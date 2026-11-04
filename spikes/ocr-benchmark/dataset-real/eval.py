#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Avaliacao do OCR (sem rede, sem banco).

Modos:
  --sintetico (default)  compara ground-truth/ com ocr-output-simulado/
  --real                 compara ground-truth-real/ (somente revisado=sim)
                         com ocr-output-real/; NUNCA imprime valores

Como a pontuacao e calculada:
  • Placar principal (por campo, por arquivo e no geral): SO celulas com
    valor no GT. Celula vazia no GT nao conta como acerto — sai do placar e
    aparece numa linha propria ("vazias no GT: N, OCR vazio: X, OCR
    preencheu: Y"). Assim arquivo sem extracao fica 0% no principal (as
    celulas com valor estao todas ausentes no OCR), em vez de inflar o
    placar com "acerto" de celula vazia contra celula vazia.
  • Alinhamento: chave exata (numero_processo + parcela) primeiro; entre as
    linhas SEM processo, a chave textual (rotulo do dashboard sem caixa e
    sem acento) quando ela e unica dos dois lados; depois posicao; por fim
    as sobras com processo pareiam pelo menor CER do numero. Um digito
    errado no processo vira erro de campo — nunca "ausente + extra".
  • Peso por campo: taxa de erro ponderada = sum(peso*erro)/sum(peso), por
    campo, por arquivo e no geral. Erro monetario pesa PESO_ERRO_MONETARIO
    vezes mais.
  • Falso confiante: celula errada de campo COM normalizador (telefone,
    moeda, percentual, DV do CNJ) que a normalizacao de producao aceita —
    ou seja, o erro entraria no sistema sem ser barrado. Campo de texto
    (cliente, servico, categoria...) nao conta: sem normalizador nao ha
    filtro que o erro pudesse atravessar.
  • Celulas com "incerto" no ground truth saem do placar de acerto/erro e
    contam em duas categorias ("preenchida pelo OCR" x "vazia no OCR") —
    so contagens, sem valor de celula.
  • Arquivo de ground truth SEM nenhuma linha de OCR nao desaparece: as
    linhas dele entram no placar como ausentes (erro total) e o arquivo
    aparece na secao "SEM EXTRACAO" do relatorio — 0% no placar principal.
  • Modo --real: a coluna "secao" fica de fora do comparativo (e um
    agrupamento da transcricao, nao existe na imagem) e os rotulos
    ("categoria") sao comparados sem diferenciar caixa nem acento — so na
    comparacao; o OCR continua verbatim no CSV.

Os normalizadores de producao aqui sao portes 1:1 de:
  backend/src/modules/dataImport/utils/rowNormalization.ts (normalizePhone,
  normalizeMoney), backend/src/shared/utils/cnj.ts (checkCnjCheckDigit) e
  backend/src/modules/clients/utils/ensureSalonClient.ts
  (salonClientWhatsappKey / isPlaceholderWhatsApp).
O script TS verificador-importacao.ts roda os mesmos casos pelas funcoes
reais e imprime a conferencia final.
"""

import argparse
import csv
import math
import os
import re
import sys
import unicodedata

OUT = os.path.dirname(os.path.abspath(__file__))
GT_DIR = os.path.join(OUT, "ground-truth")
OCR_SIM_DIR = os.path.join(OUT, "ocr-output-simulado")
GT_REAL_DIR = os.path.join(OUT, "ground-truth-real")
OCR_REAL_DIR = os.path.join(OUT, "ocr-output-real")

CAMPOS_MONETARIOS = {"valor_total", "valor_base", "valor_honorario", "valor",
                     "custo_total", "preco_venda", "custo_produto",
                     "custo_mao_de_obra", "valor_comissao"}
CAMPOS_PERCENTUAL = {"percentual_exito", "percentual_comissao"}

PESO_CAMPO = {
    "numero_processo": 3,
    "valor_total": 5,
    "valor_base": 5,
    "valor_honorario": 5,
    "valor": 5,
    "custo_total": 5,
    "preco_venda": 5,
    "custo_produto": 5,
    "custo_mao_de_obra": 5,
    "valor_comissao": 5,
    "percentual_exito": 2,
    "percentual_comissao": 2,
    "parcela": 2,
    "cliente": 1,
    "telefone": 1,
    "tipo_honorario": 1,
    "apelido_caso": 1,
    "situacao": 1,
    "vencimento": 1,
    "data_criacao": 1,
    "data_pagamento": 1,
    "status": 1,
    "observacoes": 1,
}
PESO_ERRO_MONETARIO = 5

CAMPOS_IGNORADOS = {"incerto", "revisado"}

# Comparativo real (Sessão 6):
#   • "secao" nao entra no comparativo: e um agrupamento da transcricao do
#     ground truth, nao existe na imagem;
#   • "categoria" (os rotulos do dashboard) e comparado sem diferenciar
#     caixa nem acento — o OCR le em caixa alta e sem acento, a transcricao
#     escreveu em caixa de titulo; o OCR continua verbatim no CSV.
CAMPOS_EXCLUIDOS_REAL = {"secao"}
CAMPOS_ROTULO_REAL = {"categoria"}

# Campos que a importacao de producao passa por um normalizador (unicos que
# podem virar "falso confiante": sem normalizador nao ha filtro que o erro
# pudesse atravessar). Ver `_tem_normalizador`.
CAMPOS_COM_NORMALIZADOR = {"telefone", "numero_processo"} | CAMPOS_MONETARIOS | CAMPOS_PERCENTUAL

# Colunas usadas como chave textual no alinhamento de linhas SEM processo
# (dashboard e planilha de serviços nao tem numero_processo).
COLUNAS_CHAVE_TEXTO = ("categoria", "servico")


# ── normalizadores de producao (portes) ───────────────────────────────────────

_LOOKS_SCIENTIFIC = re.compile(r"^[+-]?\d+([.,]\d+)?[eE][+-]?\d+$")


def looks_scientific_notation(text):
    """looksScientificNotation (numericText.ts)."""
    return bool(_LOOKS_SCIENTIFIC.match((text or "").strip()))


def is_placeholder_whatsapp(whatsapp):
    """isPlaceholderWhatsApp (queueDuplicate.ts)."""
    d = re.sub(r"\D", "", whatsapp or "")
    return (not d) or d == "00000000000"


def salon_client_whatsapp_key(whatsapp):
    """salonClientWhatsappKey (ensureSalonClient.ts)."""
    if is_placeholder_whatsapp(whatsapp):
        return None
    digits = re.sub(r"\D", "", whatsapp or "")
    nacional = digits
    if len(digits) in (12, 13) and digits.startswith("55"):
        nacional = digits[2:]
    if len(nacional) < 10 or len(nacional) > 11:
        return None
    return nacional


def normalize_phone_prod(value):
    """normalizePhone (rowNormalization.ts)."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if looks_scientific_notation(text):
        return None
    digits = re.sub(r"\D", "", text)
    if not digits:
        return None
    if len(digits) in (13, 14) and digits.startswith("55"):
        digits = digits[2:]
    if digits.startswith("0"):
        sem_zero = digits[1:]
        if len(sem_zero) in (10, 11):
            digits = sem_zero
    return salon_client_whatsapp_key(digits)


def normalize_money_prod(value):
    """normalizeMoney (rowNormalization.ts)."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = re.sub(r"r\$\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s", "", text)
    text = re.sub(r"%$", "", text)
    tem_comma = "," in text
    tem_ponto = "." in text
    if tem_comma and tem_ponto:
        indice = max(text.rfind(","), text.rfind("."))
        inteiro = re.sub(r"[.,]", "", text[:indice]) or "0"
        decimal = re.sub(r"[^0-9]", "", text[indice + 1:]) or "0"
        text = f"{inteiro}.{decimal}"
    elif tem_comma:
        uma_comma = text.find(",") == text.rfind(",")
        digitos_depois = len(text) - text.find(",") - 1
        text = text.replace(",", ".") if (uma_comma and digitos_depois != 3) else text.replace(",", "")
    elif tem_ponto:
        um_ponto = text.find(".") == text.rfind(".")
        digitos_depois = len(text) - text.find(".") - 1
        if (not um_ponto) or digitos_depois == 3:
            text = text.replace(".", "")
    try:
        numero = float(text)
    except ValueError:
        return None
    if not math.isfinite(numero) or numero < 0:
        return None
    return math.floor(numero * 100 + 0.5) / 100


def check_cnj_check_digit(cnj):
    """checkCnjCheckDigit (shared/utils/cnj.ts): valid | invalid | unknown."""
    digits = re.sub(r"\D", "", cnj or "")
    if len(digits) != 20:
        return "unknown"
    base = int(digits[:7] + digits[9:])
    dv = int(digits[7:9])
    return "valid" if (base * 100 + dv) % 97 == 1 else "invalid"


def cnj_valido_prod(cnj):
    return check_cnj_check_digit(cnj) == "valid"


# ── leitura de CSV ───────────────────────────────────────────────────────────

def ler_csv(caminho):
    if not os.path.exists(caminho):
        return []
    with open(caminho, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def escrever_csv(caminho, linhas):
    if not linhas:
        return
    with open(caminho, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
        w.writeheader()
        for linha in linhas:
            w.writerow(linha)


# ── CER ──────────────────────────────────────────────────────────────────────

def _levenshtein(s1, s2):
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)
    anterior = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        atual = [i + 1]
        for j, c2 in enumerate(s2):
            atual.append(min(anterior[j + 1] + 1, atual[j] + 1, anterior[j] + (c1 != c2)))
        anterior = atual
    return anterior[-1]


def cer(referencia, hipotese):
    if not referencia and not hipotese:
        return 0.0
    if not referencia or not hipotese:
        return 1.0
    return _levenshtein(referencia, hipotese) / max(len(referencia), 1)


# ── incerto (por celula) ─────────────────────────────────────────────────────

def campos_incerto(linha):
    """Campos marcados como incertos na linha do ground truth.

    O ground truth marca a celula dudosa no campo "incerto" (ex.: "valor_total"
    ou "valor_total;cliente"). "*" significa todos os campos da linha.
    """
    bruto = (linha.get("incerto") or "").strip()
    if not bruto:
        return set()
    if bruto == "*":
        return set(linha.keys()) - CAMPOS_IGNORADOS
    partes = set()
    for parte in re.split(r"[;,]", bruto):
        parte = parte.strip()
        if parte:
            partes.add(parte)
    return partes


# ── alinhamento ──────────────────────────────────────────────────────────────

def _chave(linha):
    return ((linha.get("numero_processo") or "").strip(), (linha.get("parcela") or "").strip())


def _processo(linha):
    return (linha.get("numero_processo") or "").strip()


def _chave_texto(linha):
    """Chave textual de uma linha SEM numero_processo.

    Usa a primeira coluna de rotulo preenchida (categoria ou servico),
    sem caixa e sem acento, para casar o que a planilha sem processo
    repete. So e usada quando a chave e UNICA dos dois lados (ver
    `_alinhar`): um rotulo repetido (mesmo servico em duas linhas) nao
    identifica a linha e cai no pareamento por posicao.
    """
    for campo in COLUNAS_CHAVE_TEXTO:
        valor = (linha.get(campo) or "").strip()
        if valor:
            return _sem_caixa_nem_acento(valor)
    return ""


def _alinhar(linhas_gt, linhas_ocr):
    """Casa chave exata primeiro; depois chave textual (linhas sem
    processo, unica dos dois lados); depois posicao; por fim as sobras
    com processo pelo menor CER.

    Devolve (pares, gt_sem_par, ocr_sem_par) com indices: cada par e
    (indice_gt, indice_ocr) e as sobras sao listas de indices.
    """
    pares = []
    usados_gt = set()
    usados_ocr = set()

    por_chave_gt = {}
    por_chave_ocr = {}
    for i, linha in enumerate(linhas_gt):
        if _processo(linha):
            por_chave_gt.setdefault(_chave(linha), []).append(i)
    for j, linha in enumerate(linhas_ocr):
        if _processo(linha):
            por_chave_ocr.setdefault(_chave(linha), []).append(j)

    for chave in sorted(set(por_chave_gt) & set(por_chave_ocr)):
        for i, j in zip(por_chave_gt[chave], por_chave_ocr[chave]):
            pares.append((i, j))
            usados_gt.add(i)
            usados_ocr.add(j)

    # Linhas sem processo (dashboard, planilha de serviços): a chave
    # textual casa o que a ordem nao garante (linhas reordenadas no OCR),
    # mas so quando o rotulo identifica a linha nos DOIS lados.
    por_texto_gt = {}
    por_texto_ocr = {}
    for i, linha in enumerate(linhas_gt):
        if i in usados_gt or _processo(linha):
            continue
        chave = _chave_texto(linha)
        if chave:
            por_texto_gt.setdefault(chave, []).append(i)
    for j, linha in enumerate(linhas_ocr):
        if j in usados_ocr or _processo(linha):
            continue
        chave = _chave_texto(linha)
        if chave:
            por_texto_ocr.setdefault(chave, []).append(j)
    for chave in sorted(set(por_texto_gt) & set(por_texto_ocr)):
        if len(por_texto_gt[chave]) != 1 or len(por_texto_ocr[chave]) != 1:
            continue
        i = por_texto_gt[chave][0]
        j = por_texto_ocr[chave][0]
        if i in usados_gt or j in usados_ocr:
            continue
        pares.append((i, j))
        usados_gt.add(i)
        usados_ocr.add(j)

    gt_sem_processo = [i for i in range(len(linhas_gt))
                       if i not in usados_gt and not _processo(linhas_gt[i])]
    ocr_sem_processo = [j for j in range(len(linhas_ocr))
                        if j not in usados_ocr and not _processo(linhas_ocr[j])]
    for i, j in zip(gt_sem_processo, ocr_sem_processo):
        pares.append((i, j))
        usados_gt.add(i)
        usados_ocr.add(j)

    candidatos = []
    for i in range(len(linhas_gt)):
        if i in usados_gt:
            continue
        g_proc = _processo(linhas_gt[i])
        if not g_proc:
            continue
        for j in range(len(linhas_ocr)):
            if j in usados_ocr:
                continue
            o_proc = _processo(linhas_ocr[j])
            if not o_proc:
                continue
            candidatos.append((cer(g_proc, o_proc), abs(i - j), i, j))
    candidatos.sort()

    for _c, _desvio, i, j in candidatos:
        if i in usados_gt or j in usados_ocr:
            continue
        pares.append((i, j))
        usados_gt.add(i)
        usados_ocr.add(j)

    gt_sem_par = [i for i in range(len(linhas_gt)) if i not in usados_gt]
    ocr_sem_par = [j for j in range(len(linhas_ocr)) if j not in usados_ocr]
    return pares, gt_sem_par, ocr_sem_par


# ── avaliacao de celula ──────────────────────────────────────────────────────

def _tem_normalizador(campo):
    """True se a importacao de producao aplica normalizador neste campo.

    So esses campos podem virar "falso confiante": o resto (texto) entra
    no sistema sem nenhum filtro que o erro pudesse atravessar.
    """
    return campo in CAMPOS_COM_NORMALIZADOR


def _normalizador_aceita(campo, valor):
    """True se a normalizacao de producao aceita o valor (nao rejeita).

    Campo sem normalizador devolve True (nao ha filtro que rejeite); por
    isso `falso_confiante` so vale quando `_tem_normalizador(campo)`.
    """
    if valor is None or str(valor).strip() == "":
        return False
    if campo == "telefone":
        return normalize_phone_prod(valor) is not None
    if campo in CAMPOS_MONETARIOS or campo in CAMPOS_PERCENTUAL:
        return normalize_money_prod(valor) is not None
    if campo == "numero_processo":
        return check_cnj_check_digit(valor) != "invalid"
    return True


def _erro_monetario(campo, gt, ocr):
    if campo not in CAMPOS_MONETARIOS:
        return False
    g = normalize_money_prod(gt)
    o = normalize_money_prod(ocr)
    if g is None and o is None:
        return False
    if g is None or o is None:
        return True
    return abs(g - o) > 0.005


def _sem_caixa_nem_acento(texto):
    """Normaliza texto para COMPARAR rótulos (caixa e acento).

    Só afeta a comparação; nem o ground truth nem a saída do OCR mudam.
    """
    decomposto = unicodedata.normalize("NFD", texto or "")
    sem_acento = "".join(c for c in decomposto if unicodedata.category(c) != "Mn")
    return sem_acento.casefold()


def _avaliar_celula(arquivo, campo, gt_val, ocr_val, incerto, presente_gt, presente_ocr,
                    comparar_rotulo=False):
    gt_val = "" if gt_val is None else str(gt_val)
    ocr_val = "" if ocr_val is None else str(ocr_val)
    exato = gt_val == ocr_val
    if not exato and comparar_rotulo:
        exato = _sem_caixa_nem_acento(gt_val) == _sem_caixa_nem_acento(ocr_val)
    erro = 0 if exato else 1
    peso = PESO_CAMPO.get(campo, 1)
    monetario = _erro_monetario(campo, gt_val, ocr_val)
    if monetario:
        peso *= PESO_ERRO_MONETARIO
    return {
        "arquivo": arquivo,
        "campo": campo,
        "gt": gt_val,
        "ocr": ocr_val,
        "exato": exato,
        "erro": erro,
        "cer": cer(gt_val, ocr_val),
        "peso": peso,
        "peso_erro": peso * erro,
        "erro_monetario": monetario,
        "falso_confiante": (
            (not exato) and (not incerto)
            and _tem_normalizador(campo) and _normalizador_aceita(campo, ocr_val)
        ),
        "incerto": incerto,
        "presente_gt": presente_gt,
        "presente_ocr": presente_ocr,
    }


def avaliar(gt_dir, ocr_dir, real=False):
    """Compara GT x OCR e devolve a lista de resultados de celula.

    Atalho de `avaliar_detalhado` (so a lista de celulas).
    """
    return avaliar_detalhado(gt_dir, ocr_dir, real=real)[0]


def avaliar_detalhado(gt_dir, ocr_dir, real=False):
    """Compara GT x OCR.

    Devolve (resultados, sem_extracao, excluidos):
      • resultados: lista de resultados de celula;
      • sem_extracao: lista de (arquivo, n_linhas) dos arquivos de GT que
        NAO têm nenhuma linha de OCR. Essas linhas entram no placar como
        **ausentes** (erro total): um arquivo sem extração não pode sumir
        do placar geral;
      • excluidos: {campo: n_celulas} das colunas que o modo real deixa
        fora do comparativo (ver CAMPOS_EXCLUIDOS_REAL).
    """
    resultados = []
    sem_extracao = []
    excluidos = {}
    if not os.path.isdir(gt_dir):
        return resultados, sem_extracao, excluidos

    def _revisado(linha):
        return (linha.get("revisado") or "").strip().lower() == "sim"

    for nome_gt in sorted(f for f in os.listdir(gt_dir) if f.endswith(".csv")):
        gt_linhas = ler_csv(os.path.join(gt_dir, nome_gt))
        ocr_linhas = ler_csv(os.path.join(ocr_dir, nome_gt))

        if not gt_linhas:
            continue

        if not ocr_linhas:
            # Sem nenhuma linha de OCR: todas as linhas do GT (revisadas, no
            # modo real) ficam sem par -> contam como ausentes (erro total).
            pares, ocr_sem_par = [], []
            gt_sem_par = list(range(len(gt_linhas)))
        else:
            pares, gt_sem_par, ocr_sem_par = _alinhar(gt_linhas, ocr_linhas)

        if real:
            ocr_fora_de_escopo = {j for i, j in pares if not _revisado(gt_linhas[i])}
            pares = [(i, j) for i, j in pares if _revisado(gt_linhas[i])]
            gt_sem_par = [i for i in gt_sem_par if _revisado(gt_linhas[i])]
            ocr_sem_par = [j for j in ocr_sem_par if j not in ocr_fora_de_escopo]

        if not ocr_linhas:
            sem_extracao.append((nome_gt, len(gt_sem_par)))

        def _comparar(campo, gt_val, ocr_val, incerto, presente_gt, presente_ocr):
            if real and campo in CAMPOS_EXCLUIDOS_REAL:
                excluidos[campo] = excluidos.get(campo, 0) + 1
                return None
            return _avaliar_celula(
                nome_gt, campo, gt_val, ocr_val, incerto, presente_gt, presente_ocr,
                comparar_rotulo=real and campo in CAMPOS_ROTULO_REAL,
            )

        for i, j in pares:
            g = gt_linhas[i]
            o = ocr_linhas[j]
            incerto = campos_incerto(g)
            campos = (set(g.keys()) | set(o.keys())) - CAMPOS_IGNORADOS
            for campo in sorted(campos):
                celula = _comparar(campo, g.get(campo, ""), o.get(campo, ""),
                                      campo in incerto, True, True)
                if celula is not None:
                    resultados.append(celula)

        for i in gt_sem_par:
            g = gt_linhas[i]
            incerto = campos_incerto(g)
            campos = set(g.keys()) - CAMPOS_IGNORADOS
            for campo in sorted(campos):
                celula = _comparar(campo, g.get(campo, ""), "",
                                      campo in incerto, True, False)
                if celula is not None:
                    resultados.append(celula)

        for j in ocr_sem_par:
            o = ocr_linhas[j]
            campos = set(o.keys()) - CAMPOS_IGNORADOS
            for campo in sorted(campos):
                celula = _comparar(campo, "", o.get(campo, ""), False, False, True)
                if celula is not None:
                    resultados.append(celula)

    return resultados, sem_extracao, excluidos


# ── metricas ─────────────────────────────────────────────────────────────────

def taxa_erro_ponderada(linhas):
    total_peso = sum(r["peso"] for r in linhas)
    total_erro = sum(r["peso_erro"] for r in linhas)
    return (total_erro / total_peso) if total_peso else 0.0


def _linhas_avaliadas(resultados):
    """Celulas do PLACAR PRINCIPAL: sem 'incerto' E com valor no GT.

    Celula vazia no GT (inclusive linha extra so do OCR) nao entra aqui:
    ela nao pode contar como acerto nem como erro — sai para a linha
    "vazias no GT" do relatorio (ver `celulas_vazias_no_gt`).
    """
    return [r for r in resultados if not r["incerto"] and r["gt"].strip()]


def celulas_vazias_no_gt(resultados):
    """Celulas avaliadas sem valor no GT (fora do placar principal).

    Devolve (total, ocr_vazio, ocr_preencheu).
    """
    vazias = [r for r in resultados if not r["incerto"] and not r["gt"].strip()]
    preenchidas = sum(1 for r in vazias if r["ocr"].strip())
    return len(vazias), len(vazias) - preenchidas, preenchidas


def _contar_revisadas(gt_dir):
    """(linhas com revisado=sim, total de linhas) do ground truth."""
    revisadas = 0
    total = 0
    if not os.path.isdir(gt_dir):
        return revisadas, total
    for nome in sorted(f for f in os.listdir(gt_dir) if f.endswith(".csv")):
        for linha in ler_csv(os.path.join(gt_dir, nome)):
            total += 1
            if (linha.get("revisado") or "").strip().lower() == "sim":
                revisadas += 1
    return revisadas, total


def imprimir_relatorio(resultados, real=False, sem_extracao=None, excluidos=None):
    print("=== AVALIACAO DO OCR ===\n")
    if real:
        print("(modo --real: somente metricas, sem valores de celula)\n")
    else:
        print("(ocr-output-simulado/ e SIMULADO: nao e OCR real)\n")
    print(f"Pesos por campo (padrao=1); erro monetario pesa x{PESO_ERRO_MONETARIO}.")
    print("Alinhamento: chave exata (numero_processo+parcela); linhas sem processo "
          "por chave textual unica; depois posicao; sobras com processo pelo menor CER.")
    print("Falso confiante: celula errada de campo COM normalizador (telefone, moeda, "
          "percentual, DV do CNJ) que a producao aceita; campo de texto nao conta.")
    print("Placar principal: so celulas COM VALOR no GT (celula vazia no GT nao conta "
          "como acerto; ver a linha 'vazias no GT' la embaixo).\n")

    validas = _linhas_avaliadas(resultados)

    def bloco(titulo, chave_agrupamento):
        print(titulo)
        print(f"{'Nome':<24} {'Celulas':<9} {'Acerto exato':<17} {'CER medio':<11} "
              f"{'Falso conf.':<13} {'Tx erro pond.':<14}")
        print("-" * 104)
        agrupado = {}
        for r in validas:
            agrupado.setdefault(r[chave_agrupamento], []).append(r)
        for nome in sorted(agrupado):
            ls = agrupado[nome]
            total = len(ls)
            acertos = sum(1 for r in ls if r["exato"])
            cer_medio = sum(r["cer"] for r in ls) / total if total else 0
            falso = sum(1 for r in ls if r["falso_confiante"])
            tx = taxa_erro_ponderada(ls)
            print(f"{nome:<24} {total:<9} {acertos}/{total} ({acertos / total * 100:.1f}%)   "
                  f"{cer_medio:<11.4f} {falso:<13} {tx:<14.4f}")
        print()

    bloco("POR CAMPO (so celulas com valor no GT, exclui 'incerto'):", "campo")
    bloco("POR ARQUIVO (so celulas com valor no GT, exclui 'incerto'):", "arquivo")

    por_campo = {}
    for r in validas:
        contagem = por_campo.setdefault(r["campo"], [0, 0])
        contagem[0] += r["erro"]
        contagem[1] += 1 if r["falso_confiante"] else 0
    tabela = [(campo, erros, falsos) for campo, (erros, falsos) in por_campo.items()
              if erros or falsos]
    print("FALSO CONFIANTE POR CAMPO (so celulas com valor no GT; "
          "erros x falsos confiantes):")
    print(f"{'Campo':<24} {'Erros':<8} {'Falsos confiantes'}")
    print("-" * 52)
    for campo, erros, falsos in sorted(tabela, key=lambda t: (-t[2], -t[1], t[0])):
        print(f"{campo:<24} {erros:<8} {falsos}")
    if not tabela:
        print("(nenhum erro)")
    sem_normalizador = sorted({r["campo"] for r in validas} - CAMPOS_COM_NORMALIZADOR)
    print(f"  campo de texto sem normalizador NAO conta como falso confiante: "
          f"{', '.join(sem_normalizador) if sem_normalizador else '(nenhum no modo atual)'}")
    print(f"  contam so campos com normalizador de producao: "
          f"{', '.join(sorted(CAMPOS_COM_NORMALIZADOR))}\n")

    if sem_extracao:
        total_linhas = sum(n for _arquivo, n in sem_extracao)
        print(f"SEM EXTRACAO (arquivo sem nenhuma linha de OCR): "
              f"{total_linhas} linha(s) em {len(sem_extracao)} arquivo(s)")
        print("  (as celulas com valor dessas linhas ja contam como ausentes no placar acima)")
        for arquivo, n in sem_extracao:
            print(f"  - {arquivo}: {n} linha(s)")
        print()

    if excluidos:
        fora = ", ".join(f"{campo}: {n}" for campo, n in sorted(excluidos.items()))
        print(f"COLUNAS FORA DO COMPARATIVO (so no modo --real): {fora} celula(s)")
        print()

    total = len(validas)
    if total:
        acertos = sum(1 for r in validas if r["exato"])
        cer_medio = sum(r["cer"] for r in validas) / total
        falso = sum(1 for r in validas if r["falso_confiante"])
        tx = taxa_erro_ponderada(validas)
        erros_moeda = sum(1 for r in validas if r["erro_monetario"])
        print(f"GERAL: {total} celulas | {acertos} corretas ({acertos / total * 100:.1f}%) | "
              f"CER medio {cer_medio:.4f} | Falso confiante: {falso} | "
              f"Erros monetarios: {erros_moeda} | Taxa de erro ponderada: {tx:.4f}")
    else:
        print("GERAL: 0 celulas avaliadas.")

    if resultados:
        vazias_gt, ocr_vazio, ocr_preencheu = celulas_vazias_no_gt(resultados)
        print("\nCELULAS VAZIAS NO GT (nao contam como acerto):")
        print(f"  vazias no GT: {vazias_gt}, OCR vazio: {ocr_vazio}, "
              f"OCR preencheu: {ocr_preencheu}")

    incertos = [r for r in resultados if r["incerto"]]
    if incertos:
        preenchidas = sum(1 for r in incertos if r["ocr"].strip())
        vazias = len(incertos) - preenchidas
        print(f"\nCELULAS COM 'incerto' NO GT: {len(incertos)} "
              f"(fora do placar geral: nao contam como acerto nem como erro)")
        print(f"  - preenchida pelo OCR: {preenchidas}")
        print(f"  - vazia no OCR: {vazias}")


# ── main ─────────────────────────────────────────────────────────────────────

def executar(gt_dir, ocr_dir, real=False):
    """Roda a avaliacao e devolve o codigo de saida (0 = sucesso, inclusive
    quando nao ha nada a pontuar)."""
    if real:
        revisadas, total = _contar_revisadas(gt_dir)
        print(f"Ground truth real: {total} linha(s); {total - revisadas} ainda com revisado!=sim "
              f"(fora da pontuacao).")
        if revisadas == 0:
            print("AVISO: nenhuma linha com revisado=sim no ground truth real; nada a pontuar.")
            return 0

    if not os.path.isdir(ocr_dir):
        print(f"AVISO: diretorio de OCR ausente: {ocr_dir}")

    resultados, sem_extracao, excluidos = avaliar_detalhado(gt_dir, ocr_dir, real=real)
    imprimir_relatorio(resultados, real=real, sem_extracao=sem_extracao,
                       excluidos=excluidos)
    return 0


def main():
    parser = argparse.ArgumentParser(description="Avaliacao do OCR (sintetico/real).")
    parser.add_argument("--sintetico", action="store_true",
                        help="ground-truth/ x ocr-output-simulado/ (padrao)")
    parser.add_argument("--real", action="store_true",
                        help="ground-truth-real/ (revisado=sim) x ocr-output-real/, sem valores")
    args = parser.parse_args()

    if args.real:
        gt_dir, ocr_dir, real = GT_REAL_DIR, OCR_REAL_DIR, True
    else:
        gt_dir, ocr_dir, real = GT_DIR, OCR_SIM_DIR, False

    sys.exit(executar(gt_dir, ocr_dir, real=real))


if __name__ == "__main__":
    main()
