/// <reference types="vitest/globals" />
import os from "node:os";
import { AppError } from "@/shared/errors/AppError";
import { renderSvgToPngSync } from "@/modules/posts/services/postSvgRenderer";
import type { RenderSpec } from "@/modules/posts/templates/_engine/types";
import {
  closePostRenderPool,
  postRenderPoolSize,
  postRenderTimeoutMs,
  postRenderWarmStats,
  renderPostSpec,
  renderSvgToPng,
} from "./postRenderPool";

const tinySvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0B0F19"/></svg>';

/** Spec v2 mínimo: camada vetorial pura (sem foto → PNG). */
const tinySpec: RenderSpec = {
  width: 64,
  height: 64,
  bg: "#0B0F19",
  layers: [
    {
      kind: "vector",
      node: {
        type: "div",
        props: {
          style: { width: "64px", height: "64px", fontFamily: "Inter", fontSize: 20, color: "#ffffff" },
          children: ["OK"],
        },
      },
    },
  ],
  output: "png",
};

const PNG_MAGIC = "89504e470d0a1a0a";

/** SVG com renderização deliberadamente lenta (>1s) para exercitar timeout. */
function heavySvg(rects: number): string {
  let body = "";
  for (let i = 0; i < rects; i++) {
    body += `<rect x="${i % 1080}" y="${(i * 7) % 1000}" width="40" height="30" fill="#10a"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#0B0F19"/>${body}</svg>`;
}

async function expectAppError(
  promise: Promise<unknown>,
  code: string
): Promise<AppError> {
  const err = await promise.then(
    () => {
      throw new Error("esperava AppError, mas a promise resolveu");
    },
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe("postRenderPool", () => {
  afterEach(async () => {
    delete process.env.POST_RENDER_WORKERS;
    delete process.env.POST_RENDER_TIMEOUT_MS;
    delete process.env.POST_RENDER_WARM;
  });

  afterAll(async () => {
    await closePostRenderPool();
  });

  it("renderiza SVG em PNG no worker thread", async () => {
    const png = await renderSvgToPng(tinySvg);
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
  });

  it("devolve exatamente os mesmos bytes do render síncrono", async () => {
    const pooled = await renderSvgToPng(tinySvg);
    expect(pooled.equals(renderSvgToPngSync(tinySvg))).toBe(true);
  });

  it("erro de render vira AppError previsível e o pool segue utilizável", async () => {
    const err = await expectAppError(renderSvgToPng("<svg"), "POST_RENDER_FAILED");
    expect(err.statusCode).toBe(500);

    const png = await renderSvgToPng(tinySvg);
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
  });

  it("encerrar o pool recusa o trabalho em andamento e recria os workers", async () => {
    // handler anexado antes do close para não gerar unhandled rejection
    const inFlight = expectAppError(renderSvgToPng(tinySvg), "POST_RENDER_UNAVAILABLE");
    await closePostRenderPool();
    await inFlight;

    const png = await renderSvgToPng(tinySvg);
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
  });

  it("timeout por render vira AppError e o worker preso é substituído", async () => {
    process.env.POST_RENDER_TIMEOUT_MS = "1000";
    const err = await expectAppError(renderSvgToPng(heavySvg(300_000)), "POST_RENDER_TIMEOUT");
    expect(err.statusCode).toBe(503);

    // O worker preso é destruído no timeout e o pool recria a thread sob
    // demanda (boot do tsx + arquivo do worker). O teto de 1000ms valia para
    // o render, não para o boot; mede aqui só a recuperação do pool. Com o
    // vitest 4.1.x o boot sob carga da suíte inteira passa de 15s (default),
    // então usamos o teto do clamp (120s) — o teste tem teto próprio de 30s.
    process.env.POST_RENDER_TIMEOUT_MS = "120000";
    const png = await renderSvgToPng(tinySvg);
    expect(png.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
  }, 30_000);

  it("POST_RENDER_WORKERS e POST_RENDER_TIMEOUT_MS são limitados ao clamp", () => {
    const defaultSize = Math.max(1, Math.min(4, os.cpus().length));

    process.env.POST_RENDER_WORKERS = "999";
    expect(postRenderPoolSize()).toBe(16);
    process.env.POST_RENDER_WORKERS = "0";
    expect(postRenderPoolSize()).toBe(1);
    process.env.POST_RENDER_WORKERS = "3";
    expect(postRenderPoolSize()).toBe(3);
    delete process.env.POST_RENDER_WORKERS;
    expect(postRenderPoolSize()).toBe(defaultSize);

    process.env.POST_RENDER_TIMEOUT_MS = "5";
    expect(postRenderTimeoutMs()).toBe(1_000);
    process.env.POST_RENDER_TIMEOUT_MS = "99999999";
    expect(postRenderTimeoutMs()).toBe(120_000);
    process.env.POST_RENDER_TIMEOUT_MS = "abc";
    expect(postRenderTimeoutMs()).toBe(15_000);
  });

  it("renderiza RenderSpec (v2) dentro do worker com metadados", async () => {
    const result = await renderPostSpec(tinySpec);
    expect(result.buffer.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
    expect(result.mimeType).toBe("image/png");
    expect(result.bytes).toBe(result.buffer.length);
    expect(result.timings.totalMs).toBeGreaterThan(0);
  });

  it("spec malformado vira AppError POST_RENDER_FAILED e o pool segue utilizável", async () => {
    const badSpec: RenderSpec = { ...tinySpec, width: 0 };
    const err = await expectAppError(renderPostSpec(badSpec), "POST_RENDER_FAILED");
    expect(err.statusCode).toBe(500);

    // pool segue utilizável
    const ok = await renderPostSpec(tinySpec);
    expect(ok.buffer.subarray(0, 8).toString("hex")).toBe(PNG_MAGIC);
  });

  it("falha de foto (host proibido) não derruba o job: segue sem a camada", async () => {
    const photoSpec: RenderSpec = {
      ...tinySpec,
      layers: [
        { kind: "photo", src: "https://evil.example.com/x.jpg", rect: { x: 0, y: 0, w: 64, h: 64 } },
      ],
    };
    const result = await renderPostSpec(photoSpec);
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.timings.totalMs).toBeGreaterThan(0);

    // e nem o fallback de segmento (quando existe) falha o job
    const withFallback: RenderSpec = {
      ...tinySpec,
      layers: [
        {
          kind: "photo",
          src: "http://127.0.0.1:1/x.jpg",
          fallbackSrc: "barber-editorial",
          rect: { x: 0, y: 0, w: 64, h: 64 },
        },
      ],
    };
    const ok = await renderPostSpec(withFallback);
    expect(ok.bytes).toBeGreaterThan(0);
  });

  it("aquecimento por worker: ready + warmMs medido (boot + 1º render)", async () => {
    await renderSvgToPng(tinySvg);
    const stats = postRenderWarmStats();
    expect(stats.workers).toBeGreaterThanOrEqual(1);
    expect(stats.ready).toBeGreaterThanOrEqual(1);
    expect(stats.ready).toBeLessThanOrEqual(stats.workers);
    for (const ms of stats.warmMs) expect(ms).toBeGreaterThan(0);
  });
});
