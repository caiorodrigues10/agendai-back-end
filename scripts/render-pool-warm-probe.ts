/**
 * Sonda 1.3 — aquecimento por worker do pool de render de posts.
 *
 * Mede: (1) custo de boot+warm de cada thread e a latência da onda fria;
 * (2) latências das ondas quentes com o Modelo #1 real (pior caso, stock local,
 * sem rede). Rodar: npx tsx scripts/render-pool-warm-probe.ts
 */
process.env.POST_RENDER_WORKERS = "3";

import {
  closePostRenderPool,
  postRenderWarmStats,
  renderPostSpec,
} from "../src/shared/infra/worker/postRenderPool";
import { renderPostLayers } from "../src/modules/posts/templates/_engine/render";
import { DOURADO_TOKENS } from "../src/modules/posts/templates/_engine/tokens";
import { priceSplitLayers } from "../src/modules/posts/templates/price-split/template";
import { SAMPLE_WORST } from "../src/modules/posts/templates/price-split/sample";
import type { RenderSpec } from "../src/modules/posts/templates/_engine/types";

const WAVES = 3;

async function main() {
  // Monta o spec REAL do Modelo #1 (pior caso, feed 4x5) no processo de teste;
  // no pool o mesmo objeto viaja por structured clone para a thread.
  const layers = priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS, "feed-4x5");
  const spec: RenderSpec = {
    width: 1080,
    height: 1350,
    bg: DOURADO_TOKENS.panel,
    layers,
  };

  // Só confere que o motor local renderiza antes de medir o pool.
  const sanity = await renderPostLayers(spec);
  console.log(`sanity local: ${sanity.mimeType} ${sanity.bytes}B ${Math.round(sanity.timings.totalMs)}ms\n`);

  const stat = (label: string, values: number[]): void => {
    const sorted = [...values].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    console.log(
      `${label}: ${values.map((v) => `${Math.round(v)}ms`).join("  ")}  → min=${Math.round(sorted[0])} med=${Math.round(med)} max=${Math.round(sorted[sorted.length - 1])}`
    );
  };

  // ── Onda fria: dispara 3 jobs simultâneos → 3 threads nascem em cascata ──
  const coldTimes: number[] = [];
  await Promise.all(
    [0, 1, 2].map(async () => {
      const s = Date.now();
      await renderPostSpec(spec);
      coldTimes.push(Date.now() - s);
    })
  );
  stat("fria (3 jobs paralelos, paga boot+warm)", coldTimes);
  console.log(`warmStats: ${JSON.stringify(postRenderWarmStats())}`);
  console.log(`  → warmMs por worker: ${postRenderWarmStats().warmMs.map((m) => Math.round(m)).join("ms | ")}ms\n`);

  // ── Ondas quentes: workers prontos, render real do Modelo #1 ──
  for (let wave = 1; wave <= WAVES; wave++) {
    const times: number[] = [];
    const inner: number[] = [];
    await Promise.all(
      [0, 1, 2].map(async () => {
        const s = Date.now();
        const r = await renderPostSpec(spec);
        times.push(Date.now() - s);
        inner.push(r.timings.totalMs);
      })
    );
    stat(`quente onda ${wave} (wall)`, times);
    stat(`quente onda ${wave} (no worker)`, inner);
  }

  const stats = postRenderWarmStats();
  console.log(`\nfinal: ${stats.ready}/${stats.workers} workers prontos; warmMs médio=${Math.round(stats.warmMs.reduce((a, b) => a + b, 0) / Math.max(1, stats.warmMs.length))}ms`);

  await closePostRenderPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
