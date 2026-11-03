# ocr-output-simulado / SIMULADO

Este diretório contém saídas de OCR **SIMULADAS**: arquivos CSV gerados
deterministicamente por `gerar_ocr_simulado.py` a partir dos ground truths
em `ground-truth/`, com algumas leituras intencionalmente erradas para
exercitar o script de avaliação (`eval.py`).

**Não é resultado de um OCR real.** Não use estes números como mérito de
qualquer motor de OCR. Eles servem apenas para validar o pipeline de
avaliação (alinhamento por chave, pesos, CER, erros monetários).

Relação arquivo → ground truth:
  cadastro-01.csv … recibo-01.csv  (mesmo nome-base de ground-truth/)

Erros intencionais inseridos (documentados em gerar_ocr_simulado.py):
  - cadastro-01: telefone com dígito faltando (852632804) → CER, não monetário
  - cadastro-05: valor lido como "1.250.00" (ambiguidade separador) → erro monetário (125000 ≠ 1250)
  - cadastro-07 linha 2: status "pendente" (GT "atrasado") → CER
  - export-01 linha 1: percentual "15,0" (GT "15,00") → CER

Todas as demais células são reproduzidas exatamente do ground truth.
