#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Avaliacao do OCR (sem rede, sem banco).

Modos:
  --sintetico (default)  compara ground-truth/ com ocr-output-simulado/
  --real                 compara ground-truth-real/ (somente revisado=sim)
                         com ocr-output-real/; NUNCA imprime valores

Como a pontuacao e calculada:
  • Alinhamento: chave exata (numero_processo + parcela) primeiro; as sobras
    pareiam pelo menor CER do numero_processo (ou por posicao, quando o
    numero do processo esta vazio). Um digito errado no processo vira erro de
    campo — nunca "ausente + extra".
  • Peso por campo: taxa de erro ponderada = sum(peso*erro)/sum(peso), por
    campo, por arquivo e no geral. Erro monetario pesa PESO_ERRO_MONETARIO
    vezes mais.
  • Falso confiante: celula errada que ainda passa nos normalizadores de
    producao (telefone, moeda, DV do CNJ) — ou seja, o erro entraria no
    sistema sem ser barrado.
  • Celulas com "incerto" no ground truth saem do placar de acerto/erro e
    contam em duas categorias: "abstencao valida" (OCR deixou vazio) e "erro
    confiante" (OCR preencheu um valor que ninguem pode conferir).

Os normalizadores de producao aqui sao portes 1:1 de:
  backend/src/modules/dataImport/utils/rowNormalization.ts (normalizePhone,
  normalizeMoney), backend/src/shared/utils/cnj.ts (checkCnjCheckDigit) e
  backend/src/modules/clients/utils/ensureSalonClient.ts
  (salonClientWhatsappKey / isPlaceholderWhatsApp).
O script TS verificador-importacao.ts roda os mesmos casos pelas funcoes
reais e imprime o resultado para conferencia.
"""

import argparse
import csv
import math
import os
import re
import sys

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


def _alinhar(gt_linhas, ocr_linhas):
    """Casa chave exata primeiro; depois, linhas sem processo por ordem de
    aparicao; por fim, as sobras com processo pelo menor CER.

    Devolve (pares, gt_sem_par, ocr_sem_par) com indices: cada par e
    (indice_gt, indice_ocr) e as sobras sao listas de indices.
    """
    pares = []
    usados_gt = set()
    usados_ocr = set()

    por_chave_gt = {}
    por_chave_ocr = {}
    for i, linha in enumerate(gt_linhas):
        if _processo(linha):
            por_chave_gt.setdefault(_chave(linha), []).append(i)
    for j, linha in enumerate(ocr_linhas):
        if _processo(linha):
            por_chave_ocr.setdefault(_chave(linha), []).append(j)

    for chave in sorted(set(por_chave_gt) & set(por_chave_ocr)):
        for i, j in zip(por_chave_gt[chave], por_chave_ocr[chave]):
            pares.append((i, j))
            usados_gt.add(i)
            usados_ocr.add(j)

    gt_sem_processo = [i for i in range(len(gt_linhas))
                       if i not in usados_gt and not _processo(gt_linhas[i])]
    ocr_sem_processo = [j for j in range(len(ocr_linhas))
                        if j not in usados_ocr and not _processo(ocr_linhas[j])]
    for i, j in zip(gt_sem_processo, ocr_sem_processo):
        pares.append((i, j))
        usados_gt.add(i)
        usados_ocr.add(j)

    candidatos = []
    for i in range(len(gt_linhas)):
        if i in usados_gt:
            continue
        g_proc = _processo(gt_linhas[i])
        if not g_proc:
            continue
        for j in range(len(ocr_linhas)):
            if j in usados_ocr:
                continue
            o_proc = _processo(ocr_linhas[j])
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

    gt_sem_par = [i for i in range(len(gt_linhas)) if i not in usados_gt]
    ocr_sem_par = [j for j in range(len(ocr_linhas)) if j not in usados_ocr]
    return pares, gt_sem_par, ocr_sem_par


# ── avaliacao de celula ──────────────────────────────────────────────────────

def _normalizador_aceita(campo, valor):
    """True se a normalizacao de producao aceita o valor (nao rejeita)."""
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


def _avaliar_celula(arquivo, campo, gt_val, ocr_val, incerto, presente_gt, presente_ocr):
    gt_val = "" if gt_val is None else str(gt_val)
    ocr_val = "" if ocr_val is None else str(ocr_val)
    exato = gt_val == ocr_val
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
        "falso_confiante": (not exato) and (not incerto) and _normalizador_aceita(campo, ocr_val),
        "incerto": incerto,
        "presente_gt": presente_gt,
        "presente_ocr": presente_ocr,
    }


def avaliar(gt_dir, ocr_dir, real=False):
    """Compara GT x OCR e devolve a lista de resultados de celula."""
    resultados = []
    if not os.path.isdir(gt_dir):
        return resultados

    for nome_gt in sorted(f for f in os.listdir(gt_dir) if f.endswith(".csv")):
        gt_linhas = ler_csv(os.path.join(gt_dir, nome_gt))
        ocr_linhas = ler_csv(os.path.join(ocr_dir, nome_gt))

        if not gt_linhas:
            continue
        if not ocr_linhas:
            print(f"AVISO: sem saida de OCR para {nome_gt}")
            continue

        pares, gt_sem_par, ocr_sem_par = _alinhar(gt_linhas, ocr_linhas)

        if real:
            def _revisado(linha):
                return (linha.get("revisado") or "").strip().lower() == "sim"

            ocr_fora_de_escopo = {j for i, j in pares if not _revisado(gt_linhas[i])}
            pares = [(i, j) for i, j in pares if _revisado(gt_linhas[i])]
            gt_sem_par = [i for i in gt_sem_par if _revisado(gt_linhas[i])]
            ocr_sem_par = [j for j in ocr_sem_par if j not in ocr_fora_de_escopo]

        for i, j in pares:
            g = gt_linhas[i]
            o = ocr_linhas[j]
            incerto = campos_incerto(g)
            campos = (set(g.keys()) | set(o.keys())) - CAMPOS_IGNORADOS
            for campo in sorted(campos):
                resultados.append(_avaliar_celula(
                    nome_gt, campo, g.get(campo, ""), o.get(campo, ""),
                    campo in incerto, True, True,
                ))

        for i in gt_sem_par:
            g = gt_linhas[i]
            incerto = campos_incerto(g)
            campos = set(g.keys()) - CAMPOS_IGNORADOS
            for campo in sorted(campos):
                resultados.append(_avaliar_celula(
                    nome_gt, campo, g.get(campo, ""), "", campo in incerto, True, False,
                ))

        for j in ocr_sem_par:
            o = ocr_linhas[j]
            campos = set(o.keys()) - CAMPOS_IGNORADOS
            for campo in sorted(campos):
                resultados.append(_avaliar_celula(
                    nome_gt, campo, "", o.get(campo, ""), False, False, True,
                ))

    return resultados


# ── metricas ─────────────────────────────────────────────────────────────────

def taxa_erro_ponderada(linhas):
    total_peso = sum(r["peso"] for r in linhas)
    total_erro = sum(r["peso_erro"] for r in linhas)
    return (total_erro / total_peso) if total_peso else 0.0


def _linhas_avaliadas(resultados):
    return [r for r in resultados if not r["incerto"]]


def _pendencias_de_revisao(gt_dir):
    """Quantas linhas do ground truth ainda estao com revisado != sim."""
    pendentes = 0
    total = 0
    if not os.path.isdir(gt_dir):
        return pendentes, total
    for nome in sorted(f for f in os.listdir(gt_dir) if f.endswith(".csv")):
        for linha in ler_csv(os.path.join(gt_dir, nome)):
            total += 1
            if (linha.get("revisado") or "").strip().lower() != "sim":
                pendentes += 1
    return pendentes, total


def imprimir_relatorio(resultados, real=False):
    print("=== AVALIACAO DO OCR ===\n")
    if real:
        print("(modo --real: somente metricas, sem valores de celula)\n")
    else:
        print("(ocr-output-simulado/ e SIMULADO: nao e OCR real)\n")
    print(f"Pesos por campo (padrao=1); erro monetario pesa x{PESO_ERRO_MONETARIO}.")
    print("Alinhamento: chave exata (numero_processo+parcela); sobras pelo menor CER do processo.")
    print("Falso confiante: celula errada que a normalizacao de producao aceita.\n")

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

    bloco("POR CAMPO (exclui celulas com 'incerto'):", "campo")
    bloco("POR ARQUIVO (exclui celulas com 'incerto'):", "arquivo")

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

    incertos = [r for r in resultados if r["incerto"]]
    if incertos:
        abstencao = sum(1 for r in incertos if not r["ocr"].strip())
        confiante = len(incertos) - abstencao
        print(f"\nCELULAS COM 'incerto' NO GT: {len(incertos)} (fora do placar de acerto/erro)")
        print(f"  - abstencao valida (OCR deixou vazio): {abstencao}")
        print(f"  - erro confiante (OCR preencheu valor nao conferivel): {confiante}")


# ── main ─────────────────────────────────────────────────────────────────────

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

    if not os.path.isdir(ocr_dir):
        print(f"AVISO: diretorio de OCR ausente: {ocr_dir}")

    if real:
        pendentes, total = _pendencias_de_revisao(gt_dir)
        print(f"Ground truth real: {total} linha(s); {pendentes} ainda com revisado!=sim "
              f"(fora da pontuacao).")

    resultados = avaliar(gt_dir, ocr_dir, real=real)
    imprimir_relatorio(resultados, real=real)


if __name__ == "__main__":
    main()
