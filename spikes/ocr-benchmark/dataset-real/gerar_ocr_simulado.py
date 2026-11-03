#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera saídas de OCR **SIMULADAS** em dataset-real/ocr-output-simulado/ a
partir dos ground truths de dataset-real/ground-truth/.

São arquivos CSV no mesmo formato do GT, com a maioria das células
reproduzida exatamente e algumas leituras intencionalmente ERRADAS (mapa
determinístico, sem RNG) para exercitar o avaliador eval.py.

**SIMULADO: não é resultado de OCR real.**

Erros intencionais inseridos:
  - cadastro-01, linha 1, telefone: dígito faltando (852632804) → CER, não monetário
  - cadastro-05, linha 1, valor_total: "1.250.00" (ambiguidade de separador)
    → erro monetário (125000 ≠ 1250)
  - cadastro-07, linha 2, status: "pendente" (GT "atrasado") → CER
  - export-01, linha 1, percentual_exito: "15,0" (GT "15,00") → CER
"""
import csv
import os

OUT = os.path.dirname(os.path.abspath(__file__))
GT_DIR = os.path.join(OUT, "ground-truth")
OCR_DIR = os.path.join(OUT, "ocr-output-simulado")

# (arquivo_sem_extensao, linha_1based, campo) -> valor lido pelo "OCR"
ERROS = {
    ("cadastro-01", 1, "telefone"): "852632804",
    ("cadastro-05", 1, "valor_total"): "1.250.00",
    ("cadastro-07", 2, "status"): "pago",
    ("export-01", 1, "percentual_exito"): "15,0",
}


def main():
    os.makedirs(OCR_DIR, exist_ok=True)
    nomes = sorted(f for f in os.listdir(GT_DIR) if f.endswith(".csv"))
    total_celulas_erradas = 0
    for nome in nomes:
        id_arquivo = nome.replace(".csv", "")
        caminho_gt = os.path.join(GT_DIR, nome)
        with open(caminho_gt, newline="", encoding="utf-8") as f:
            linhas = list(csv.DictReader(f))
        if not linhas:
            continue
        colunas = list(linhas[0].keys())
        ocr_linhas = []
        for indice, linha in enumerate(linhas, 1):
            nova = {}
            for coluna in colunas:
                chave = (id_arquivo, indice, coluna)
                if chave in ERROS:
                    nova[coluna] = ERROS[chave]
                    total_celulas_erradas += 1
                else:
                    nova[coluna] = linha.get(coluna, "")
            ocr_linhas.append(nova)
        caminho_ocr = os.path.join(OCR_DIR, nome)
        with open(caminho_ocr, "w", newline="", encoding="utf-8") as f:
            escritor = csv.DictWriter(f, fieldnames=colunas)
            escritor.writeheader()
            escritor.writerows(ocr_linhas)
        print(f"Gerado (simulado): {caminho_ocr} ({len(ocr_linhas)} linha(s))")
    print(f"\n{total_celulas_erradas} célula(s) com erro intencional (simulado).")


if __name__ == "__main__":
    main()
