# Dataset-real do spike OCR (imagens reais de testimage/)

Rascunhos **ignorados** pelo `.gitignore` do backend (nunca versionar):

- `real/` — cópias/conversões das imagens de `testimage/` (o `.webp` vira PNG
  via Pillow).
- `ground-truth-real/` — ground truth transcrito (`revisado=nao`, dúvidas em
  `incerto`).
- `manifest-real.csv` — catálogo das 4 imagens reais.
- `ocr-output-real/` — saída do OCR local (`A-tesseract-texto`,
  `C-macos-vision`) **e o CSV estruturado** (`.csv`, mesmo basename do
  ground truth) que o `eval.py --real` consome.
- `.venv/` — ambiente Python local.
- `PROGRESSO.md` — diário do spike.

## Aviso sobre o dataset SINTÉTICO

Os telefones e CNJs das imagens/ground truths sintéticas (`dataset/`, `ground-truth/`) são **aleatórios gerados pelo spike** e **não verificados como inexistentes**. Não há garantia de que não correspondam a pessoas ou processos reais. Eles servem apenas para calibrar o método de extração; nunca devem ser usados como dados de clientes.

O mesmo vale para o ground truth real transcrito (`ground-truth-real/`): é
rascunho, ainda **não revisado** (`revisado=nao`).

## Como rodar (sem rede, sem banco)

Ambiente Python: `dataset-real/.venv` (já criado; `pytest` instalado). Tudo
roda **dentro dele**:

```
cd backend/spikes/ocr-benchmark/dataset-real
./.venv/bin/python -m pytest -q                                  # testes (62)
./.venv/bin/python eval.py --sintetico                           # eval default
./.venv/bin/python eval.py --real                                # eval real (somente revisado=sim)
./.venv/bin/python gerar-artefatos-reais.py                      # regera manifest-real.csv + _transcricao.json
```

Scripts TS (node, sem banco/rede, chamando as funções reais do backend):

```
cd backend/spikes/ocr-benchmark
./node_modules/.bin/tsx dataset-real/verificador-importacao.ts   # importação x resultado-esperado.csv
./node_modules/.bin/tsx dataset-real/gerar-paridade.ts            # gera paridade-normalizadores.json
./node_modules/.bin/tsx dataset-real/ocr-local.ts <imagem>        # OCR local (A-tesseract-texto + C-macos-vision)
./node_modules/.bin/tsx dataset-real/ocr-para-csv.ts             # texto do OCR local -> ocr-output-real/<base>.csv (estruturado)
./node_modules/.bin/tsx dataset-real/test_ocr_para_csv.ts        # teste do parser (texto inventado + grep dos literais do GT)
```

`ocr-para-csv.ts` é o elo entre o OCR local e o `eval.py --real`: lê
`ocr-output-real/<base>.a-tesseract-texto.txt` e escreve
`ocr-output-real/<base>.csv` com as **mesmas colunas do ground truth** da
imagem (dinheiro verbatim, vírgula decimal pt-BR preservada, sem inventar
valor). Rodar **depois** do `ocr-local.ts`.

O parser trabalha só com **formato** e **posição** (nº de processo, data,
`R$`/`RS` posicional, posição das colunas) e **não normaliza o OCR** (o "m"
lido continua "m"). **Nenhum valor do ground truth pode estar dentro do
`.ts`** — o `test_ocr_para_csv.ts` faz o grep de todos os valores do GT no
parser (e também confere o CSV gerado a partir de um texto bruto **inventado**)
e falha se algo aparecer. O mesmo teste roda dentro do pytest
(`test_ocr_para_csv.py`): o do parser roda sempre e o **grep do GT sai como
SKIP** quando `ground-truth-real/` não existe (em vez de passar em silêncio).

`paridade-normalizadores.json` é o **fixture de paridade** Python x
TypeScript: `gerar-paridade.ts` roda `normalizeMoney`, `normalizePhone` e
`checkCnjCheckDigit` (funções reais do backend) sobre uma lista fixa de
casos, e `test_eval.py` compara cada saída com a porta Python — divergência
faz o teste falhar. Regerar o fixture depois de mexer nos normalizadores.

## Regras da série

- Máximo **4 leituras de imagem por sessão**, **uma por chamada**. O servidor
  aceita no máximo 8 imagens por requisição e o histórico é reenviado a cada
  chamada.
- Se vier "At most 8 image(s)" ou "content safety screening": **não repetir
  a chamada** — registrar em `PROGRESSO.md` e parar.
- Imagens reais: **UMA por chamada**, no máximo 4 por sessão, com **OCR local
  como base** (`a-tesseract-texto`, `c-macos-vision`) rodado **antes** da
  leitura visual.
- Rascunho de ground truth sempre com `revisado=nao`; `incerto` marca as
  dúvidas. **Ninguém marca `revisado=sim`** — quem revisa, revisa.
- Sem commit, push, banco, `test:integration` e rede.
