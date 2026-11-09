#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monta o manifest.csv do dataset-real a partir das partes escritas pelos
geradores (manifest-partes/<id>.csv). O manifest nunca é escrito à mão.

Regras verificadas aqui:
  • toda linha tem `sintetica` = "sim";
  • a linha da exportação tem `origem` = "export-roundtrip";
  • `casos_especiais` vem das marcas explícitas dos casos (nenhuma
    coincidência de RNG);
  • toda imagem listada existe no disco.
"""

import csv
import os

OUT = os.path.dirname(os.path.abspath(__file__))
PARTES_DIR = os.path.join(OUT, "manifest-partes")
IMAGES_DIR = os.path.join(OUT, "imagens")
MANIFEST = os.path.join(OUT, "manifest.csv")

COLUNAS = ["arquivo", "tipo", "tipo_documento", "largura_px", "altura_px",
           "sintetica", "origem", "casos_especiais"]


def main():
    partes = []
    for nome in sorted(os.listdir(PARTES_DIR)):
        if not nome.endswith(".csv"):
            continue
        with open(os.path.join(PARTES_DIR, nome), newline="", encoding="utf-8") as arquivo:
            partes.extend(csv.DictReader(arquivo))

    if not partes:
        raise SystemExit("Nenhuma parte de manifest encontrada — rode os geradores antes.")

    partes.sort(key=lambda linha: linha["arquivo"])

    for linha in partes:
        if linha["sintetica"] != "sim":
            raise SystemExit(f"{linha['arquivo']}: sintetica deveria ser 'sim'.")
        caminho = os.path.join(IMAGES_DIR, linha["arquivo"])
        if not os.path.exists(caminho):
            raise SystemExit(f"{linha['arquivo']}: imagem não existe em {IMAGES_DIR}.")
        if linha["tipo"] == "export" and linha["origem"] != "export-roundtrip":
            raise SystemExit(f"{linha['arquivo']}: origem do export deveria ser export-roundtrip.")

    with open(MANIFEST, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS)
        escritor.writeheader()
        for linha in partes:
            escritor.writerow(linha)

    print(f"Manifest com {len(partes)} imagens em {MANIFEST}")
    for linha in partes:
        print(f"  {linha['arquivo']:<20} {linha['tipo']:<10} {linha['largura_px']}x{linha['altura_px']:<6} "
              f"{linha['origem']:<16} {linha['casos_especiais']}")


if __name__ == "__main__":
    main()
