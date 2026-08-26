/**
 * Upload constraints — single source of truth.
 * Used by LogoController, use-cases, and app.ts multipart config.
 */

/** 5 MB */
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

/** MIME types allowed for logo uploads */
export const ALLOWED_LOGO_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Magic bytes for each allowed type (first 4+ bytes) */
export const FILE_SIGNATURES: Record<string, Buffer[]> = {
  "image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
  "image/jpg": [Buffer.from([0xff, 0xd8, 0xff])],
  "image/png": [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  "image/webp": [
    // RIFF....WEBP
    Buffer.from([0x52, 0x49, 0x46, 0x46]),
  ],
};

/**
 * Verify that the first bytes of a buffer match the declared MIME type.
 * Returns true if valid, false if magic bytes don't match.
 */
export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = FILE_SIGNATURES[mimeType];
  if (!signatures || signatures.length === 0) return false;

  // For JPEG: just check the 3-byte header
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer.subarray(0, 3).equals(signatures[0]);
  }

  // For PNG: check the 8-byte signature
  if (mimeType === "image/png") {
    return buffer.subarray(0, 4).equals(signatures[0]);
  }

  // For WebP: check RIFF header (bytes 0-3) + WEBP at offset 8
  if (mimeType === "image/webp") {
    const riff = buffer.subarray(0, 4).equals(signatures[0]);
    const webp = buffer.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]));
    return riff && webp;
  }

  return false;
}
