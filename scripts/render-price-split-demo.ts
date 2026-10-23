/**
 * Demo 1.2 — renderiza o Modelo #1 pelo MOTOR REAL (pilha de camadas),
 * nos 3 formatos × pior caso + melhor caso. Mede tempos e pesos.
 *
 * Rodar:  npx tsx scripts/render-price-split-demo.ts
 * Saída:  docs/post-references/modelo1-*.jpg|png (gitignorado).
 */
import fs from "node:fs";
import path from "node:path";
import { renderPostLayers } from "../src/modules/posts/templates/_engine/render";
import { photoCacheStats } from "../src/modules/posts/templates/_engine/image";
import { DOURADO_TOKENS } from "../src/modules/posts/templates/_engine/tokens";
import { priceSplitLayers } from "../src/modules/posts/templates/price-split/template";
import { SAMPLE_BEST, SAMPLE_WORST } from "../src/modules/posts/templates/price-split/sample";
import type { PriceSplitSizeKey } from "../src/modules/posts/templates/price-split/manifest";

const OUT = path.join(__dirname, "..", "docs", "post-references");
fs.mkdirSync(OUT, { recursive: true });

const SIZES: PriceSplitSizeKey[] = ["feed-4x5", "square", "story"];
const DIMS: Record<PriceSplitSizeKey, { w: number; h: number }> = {
  "feed-4x5": { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

async function main() {
  console.log("=== Modelo #1 (price-split) pelo motor real — pior caso ===\n");
  console.log(
    `[pior caso] título=${SAMPLE_WORST.title.length} chars "${SAMPLE_WORST.title}" · ` +
      `${SAMPLE_WORST.items.length} itens (fit exibe no máx. 8 + "+N serviços") · ` +
      `sem foto=${!SAMPLE_WORST.photoUrl} (stock ${SAMPLE_WORST.segment}) · sem logo=${!SAMPLE_WORST.logoUrl} · ` +
      `sem WhatsApp/Instagram\n`
  );
  // warm-up (frio do worker) — 5 renders descartados pagam parse de fontes + WASM do harfbuzz
  for (let i = 0; i < 5; i++) {
    const warmLayers = priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS, "feed-4x5");
    await renderPostLayers({ width: 1080, height: 1350, bg: DOURADO_TOKENS.panel, layers: warmLayers });
  }

  for (const size of SIZES) {
    const { w, h } = DIMS[size];
    const layers = priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS, size);
    const r = await renderPostLayers({ width: w, height: h, bg: DOURADO_TOKENS.panel, layers });
    const ext = r.mimeType === "image/jpeg" ? "jpg" : "png";
    const out = path.join(OUT, `modelo1-worst-${size}.${ext}`);
    fs.writeFileSync(out, r.buffer);
    console.log(
      `[pior ${size} ${w}×${h}] total=${Math.round(r.timings.totalMs)}ms ` +
        `(photo=${Math.round(r.timings.photoMs)} vector=${Math.round(r.timings.vectorMs)} compose=${Math.round(r.timings.composeMs)}) ` +
        `${r.mimeType} ${Math.round(r.bytes / 1024)}KB -> ${path.basename(out)}`
    );
  }

  console.log("\n=== Melhor caso (feed-4x5) ===");
  const bl = priceSplitLayers(SAMPLE_BEST, DOURADO_TOKENS, "feed-4x5");
  const br = await renderPostLayers({ width: 1080, height: 1350, bg: DOURADO_TOKENS.panel, layers: bl });
  const bext = br.mimeType === "image/jpeg" ? "jpg" : "png";
  fs.writeFileSync(path.join(OUT, `modelo1-best-feed-4x5.${bext}`), br.buffer);
  console.log(
    `[melhor feed-4x5] total=${Math.round(br.timings.totalMs)}ms ${br.mimeType} ${Math.round(br.bytes / 1024)}KB`
  );

  console.log("\n=== Prévia 540 (feed-4x5, pior caso) ===");
  const pvLayers = priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS, "feed-4x5");
  const pv = await renderPostLayers({
    width: 1080,
    height: 1350,
    bg: DOURADO_TOKENS.panel,
    layers: pvLayers,
    preview: true, // JPEG q78 de 540 px (composto lossless → resize → encode)
  });
  fs.writeFileSync(path.join(OUT, "modelo1-worst-preview540.jpg"), pv.buffer);
  console.log(
    `[prévia 540] total=${Math.round(pv.timings.totalMs)}ms ` +
      `(photo=${Math.round(pv.timings.photoMs)} vector=${Math.round(pv.timings.vectorMs)} compose=${Math.round(pv.timings.composeMs)}) ` +
      `${pv.mimeType} ${Math.round(pv.bytes / 1024)}KB`
  );
  const cached = await renderPostLayers({
    width: 1080,
    height: 1350,
    bg: DOURADO_TOKENS.panel,
    layers: pvLayers,
    preview: true,
  });
  console.log(`[prévia 540 · cache hit] ${Math.round(cached.timings.totalMs)}ms (${cached.bytes} bytes iguais)`);

  console.log(`\n[cache] fotos=${photoCacheStats().photos} prévias=${photoCacheStats().previews}`);
}

main().catch((e) => {
  console.error("DEMO_FALHOU:", e?.stack || e);
  process.exit(1);
});
