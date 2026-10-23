/**
 * Sonda 1.3 (dist) — Modelo #1 compilado: motor standalone e pool de workers.
 *
 * Roda contra `dist/` (build `npm run build`), cobrindo o que a 1.3 precisa
 * medir: render DENTRO do worker (frio por worker via warmMs + quente) e o
 * Modelo #1 a partir do dist compilado (WASM do yoga/harfbuzz embutidos no
 * bundle do satori, fontes e stocks copiados para dist/…/templates/assets).
 *
 * Rodar: npx tsx scripts/render-dist-probe.ts   (na raiz do backend)
 */
process.env.POST_RENDER_WORKERS = "3";

const path = require("node:path") as typeof import("node:path");

const dist = (...p: string[]) => path.join(__dirname, "..", "dist", ...p);

const { renderPostLayers } = require(dist("modules/posts/templates/_engine/render.js"));
const { priceSplitLayers } = require(dist("modules/posts/templates/price-split/template.js"));
const { SAMPLE_WORST } = require(dist("modules/posts/templates/price-split/sample.js"));
const { DOURADO_TOKENS } = require(dist("modules/posts/templates/_engine/tokens.js"));
const pool = require(dist("shared/infra/worker/postRenderPool.js"));

import type { RenderSpec } from "../src/modules/posts/templates/_engine/types";

const WAVES = 3;

function stat(label: string, values: number[]): void {
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  console.log(
    `${label}: ${values.map((v) => `${Math.round(v)}ms`).join("  ")}  → min=${Math.round(sorted[0])} med=${Math.round(med)} max=${Math.round(sorted[sorted.length - 1])}`
  );
}

async function main() {
  const spec: RenderSpec = {
    width: 1080,
    height: 1350,
    bg: DOURADO_TOKENS.panel,
    layers: priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS, "feed-4x5"),
  };

  // ── Motor standalone do dist (sem pool) ───────────────────────────────────
  const t0 = Date.now();
  console.log(`require do motor dist: ${Date.now() - t0}ms`);
  for (let i = 1; i <= 3; i++) {
    const s = Date.now();
    const r = await renderPostLayers(spec);
    console.log(
      `${i === 1 ? "FRIO " : "quente"} engine dist #${i}: ${Date.now() - s}ms  (${r.mimeType} ${r.bytes}B)  photo=${Math.round(r.timings.photoMs)} vector=${Math.round(r.timings.vectorMs)} compose=${Math.round(r.timings.composeMs)}`
    );
  }

  // ── Pool do dist: frio por worker (boot+warm) e ondas quentes ────────────
  const cold: number[] = [];
  await Promise.all(
    [0, 1, 2].map(async () => {
      const s = Date.now();
      await pool.renderPostSpec(spec);
      cold.push(Date.now() - s);
    })
  );
  stat("fria pool dist (3 jobs paralelos, paga boot+warm)", cold);
  let stats = pool.postRenderWarmStats();
  console.log(`warmStats: ${JSON.stringify(stats)}`);
  console.log(
    `  → warmMs por worker: ${stats.warmMs.map((m: number) => Math.round(m)).join("ms | ")}ms\n`
  );

  for (let wave = 1; wave <= WAVES; wave++) {
    const wall: number[] = [];
    const inner: number[] = [];
    await Promise.all(
      [0, 1, 2].map(async () => {
        const s = Date.now();
        const r = await pool.renderPostSpec(spec);
        wall.push(Date.now() - s);
        inner.push(r.timings.totalMs);
      })
    );
    stat(`quente onda ${wave} (wall)`, wall);
    stat(`quente onda ${wave} (no worker)`, inner);
  }

  stats = pool.postRenderWarmStats();
  console.log(
    `\nfinal: ${stats.ready}/${stats.workers} workers prontos; warmMs por worker = ${stats.warmMs
      .map((m: number) => `${Math.round(m)}ms`)
      .join(" | ")}`
  );

  await pool.closePostRenderPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
