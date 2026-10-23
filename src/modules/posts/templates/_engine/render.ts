/**
 * Motor de render em pilha de camadas.
 *
 * Um template devolve `Layer[]` ordenada. Para cada camada:
 *  - `photo`: sharp (fetch cacheado + resize/focal + blur + tint + mask).
 *  - `vector`: satori (fundo transparente) → resvg → PNG com alpha.
 * A composição é feita em ordem sobre uma base sólida (`bg`).
 *
 * Saída: com foto → JPEG q90 4:4:4; sem foto → PNG otimizado; prévia → JPEG q78.
 * (Nada de WebP no arquivo compartilhável — JPEG/PNG são seguros p/ IG/WhatsApp.)
 */
import sharp, { type Sharp, type OverlayOptions } from "sharp";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { getEngineFonts } from "./fonts";
import { loadProcessedPhoto, previewRenderGet, previewRenderSet, PhotoError } from "./image";
import type { Layer, PhotoLayer, VectorLayer, RenderSpec, RenderResult } from "./types";

/** Teto de peso do arte final (meta ≤400 KB — seguro p/ IG/WhatsApp). */
const MAX_EXPORT_BYTES = 400 * 1024;

/** Prévia: JPEG q75–80 (aqui 78), largura padrão 540. */
const PREVIEW_QUALITY = 78;
const PREVIEW_WIDTH = 540;

/**
 * Processa uma camada photo aplicando a regra "falha de foto → fallback do
 * segmento → nunca 500": tenta `src`; se falhar, tenta `fallbackSrc` (stock);
 * se nem isso der, devolve `null` e a camada sai do composto (fundo sólido).
 */
async function processPhotoLayerSafe(layer: PhotoLayer): Promise<Buffer | null> {
  const attempts =
    layer.fallbackSrc && layer.fallbackSrc !== layer.src ? [layer.src, layer.fallbackSrc] : [layer.src];
  for (const src of attempts) {
    try {
      return await processPhotoLayer({ ...layer, src });
    } catch {
      // foto falhou (fetch/host/bytes/decode) → tenta a próxima origem
    }
  }
  return null;
}

/** Processa uma camada photo → PNG RGBA do tamanho do rect (com alpha p/ masks). */
async function processPhotoLayer(layer: PhotoLayer): Promise<Buffer> {
  const { rect } = layer;
  // Cacheia pela URL (o JPEG ≤1080 é independente do rect — foco/corte
  // acontecem depois), p/ uma mesma foto não ocupar N entradas do LRU.
  const raw = await loadProcessedPhoto(layer.src);

  // Resize cover + focal (via extract offset quando focal explícito).
  const meta = await sharp(raw).metadata();
  const imgW = meta.width || rect.w;
  const imgH = meta.height || rect.h;
  let pipeline: Sharp;
  if (layer.focal && (layer.focal.x !== 0.5 || layer.focal.y !== 0.5)) {
    const scale = Math.max(rect.w / imgW, rect.h / imgH);
    const scaledW = Math.ceil(imgW * scale);
    const scaledH = Math.ceil(imgH * scale);
    const left = Math.max(0, Math.round((scaledW - rect.w) * layer.focal.x));
    const top = Math.max(0, Math.round((scaledH - rect.h) * layer.focal.y));
    pipeline = sharp(raw)
      .resize(scaledW, scaledH, { fit: "fill" })
      .extract({ left, top, width: rect.w, height: rect.h });
  } else {
    pipeline = sharp(raw).resize(rect.w, rect.h, {
      fit: layer.fit ?? "cover",
      position: "centre",
    });
  }

  if (layer.blur && layer.blur > 0) pipeline = pipeline.blur(layer.blur);

  // Tinta (gradiente) via SVG composto por cima.
  let img = await pipeline.png().toBuffer();
  if (layer.tint) {
    const { color, opacity, angle = 135 } = layer.tint;
    const tintSvg = Buffer.from(
      `<svg width="${rect.w}" height="${rect.h}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><linearGradient id="t" gradientTransform="rotate(${angle} .5 .5)">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/>` +
        `<stop offset="0.45" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient></defs><rect width="100%" height="100%" fill="url(#t)"/></svg>`
    );
    img = await sharp(img).composite([{ input: tintSvg, blend: "over" }]).png().toBuffer();
  }

  // Máscara (circle/polygon) via alpha dest-in.
  const mask = layer.mask ?? "rect";
  if (mask === "circle" || mask === "polygon") {
    let maskSvg: string;
    if (mask === "circle") {
      const r = Math.min(rect.w, rect.h) / 2;
      maskSvg = `<svg width="${rect.w}" height="${rect.h}" xmlns="http://www.w3.org/2000/svg"><circle cx="${rect.w / 2}" cy="${rect.h / 2}" r="${r}" fill="#fff"/></svg>`;
    } else {
      const pts = layer.polygonPoints ?? "0,0 1,0 1,1";
      const abs = pts
        .split(" ")
        .map((p) => {
          const [x, y] = p.split(",").map(Number);
          return `${x * rect.w},${y * rect.h}`;
        })
        .join(" ");
      maskSvg = `<svg width="${rect.w}" height="${rect.h}" xmlns="http://www.w3.org/2000/svg"><polygon points="${abs}" fill="#fff"/></svg>`;
    }
    img = await sharp(img)
      .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  return img;
}

/** Renderiza uma camada vector (satori → resvg) em fundo transparente. */
async function renderVectorLayer(
  layer: VectorLayer,
  canvasW: number,
  canvasH: number
): Promise<{ png: Buffer; left: number; top: number }> {
  const w = layer.rect?.w ?? canvasW;
  const h = layer.rect?.h ?? canvasH;
  const svg = await satori(layer.node as never, {
    fonts: getEngineFonts(),
    width: w,
    height: h,
    debug: false,
  });
  // O SVG do satori sai em <path> (glifos já convertidos, sem <text>) → resvg não
  // precisa de fonte nenhuma. Sem loadSystemFonts:false ele varre as fontes do SO
  // a cada instância (~1,4 s de latência intermitente). Nunca pôr <text> aqui.
  const png = Buffer.from(
    new Resvg(svg, {
      fitTo: { mode: "width", value: w },
      font: { loadSystemFonts: false },
    }).render().asPng()
  );
  return { png, left: layer.rect?.x ?? 0, top: layer.rect?.y ?? 0 };
}

/**
 * Renderiza a pilha de camadas. Foto que falha cai no fallback do segmento e,
 * se nem ele responder, sai do composto — o motor nunca lança por causa de foto
 * (o chamador só vê erro para spec malformado; nunca 500 por foto).
 */
export async function renderPostLayers(spec: RenderSpec): Promise<RenderResult> {
  const t0 = performance.now();
  const { width, height, bg, layers } = spec;
  const hasPhoto = layers.some((l) => l.kind === "photo");

  // Prévia é pura função do spec → cache LRU (100) devolve o JPEG pronto.
  const previewKey = spec.preview ? JSON.stringify(spec) : null;
  if (previewKey) {
    const hit = previewRenderGet(previewKey);
    if (hit) {
      return {
        buffer: hit,
        mimeType: "image/jpeg",
        bytes: hit.length,
        timings: { photoMs: 0, vectorMs: 0, composeMs: 0, totalMs: performance.now() - t0 },
      };
    }
  }

  const composites: OverlayOptions[] = [];
  let photoMs = 0;
  let vectorMs = 0;

  for (const layer of layers) {
    if (layer.kind === "photo") {
      const p0 = performance.now();
      const png = await processPhotoLayerSafe(layer);
      photoMs += performance.now() - p0;
      if (png) composites.push({ input: png, left: layer.rect.x, top: layer.rect.y });
    } else {
      const v0 = performance.now();
      const { png, left, top } = await renderVectorLayer(layer, width, height);
      vectorMs += performance.now() - v0;
      composites.push({ input: png, left, top });
    }
  }

  const c0 = performance.now();
  let pipeline = sharp({ create: { width, height, channels: 4, background: bg } });
  if (composites.length) pipeline = pipeline.composite(composites);

  let buffer: Buffer;
  let mimeType: "image/jpeg" | "image/png";
  if (spec.preview) {
    // Prévia 540 = JPEG q78. Duas passadas de propósito: o sharp aplica
    // `resize` ANTES de `composite`, então dá para encolher só depois de
    // compor — e o intermediário é PNG (lossless) p/ ter 1 geração lossy só.
    mimeType = "image/jpeg";
    const composed = await pipeline.png().toBuffer();
    buffer = await sharp(composed)
      .resize({ width: spec.previewWidth ?? PREVIEW_WIDTH, withoutEnlargement: true })
      .flatten({ background: bg })
      .jpeg({ quality: PREVIEW_QUALITY, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toBuffer();
  } else if (spec.output === "png" || (!hasPhoto && spec.output !== "jpeg")) {
    mimeType = "image/png";
    buffer = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer();
    // Teto de peso: sem foto (vetor puro) → reencoda paleta 256 cores se passar.
    if (buffer.length > MAX_EXPORT_BYTES) {
      buffer = await pipeline
        .clone()
        .png({ compressionLevel: 9, palette: true, quality: 90, effort: 7 })
        .toBuffer();
    }
  } else {
    mimeType = "image/jpeg";
    let q = 90;
    const encodeJpeg = (quality: number): Promise<Buffer> =>
      pipeline
        .clone()
        .flatten({ background: bg })
        .jpeg({ quality, chromaSubsampling: "4:4:4", mozjpeg: true })
        .toBuffer();
    buffer = await encodeJpeg(q);
    // Se passar do teto, reencoda em passos de -6 (min 76) até caber.
    for (let attempt = 0; attempt < 3 && buffer.length > MAX_EXPORT_BYTES && q > 76; attempt++) {
      q -= 6;
      buffer = await encodeJpeg(q);
    }
  }
  if (previewKey) previewRenderSet(previewKey, buffer);
  const composeMs = performance.now() - c0;
  const totalMs = performance.now() - t0;

  return { buffer, mimeType, bytes: buffer.length, timings: { photoMs, vectorMs, composeMs, totalMs } };
}

export { PhotoError };
