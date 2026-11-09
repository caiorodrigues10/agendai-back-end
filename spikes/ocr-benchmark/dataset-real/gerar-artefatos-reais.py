#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regera os artefatos do ground truth real a partir dos CSV revisados.

- `ground-truth-real/_transcricao.json`: espelho dos CSV (metadados + dados).
- `manifest-real.csv`: catalogo das imagens reais (dimensoes via Pillow).

Sem rede, sem banco. As dimensoes sao lidas das copias em `real/`.
"""
import csv
import json
import os
import sys

from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
GT = os.path.join(BASE, "ground-truth-real")
REAL = os.path.join(BASE, "real")
# Raiz de testimage/ (nao versionada): env var tem prioridade; o padrao e o
# caminho relativo da raiz do repo (4 niveis acima deste arquivo).
TESTIMAGE = os.environ.get("TESTIMAGE_DIR") or os.path.abspath(
    os.path.join(BASE, "..", "..", "..", "..", "testimage"))

# arquivo_fonte (em testimage/) -> csv do ground truth
IMAGENS = [
    ("planilha-para-advogado.jpg.webp", "planilha-para-advogado.csv", "planilha-para-advogado.png"),
    ("planilha-controle-barbearia-1.jpg", "planilha-controle-barbearia-1.csv", "planilha-controle-barbearia-1.jpg"),
    ("O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.png", "O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.csv", "O-Que-Voce-Encontra-na-Planilha-de-Gestao-de-Petshop.png"),
    ("Planilha-para-Barbearia.png", "Planilha-para-Barbearia.csv", "Planilha-para-Barbearia.png"),
]


def status_ocr(nome_base):
    """Status de cada motor de OCR local para a imagem (do .ocr.json)."""
    caminho = os.path.join(BASE, "ocr-output-real", f"{nome_base}.ocr.json")
    if not os.path.exists(caminho):
        return {"a-tesseract-texto": "nao-executado", "c-macos-vision": "nao-executado"}
    with open(caminho, encoding="utf-8") as f:
        payload = json.load(f)
    saida = {}
    for motor in payload.get("motores", []):
        saida[motor["motor"].lower()] = "ok" if motor.get("ok") else "falhou"
    return saida


def main():
    transcricao = {
        "origem": "transcricao manual das 4 imagens de testimage/ (modelos de planilha de terceiros)",
        "lido_em": "2026-11-03",
        "revisado_em": "2026-11-03 (Sessao 3: rascunho revisado contra o OCR local + leitura visual)",
        "observacoes": [
            "Valores monetarios sem o prefixo 'R$' (mesmo formato do ground-truth sintetico).",
            "Percentuais sem o '%'.",
            "Datas mantidas como aparecem na imagem (dd/mm/aaaa ou dd/mm/yy - dia da semana).",
            "Coluna 'incerto' lista os campos duvidosos da linha (separados por ';').",
            "Todas as linhas saem com revisado=nao: quem revisa marca revisado=sim.",
            "OCR local (A-tesseract-texto) rodou offline antes da leitura visual; C-macos-vision falhou (pyobjc ausente).",
        ],
        "imagens": [],
    }
    manifest = []

    for fonte, csv_nome, copia in IMAGENS:
        caminho_csv = os.path.join(GT, csv_nome)
        with open(caminho_csv, newline="", encoding="utf-8") as f:
            linhas = list(csv.DictReader(f))
        colunas = [c for c in linhas[0].keys() if c not in ("incerto", "revisado")]
        dados = []
        for linha in linhas:
            dados.append({c: linha.get(c, "") for c in colunas})

        caminho_real = os.path.join(REAL, copia)
        with Image.open(caminho_real) as im:
            largura, altura = im.size

        nome_base = os.path.splitext(copia)[0]
        ocr = status_ocr(nome_base)
        transcricao["imagens"].append({
            "arquivo": fonte,
            "copia_local": f"dataset-real/real/{copia}",
            "tipo": "planilha",
            "sintetica": "nao",
            "origem": "terceiros",
            "anonimizada": "nao-se-aplica",
            "lida": "visual",
            "ocr_local": ocr,
            "largura_px": largura,
            "altura_px": altura,
            "colunas": colunas,
            "dados": dados,
        })

        celulas_incerto = sum(
            len([c for c in (linha.get("incerto") or "").split(";") if c.strip()])
            for linha in linhas
        )
        manifest.append({
            "arquivo": fonte,
            "tipo": "planilha",
            "largura_px": largura,
            "altura_px": altura,
            "sintetica": "nao",
            "origem": "terceiros",
            "anonimizada": "nao-se-aplica",
            "lida": "visual",
            "ocr_local": "a-tesseract-texto",
            "ocr_macos_vision": ocr.get("c-macos-vision", "nao-executado"),
            "linhas": len(linhas),
            "celulas_incerto": celulas_incerto,
        })

    with open(os.path.join(GT, "_transcricao.json"), "w", encoding="utf-8") as f:
        json.dump(transcricao, f, ensure_ascii=False, indent=2)
        f.write("\n")

    with open(os.path.join(BASE, "manifest-real.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(manifest[0].keys()))
        w.writeheader()
        for linha in manifest:
            w.writerow(linha)

    for linha in manifest:
        print(f"{linha['arquivo']}: {linha['linhas']} linha(s), {linha['celulas_incerto']} celula(s) incerto, "
              f"{linha['largura_px']}x{linha['altura_px']}")


if __name__ == "__main__":
    sys.exit(main())
