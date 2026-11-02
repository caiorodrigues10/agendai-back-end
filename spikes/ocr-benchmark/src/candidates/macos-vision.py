#!/usr/bin/env python3
"""OCR com o framework Vision do macOS (via pyobjc).

Uso: macos-vision.py <caminho-da-imagem>

Saída: JSON com {"lines": [{"text": ..., "confidence": ..., "bbox": {...}}]}
"""
import json
import sys

import Quartz
import Vision
from Foundation import NSURL

PATH = sys.argv[1]

url = NSURL.fileURLWithPath_(PATH)
source = Quartz.CGImageSourceCreateWithURL(url, None)
if source is None:
    print(json.dumps({"error": "nao foi possivel abrir a imagem"}))
    sys.exit(1)

image = Quartz.CGImageSourceCreateImageAtIndex(source, 0, None)
if image is None:
    print(json.dumps({"error": "imagem invalida"}))
    sys.exit(1)

request = Vision.VNRecognizeTextRequest.alloc().init()
request.setRecognitionLevel_(0)  # accurate
request.setUsesLanguageCorrection_(True)
request.setMinimumTextHeight_(0.012)

handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(image, None)
ok, error = handler.performRequests_error_([request], None)
if not ok:
    print(json.dumps({"error": str(error)}))
    sys.exit(1)

height = Quartz.CGImageGetHeight(image)
width = Quartz.CGImageGetWidth(image)

lines = []
for observation in request.results():
    candidates = observation.topCandidates_(1)
    if not candidates:
        continue
    best = candidates[0]
    box = observation.boundingBox()
    # boundingBox do Vision tem origem no canto inferior esquerdo.
    x0 = box.origin.x * width
    y0 = (1.0 - box.origin.y - box.size.height) * height
    x1 = (box.origin.x + box.size.width) * width
    y1 = (1.0 - box.origin.y) * height
    lines.append(
        {
            "text": best.string(),
            "confidence": round(float(best.confidence()), 4),
            "bbox": {
                "x0": round(x0, 2),
                "y0": round(y0, 2),
                "x1": round(x1, 2),
                "y1": round(y1, 2),
            },
        }
    )

lines.sort(key=lambda item: (item["bbox"]["y0"], item["bbox"]["x0"]))

# O Vision devolve uma observação por célula. Agrupa por linha visual
# (sobreposição vertical) para reconstruir as linhas da tabela.
rows = []
for line in lines:
    centro = (line["bbox"]["y0"] + line["bbox"]["y1"]) / 2
    alvo = None
    for row in rows:
        if any(abs(centro - outro) < 18 for outro in row["centros"]):
            alvo = row
            break
    if alvo is None:
        alvo = {"centros": [], "celulas": []}
        rows.append(alvo)
    alvo["centros"].append(centro)
    alvo["celulas"].append(line)

saida = []
for row in rows:
    celulas = sorted(row["celulas"], key=lambda item: item["bbox"]["x0"])
    saida.append(
        {
            "texto": "  ".join(c["text"] for c in celulas),
            "celulas": celulas,
        }
    )

print(json.dumps({"lines": lines, "rows": saida}, ensure_ascii=False))
