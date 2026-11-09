#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Formatters e validadores compartilhados pelo dataset-real.

Tudo aqui é determinístico: nenhum dado depende de rede, banco ou sorteio
quando a semente é fixada. As regras vêm do código do produto:

  • dinheiro(): padrão brasileiro — milhar com ponto, decimal com vírgula
    (é o mesmo formato que `normalizeMoney` do importador espera,
    backend/src/modules/dataImport/utils/rowNormalization.ts:161-175);
  • CNJ: DV = 98 - (int(NNNNNNN+AAAA+J+TR+OOOO+"00") % 97), com 2 dígitos e
    origem (OOOO) fixa — é a mesma conta de
    backend/src/shared/utils/cnj.ts:3-11, cuja equivalência é
    (base*100 + DV) % 97 == 1;
  • telefone: celular (DD) 9XXXX-XXXX = 11 dígitos, fixo (DD) XXXX-XXXX =
    10 dígitos (backend/src/modules/clients/utils/ensureSalonClient.ts:4-13
    aceita 10 ou 11 dígitos nacionais).
"""

import re
from decimal import Decimal, ROUND_HALF_UP

# Origem (OOOO) fixa do CNJ — nunca derivada do DV.
ORIGEM_CNJ = "0100"
ANO_CNJ = "2025"
TRIBUNAL_CNJ = "8"  # J
TR_CNJ = "26"  #.TR

DDDS = ("11", "21", "31", "41", "48", "51", "61", "71", "81", "85")

# Regex de privacidade: encontra sequências de telefone (DDD + 8 ou 9 dígitos
# nacionais = 10 ou 11 dígitos totais) em texto livre, tolerando os
# separadores comuns de máscara (( ), - e espaço).
RE_TELEFONE_PRIVACIDADE = re.compile(
    r"(?<!\d)(\d{2})[\s\-.()]*(\d{4,5})[\s\-]*(\d{4})(?!\d)"
)


def digitos(valor: str) -> str:
    """Mantém só os dígitos de qualquer string."""
    return re.sub(r"\D", "", valor or "")


def eh_celular(digitos: str) -> bool:
    """11 dígitos, nono dígito (após o DDD) igual a '9' → celular."""
    d = digitos_telefone(digitos)
    return len(d) == 11 and d[2] == "9"


def eh_fixo(digitos: str) -> bool:
    """10 dígitos, nono dígito (após o DDD) entre 2 e 5 → fixo."""
    d = digitos_telefone(digitos)
    return len(d) == 10 and d[2] in "2345"


def telefone_valido(digitos: str) -> bool:
    """Telefone brasileiro: exatamente 10 (fixo) ou 11 (celular) dígitos."""
    d = digitos_telefone(digitos)
    return eh_celular(d) or eh_fixo(d)


def grep_telefones(texto: str) -> list[tuple[str, str]]:
    """'Grep de privacidade': acha sequências de telefone no texto.

    Devolve lista de (digitos, tipo) onde tipo é "celular" (11 dígitos) ou
    "fixo" (10 dígitos). Usado para garantir que o dataset não contenha
    telefones com tamanhos fora do padrão (10/11 dígitos).
    """
    achados: list[tuple[str, str]] = []
    for m in RE_TELEFONE_PRIVACIDADE.finditer(texto or ""):
        d = m.group(1) + m.group(2) + m.group(3)
        if eh_celular(d) or eh_fixo(d):
            achados.append((d, "celular" if eh_celular(d) else "fixo"))
    return achados


def dinheiro(valor) -> str:
    """Formata um número no padrão brasileiro: milhar com ponto, decimal com vírgula.

    >>> dinheiro(14786.36)
    '14.786,36'
    >>> dinheiro(1250.0)
    '1.250,00'
    >>> dinheiro(800.5)
    '800,50'
    >>> dinheiro(0.99)
    '0,99'
    """
    quantizado = Decimal(str(valor)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    inteiro = int(quantizado)
    centavos = int((quantizado - inteiro) * 100)
    milhar = f"{inteiro:,}".replace(",", ".")
    return f"{milhar},{centavos:02d}"


def digitos_telefone(valor: str) -> str:
    """Mantém só os dígitos do telefone."""
    return re.sub(r"\D", "", valor or "")


def telefone_formatado(digitos: str) -> str:
    """Aplica a máscara brasileira conforme o tamanho do número.

    11 dígitos → celular (DD) 9XXXX-XXXX
    10 dígitos → fixo    (DD) XXXX-XXXX
    """
    d = digitos_telefone(digitos)
    if len(d) == 11:
        return f"({d[:2]}) {d[2:7]}-{d[7:]}"
    if len(d) == 10:
        return f"({d[:2]}) {d[2:6]}-{d[6:]}"
    raise ValueError(f"telefone fora de 10/11 dígitos: {digitos!r}")


def cnj_dv(nnnnnnn: str, aaaa: str, j: str, tr: str, oooo: str) -> int:
    """Dígito verificador do CNJ: 98 - (int(NNNNNNN+AAAA+J+TR+OOOO+'00') % 97)."""
    base = int(f"{nnnnnnn}{aaaa}{j}{tr}{oooo}00")
    return 98 - (base % 97)


def cnj_numero(nnnnnnn: str, aaaa: str = ANO_CNJ, j: str = TRIBUNAL_CNJ,
               tr: str = TR_CNJ, oooo: str = ORIGEM_CNJ) -> str:
    """Monta o CNJ completo (20N.NNNNN-DD.AAAA.J.TR.OOOO) com DV válido."""
    dv = cnj_dv(nnnnnnn, aaaa, j, tr, oooo)
    return f"{nnnnnnn}-{dv:02d}.{aaaa}.{j}.{tr}.{oooo}"


def cnj_valido(cnj: str) -> bool:
    """True quando o DV do CNJ confere com a regra de módulo 97."""
    d = digitos_telefone(cnj)
    if len(d) != 20:
        return False
    nnnnnnn, dv, aaaa, j, tr, oooo = d[:7], d[7:9], d[9:13], d[13], d[14:16], d[16:20]
    return int(dv) == cnj_dv(nnnnnnn, aaaa, j, tr, oooo)


def telefone_celular(rng) -> str:
    """Gera um celular fictício: DDD + 9 + 8 dígitos (11 dígitos)."""
    ddd = rng.choice(DDDS)
    return f"{ddd}9{rng.randint(0, 99999999):08d}"


def telefone_fixo(rng) -> str:
    """Gera um fixo fictício: DDD + 8 dígitos com primeiro dígito 2-5 (10 dígitos)."""
    ddd = rng.choice(DDDS)
    return f"{ddd}{rng.randint(2, 5)}{rng.randint(0, 9999999):07d}"
