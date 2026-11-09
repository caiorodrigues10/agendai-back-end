#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Helpers de desenho do dataset-real.

O layout das tabelas é medido pelo texto real (bbox da fonte): a largura de
cada coluna é a maior entre o cabeçalho quebrado e as células, então as
colunas nunca se sobrepõem — o defeito que existia no export-01 antigo.

Os efeitos de imagem (rotação, ruído, vinheta, compressão JPEG) usam só o
Pillow — nenhum numpy é necessário.
"""

import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTES = {
    "bold": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "regular": "/System/Library/Fonts/Supplemental/Arial.ttf",
    "mono": "/System/Library/Fonts/Supplemental/Courier New.ttf",
    "mono_bold": "/System/Library/Fonts/Supplemental/Courier New Bold.ttf",
    "mao": "/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf",
}


# Respiro entre a linha da grade e o texto da célula.
PADDING = 6


def fonte(chave: str, tamanho: int) -> ImageFont.FreeTypeFont:
    caminho = FONTES.get(chave, FONTES["regular"])
    if not os.path.exists(caminho):
        caminho = FONTES["regular"]
    return ImageFont.truetype(caminho, tamanho)


def largura_texto(draw: ImageDraw.ImageDraw, texto: str, f: ImageFont.FreeTypeFont) -> int:
    if not texto:
        return 0
    caixa = draw.textbbox((0, 0), texto, font=f)
    return caixa[2] - caixa[0]


def quebrar_texto(draw, texto: str, f: ImageFont.FreeTypeFont, largura_max: int) -> list[str]:
    """Quebra o texto em linhas que cabem em `largura_max` (quebra por palavra)."""
    palavras = str(texto).split()
    if not palavras:
        return [""]
    linhas: list[str] = []
    atual = palavras[0]
    for palavra in palavras[1:]:
        tentativa = f"{atual} {palavra}"
        if largura_texto(draw, tentativa, f) <= largura_max:
            atual = tentativa
        else:
            linhas.append(atual)
            atual = palavra
    linhas.append(atual)
    return linhas


def desenhar_tabela(
    titulo: str,
    colunas: list[tuple[str, str]],
    linhas: list[dict],
    *,
    fonte_titulo: str = "bold",
    fonte_coluna: str = "bold",
    fonte_linha: str = "regular",
    tamanho_titulo: int = 24,
    tamanho_coluna: int = 15,
    tamanho_linha: int = 15,
    fundo: str = "white",
    cor_texto=(0, 0, 0),
    cor_cabecalho=(0, 0, 0),
    cor_linha=(120, 120, 120),
    cor_grade=None,
    fundo_cabecalho=None,
    margem: int = 28,
    espaco_coluna: int = 18,
    altura_linha: int = 34,
    largura_max_coluna: int = 150,
    max_largura: int = 2200,
):
    """Desenha uma tabela medindo as colunas — sem sobreposição.

    `colunas` é uma lista de (rótulo, chave) e `linhas` uma lista de dicts.
    Devolve a imagem PIL.
    """
    medida = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    espaco_coluna = max(espaco_coluna, PADDING + 6)
    f_titulo = fonte(fonte_titulo, tamanho_titulo)
    f_coluna = fonte(fonte_coluna, tamanho_coluna)
    f_linha = fonte(fonte_linha, tamanho_linha)

    cabecalhos: list[list[str]] = []
    for rotulo, _chave in colunas:
        cabecalhos.append(quebrar_texto(medida, rotulo, f_coluna, largura_max_coluna))

    larguras: list[int] = []
    for i, (_rotulo, chave) in enumerate(colunas):
        largura = max(
            (largura_texto(medida, linha_cabecalho, f_coluna)
             for linha_cabecalho in cabecalhos[i]),
            default=0,
        )
        for linha in linhas:
            largura = max(largura, largura_texto(medida, str(linha.get(chave, "")), f_linha))
        larguras.append(largura + espaco_coluna)

    while sum(larguras) + 2 * margem > max_largura:
        # Reduz proporcionalmente até caber (nunca corta conteúdo).
        larguras = [max(int(l * 0.9), 40) for l in larguras]

    altura_cabecalho = max(len(c) for c in cabecalhos) * (tamanho_coluna + 6) + 12
    altura = margem + (tamanho_titulo + 18 if titulo else 0) + altura_cabecalho + 12
    altura += altura_linha * len(linhas) + margem
    largura = sum(larguras) + 2 * margem

    img = Image.new("RGB", (largura, altura), fundo)
    draw = ImageDraw.Draw(img)

    y = margem
    if titulo:
        draw.text((margem, y), titulo, font=f_titulo, fill=cor_texto)
        y += tamanho_titulo + 18

    xs: list[int] = []
    x = margem
    for largura_coluna in larguras:
        xs.append(x)
        x += largura_coluna

    topo_cabecalho = y
    if fundo_cabecalho:
        draw.rectangle([margem, y, largura - margem, y + altura_cabecalho], fill=fundo_cabecalho)

    # 1ª passada: grade e separadores (as linhas nunca são desenhadas por cima
    # do texto — o defeito antigo era a grade cortando a primeira letra).
    y = topo_cabecalho + altura_cabecalho
    draw.line([(margem, y), (largura - margem, y)], fill=cor_linha, width=1)

    if cor_grade:
        for x_coluna in xs:
            draw.line([(x_coluna, topo_cabecalho), (x_coluna, altura - margem)],
                      fill=cor_grade, width=1)
        draw.line([(largura - margem, topo_cabecalho), (largura - margem, altura - margem)],
                  fill=cor_grade, width=1)
        draw.line([(margem, topo_cabecalho), (largura - margem, topo_cabecalho)],
                  fill=cor_grade, width=1)

    topos_linhas: list[int] = []
    y_linhas = topo_cabecalho + altura_cabecalho
    for linha in linhas:
        y_linhas += altura_linha
        topos_linhas.append(y_linhas - tamanho_linha - 4)
        if cor_grade:
            draw.line([(margem, y_linhas), (largura - margem, y_linhas)], fill=cor_grade, width=1)

    # 2ª passada: texto (sempre por cima da grade, com respiro interno).
    for i, cabecalho in enumerate(cabecalhos):
        y_linha = topo_cabecalho + 6
        for parte in cabecalho:
            draw.text((xs[i] + PADDING, y_linha), parte, font=f_coluna, fill=cor_cabecalho)
            y_linha += tamanho_coluna + 6

    for indice_linha, linha in enumerate(linhas):
        for i, (_rotulo, chave) in enumerate(colunas):
            draw.text((xs[i] + PADDING, topos_linhas[indice_linha]), str(linha.get(chave, "")),
                      font=f_linha, fill=cor_texto)

    layout = {
        "xs": xs,
        "larguras": larguras,
        "topo_cabecalho": topo_cabecalho,
        "altura_cabecalho": altura_cabecalho,
        "altura_linha": altura_linha,
        "topo_primeira_linha": topo_cabecalho + altura_linha,
        "topos_linhas": topos_linhas,
        "fonte_linha": f_linha,
        "tamanho_linha": tamanho_linha,
    }
    return img, layout


def aplicar_ruido(img: Image.Image, sigma: int = 14, seed: int = 0) -> Image.Image:
    """Soma ruído gaussiano (Pillow puro, sem numpy)."""
    ruido = Image.effect_noise(img.size, sigma).convert("L")
    ruido_rgb = Image.merge("RGB", (ruido, ruido, ruido))
    return Image.blend(img, ruido_rgb, 0.12)


def aplicar_vinheta(img: Image.Image, forca: float = 0.45) -> Image.Image:
    """Escurece as bordas (vinheta de foto)."""
    largura, altura = img.size
    mascara = Image.radial_gradient("L").resize((largura, altura))
    sombra = Image.new("RGB", (largura, altura), (0, 0, 0))
    mascara = mascara.point(lambda v: int(v * forca))
    return Image.composite(sombra, img, mascara)


def rotacionar(img: Image.Image, graus: float, cor_fundo=(128, 128, 126)) -> Image.Image:
    """Rotaciona levemente, como uma foto de papel tirada de lado."""
    return img.rotate(angle=graus, resample=Image.BICUBIC, expand=True, fillcolor=cor_fundo)


def borrar_texto(img: Image.Image, x: int, y: int, largura: int, altura: int,
                 intensidade: float = 2.2) -> None:
    """Borra uma região (dígito ilegível) — modifica a imagem no lugar."""
    regiao = img.crop((x, y, x + largura, y + altura)).filter(
        ImageFilter.GaussianBlur(radius=intensidade)
    )
    img.paste(regiao, (x, y))


def salvar_jpeg(img: Image.Image, caminho: str, qualidade: int = 68) -> None:
    """Salva como JPEG com compressão (o 'print de celular' do dataset)."""
    img.convert("RGB").save(caminho, "JPEG", quality=qualidade, optimize=True)


def fundo_papel_ruido(largura: int, altura: int, seed: int = 0,
                       cor=(252, 250, 242)) -> Image.Image:
    """Papel com textura granulada leve."""
    rng = random.Random(seed)
    img = Image.new("RGB", (largura, altura), cor)
    ruido = Image.effect_noise((largura, altura), 12).convert("L")
    ruido = ruido.point(lambda v: 255 - abs(v - 128) // 3)
    img = Image.blend(img, Image.merge("RGB", (ruido, ruido, ruido)), 0.05)
    _ = rng
    return img


def linhas_pauta(img: Image.Image, cor=(120, 150, 200), espaco: int = 34,
                 margem: int = 40) -> None:
    """Pauta de caderno (linhas azuis)."""
    draw = ImageDraw.Draw(img)
    for y in range(margem, img.size[1] - margem, espaco):
        draw.line([(margem, y), (img.size[0] - margem, y)], fill=cor, width=1)


def margem_pontilhada(img: Image.Image, cor=(220, 90, 90)) -> None:
    """Margem vermelha pontilhada de caderno."""
    draw = ImageDraw.Draw(img)
    x = 52
    for y in range(20, img.size[1] - 20, 16):
        draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=cor)
