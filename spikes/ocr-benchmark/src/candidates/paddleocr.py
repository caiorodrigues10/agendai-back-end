#!/usr/bin/env python3
"""Ponte Python do candidato G — PaddleOCR (CPU, offline após o download).

Uso: paddleocr.py <caminho-da-imagem> [mais imagens...]

Saída: JSON array com um objeto por imagem:
  {"image": "<caminho>", "lines": [...], "rows": [...]}

Cada `line` e cada `celula` segue o mesmo formato do candidato C
(macos-vision.py): {text, confidence, bbox:{x0,y0,x1,y1}} e
rows agrupa as celulas em linhas visuais (sobreposicao vertical).

O modelo PaddleOCR eh instanciado UNA VEZ por processo (singleton de modulo)
e reusado para todas as imagens passadas na mesma invocacao — nunca por imagem.
Rodagem: CPU, sem GPU. Idioma: portugues/latino (lang='pt' -> modelo
PP-OCRv6_medium_det + PP-OCRv6_medium_rec, que cobre LATIN_LANGS).
"""
import json
import os
import sys

# O script tem o mesmo nome do pacote instalado (paddleocr). Remove o diretorio
# do script do sys.path para que `import paddleocr` resolva o pacote real e nao
# este proprio arquivo (importacao circular).
sys.path = [p for p in sys.path if os.path.abspath(p) != os.path.dirname(os.path.abspath(__file__))]

from paddleocr import PaddleOCR

_OCR = None


def ocr_engine():
    global _OCR
    if _OCR is None:
        # Desliga pre-processamento de documento (orientacao/desarme) que nao
        # e necessario para tabelas de print e so acrescenta modelos/custo.
        # Permite sobrescrever det/rec via variavel de ambiente (ex.: variante
        # mobile/small) sem trocar o idioma.
        _OCR = PaddleOCR(
            lang="pt",
            text_detection_model_name=os.environ.get("PADDLE_DET_MODEL") or None,
            text_recognition_model_name=os.environ.get("PADDLE_REC_MODEL") or None,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return _OCR


def _cells(result):
    cells = []
    texts = result.get("rec_texts")
    scores = result.get("rec_scores")
    boxes = result.get("rec_boxes")
    if texts is None:
        texts = []
    if scores is None:
        scores = []
    if boxes is None:
        boxes = []
    for i, texto in enumerate(texts):
        box = boxes[i] if i < len(boxes) else [0, 0, 0, 0]
        score = scores[i] if i < len(scores) else 0.0
        x0, y0, x1, y1 = [float(v) for v in box]
        cells.append(
            {
                "text": texto,
                "confidence": round(float(score), 4),
                "bbox": {"x0": round(x0, 2), "y0": round(y0, 2), "x1": round(x1, 2), "y1": round(y1, 2)},
            }
        )
    return cells


def _group_rows(cells):
    lines = sorted(cells, key=lambda c: (c["bbox"]["y0"], c["bbox"]["x0"]))
    rows = []
    for cell in lines:
        centro = (cell["bbox"]["y0"] + cell["bbox"]["y1"]) / 2
        alvo = None
        for row in rows:
            if any(abs(centro - outro) < 18 for outro in row["centros"]):
                alvo = row
                break
        if alvo is None:
            alvo = {"centros": [], "celulas": []}
            rows.append(alvo)
        alvo["centros"].append(centro)
        alvo["celulas"].append(cell)
    saida = []
    for row in rows:
        celulas = sorted(row["celulas"], key=lambda c: c["bbox"]["x0"])
        saida.append(
            {
                "texto": "  ".join(c["text"] for c in celulas),
                "celulas": celulas,
            }
        )
    return saida


def main():
    paths = sys.argv[1:]
    if not paths:
        print(json.dumps({"error": "informe pelo menos um caminho de imagem"}))
        sys.exit(1)

    engine = ocr_engine()
    saida = []
    for path in paths:
        try:
            result = engine.predict(path)
            r0 = result[0] if isinstance(result, list) and result else result
            cells = _cells(r0) if r0 is not None else []
            saida.append(
                {
                    "image": path,
                    "lines": cells,
                    "rows": _group_rows(cells),
                }
            )
        except Exception as err:  # nao derruba o lote por uma imagem
            saida.append({"image": path, "error": str(err), "lines": [], "rows": []})

    print(json.dumps(saida, ensure_ascii=False))


if __name__ == "__main__":
    main()
