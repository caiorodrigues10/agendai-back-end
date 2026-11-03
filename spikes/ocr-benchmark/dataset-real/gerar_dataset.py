#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera o dataset-real do spike OCR (dados FICTÍCIOS, sintéticos).

Imagens por tipo de captura:
  • foto     — papel fotografado: leve rotação, ruído, vinheta e JPEG
  • print    — sistema antigo: fundo escuro, fonte pequena (monoespaçada)
  • planilha — grade com linhas, cabeçalho sombreado
  • caderno  — pauta de caderno com fonte manuscrita e ruído
  • recibo / contrato — documentos impressos

Cada imagem tem um ground truth CSV com as colunas:
  cliente, telefone, numero_processo, tipo_honorario, valor_total,
  percentual_exito, parcela, vencimento, data_pagamento, status, incerto

O manifest é gerado por script (ver gerar_manifest.py) a partir das partes
escritas por cada gerador — nunca à mão.

Saída:
  dataset-real/imagens/<id>.png|.jpg
  dataset-real/ground-truth/<id>.csv
  dataset-real/manifest-partes/<id>.csv
"""

import csv
import os
import random

from PIL import Image, ImageDraw

from dataset_core import (
    ANO_CNJ,
    cnj_numero,
    dinheiro,
    telefone_celular,
    telefone_fixo,
    telefone_formatado,
)
from render import (
    aplicar_ruido,
    aplicar_vinheta,
    borrar_texto,
    desenhar_tabela,
    fundo_papel_ruido,
    fonte,
    linhas_pauta,
    largura_texto,
    margem_pontilhada,
    rotacionar,
    salvar_jpeg,
)


OUT = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(OUT, "imagens")
GT_DIR = os.path.join(OUT, "ground-truth")
PARTES_DIR = os.path.join(OUT, "manifest-partes")

for pasta in (IMAGES_DIR, GT_DIR, PARTES_DIR):
    os.makedirs(pasta, exist_ok=True)

SEMENTE = 20261102
rng = random.Random(SEMENTE)

COLUNAS_TABELA = [
    ("Cliente", "cliente"),
    ("Telefone", "telefone_fmt"),
    ("Processo", "numero_processo"),
    ("Tipo", "tipo_honorario"),
    ("Valor (R$)", "valor_fmt"),
    ("%", "percentual_exito"),
    ("Parcela", "parcela"),
    ("Vencimento", "vencimento"),
    ("Pagamento", "data_pagamento"),
    ("Status", "status"),
]


def novo_caso(**campos):
    caso = {
        "cliente": "",
        "telefone": "",
        "numero_processo": "",
        "tipo_honorario": "contratual",
        "valor_total": 0.0,
        "percentual_exito": 10,
        "parcela": "1/1",
        "vencimento": "",
        "data_pagamento": "",
        "status": "pendente",
        "incerto": [],
        "casos_especiais": [],
    }
    caso.update(campos)
    caso["telefone_fmt"] = telefone_formatado(caso["telefone"])
    caso["valor_fmt"] = dinheiro(caso["valor_total"])
    return caso


def processo(nnnnnnn: str) -> str:
    return cnj_numero(nnnnnnn, ANO_CNJ)


def montar_casos():
    """Casos base com marcas (tags) explícitas — sem coincidência de RNG."""
    processo_compartilhado = processo("0046868")

    casos = [
        novo_caso(
            cliente="Juliana Oliveira",
            telefone=telefone_fixo(rng),
            numero_processo=processo("0046868"),
            tipo_honorario="contratual",
            valor_total=14786.36,
            percentual_exito=11,
            parcela="1/3",
            vencimento="2026-04-26",
            data_pagamento="2026-10-06",
            status="atrasado",
            casos_especiais=["duplicata-cliente"],
        ),
        novo_caso(
            cliente="Juliana Oliveira",
            telefone=telefone_fixo(rng),
            numero_processo=processo("0208938"),
            tipo_honorario="exito",
            valor_total=8823.33,
            percentual_exito=21,
            parcela="1/3",
            vencimento="2026-02-21",
            data_pagamento="",
            status="pendente",
            casos_especiais=["duplicata-cliente"],
        ),
        novo_caso(
            cliente="Ricardo Rodrigues",
            telefone=telefone_celular(rng),
            numero_processo=processo_compartilhado,
            tipo_honorario="sucumbencia",
            valor_total=1083.69,
            percentual_exito=29,
            parcela="1/3",
            vencimento="2026-11-08",
            data_pagamento="2026-10-04",
            status="pendente",
            casos_especiais=["parcelas-mesmo-processo"],
        ),
        novo_caso(
            cliente="João Pereira",
            telefone=telefone_fixo(rng),
            numero_processo=processo_compartilhado,
            tipo_honorario="sucumbencia",
            valor_total=8364.35,
            percentual_exito=13,
            parcela="2/3",
            vencimento="2026-08-23",
            data_pagamento="2026-08-06",
            status="atrasado",
            casos_especiais=["parcelas-mesmo-processo"],
        ),
        novo_caso(
            cliente="Patrícia Alves",
            telefone=telefone_celular(rng),
            numero_processo=processo("0240730"),
            tipo_honorario="exito",
            valor_total=1250.00,
            percentual_exito=13,
            parcela="2/3",
            vencimento="2026-05-10",
            data_pagamento="",
            status="pendente",
            incerto=["valor_total"],
            casos_especiais=["valor-ambiguo"],
        ),
        novo_caso(
            cliente="",
            telefone=telefone_celular(rng),
            numero_processo=processo("0210811"),
            tipo_honorario="contratual",
            valor_total=7310.11,
            percentual_exito=8,
            parcela="3/4",
            vencimento="2026-04-06",
            data_pagamento="",
            status="atrasado",
            casos_especiais=["processo-sem-cliente"],
        ),
        novo_caso(
            cliente="Ana Souza",
            telefone=telefone_celular(rng),
            numero_processo=processo("0729120"),
            tipo_honorario="contratual",
            valor_total=4520.80,
            percentual_exito=20,
            parcela="1/2",
            vencimento="2026-12-15",
            data_pagamento="",
            status="pendente",
        ),
        novo_caso(
            cliente="Carlos Ferreira",
            telefone=telefone_fixo(rng),
            numero_processo="",
            tipo_honorario="exito",
            valor_total=3290.00,
            percentual_exito=15,
            parcela="2/2",
            vencimento="2026-03-18",
            data_pagamento="",
            status="pendente",
            casos_especiais=["processo-ausente"],
        ),
        novo_caso(
            cliente="Fernanda Costa",
            telefone=telefone_celular(rng),
            numero_processo=processo("0530417"),
            tipo_honorario="exito",
            valor_total=7679.62,
            percentual_exito=17,
            parcela="1/3",
            vencimento="2026-10-01",
            data_pagamento="2026-08-24",
            status="pago",
        ),
        novo_caso(
            cliente="Lucas Rodrigues",
            telefone=telefone_celular(rng),
            numero_processo=processo("0658076"),
            tipo_honorario="sucumbencia",
            valor_total=9202.97,
            percentual_exito=12,
            parcela="1/3",
            vencimento="2026-03-25",
            data_pagamento="2026-01-19",
            status="pendente",
        ),
        novo_caso(
            cliente="Gustavo Lima",
            telefone=telefone_fixo(rng),
            numero_processo=processo("0281787"),
            tipo_honorario="sucumbencia",
            valor_total=9011.69,
            percentual_exito=11,
            parcela="3/5",
            vencimento="2026-08-04",
            data_pagamento="2026-09-25",
            status="pendente",
        ),
    ]

    # O caso duplicado (cadastro-02) tem exatamente o mesmo cliente/telefone do
    # caso 1 — marcado por tag, não por coincidência do sorteio.
    casos[1]["telefone"] = casos[0]["telefone"]
    casos[1]["telefone_fmt"] = telefone_formatado(casos[1]["telefone"])
    return casos


def linhas_documento(caso: dict) -> list[str]:
    """Linhas do documento impresso/fotografado (o mesmo conteúdo do GT)."""
    return [
        f"Cliente: {caso['cliente'] or '(não informado)'}",
        f"Telefone: {caso['telefone_fmt']}",
        f"Processo: {caso['numero_processo'] or '(não informado)'}",
        f"Tipo: {caso['tipo_honorario']}",
        f"Valor total (R$): {caso['valor_fmt']}",
        f"Percentual de êxito: {caso['percentual_exito']}%",
        f"Parcela: {caso['parcela']}",
        f"Vencimento: {caso['vencimento'] or '(não informado)'}",
        f"Data de pagamento: {caso['data_pagamento'] or '(não informado)'}",
        f"Status: {caso['status']}",
    ]


def render_planilha(caminho: str, titulo: str, casos: list[dict]) -> tuple[int, int]:
    """Planilha: grade com linhas, cabeçalho sombreado."""
    img, _layout = desenhar_tabela(
        titulo,
        COLUNAS_TABELA,
        casos,
        tamanho_titulo=22,
        tamanho_coluna=14,
        tamanho_linha=14,
        cor_grade=(190, 190, 190),
        fundo_cabecalho=(224, 230, 238),
        cor_linha=(90, 90, 90),
        altura_linha=30,
    )
    img.save(caminho)
    return img.size


def render_print(caminho: str, titulo: str, casos: list[dict]) -> tuple[int, int]:
    """Print de sistema antigo: fundo escuro, fonte pequena e monoespaçada."""
    img, _layout = desenhar_tabela(
        titulo,
        COLUNAS_TABELA,
        casos,
        fonte_coluna="mono_bold",
        fonte_linha="mono",
        tamanho_titulo=14,
        tamanho_coluna=12,
        tamanho_linha=12,
        fundo=(12, 20, 44),
        cor_texto=(214, 222, 236),
        cor_cabecalho=(255, 214, 120),
        cor_linha=(78, 104, 160),
        cor_grade=(46, 64, 108),
        altura_linha=24,
        espaco_coluna=12,
    )
    # Barra de título de janela (visual de sistema antigo).
    largura, altura = img.size
    moldura = Image.new("RGB", (largura, altura + 30), (12, 20, 44))
    draw = ImageDraw.Draw(moldura)
    draw.rectangle([0, 0, largura, 28], fill=(28, 46, 92))
    draw.rectangle([0, 28, largura, 30], fill=(90, 130, 210))
    draw.text((12, 7), f"{titulo}  [ SISTEMA ANTIGO v2.3 ]", font=fonte("mono_bold", 13),
              fill=(235, 240, 250))
    moldura.paste(img, (0, 30))
    moldura.save(caminho)
    return moldura.size


def render_documento(caminho: str, titulo: str, casos: list[dict]) -> tuple[int, int]:
    """Documento impresso claro (recibo/contrato)."""
    f_titulo = fonte("bold", 22)
    f_linha = fonte("regular", 15)
    linhas = linhas_documento(casos[0])
    largura = 760
    altura = 120 + 28 * len(linhas) + 120
    img = Image.new("RGB", (largura, altura), "white")
    draw = ImageDraw.Draw(img)
    draw.text((40, 34), titulo, font=f_titulo, fill=(0, 0, 0))
    draw.line([(40, 74), (largura - 40, 74)], fill=(0, 0, 0), width=1)
    y = 100
    for linha in linhas:
        draw.text((40, y), linha, font=f_linha, fill=(0, 0, 0))
        y += 28
    draw.line([(40, y + 8), (largura - 40, y + 8)], fill=(0, 0, 0), width=1)
    y += 28
    for extra in ("", "Recebido conforme acima.", "", "Assinatura: ______________________"):
        draw.text((40, y), extra, font=f_linha, fill=(0, 0, 0))
        y += 26
    img.save(caminho)
    return img.size


def render_foto(caminho: str, titulo: str, casos: list[dict]) -> tuple[int, int]:
    """Foto de celular: papel fotografado com leve rotação, ruído, vinheta e JPEG."""
    f_titulo = fonte("bold", 22)
    f_linha = fonte("regular", 16)
    linhas = linhas_documento(casos[0])
    papel_l, papel_a = 780, 560
    papel = Image.new("RGB", (papel_l, papel_a), (252, 252, 250))
    draw = ImageDraw.Draw(papel)
    draw.text((46, 40), titulo, font=f_titulo, fill=(35, 35, 35))
    draw.line([(46, 78), (papel_l - 46, 78)], fill=(90, 90, 90), width=1)
    y = 104
    for linha in linhas:
        draw.text((46, y), linha, font=f_linha, fill=(30, 30, 30))
        y += 34

    fundo_l, fundo_a = papel_l + 90, papel_a + 90
    fundo = Image.new("RGB", (fundo_l, fundo_a), (138, 137, 133))
    fundo.paste(papel, (45, 45))
    img = rotacionar(fundo, 1.4, cor_fundo=(138, 137, 133))
    img = aplicar_ruido(img, sigma=16, seed=7)
    img = aplicar_vinheta(img, forca=0.5)
    salvar_jpeg(img, caminho, qualidade=68)
    return img.size


def render_caderno(caminho: str, titulo: str, casos: list[dict]) -> tuple[int, int]:
    """Caderno: pauta, fonte manuscrita e ruído."""
    f_titulo = fonte("mao", 26)
    f_linha = fonte("mao", 20)
    largura, altura = 900, 620
    img = fundo_papel_ruido(largura, altura, seed=11, cor=(250, 248, 238))
    linhas_pauta(img, espaco=40)
    margem_pontilhada(img)
    draw = ImageDraw.Draw(img)
    draw.text((80, 26), titulo, font=f_titulo, fill=(28, 42, 96))
    y = 86
    for i, caso in enumerate(casos, 1):
        draw.text((80, y), f"{i}. {caso['cliente']} - {caso['numero_processo'] or 'sem processo'}",
                  font=f_linha, fill=(24, 38, 92))
        y += 44
        draw.text((110, y),
                  f"Tel: {caso['telefone_fmt']} | {caso['tipo_honorario']} | {caso['parcela']} | {caso['status']}",
                  font=f_linha, fill=(24, 38, 92))
        y += 44
        draw.text((110, y),
                  f"Valor: R$ {caso['valor_fmt']} | {caso['percentual_exito']}% | venc. {caso['vencimento']} | pago {caso['data_pagamento'] or '-'}",
                  font=f_linha, fill=(24, 38, 92))
        y += 56
    img = rotacionar(img, -0.9, cor_fundo=(238, 236, 226))
    img = aplicar_ruido(img, sigma=18, seed=13)
    img.save(caminho)
    return img.size


def render_planilha_com_ambiguidade(caminho: str, titulo: str, casos: list[dict],
                                    indice_coluna_valor: int = 4) -> tuple[int, int]:
    """Planilha em que a última linha tem o valor parcialmente ilegível."""
    img, layout = desenhar_tabela(
        titulo,
        COLUNAS_TABELA,
        casos,
        tamanho_titulo=22,
        tamanho_coluna=14,
        tamanho_linha=14,
        cor_grade=(190, 190, 190),
        fundo_cabecalho=(224, 230, 238),
        cor_linha=(90, 90, 90),
        altura_linha=30,
    )
    # Borrão no separador decimal da última linha: a vírgula de "1.250,00"
    # fica ilegível, então o valor pode ser lido como 1.250,00 (mil e
    # duzentos e cinquenta reais) ou como 1.250.00 (cento e vinte e cinco
    # mil). A célula é listada em "incerto" no ground truth.
    f_linha = layout["fonte_linha"]
    valor = str(casos[-1]["valor_fmt"])
    medida = ImageDraw.Draw(img)
    x_base = layout["xs"][indice_coluna_valor]
    y = layout["topos_linhas"][len(casos) - 1]
    altura = layout["tamanho_linha"] + 6

    x_sep = None
    for i, ch in enumerate(valor):
        if ch == ",":
            antes = largura_texto(medida, valor[:i], f_linha)
            depois = largura_texto(medida, valor[:i + 1], f_linha)
            x_sep = x_base + (antes + depois) / 2
            break
    if x_sep is None:
        largura_valor = largura_texto(medida, valor, f_linha)
        x_sep = x_base + largura_valor - altura / 2

    borrar_texto(
        img,
        int(x_sep - altura / 2),
        y - 2,
        int(altura * 1.5),
        altura,
        intensidade=3.0,
    )
    img.save(caminho)
    return img.size



def escrever_ground_truth(caminho: str, casos: list[dict]) -> None:
    colunas = ["cliente", "telefone", "numero_processo", "tipo_honorario", "valor_total",
               "percentual_exito", "parcela", "vencimento", "data_pagamento", "status", "incerto"]
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.writer(arquivo)
        escritor.writerow(colunas)
        for caso in casos:
            escritor.writerow([
                caso["cliente"],
                caso["telefone"],
                caso["numero_processo"],
                caso["tipo_honorario"],
                dinheiro(caso["valor_total"]),
                caso["percentual_exito"],
                caso["parcela"],
                caso["vencimento"],
                caso["data_pagamento"],
                caso["status"],
                ",".join(caso["incerto"]),
            ])


def escrever_parte_manifest(caminho: str, arquivo: str, tipo: str, tipo_documento: str,
                            largura: int, altura: int, casos_especiais: list[str]) -> None:
    """Uma linha do manifest — o manifest final é montado por gerar_manifest.py."""
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo_csv:
        escritor = csv.DictWriter(arquivo_csv, fieldnames=[
            "arquivo", "tipo", "tipo_documento", "largura_px", "altura_px",
            "sintetica", "origem", "casos_especiais",
        ])
        escritor.writeheader()
        escritor.writerow({
            "arquivo": arquivo,
            "tipo": tipo,
            "tipo_documento": tipo_documento,
            "largura_px": largura,
            "altura_px": altura,
            "sintetica": "sim",
            "origem": "fictícia",
            "casos_especiais": ";".join(casos_especiais),
        })


def main():
    casos = montar_casos()

    imagens = [
        ("cadastro-01", "print", "cadastro", "Honorários de êxito", [casos[0]], "render_print"),
        ("cadastro-02", "foto", "cadastro", "Honorários de êxito", [casos[1]], "render_foto"),
        ("cadastro-03", "planilha", "cadastro", "Honorários de êxito", [casos[2]], "render_planilha"),
        ("cadastro-04", "foto", "cadastro", "Honorários de êxito", [casos[3]], "render_foto"),
        ("cadastro-05", "planilha", "cadastro", "Honorários de êxito", [casos[4]],
         "render_planilha_com_ambiguidade"),
        ("cadastro-06", "print", "cadastro", "Honorários de êxito", [casos[5]], "render_print"),
        ("cadastro-07", "planilha", "cadastro", "Honorários de êxito",
         [casos[0], casos[2], casos[3]], "render_planilha"),
        ("recibo-01", "recibo", "recibo", "RECIBO DE HONORÁRIOS", [casos[7]], "render_documento"),
        ("contrato-01", "contrato", "contrato", "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
         [casos[8]], "render_documento"),
        ("caderno-01", "caderno", "caderno", "Caderno de Honorários", [casos[9], casos[10]],
         "render_caderno"),
    ]

    for id_arquivo, tipo, tipo_documento, titulo, casos_lista, funcao in imagens:
        extensao = ".jpg" if tipo == "foto" else ".png"
        nome_img = f"{id_arquivo}{extensao}"
        caminho_img = os.path.join(IMAGES_DIR, nome_img)
        render = globals()[funcao]
        largura, altura = render(caminho_img, titulo, casos_lista)

        escrever_ground_truth(os.path.join(GT_DIR, f"{id_arquivo}.csv"), casos_lista)

        especiais: list[str] = []
        for caso in casos_lista:
            for marca in caso["casos_especiais"]:
                if marca not in especiais:
                    especiais.append(marca)
        if len(casos_lista) > 1 and "varias-linhas" not in especiais:
            especiais.append("varias-linhas")

        escrever_parte_manifest(
            os.path.join(PARTES_DIR, f"{id_arquivo}.csv"),
            nome_img, tipo, tipo_documento, largura, altura, especiais,
        )
        print(f"Gerado: {nome_img} ({tipo}) + ground-truth/{id_arquivo}.csv")

    print(f"\n{len(imagens)} imagens em {IMAGES_DIR}")
    print("Partes do manifest em", PARTES_DIR)


if __name__ == "__main__":
    main()
