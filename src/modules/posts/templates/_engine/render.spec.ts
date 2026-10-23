import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderPostLayers } from "./render";
import { photoCacheStats } from "./image";
import type { RenderSpec } from "./types";
import { h } from "../_shared/h";

/**
 * Foto 8×8 em data-URI (PNG válido, sem rede). `seed` muda o tom p/ cada teste
 * usar uma URL distinta e não dividir a entrada de cache entre si.
 */
async function pngDataUri(seed: number): Promise<string> {
  const buf = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: seed, g: 120, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** Lê fatores de subamostragem cromática de um JPEG (SOF0/SOF1/SOF2). */
function jpegSampling(buf: Buffer): Array<{ h: number; v: number }> {
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const n = buf[i + 9];
      const comps: Array<{ h: number; v: number }> = [];
      for (let c = 0; c < n; c++) {
        const s = buf[i + 11 + c * 3];
        comps.push({ h: s >> 4, v: s & 0x0f });
      }
      return comps;
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return [];
}

function textLayer(text: string) {
  return {
    kind: "vector" as const,
    node: h(
      "div",
      {
        style: {
          width: "320px",
          height: "80px",
          display: "flex",
          alignItems: "center",
          fontFamily: "Montserrat",
          fontWeight: 800,
          fontSize: 32,
          color: "#ffffff",
        },
      },
      text
    ),
  };
}

describe("renderPostLayers — formatos de saída", () => {
  it("com foto → JPEG (4:4:4, sem subamostragem de croma)", async () => {
    const photo = await pngDataUri(10);
    const r = await renderPostLayers({
      width: 320,
      height: 200,
      bg: "#111111",
      layers: [
        { kind: "photo", src: photo, rect: { x: 0, y: 0, w: 120, h: 200 } },
        textLayer("TABELA DE VALORES"),
      ],
    });
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.bytes).toBeGreaterThan(0);
    expect(r.buffer.subarray(0, 2).toString("hex")).toBe("ffd8");
    const comps = jpegSampling(r.buffer);
    expect(comps.length).toBe(3);
    // 4:4:4 = croma na mesma resolução da luminância (h=1, v=1 nos 3 componentes)
    expect(comps.every((c) => c.h === 1 && c.v === 1)).toBe(true);
    const meta = await sharp(r.buffer).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(200);
  });

  it("sem foto (só vetores) → PNG otimizado", async () => {
    const r = await renderPostLayers({
      width: 320,
      height: 200,
      bg: "#171208",
      layers: [textLayer("SÓ VETOR")],
    });
    expect(r.mimeType).toBe("image/png");
    expect(r.buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
    const meta = await sharp(r.buffer).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
  });

  it("prévia → JPEG de 540 px (q75–80) com cache LRU do resultado", async () => {
    const spec: RenderSpec = {
      width: 1080,
      height: 240,
      bg: "#171208",
      layers: [textLayer("PRÉVIA 540")],
      preview: true,
    };
    const before = photoCacheStats().previews;
    const r = await renderPostLayers(spec);
    expect(r.mimeType).toBe("image/jpeg");
    const meta = await sharp(r.buffer).metadata();
    expect(meta.width).toBe(540);
    expect(meta.height).toBe(120);
    expect(photoCacheStats().previews).toBe(before + 1);

    const hit = await renderPostLayers(spec);
    expect(hit.buffer.equals(r.buffer)).toBe(true);
    expect(photoCacheStats().previews).toBe(before + 1); // hit não cresce o LRU
    expect(hit.timings.totalMs).toBeLessThan(20);
  });
});

describe("renderPostLayers — falha de foto nunca derruba o render", () => {
  it("host não permitido cai no stock do segmento (fallbackSrc)", async () => {
    const r = await renderPostLayers({
      width: 320,
      height: 200,
      bg: "#111111",
      layers: [
        {
          kind: "photo",
          src: "https://evil.example.com/foto.jpg",
          fallbackSrc: "barber-editorial",
          rect: { x: 0, y: 0, w: 120, h: 200 },
        },
        textLayer("COM FALLBACK"),
      ],
    });
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("fetch que falha cai no stock do segmento (nunca 500)", async () => {
    const r = await renderPostLayers({
      width: 320,
      height: 200,
      bg: "#111111",
      layers: [
        {
          kind: "photo",
          src: "http://127.0.0.1:1/foto.jpg",
          fallbackSrc: "barber-editorial",
          rect: { x: 0, y: 0, w: 120, h: 200 },
        },
        textLayer("FETCH CAIU"),
      ],
    });
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("bytes inválidos sem fallback → renderiza sem a camada", async () => {
    const r = await renderPostLayers({
      width: 320,
      height: 200,
      bg: "#111111",
      layers: [
        { kind: "photo", src: "data:image/png;base64,AAAA", rect: { x: 0, y: 0, w: 120, h: 200 } },
        textLayer("SEM FOTO"),
      ],
    });
    expect(r.mimeType).toBe("image/jpeg");
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("protocolo não permitido sem fallback também não vira erro", async () => {
    await expect(
      renderPostLayers({
        width: 200,
        height: 100,
        bg: "#111111",
        layers: [{ kind: "photo", src: "ftp://intranet/foto.jpg", rect: { x: 0, y: 0, w: 50, h: 50 } }],
      })
    ).resolves.toMatchObject({ bytes: expect.any(Number) });
  });
});

describe("renderPostLayers — cache de fotos", () => {
  it("reaproveita a foto já processada (o LRU não cresce no 2º render)", async () => {
    const photo = await pngDataUri(200);
    const spec = {
      width: 200,
      height: 120,
      bg: "#111111",
      layers: [{ kind: "photo" as const, src: photo, rect: { x: 0, y: 0, w: 100, h: 120 } }],
    };
    const before = photoCacheStats().photos;
    await renderPostLayers(spec);
    const afterFirst = photoCacheStats().photos;
    expect(afterFirst).toBe(before + 1);
    await renderPostLayers(spec);
    expect(photoCacheStats().photos).toBe(afterFirst);
  });
});
