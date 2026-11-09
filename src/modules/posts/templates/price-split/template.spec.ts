import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { priceSplitLayers, priceSplitLayout, type PriceSplitData } from "./template";
import { DOURADO_TOKENS } from "../_engine/tokens";
import { renderPostLayers } from "../_engine/render";
import type { Layer } from "../_engine/types";
import { SAMPLE_BEST, SAMPLE_WORST } from "./sample";

const sizes = ["square", "feed-4x5", "story"] as const;
const eight: PriceSplitData = {
  title: "Tabela de valores", businessName: "Estúdio Aurora", segment: "OTHER",
  whatsapp: "5511999998888", instagram: "estudioaurora",
  items: Array.from({ length: 8 }, (_, index) => ({ name: `Serviço ${index + 1}`, price: 25 + index })),
};

function texts(layers: Layer[]): string {
  const visit = (node: unknown): string[] => {
    if (typeof node === "string") return [node];
    if (Array.isArray(node)) return node.flatMap(visit);
    if (!node || typeof node !== "object") return [];
    return visit((node as { props?: { children?: unknown } }).props?.children);
  };
  return layers.flatMap(layer => layer.kind === "vector" ? visit(layer.node) : []).join(" ");
}

describe("price-split — complete readable content", () => {
  it.each(sizes)("retains eight service names and prices in %s without reducing readable type", size => {
    const plan = priceSplitLayout(eight, size);
    const text = texts(priceSplitLayers(eight, DOURADO_TOKENS, size));
    expect(plan.rows).toHaveLength(8);
    eight.items.forEach(item => expect(text).toContain(item.name));
    expect(text).not.toContain("…");
    expect(text).not.toMatch(/\+\d+ serviços/);
    expect(plan.rows.every(row => row.name.size >= 39)).toBe(true);
    expect(plan.contacts.every(contact => contact.size >= 39)).toBe(true);
    expect(plan.rowsBottom).toBeLessThanOrEqual(plan.footerTop - 28);
    expect(plan.footerBottom).toBeLessThanOrEqual(plan.height - (size === "story" ? 190 : 48));
    expect(text).toContain("(11) 99999-8888");
    expect(text).toContain("@estudioaurora");
  });

  it.each(["PETSHOP", "VETERINARY", "PHYSIOTHERAPY", "NUTRITION", "PSYCHOTHERAPY", "CAR_WASH", "NAIL_STUDIO", "OTHER", undefined])("uses a neutral composition for %s without an unrelated stock photo", segment => {
    const layers = priceSplitLayers({ ...eight, segment }, DOURADO_TOKENS);
    expect(layers.some(layer => layer.kind === "photo")).toBe(false);
    expect(priceSplitLayout({ ...eight, segment }).photoRect).toBeNull();
  });

  it("preserves an explicit photo for an unsupported segment without adding barber fallback", () => {
    const photoUrl = "data:image/png;base64,ZmFrZQ==";
    const photo = priceSplitLayers({ ...eight, segment: "PETSHOP", photoUrl }, DOURADO_TOKENS).find(layer => layer.kind === "photo");
    expect(photo).toMatchObject({ kind: "photo", src: photoUrl });
    expect(photo).not.toHaveProperty("fallbackSrc");
  });

  it("keeps real services with a matching barbershop photo in the reference sample", () => {
    const layers = priceSplitLayers(SAMPLE_BEST, DOURADO_TOKENS);
    expect(layers).toContainEqual(expect.objectContaining({ kind: "photo", src: "barber-editorial" }));
    const text = texts(layers);
    SAMPLE_BEST.items.forEach(item => expect(text).toContain(item.name));
  });

  it("rejects excessive content with an actionable error instead of hiding prices or names", () => {
    const data = { ...eight, items: Array.from({ length: 8 }, () => ({ name: "Serviço com uma descrição extensa que precisa permanecer inteira na imagem", price: 150 })) };
    expect(() => priceSplitLayers(data, DOURADO_TOKENS, "square")).toThrow(/Reduza os itens ou escolha Retrato ou Story/);
    expect(() => priceSplitLayers({ ...eight, items: [...eight.items, { name: "Nono serviço", price: 50 }] }, DOURADO_TOKENS)).toThrow(/até 8 serviços/);
  });

  it("keeps a long service complete when it fits a wider story column", () => {
    const name = "Manutenção de cílios com avaliação individual";
    const data = { ...eight, items: [{ name, price: null }] };
    const plan = priceSplitLayout(data, "story");
    expect(plan.rows[0].name.lines.join(" ")).toBe(name);
    expect(texts(priceSplitLayers(data, DOURADO_TOKENS, "story"))).toContain("sob consulta");
  });

  it.each(["feed-4x5", "story"] as const)("keeps the long eight-item fixture and complete title in %s", size => {
    const text = texts(priceSplitLayers(SAMPLE_WORST, DOURADO_TOKENS, size));
    SAMPLE_WORST.items.forEach(item => expect(text).toContain(item.name));
    expect(text).toContain(SAMPLE_WORST.title);
    expect(text).not.toContain("…");
    expect(text).not.toMatch(/\+\d+ serviços/);
  });

  it.each(sizes)("renders valid export pixels for neutral eight-item %s", async size => {
    const height = size === "story" ? 1920 : size === "square" ? 1080 : 1350;
    const result = await renderPostLayers({ width: 1080, height, bg: DOURADO_TOKENS.bg, layers: priceSplitLayers(eight, DOURADO_TOKENS, size) });
    expect(result.mimeType).toBe("image/png");
    expect(await sharp(result.buffer).metadata()).toMatchObject({ width: 1080, height });
  });

  it("aligns the rendered price rows with the reserved side margins, including horizontal padding", async () => {
    const plan = priceSplitLayout(eight, "square");
    const result = await renderPostLayers({ width: 1080, height: 1080, bg: DOURADO_TOKENS.bg, layers: priceSplitLayers(eight, DOURADO_TOKENS, "square") });
    const y = Math.round(plan.rowsTop + plan.rows[0].height / 2);
    const pixels = await sharp(result.buffer).extract({ left: 0, top: y, width: 1080, height: 1 }).removeAlpha().raw().toBuffer();
    const rowColor = pixels.subarray((plan.contentX + 8) * 3, (plan.contentX + 9) * 3);
    expect(rowColor.equals(pixels.subarray(0, 3))).toBe(false);
    const rowPixels: number[] = [];
    for (let x = 0; x < 1080; x++) if (pixels.subarray(x * 3, x * 3 + 3).equals(rowColor)) rowPixels.push(x);
    expect(rowPixels[0]).toBe(plan.contentX);
    expect(rowPixels.at(-1)).toBe(plan.contentX + plan.contentWidth - 1);
  });
});
