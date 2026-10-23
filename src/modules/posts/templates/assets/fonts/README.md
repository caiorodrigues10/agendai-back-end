# Fontes do motor de posts (Fase 1)

Fontes **estáticas TTF** sob licença **OFL** (SIL Open Font License), usadas pelo
Satori no render dos modelos de post. Nada de WOFF2 (o Satori consome TTF/OTF).

## Pacote atual (Fase 1)

| Família | Arquivo | Peso | Origem |
|---|---|---|---|
| Montserrat | `Montserrat-ExtraBold.ttf` | 800 | instanciada de `Montserrat[wght].ttf` (google/fonts) |
| Montserrat | `Montserrat-Black.ttf` | 900 | idem |
| Inter | `Inter-Regular.ttf` | 400 | instanciada de `Inter[opsz,wght].ttf` (google/fonts) |
| Inter | `Inter-Medium.ttf` | 500 | idem |
| Inter | `Inter-Bold.ttf` | 700 | idem |

Licenças: `Montserrat-OFL.txt`, `Inter-OFL.txt` (cópias de `google/fonts/ofl/<font>/OFL.txt`,
presentes nesta pasta). Requerem preservar o copyright e a licença ao redistribuir.

## Versões

| Fonte | Arquivo variável (google/fonts) | Versão (`name` ID 5) | Instanciadas |
|---|---|---|---|
| Montserrat | `ofl/montserrat/Montserrat[wght].ttf` | `Version 9.000` | 800 → `Version 9.000` · 900 → `Version 9.000` |
| Inter | `ofl/inter/Inter[opsz,wght].ttf` | `Version 4.001;git-66647c0bb` | 400/500/700 → `Version 4.001;git-66647c0bb` |

- `OS/2.usWeightClass` sai correto do instancer (800/900 e 400/500/700) — é por ele que o
  Satori escolhe a face quando o layout pede `fontWeight`.
- O nome legado (`name` 1/4) continua `Montserrat Thin`/`Inter Regular` porque o instancer
  roda sem `--update-name-table`; o que o Satori casa com `fontFamily` é a família
  tipográfica (`name` 16) = **Montserrat** / **Inter**.
- Ferramentas usadas na PoC/verificação: `fonttools 4.67.0` + `brotli` (instanciação e
  conferência de GPOS) e `uharfbuzz 0.56.4` (prova de shaping, mesmo motor do Satori).

## Como foram geradas (estáticas a partir das variáveis)

O `google/fonts` publica hoje apenas as fontes **variáveis**. As estáticas foram
geradas com `fonttools varLib.instancer`, fixando os eixos:

```bash
# Montserrat (eixo de peso)
fonttools varLib.instancer Montserrat.ttf wght=800 -o Montserrat-ExtraBold.ttf
fonttools varLib.instancer Montserrat.ttf wght=900 -o Montserrat-Black.ttf

# Inter (eixos de óptica + peso; opsz fixado em 14 = corpo de texto)
fonttools varLib.instancer Inter.ttf opsz=14 wght=400 -o Inter-Regular.ttf
fonttools varLib.instancer Inter.ttf opsz=14 wght=500 -o Inter-Medium.ttf
fonttools varLib.instancer Inter.ttf opsz=14 wght=700 -o Inter-Bold.ttf
```

Dependência: `pip install fonttools brotli`.

## Nota sobre OTLOffsetOverflowError e kerning

O `varLib.instancer` loga `Attempting to fix OTLOffsetOverflowError ('GPOS'…)` ao
instanciar Montserrat/Inter. É o fonttools **re-empacotando** as sub-tabelas GPOS
grandes para caber nos offsets (os `PairSet` saem agrupados de outro jeito) — **não**
descarta dados de kerning.

Conferência reproduzida em 2026-10-23 (`fonttools 4.67.0`, `ttx -t GPOS` + shaping
`uharfbuzz 0.56.4`):

| Fonte | `<Lookup>` | `PairValueRecord` | `PairSet` | pares First×Second |
|---|---|---|---|---|
| Montserrat variável (original) | 17 | **3.267** | 738 | — |
| Montserrat-ExtraBold (instanciada) | 17 | **3.267** | 688 | idênticos à origem |
| Montserrat-Black (instanciada) | 17 | **3.267** | 688 | idênticos à origem |

Os **3.267 pares de kerning são os mesmos** (conjunto First×Second idêntico); muda só
o agrupamento dos `PairSet` (738 → 688), efeito do re-empacotamento.

Prova no motor de shaping do Satori (harfbuzz) — variável instanciada em `wght` igual
é **idêntica** às estáticas (glifos, avanços e kern), palavras de controle 1.0b:

| Texto | avanço var@800 | ExtraBold | kern aplicado | var@900 vs Black |
|---|---|---|---|---|
| `AVATAR` | 4351 | 4351 | −148 | idêntico |
| `TABELA DE` | 6019 | 6019 | −28 | idêntico |
| `VALORES` | 5017 | 5017 | −50 | idêntico |

Sem perda de kerning: espaçamento correto (sem letras coladas nem soltas). Originalmente
concluído na PoC 1.0b (2026-10-22) e **reconfirmado na Fase 1.2 (2026-10-23)**, desta vez
com o comando de conferência versionado abaixo.

### Como reproduzir a conferência

```bash
python3 -m venv /tmp/fontvenv
/tmp/fontvenv/bin/pip install fonttools brotli uharfbuzz

# 1) contagem de kerning (GPOS) — origem e instanciadas devem bater em 3.267
/tmp/fontvenv/bin/ttx -q -t GPOS -o /tmp/mont-var.ttx "Montserrat[wght].ttf"
/tmp/fontvenv/bin/ttx -q -t GPOS -o /tmp/mont-800.ttx Montserrat-ExtraBold.ttf
grep -c '<PairValueRecord' /tmp/mont-var.ttx /tmp/mont-800.ttx

# 2) shaping: var@800 == ExtraBold e var@900 == Black (glifos + avanços + kern)
/tmp/fontvenv/bin/python - <<'PY'
import uharfbuzz as hb
def shape(path, text, var=None, kern=True):
    font = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
    if var: font.set_variations(var)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {} if kern else {"kern": False})
    return [(i.codepoint, p.x_advance) for i, p in zip(buf.glyph_infos, buf.glyph_positions)]
for w in ("AVATAR", "TABELA DE", "VALORES"):
    print(w, shape("Montserrat[wght].ttf", w, {"wght": 800}) == shape("Montserrat-ExtraBold.ttf", w))
PY
```

## Versionamento

- Fontes variáveis baixadas de `raw.githubusercontent.com/google/fonts/main/ofl/<font>/`
  em 2026-10-22 (Montserrat `Montserrat[wght].ttf`; Inter `Inter[opsz,wght].ttf`).
- Para atualizar: baixar a variável nova, re-instanciar com os comandos acima e
  repetir a conferência de kerning acima (contagem + shaping).
