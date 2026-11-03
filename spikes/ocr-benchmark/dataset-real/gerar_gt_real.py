#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o ground truth das imagens REAIS (testimage/) em
dataset-real/ground-truth-real/ e o catalogo dataset-real/manifest-real.csv.

A transcricao fica em dataset-real/ground-truth-real/_transcricao.json, que e
lido deste script. Tudo que contem o conteudo das imagens fica em pastas
IGNORADAS pelo .gitignore (backend/.gitignore):
  spikes/ocr-benchmark/dataset-real/real/
  spikes/ocr-benchmark/dataset-real/ground-truth-real/
  spikes/ocr-benchmark/dataset-real/manifest-real.csv

As imagens em testimage/ sao modelos de planilha de terceiros (petshop,
barbearia dashboard, controle barbearia, advogado) - nao contem dados de
cliente reais verificados. Tratam-se de "print de planilha modelo":
sintetica=nao, origem=terceiros.

Todo ground truth sai com revisado=nao. Celula duvidosa / que nao mapeia para
o esquema de honorarios vai em "incerto", sem chutar. O dono (usuario)
marca revisado=sim depois de conferir.
"""
import csv
import json
import os
import shutil

from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
REAL_DIR = os.path.join(BASE, "real")
GT_REAL_DIR = os.path.join(BASE, "ground-truth-real")
MANIFEST = os.path.join(BASE, "manifest-real.csv")
TRANSCRICAO = os.path.join(GT_REAL_DIR, "_transcricao.json")
TESTIMAGE_DIR = os.path.abspath(os.path.join(BASE, "..", "..", "..", "..", "testimage"))

COLUNAS_MANIFEST = ["arquivo", "tipo", "largura_px", "altura_px", "sintetica",
                    "origem", "anonimizada", "lida", "linhas", "celulas_incerto"]


def garantir_imagem(arquivo):
    """Garante a imagem em real/; converte .webp para .png quando preciso."""
    destino = os.path.join(REAL_DIR, arquivo)
    if os.path.exists(destino):
        return destino

    nome_base = os.path.splitext(arquivo)[0]
    for extensao in (".png", ".jpg", ".jpeg", ".webp"):
        origem = os.path.join(TESTIMAGE_DIR, nome_base + extensao)
        if not os.path.exists(origem):
            continue
        if extensao == ".webp":
            with Image.open(origem) as img:
                img.save(destino, format="PNG")
        else:
            shutil.copyfile(origem, destino)
        return destino

    return None


def main():
    if not os.path.exists(TRANSCRICAO):
        raise SystemExit(f"transcricao nao encontrada: {TRANSCRICAO}")

    os.makedirs(REAL_DIR, exist_ok=True)
    os.makedirs(GT_REAL_DIR, exist_ok=True)

    with open(TRANSCRICAO, encoding="utf-8") as f:
        dados = json.load(f)

    manifest_rows = []
    total_incerto = 0

    for imagem in dados["imagens"]:
        arquivo = imagem["arquivo"]
        caminho_img = garantir_imagem(arquivo)
        if not caminho_img:
            print(f"AVISO: imagem nao encontrada em real/ nem em testimage/: {arquivo}")
            continue

        with Image.open(caminho_img) as img:
            largura, altura = img.size

        colunas = list(imagem["colunas"])
        linhas = []
        celulas_incerto = 0
        for bruto in imagem["dados"]:
            linha = {c: "" for c in colunas}
            for campo, valor in bruto.items():
                linha[campo] = valor
            linha["incerto"] = bruto.get("incerto", "")
            linha["revisado"] = bruto.get("revisado", "nao")
            celulas_incerto += len([p for p in linha["incerto"].split(";") if p])
            linhas.append(linha)

        nome_base = os.path.splitext(arquivo)[0]
        caminho_gt = os.path.join(GT_REAL_DIR, f"{nome_base}.csv")
        with open(caminho_gt, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=colunas)
            w.writeheader()
            for l in linhas:
                w.writerow(l)
        print(f"GT: {caminho_gt} ({len(linhas)} linha(s), incerto={celulas_incerto})")

        manifest_rows.append({
            "arquivo": arquivo,
            "tipo": imagem.get("tipo", ""),
            "largura_px": largura,
            "altura_px": altura,
            "sintetica": imagem.get("sintetica", "nao"),
            "origem": imagem.get("origem", "terceiros"),
            "anonimizada": imagem.get("anonimizada", "nao-se-aplica"),
            "lida": imagem.get("lida", "visual"),
            "linhas": len(linhas),
            "celulas_incerto": celulas_incerto,
        })
        total_incerto += celulas_incerto

    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUNAS_MANIFEST)
        w.writeheader()
        for r in manifest_rows:
            w.writerow(r)
    print(f"\nmanifest-real.csv: {len(manifest_rows)} imagem(s)")
    print(f"Total de celulas marcadas incerto: {total_incerto}")


if __name__ == "__main__":
    main()
