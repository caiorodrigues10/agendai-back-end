/**
 * Segurança de arquivo de imagem para OCR.
 *
 * Valida MIME por conteúdo (magic bytes), não só extensão; limita tamanho e
 * pixels; redimensiona antes do OCR; apaga o temporário SEMPRE (try/finally).
 * Sem download em runtime.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { OCR_ACCEPTED_MIME, OCR_MAX_FILE_SIZE_BYTES, OCR_MAX_IMAGE_PIXELS, OCR_ERROR_CODES } from "./ocr.constants";
import { AppError } from "@/shared/errors/AppError";
import { deleteTempFile, saveTempFile, importTempDirectory } from "../utils/tempFiles";

/** Assinaturas (magic bytes) de imagens aceitas. */
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_SIG_RIFF = Buffer.from([0x52, 0x49, 0x46, 0x46]);
const WEBP_SIG_WEBP = Buffer.from([0x57, 0x45, 0x42, 0x50]);

export interface ValidatedImage {
  filePath: string;
  fileName: string;
  mime: string;
  /** Largura da imagem depois do redimensionamento (a que o OCR lê). */
  width: number;
  /** Altura da imagem depois do redimensionamento. */
  height: number;
  /** Largura da imagem **original**, como o dono enviou. */
  larguraOriginalPx: number;
  /** Altura da imagem **original**. */
  alturaOriginalPx: number;
  sizeBytes: number;
  /** Caminho da imagem (possivelmente redimensionada) pronta para OCR. */
  ocrPath: string;
}

/** Detecta o MIME pelo conteúdo (magic bytes). */
export function detectImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 4).equals(PNG_SIG)) return "image/png";
  if (buffer.subarray(0, 3).equals(JPEG_SIG)) return "image/jpeg";
  if (
    buffer.subarray(0, 4).equals(WEBP_SIG_RIFF) &&
    buffer.subarray(8, 12).equals(WEBP_SIG_WEBP)
  ) {
    return "image/webp";
  }
  return null;
}

/** Extensão esperada para o MIME. */
function extForMime(mime: string): string {
  switch (mime) {
    case "image/png": return ".png";
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    default: return ".bin";
  }
}

/**
 * Valida o buffer de imagem e grava um temporário pronto para OCR.
 * Redimensiona se exceder OCR_MAX_IMAGE_PIXELS no lado maior.
 *
 * Lança AppError com mensagem clara para o usuário final.
 */
export async function validateAndPrepareImage(
  fileName: string,
  buffer: Buffer,
): Promise<ValidatedImage> {
  if (!buffer || buffer.length === 0) {
    throw new AppError("A imagem enviada está vazia.", 400);
  }

  if (buffer.length > OCR_MAX_FILE_SIZE_BYTES) {
    throw new AppError(
      `A imagem passa de ${Math.round(OCR_MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB. Envie uma imagem menor.`,
      413,
      undefined,
      OCR_ERROR_CODES.imagemGrande,
    );
  }

  const mime = detectImageMime(buffer);
  if (!mime || !OCR_ACCEPTED_MIME.includes(mime)) {
    throw new AppError(
      "Formato de imagem não aceito. Envie PNG, JPG ou WEBP.",
      400,
      undefined,
      OCR_ERROR_CODES.formatoInvalido,
    );
  }

  const ext = extForMime(mime);
  const filePath = await saveTempFile(buffer, ext);

  let ocrPath = filePath;
  let width = 0;
  let height = 0;
  let larguraOriginalPx = 0;
  let alturaOriginalPx = 0;

  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(filePath).metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
    larguraOriginalPx = width;
    alturaOriginalPx = height;

    const maxSide = Math.max(width, height);
    if (maxSide > OCR_MAX_IMAGE_PIXELS) {
      const redimensionada = join(
        importTempDirectory(),
        `${createHash("sha1").update(filePath).digest("hex")}-resized${ext}`,
      );
      await sharp(filePath)
        .resize({ width: OCR_MAX_IMAGE_PIXELS, height: OCR_MAX_IMAGE_PIXELS, fit: "inside" })
        .toFile(redimensionada);
      await deleteTempFile(filePath);
      ocrPath = redimensionada;
      const meta2 = await sharp(redimensionada).metadata();
      width = meta2.width ?? width;
      height = meta2.height ?? height;
    }
  } catch (err) {
    // Se falhar a leitura/redimensionamento, remove o temp e avisa.
    await deleteTempFile(filePath);
    if (ocrPath !== filePath) await deleteTempFile(ocrPath);
    throw new AppError("Não foi possível ler a imagem enviada.", 400);
  }

  return {
    filePath,
    fileName: sanitizeFileName(fileName),
    mime,
    width,
    height,
    larguraOriginalPx,
    alturaOriginalPx,
    sizeBytes: buffer.length,
    ocrPath,
  };
}

/** Limpa todos os temporários criados por esta validação (chamado no finally). */
export async function cleanupImage(validated: ValidatedImage | null): Promise<void> {
  if (!validated) return;
  await deleteTempFile(validated.filePath);
  if (validated.ocrPath !== validated.filePath) {
    await deleteTempFile(validated.ocrPath);
  }
}

/** Nome para exibição (sem caminho). */
function sanitizeFileName(fileName: string): string {
  const base = String(fileName || "").split(/[\\/]/).pop() ?? "imagem";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["*:<>?|]/g, "")
    .trim();
  return (cleaned || "imagem").slice(0, 255);
}
