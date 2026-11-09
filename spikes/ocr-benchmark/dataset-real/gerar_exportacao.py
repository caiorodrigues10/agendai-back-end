#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera uma imagem simulando a exportação do sistema (aba "Honorários de êxito"
do coreSheets/caseSheets.ts) a partir de dados FICTÍCIOS, e o ground truth
correspondente — o ground truth é **exatamente** o texto que aparece na imagem.

Formato copiado de
backend/src/modules/dataExport/builders/sheets/caseSheets.ts:164-176
(CASE_FEES_COLUMNS) e dos formatos de célula de
backend/src/modules/dataExport/builders/sheetHelpers.ts:102-111:
  currency → 'R$ #,##0.00'  (pt-BR: "R$ 32.890,33")
  date     → 'dd/mm/yyyy'
  datetime → 'dd/mm/yyyy hh:mm'
  decimal  → '#,##0.00'     (pt-BR: "16,00")
  int      → '#,##0'
  situação → rótulo em português (FEE_STATUS_LABELS, caseSheets.ts:57-62)
  id       → uuid (schema.prisma: CaseSuccessFee.id é @default(uuid()))

Saída:
  dataset-real/imagens/export-01.png
  dataset-real/ground-truth/export-01.csv
  dataset-real/manifest-partes/export-01.csv
"""

import csv
import os
import random
import uuid
from datetime import date, datetime

from dataset_core import ANO_CNJ, cnj_numero, dinheiro
from render import desenhar_tabela

OUT = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(OUT, "imagens")
GT_DIR = os.path.join(OUT, "ground-truth")
PARTES_DIR = os.path.join(OUT, "manifest-partes")

for pasta in (IMAGES_DIR, GT_DIR, PARTES_DIR):
    os.makedirs(pasta, exist_ok=True)

SEMENTE = 20261103
rng = random.Random(SEMENTE)

COLUNAS = [
    ("Número do processo", "numero_processo"),
    ("Apelido do caso", "apelido_caso"),
    ("Percentual (%)", "percentual_exito"),
    ("Valor base (R$)", "valor_base"),
    ("Valor do honorário (R$)", "valor_honorario"),
    ("Situação", "situacao"),
    ("Vencimento", "vencimento"),
    ("Parcelas", "parcela"),
    ("Observações", "observacoes"),
    ("Data de criação", "data_criacao"),
    ("ID", "id"),
]

SITUACOES = ["Pendente", "Pago", "Faturado"]
PRIMEIROS = ["Maria", "João", "Ana", "Carlos", "Fernanda", "Ricardo", "Juliana", "Lucas"]
SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Lima", "Ferreira", "Alves"]


def uuid_deterministico(semente: str) -> str:
    """UUID v5 estável (mesma entrada → mesmo id), sem RNG."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"agendai-dataset-real/{semente}"))


def data_hora_aleatoria(rng) -> datetime:
    dia = date(2026, rng.randint(1, 12), rng.randint(1, 28))
    return datetime(dia.year, dia.month, dia.day, rng.randint(8, 19), rng.randint(0, 59))


def gerar_linhas():
    linhas = []
    for i in range(3):
        numero_processo = cnj_numero(f"{rng.randint(0, 9999999):07d}", ANO_CNJ)
        apelido = f"Ação {rng.choice(PRIMEIROS)} {rng.choice(SOBRENOMES)}"
        percentual = rng.randint(10, 30)
        valor_base = round(rng.uniform(5000, 50000), 2)
        valor_honorario = round(valor_base * percentual / 100, 2)
        situacao = rng.choice(SITUACOES)
        vencimento = date(2026, rng.randint(1, 12), rng.randint(1, 28))
        parcelas = rng.choice([1, 1, 2, 3])
        observacoes = "Honorário de êxito sobre valor obtido."
        criada = data_hora_aleatoria(rng)
        id_ = uuid_deterministico(f"export-01-{i}")

        linhas.append({
            "numero_processo": numero_processo,
            "apelido_caso": apelido,
            "percentual_exito": f"{percentual:.2f}".replace(".", ","),
            "valor_base": f"R$ {dinheiro(valor_base)}",
            "valor_honorario": f"R$ {dinheiro(valor_honorario)}",
            "situacao": situacao,
            "vencimento": vencimento.strftime("%d/%m/%Y"),
            "parcela": str(parcelas),
            "observacoes": observacoes,
            "data_criacao": criada.strftime("%d/%m/%Y %H:%M"),
            "id": id_,
        })
    return linhas


def gerar_exportacao():
    linhas = gerar_linhas()

    # A aba exportada não tem título: só cabeçalho + dados, para que o ground
    # truth seja exatamente o conteúdo da imagem.
    img, _layout = desenhar_tabela(
        "",
        COLUNAS,
        linhas,
        tamanho_coluna=13,
        tamanho_linha=13,
        cor_grade=(205, 205, 205),
        fundo_cabecalho=(31, 41, 55),
        cor_cabecalho=(255, 255, 255),
        cor_linha=(90, 90, 90),
        altura_linha=28,
        espaco_coluna=14,
        largura_max_coluna=140,
    )
    img.save(os.path.join(IMAGES_DIR, "export-01.png"))

    colunas = [chave for _rotulo, chave in COLUNAS]
    with open(os.path.join(GT_DIR, "export-01.csv"), "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=colunas)
        escritor.writeheader()
        for linha in linhas:
            escritor.writerow(linha)

    with open(os.path.join(PARTES_DIR, "export-01.csv"), "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=[
            "arquivo", "tipo", "tipo_documento", "largura_px", "altura_px",
            "sintetica", "origem", "casos_especiais",
        ])
        escritor.writeheader()
        escritor.writerow({
            "arquivo": "export-01.png",
            "tipo": "export",
            "tipo_documento": "export",
            "largura_px": img.size[0],
            "altura_px": img.size[1],
            "sintetica": "sim",
            "origem": "export-roundtrip",
            "casos_especiais": "export-roundtrip",
        })

    print(f"Gerado: export-01.png ({img.size[0]}x{img.size[1]}) com {len(linhas)} registros")


if __name__ == "__main__":
    gerar_exportacao()
