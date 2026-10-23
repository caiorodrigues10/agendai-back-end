import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { AppError } from "@/shared/errors/AppError";
import { COVER_IMAGE_SPEC, LOGO_IMAGE_SPEC } from "@/shared/constants/imageSpecs";
import { validateAndNormalizeImage } from "@/shared/utils/imageValidation";

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 90 } },
  })
    .png()
    .toBuffer();
}

describe("validateAndNormalizeImage", () => {
  it("aceita capa 1920×1080 PNG e devolve buffer normalizado sem metadados", async () => {
    const buffer = await pngBuffer(1920, 1080);
    const result = await validateAndNormalizeImage({
      buffer,
      declaredMimeType: "image/png",
      spec: COVER_IMAGE_SPEC,
    });

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.format).toBe("png");
    expect(result.mimeType).toBe("image/png");

    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.width).toBe(1920);
  });

  it("aceita logo 512×512 JPEG (proporção 1:1 exata)", async () => {
    const buffer = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await validateAndNormalizeImage({
      buffer,
      declaredMimeType: "image/jpeg",
      spec: LOGO_IMAGE_SPEC,
    });

    expect(result.format).toBe("jpeg");
    expect(result.width).toBe(512);
  });

  it("aceita capa 1200×800 (qualquer medida) e devolve as dimensões originais", async () => {
    const buffer = await pngBuffer(1200, 800);
    const result = await validateAndNormalizeImage({ buffer, spec: COVER_IMAGE_SPEC });

    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.format).toBe("png");
  });

  it("aceita capa com proporção fora de 16:9 (1920×1200) — o recorte é aplicado na entrega", async () => {
    const buffer = await pngBuffer(1920, 1200);
    const result = await validateAndNormalizeImage({ buffer, spec: COVER_IMAGE_SPEC });

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1200);
  });

  it("rejeita logo quadrado fora da tolerância (500×501)", async () => {
    const buffer = await pngBuffer(500, 501);
    await expect(
      validateAndNormalizeImage({ buffer, spec: LOGO_IMAGE_SPEC })
    ).rejects.toThrowError(/500×501/);
  });

  it("rejeita arquivo acima do peso máximo com 413 — ANTES de decodificar", async () => {
    // buffer maior que maxBytes e nem é imagem: se a checagem viesse depois do
    // decode, o erro seria 400 "arquivo corrompido" em vez de 413.
    const oversized = Buffer.alloc(COVER_IMAGE_SPEC.maxBytes + 1, 7);
    const attempt = validateAndNormalizeImage({ buffer: oversized, spec: COVER_IMAGE_SPEC });
    await expect(attempt).rejects.toMatchObject({ statusCode: 413 });
    await expect(attempt).rejects.toThrowError(/Arquivo muito grande/);
  });

  it("rejeita buffer que não é imagem (arquivo renomeado)", async () => {
    const fake = Buffer.from("#!/bin/sh\necho nao sou imagem\n".repeat(50));
    await expect(
      validateAndNormalizeImage({ buffer: fake, declaredMimeType: "image/png", spec: COVER_IMAGE_SPEC })
    ).rejects.toThrowError(/corrompido ou não é uma imagem/);
  });

  it("rejeita GIF", async () => {
    const gif = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .gif()
      .toBuffer();

    await expect(
      validateAndNormalizeImage({ buffer: gif, declaredMimeType: "image/gif", spec: COVER_IMAGE_SPEC })
    ).rejects.toThrowError(/Tipo de arquivo não permitido/);
  });

  it("rejeita SVG", async () => {
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#0f0"/></svg>`
    );
    await expect(
      validateAndNormalizeImage({ buffer: svg, declaredMimeType: "image/svg+xml", spec: COVER_IMAGE_SPEC })
    ).rejects.toThrowError(AppError);
  });

  it("rejeita arquivo vazio", async () => {
    await expect(
      validateAndNormalizeImage({ buffer: Buffer.alloc(0), spec: COVER_IMAGE_SPEC })
    ).rejects.toThrowError(/Arquivo vazio/);
  });
});
