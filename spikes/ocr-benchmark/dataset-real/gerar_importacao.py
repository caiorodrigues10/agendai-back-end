#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera os arquivos de importação (CASE_FEES) do dataset-real, no formato do
importador do sistema Agenda Já, e o **resultado esperado** de cada linha.

Colunas aceitas para CASE_FEES (fonte:
backend/src/modules/dataImport/dataImport.constants.ts:795-844,
`CASE_FEE_FIELDS`):
  caseNumber, percent, feeStatus, feeDueDate, feeInstallments, feeNotes

As colunas `clientName`, `clientWhatsapp` e `caseName` **não** existem para
CASE_FEES: o backend recusa o mapeamento com 400
(backend/src/modules/dataImport/dataImportUseCases.ts:316-319,
`Campo "<campo>" não se aplica a este tipo de importação.`).

Regras do importador replicadas aqui (mesma semântica do TypeScript):
  • percentual obrigatório e entre 0 e 100
    (rowValidator.ts:1037-1046);
  • vencimento inválido rejeita a linha (rowValidator.ts:1051-1059);
  • parcelas diferentes de 1 **não são forçadas em silêncio**: o processador
    devolve o aviso `Parcelas "N" não são aceitas na importação; o honorário
    entra com 1 parcela.` e importa com 1 parcela
    (caseFeeImporter.ts:54-64, feeInstallmentsWarning);
  • situação desconhecida vira PENDING com aviso (caseFeeImporter.ts:42-52);
  • sem número do processo e sem apelido do caso, a linha é rejeitada
    (rowValidator.ts:972-978).

Saída:
  dataset-real/importacao/<id>.import.csv             (arquivo para importar)
  dataset-real/importacao/<id>.resultado-esperado.csv (aviso/rejeição por linha)
  dataset-real/importacao/import.csv                  (todos os arquivos juntos)
  dataset-real/importacao/resultado-esperado.csv      (resultado de todos)
"""

import csv
import math
import os
import re
import unicodedata
from datetime import date, datetime

OUT = os.path.dirname(os.path.abspath(__file__))
GT_DIR = os.path.join(OUT, "ground-truth")
IMP_DIR = os.path.join(OUT, "importacao")

os.makedirs(IMP_DIR, exist_ok=True)

COLUNAS_IMPORT = ["caseNumber", "percent", "feeStatus", "feeDueDate",
                  "feeInstallments", "feeNotes"]

COLUNAS_RESULTADO = ["arquivo", "linha", "status", "campo", "mensagem", "avisos",
                     "parcelas_efetivas", "verificacao_banco"]

FEE_STATUS_MAP = {
    "pendente": "PENDING",
    "pending": "PENDING",
    "faturado": "INVOICED",
    "invoiced": "INVOICED",
    "pago": "PAID",
    "paid": "PAID",
    "cancelado": "CANCELED",
    "canceled": "CANCELED",
}


# ── espelhos das funções do importador ────────────────────────────────────────

def normalize_header_text(valor: str) -> str:
    """normalizeHeaderText (columnMapping.ts:21-28)."""
    texto = unicodedata.normalize("NFD", str(valor or ""))
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^a-z0-9]+", " ", texto.lower())
    return texto.strip()


def normalize_money(valor: str):
    """normalizeMoney (rowNormalization.ts:161-192)."""
    texto = str(valor or "").strip()
    if not texto:
        return None
    texto = re.sub(r"r\$\s*", "", texto, flags=re.IGNORECASE)
    texto = re.sub(r"\s", "", texto)
    texto = re.sub(r"%$", "", texto)
    tem_comma = "," in texto
    tem_ponto = "." in texto
    if tem_comma and tem_ponto:
        indice = max(texto.rfind(","), texto.rfind("."))
        inteiro = re.sub(r"[.,]", "", texto[:indice]) or "0"
        decimal = re.sub(r"[^0-9]", "", texto[indice + 1:]) or "0"
        texto = f"{inteiro}.{decimal}"
    elif tem_comma:
        uma_comma = texto.find(",") == texto.rfind(",")
        digitos_depois = len(texto) - texto.find(",") - 1
        texto = texto.replace(",", ".") if (uma_comma and digitos_depois != 3) else texto.replace(",", "")
    elif tem_ponto:
        um_ponto = texto.find(".") == texto.rfind(".")
        digitos_depois = len(texto) - texto.find(".") - 1
        if not um_ponto or digitos_depois == 3:
            texto = texto.replace(".", "")
    try:
        numero = float(texto)
    except ValueError:
        return None
    if not math.isfinite(numero) or numero < 0:
        return None
    return math.floor(numero * 100 + 0.5) / 100


def normalize_integer(valor: str):
    """normalizeInteger (rowNormalization.ts:195-201) — arredonda como Math.round."""
    texto = str(valor or "").strip()
    if not texto:
        return None
    try:
        numero = float(texto.replace(",", "."))
    except ValueError:
        return None
    if not math.isfinite(numero) or numero < 0:
        return None
    return math.floor(numero + 0.5)


def _data_valida(ano: int, mes: int, dia: int) -> bool:
    try:
        date(ano, mes, dia)
    except ValueError:
        return False
    return 1900 <= ano <= 2200


def normalize_date(valor: str):
    """normalizeDate (rowNormalization.ts:44-61)."""
    texto = str(valor or "").strip()
    if not texto:
        return None
    achado = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$", texto)
    if achado:
        dia = int(achado.group(1))
        mes = int(achado.group(2))
        ano = int(achado.group(3))
        if ano < 100:
            ano += 2000 if ano < 70 else 1900
        if not _data_valida(ano, mes, dia):
            return None
        return f"{ano:04d}-{mes:02d}-{dia:02d}"
    try:
        _dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _dt.strftime("%Y-%m-%d")


def parse_fee_status(valor: str):
    """parseFeeStatus (caseFeeImporter.ts:43-52)."""
    texto = str(valor or "").strip()
    if not texto:
        return "PENDING", None
    mapeado = FEE_STATUS_MAP.get(normalize_header_text(texto))
    if mapeado:
        return mapeado, None
    return "PENDING", f'Situação "{texto}" não reconhecida; usando "Pendente".'


def fee_installments_warning(valor: str):
    """feeInstallmentsWarning (caseFeeImporter.ts:55-64)."""
    inteiro = normalize_integer(valor)
    if inteiro is None:
        return None, None
    if inteiro <= 0:
        return None, None
    if inteiro == 1:
        return 1, None
    return 1, f'Parcelas "{inteiro}" não são aceitas na importação; o honorário entra com 1 parcela.'


# ── transformação do ground truth em arquivo de importação ────────────────────

def numero_parcela(parcela: str) -> str:
    """'2/3' → '3' (total de parcelas do honorário; o importador aceita só 1
    e avisa). Não devolve a parcela corrente ('2'), pois isso mascararia o
    aviso e forçaria 1 parcela em silêncio."""
    texto = str(parcela or "").strip()
    if not texto:
        return ""
    partes = texto.split("/")
    return partes[-1].strip() if len(partes) > 1 else partes[0].strip()


def normalizar_data_para_ddmmaaaa(data_iso: str) -> str:
    """AAAA-MM-DD → dd/mm/aaaa (o que o importador espera)."""
    if not data_iso:
        return ""
    try:
        ano, mes, dia = data_iso.split("-")
        return f"{dia}/{mes}/{ano}"
    except ValueError:
        return data_iso


def linha_para_import(linha: dict) -> dict:
    """Converte uma linha do ground truth em linha do arquivo de importação."""
    if "numero_processo" in linha and "situacao" in linha:
        # Formato da exportação (export-01).
        case_number = linha.get("numero_processo", "")
        percentual = linha.get("percentual_exito", "")
        situacao = linha.get("situacao", "")
        vencimento = linha.get("vencimento", "")
        parcelas = linha.get("parcela", "")
        observacoes = linha.get("observacoes", "")
    else:
        case_number = linha.get("numero_processo", "")
        percentual = linha.get("percentual_exito", "")
        situacao = linha.get("status", "")
        vencimento = normalizar_data_para_ddmmaaaa(linha.get("vencimento", ""))
        parcelas = numero_parcela(linha.get("parcela", ""))
        observacoes = ""

    percentual_num = normalize_money(percentual)
    return {
        "caseNumber": case_number,
        "percent": str(percentual_num) if percentual_num is not None else "",
        "feeStatus": situacao,
        "feeDueDate": vencimento,
        # Parcela real: o importador decide o que fazer (aviso + 1 parcela).
        "feeInstallments": parcelas,
        "feeNotes": observacoes,
    }


def resultado_esperado(arquivo: str, numero_linha: int, linha: dict) -> dict:
    """Resultado do dry-run (rowValidator.validateCaseFeeRow) esperado para a linha."""
    status = "VALID"
    campo = ""
    mensagem = ""
    avisos: list[str] = []

    case_number = str(linha.get("caseNumber", "")).strip()
    case_name = str(linha.get("caseName", "")).strip()

    if not case_number and not case_name:
        status = "FAILED"
        campo = "caseNumber"
        mensagem = "Número do processo ou apelido do caso é obrigatório."
    else:
        percentual = normalize_money(linha.get("percent", ""))
        if percentual is None or percentual < 0 or percentual > 100:
            status = "FAILED"
            campo = "percent"
            mensagem = "Percentual do honorário é obrigatório e deve estar entre 0 e 100."
        else:
            _situacao, aviso = parse_fee_status(linha.get("feeStatus", ""))
            if aviso:
                avisos.append(aviso)
            vencimento = str(linha.get("feeDueDate", "")).strip()
            if vencimento and not normalize_date(vencimento):
                status = "FAILED"
                campo = "feeDueDate"
                mensagem = "Data de vencimento inválida. Use dd/mm/aaaa."

    parcelas_efetivas = 1
    if status != "FAILED":
        parcelas, aviso = fee_installments_warning(linha.get("feeInstallments", ""))
        if aviso:
            avisos.append(aviso)
        parcelas_efetivas = parcelas if parcelas is not None else 1

    return {
        "arquivo": arquivo,
        "linha": numero_linha,
        "status": status,
        "campo": campo,
        "mensagem": mensagem,
        "avisos": " | ".join(avisos),
        "parcelas_efetivas": parcelas_efetivas,
        "verificacao_banco": (
            "processo precisa existir no sistema (caseSuccessFee/ClientCase) — "
            "checagem de banco não roda offline"
        ),
    }


def main():
    arquivos = sorted(nome for nome in os.listdir(GT_DIR) if nome.endswith(".csv"))
    todas_import = []
    todos_resultados = []

    for nome_arquivo in arquivos:
        nome_base = nome_arquivo.replace(".csv", "")
        with open(os.path.join(GT_DIR, nome_arquivo), newline="", encoding="utf-8") as arquivo:
            linhas_gt = list(csv.DictReader(arquivo))

        linhas_import = []
        resultados = []
        for indice, linha_gt in enumerate(linhas_gt, 1):
            linha = linha_para_import(linha_gt)
            linhas_import.append(linha)
            resultados.append(resultado_esperado(nome_base, indice, linha))

        caminho_imp = os.path.join(IMP_DIR, f"{nome_base}.import.csv")
        with open(caminho_imp, "w", newline="", encoding="utf-8") as arquivo:
            escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_IMPORT)
            escritor.writeheader()
            for linha in linhas_import:
                escritor.writerow(linha)

        caminho_res = os.path.join(IMP_DIR, f"{nome_base}.resultado-esperado.csv")
        with open(caminho_res, "w", newline="", encoding="utf-8") as arquivo:
            escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_RESULTADO)
            escritor.writeheader()
            for resultado in resultados:
                escritor.writerow(resultado)

        todas_import.extend(linhas_import)
        todos_resultados.extend(resultados)

        avisos = [r for r in resultados if r["avisos"]]
        falhas = [r for r in resultados if r["status"] == "FAILED"]
        print(f"{nome_base}: {len(linhas_import)} linha(s) | "
              f"{len(avisos)} com aviso | {len(falhas)} rejeição(ões)")

    with open(os.path.join(IMP_DIR, "import.csv"), "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_IMPORT)
        escritor.writeheader()
        for linha in todas_import:
            escritor.writerow(linha)

    with open(os.path.join(IMP_DIR, "resultado-esperado.csv"), "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS_RESULTADO)
        escritor.writeheader()
        for resultado in todos_resultados:
            escritor.writerow(resultado)

    print(f"\nimportacao/import.csv: {len(todas_import)} linhas")
    print(f"importacao/resultado-esperado.csv: {len(todos_resultados)} linhas")


if __name__ == "__main__":
    main()
