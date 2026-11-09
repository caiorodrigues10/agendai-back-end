/**
 * Local price-split proof through the real layer renderer. No database writes.
 * npx tsx scripts/render-price-split-demo.ts [output-directory]
 * The long eight-item square is deliberately rejected; wider formats keep it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { renderPostLayers } from "../src/modules/posts/templates/_engine/render";
import { DOURADO_TOKENS } from "../src/modules/posts/templates/_engine/tokens";
import { priceSplitLayers, type PriceSplitData } from "../src/modules/posts/templates/price-split/template";
import { SAMPLE_BEST, SAMPLE_WORST } from "../src/modules/posts/templates/price-split/sample";
import type { PriceSplitSizeKey } from "../src/modules/posts/templates/price-split/manifest";
import { AppError } from "../src/shared/errors/AppError";

const SIZES = ["square", "feed-4x5", "story"] as const;
const HEIGHT = { square: 1080, "feed-4x5": 1350, story: 1920 };
const LABEL = { square: "Quadrado", "feed-4x5": "Retrato", story: "Story" };
const xml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

async function main() {
  const output = path.resolve(process.argv[2] || path.join(__dirname, "../docs/post-references"));
  await fs.mkdir(output, { recursive: true });
  const neutral: PriceSplitData = {
    title: "Tabela de valores", businessName: "Centro Veterinário Horizonte", segment: "VETERINARY",
    whatsapp: "5511999998888", instagram: "horizontevet",
    items: Array.from({ length: 8 }, (_, index) => ({ name: `Atendimento ${index + 1}`, price: 25 + index })),
  };
  const cases = [{ key: "best", label: "Barbearia · cinco serviços", data: SAMPLE_BEST },
    { key: "worst", label: "Oito nomes longos · sem omitir texto", data: SAMPLE_WORST },
    { key: "neutral", label: "Veterinária · oito itens · composição neutra", data: neutral }];
  const records: { case: string; format: PriceSplitSizeKey; file?: string; width?: number; height?: number; bytes?: number; expectedError?: string }[] = [];
  const sections: string[] = [];

  for (const item of cases) {
    const cards: string[] = [];
    const board: { input: Buffer; left: number; top: number }[] = [];
    for (const [index, size] of SIZES.entries()) {
      let layers;
      try { layers = priceSplitLayers(item.data, DOURADO_TOKENS, size); }
      catch (error) {
        if (item.key !== "worst" || size !== "square" || !(error instanceof AppError) || error.statusCode !== 400) throw error;
        records.push({ case: item.key, format: size, expectedError: error.message });
        cards.push(`<figure><div class="error"><b>Limite de leitura preservado</b><p>${xml(error.message)}</p></div><figcaption>${LABEL[size]}</figcaption></figure>`);
        board.push({ left: index * 384, top: 40, input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><rect width="360" height="360" fill="#221f18"/><text x="24" y="54" font-family="Arial" font-size="17" fill="#fff6dc">Oito nomes longos completos</text><text x="24" y="88" font-family="Arial" font-size="16" fill="#fff6dc">Este caso precisa de</text><text x="24" y="116" font-family="Arial" font-size="16" fill="#fff6dc">Retrato ou Story.</text><text x="24" y="164" font-family="Arial" font-size="15" fill="#e4c98e">Nenhum item foi ocultado.</text></svg>`) });
        continue;
      }
      const result = await renderPostLayers({ width: 1080, height: HEIGHT[size], bg: DOURADO_TOKENS.bg, layers });
      const extension = result.mimeType === "image/jpeg" ? "jpg" : "png";
      const file = `modelo1-${item.key}-${size}.${extension}`;
      const metadata = await sharp(result.buffer).metadata();
      if (metadata.width !== 1080 || metadata.height !== HEIGHT[size]) throw new Error(`Dimensão incorreta: ${file}`);
      await fs.writeFile(path.join(output, file), result.buffer);
      records.push({ case: item.key, format: size, file, width: metadata.width, height: metadata.height, bytes: result.bytes });
      cards.push(`<figure><a href="${file}"><img src="${file}" alt="${xml(item.label)} · ${LABEL[size]}" loading="lazy"></a><figcaption>${LABEL[size]} · 1080 × ${HEIGHT[size]}</figcaption></figure>`);
      board.push({ input: await sharp(result.buffer).resize({ width: 360 }).png().toBuffer(), left: index * 384, top: 40 });
      console.log(`${item.key}/${size}: ${result.mimeType}, ${Math.round(result.bytes / 1024)} KB`);
    }
    board.push({ left: 0, top: 0, input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1128" height="40">${SIZES.map((size, index) => `<text x="${index * 384 + 6}" y="25" font-family="Arial" font-size="15" fill="#263d35">${LABEL[size]} · 360 px</text>`).join("")}</svg>`) });
    await sharp({ create: { width: 1128, height: 704, channels: 4, background: "#e8e6df" } }).composite(board).png().toFile(path.join(output, `modelo1-${item.key}-360.png`));
    sections.push(`<section><h2>${xml(item.label)}</h2><div class="grid">${cards.join("")}</div></section>`);
  }
  const preview = await renderPostLayers({ width: 1080, height: 1350, bg: DOURADO_TOKENS.bg, layers: priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS), preview: true });
  const previewMeta = await sharp(preview.buffer).metadata();
  if (previewMeta.width !== 540 || preview.mimeType !== "image/jpeg") throw new Error("Prévia deve ser JPEG com 540 px de largura.");
  await fs.writeFile(path.join(output, "modelo1-worst-preview540.jpg"), preview.buffer);
  await fs.writeFile(path.join(output, "summary.json"), JSON.stringify({ examplesAreFictional: true, records, preview: { file: "modelo1-worst-preview540.jpg", width: previewMeta.width, height: previewMeta.height, mimeType: preview.mimeType } }, null, 2));
  await fs.writeFile(path.join(output, "index.html"), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tabela de valores · revisão visual</title><style>*{box-sizing:border-box}body{font:16px system-ui;margin:0;padding:28px;background:#e8e6df;color:#263d35}main{max-width:1280px;margin:auto}h1{font-size:36px}h2{font-size:24px;margin-top:48px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}figure{margin:0}img{display:block;width:100%;height:auto}figcaption{padding-top:12px}.error{min-height:280px;padding:28px;background:#221f18;color:#fff6dc;line-height:1.5}a:focus-visible{outline:3px solid #805e24;outline-offset:4px}@media(max-width:760px){.grid{grid-template-columns:1fr}body{padding:20px}}</style><main><h1>Tabela de valores</h1><p>Dados e preços fictícios para revisão. Oito itens são preservados; o caso que excede o quadrado pede um formato maior.</p>${sections.join("")}</main></html>`);
  console.log(output);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
