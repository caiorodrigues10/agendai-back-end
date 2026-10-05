import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPostSvg } from "../src/modules/posts/services/postImageService";
import { renderSvgToPngSync } from "../src/modules/posts/services/postSvgRenderer";
import { POST_TEMPLATES } from "../src/modules/posts/services/postTemplates";
import { loadPostStockImage } from "../src/modules/posts/services/postStockImages";

// Local QA only. No API/database credentials or real customer information.
const out = process.argv[2];
if (!out || !path.isAbsolute(out)) throw new Error("Informe um diretório absoluto para as imagens de QA");
mkdirSync(out, { recursive: true });
const formats = ["square", "portrait", "story"] as const;
const rows: string[] = [];
const width = 900;
const cellW = 300;
const cellH = 580;
for (const [row, template] of POST_TEMPLATES.entries()) {
  for (const [col, format] of formats.entries()) {
    const png = renderSvgToPngSync(buildPostSvg({
      shopName: "Studio Aurora", logoUrl: null, templateKey: template.key, format,
      paletteKey: row % 2 ? "clara" : "brand",
      title: "Seu próximo momento de cuidado começa aqui",
      ctaText: "Reserve seu horário", postMode: "appointments",
      services: [{ name: "Corte e finalização", price: 85 }, { name: "Barba", price: 35 }],
      todaySchedule: { isOpen: true, openTime: "09:00", closeTime: "19:00" },
      primaryImageUrl: template.photoMode === "none" ? null : loadPostStockImage(template.stockImageKey ?? "salon"),
      secondaryImageUrl: template.requiredMedia === 2 ? loadPostStockImage("barber") : null,
    }));
    writeFileSync(path.join(out, `${template.key}-${format}.png`), png);
    rows.push(`<text x="${col * cellW + 12}" y="${row * cellH + 22}" font-size="14" fill="#fafafa">${template.key} · ${format}</text><image href="data:image/png;base64,${png.toString("base64")}" x="${col * cellW + 10}" y="${row * cellH + 40}" width="280" height="520" preserveAspectRatio="xMidYMid meet" />`);
  }
}
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${POST_TEMPLATES.length * cellH}"><rect width="100%" height="100%" fill="#242424" />${rows.join("")}</svg>`;
writeFileSync(path.join(out, "contact-sheet.png"), renderSvgToPngSync(sheet));
console.log(`Rendered ${POST_TEMPLATES.length * formats.length} QA images in ${out}. Fixtures are illustrative, not customer results.`);
