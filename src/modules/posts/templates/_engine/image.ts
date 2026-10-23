/**
 * Fetch + processamento de fotos do motor, com cache LRU.
 *
 * Regras:
 *  - Só baixa de hosts permitidos: Cloudinary do próprio projeto
 *    (`/CLOUDINARY_CLOUD_NAME/`, https) e loopback — este, só fora de
 *    produção (ou `POST_IMAGE_ALLOW_LOOPBACK=1`); data-URI aceito direto.
 *  - Timeout 10 s, limite de bytes, checagem de content-type + magic bytes.
 *  - Cacheia a foto JÁ redimensionada (≤1080, buffer JPEG) — nunca raster cru.
 *  - Falha de foto → `PhotoError`; o motor tenta o stock do segmento e, se
 *    nada responder, segue sem a camada (nunca 500).
 *  - Cache LRU: 50 fotos processadas + 100 prévias renderizadas.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const MAX_DIM = 1080;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB (imagem de entrada)

/** Cloudinary do projeto — aceito só sob `/<CLOUDINARY_CLOUD_NAME>/`. */
const CLOUDINARY_HOST = "res.cloudinary.com";

/**
 * Loopback (dev/serviços internos). Em produção é SSRF contra a própria
 * infraestrutura: liberado só fora de produção ou com a flag de teste
 * explícita `POST_IMAGE_ALLOW_LOOPBACK=1`.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function loopbackAllowed(): boolean {
  if (process.env.POST_IMAGE_ALLOW_LOOPBACK === "1") return true;
  return process.env.NODE_ENV !== "production";
}

function cloudinaryCloudName(): string {
  return (process.env.CLOUDINARY_CLOUD_NAME ?? "").trim();
}

/** Primeiro segmento do path: `/<cloud_name>/...` */
function cloudinaryPathCloud(url: URL): string {
  return url.pathname.split("/")[1] ?? "";
}

// ─── Stocks (ilustrações de fallback por segmento) ──────────────────────────
const STOCK_DIR_CANDIDATES = [
  path.join(__dirname, "..", "assets", "stocks"),
  // bundle compilado do worker: dist/shared/infra/worker → dist/…
  path.join(__dirname, "..", "..", "..", "modules", "posts", "templates", "assets", "stocks"),
  path.join(process.cwd(), "dist", "modules", "posts", "templates", "assets", "stocks"),
  path.join(process.cwd(), "src", "modules", "posts", "templates", "assets", "stocks"),
];
const stockCache = new Map<string, Buffer>();

function loadStockBytes(key: string): Buffer {
  const hit = stockCache.get(key);
  if (hit) return hit;
  const dir = STOCK_DIR_CANDIDATES.find((c) => fs.existsSync(c));
  if (!dir) throw new PhotoError("Diretório de stocks não encontrado");
  const file = path.join(dir, `${key}.jpg`);
  if (!fs.existsSync(file)) throw new PhotoError(`Stock desconhecido: ${key}`);
  const buf = fs.readFileSync(file);
  stockCache.set(key, buf);
  return buf;
}

export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

// ─── LRU simples por tamanho ─────────────────────────────────────────────────
class LRU<K, V> {
  private map = new Map<K, V>();
  constructor(private max: number) {}
  get(k: K): V | undefined {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k)!;
    this.map.delete(k);
    this.map.set(k, v); // reinsert = mais recente
    return v;
  }
  set(k: K, v: V): void {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }
  get size(): number {
    return this.map.size;
  }
}

// Cache de fotos processadas (chave = src; o JPEG ≤1080 é independente do rect)
// e de prévias já renderizadas (chave = spec serializada). Limites: 50 / 100.
const photoCache = new LRU<string, Buffer>(50);
const previewRenderCache = new LRU<string, Buffer>(100);

// ─── Validação ───────────────────────────────────────────────────────────────
function isAllowedUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "data:") return true; // data-URI ok (mídia já validada no upload)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.hostname === CLOUDINARY_HOST) {
    const cloud = cloudinaryCloudName();
    return parsed.protocol === "https:" && cloud !== "" && cloudinaryPathCloud(parsed) === cloud;
  }
  if (LOOPBACK_HOSTS.has(parsed.hostname)) return loopbackAllowed();
  return false;
}

export function assertAllowedUrl(url: string): void {
  if (isAllowedUrl(url)) return;
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    throw new PhotoError("URL de imagem inválida");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new PhotoError("Protocolo de imagem não permitido");
  }
  if (parsed.hostname === CLOUDINARY_HOST) {
    if (parsed.protocol !== "https:") {
      throw new PhotoError("Host de imagem não permitido: res.cloudinary.com (exige https)");
    }
    const cloud = cloudinaryCloudName();
    if (cloud === "") {
      throw new PhotoError("Cloudinary não configurado (CLOUDINARY_CLOUD_NAME) — imagem recusada");
    }
    throw new PhotoError(`Cloudinary de outro projeto: ${cloudinaryPathCloud(parsed) || "(sem cloud)"}`);
  }
  if (LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new PhotoError(`Host de imagem não permitido: ${parsed.hostname} (loopback liberado só fora de produção)`);
  }
  throw new PhotoError(`Host de imagem não permitido: ${parsed.hostname}`);
}

function sniffImageMagic(bytes: Buffer): "jpeg" | "png" | "webp" | "gif" | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.slice(0, 4).toString("ascii") === "RIFF" && bytes.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (bytes.slice(0, 3).toString("ascii") === "GIF") return "gif";
  return null;
}

// ─── Fetch de bytes ──────────────────────────────────────────────────────────
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

/**
 * Segue redirects manualmente validando o host de cada salto contra a allowlist
 * (`redirect: "follow"` do fetch iria buscar o destino antes de qualquer checagem).
 */
async function fetchFollowingRedirects(url: string): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      // Rede/timeout/DNS: contrato de `loadProcessedPhoto` é sempre PhotoError.
      throw new PhotoError(`Falha ao baixar imagem: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!REDIRECT_CODES.has(res.status)) return res;
    const location = res.headers.get("location");
    await res.body?.cancel().catch(() => {});
    if (!location) throw new PhotoError("Redirecionamento sem Location");
    const next = new URL(location, current).toString();
    assertAllowedUrl(next);
    current = next;
  }
  throw new PhotoError("Muitos redirecionamentos ao baixar imagem");
}

async function fetchBytes(url: string): Promise<Buffer> {
  assertAllowedUrl(url);
  if (url.startsWith("data:")) {
    const b64 = url.split(",")[1];
    if (!b64) throw new PhotoError("data-URI malformado");
    const buf = Buffer.from(b64, "base64");
    if (buf.length > MAX_BYTES) throw new PhotoError("Imagem acima do limite de bytes");
    return buf;
  }
  const res = await fetchFollowingRedirects(url);
  if (!res.ok) throw new PhotoError(`Falha ao baixar imagem (${res.status})`);
  const ct = res.headers.get("content-type") || "";
  if (ct && !/^image\//.test(ct)) throw new PhotoError(`content-type não é imagem: ${ct}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_BYTES) throw new PhotoError("Imagem acima do limite de bytes");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new PhotoError("Imagem acima do limite de bytes");
  if (!sniffImageMagic(buf)) throw new PhotoError("Bytes não correspondem a uma imagem");
  return buf;
}

// ─── Processamento (resize ≤1080 → JPEG) ────────────────────────────────────
async function processToJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * Obtém a foto já redimensionada (JPEG ≤1080). Cacheia o resultado processado.
 * `src` pode ser URL host-permitida, data-URI, ou stock key (ex.: "barber").
 * Lança `PhotoError` em qualquer falha (o chamador aplica fallback).
 */
export async function loadProcessedPhoto(
  src: string,
  cacheKeyExtra = ""
): Promise<Buffer> {
  const key = `${src}#${cacheKeyExtra}`;
  const hit = photoCache.get(key);
  if (hit) return hit;
  const isStock = !/^(https?:|data:)/.test(src);
  const raw = isStock ? loadStockBytes(src) : await fetchBytes(src);
  const jpeg = await processToJpeg(raw);
  photoCache.set(key, jpeg);
  return jpeg;
}

/** Prévia renderizada (JPEG 540) — LRU de 100 entradas, chave = spec. */
export function previewRenderGet(key: string): Buffer | undefined {
  return previewRenderCache.get(key);
}

export function previewRenderSet(key: string, buffer: Buffer): void {
  previewRenderCache.set(key, buffer);
}

/** Métricas de cache (para telemetria/testes). */
export function photoCacheStats(): { photos: number; previews: number } {
  return { photos: photoCache.size, previews: previewRenderCache.size };
}
