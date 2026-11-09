/** Price list artwork. Layout reserves complete, readable text before rendering. */
import { h, type VNode } from "../_shared/h";
import type { Layer } from "../_engine/types";
import { contrastRatio, type PostTokens } from "../_engine/tokens";
import { fitPrice, formatPhoneBR } from "../_engine/fit";
import { sanitizeText } from "../_engine/sanitize";
import { AppError } from "@/shared/errors/AppError";
import metrics from "../../services/legalFontMetrics.json";
import type { PriceSplitSizeKey } from "./manifest";

export type PriceItem = { name: string; price: number | null };
export type PriceSplitData = {
  title?: string;
  items: PriceItem[];
  businessName: string;
  photoUrl?: string | null;
  logoUrl?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  segment?: string;
  focal?: { x: number; y: number };
};

// Only photos whose subject matches the segment may be chosen automatically.
// Unknown/pet/health/service segments use a neutral typographic composition.
const SEGMENT_STOCK: Record<string, string> = {
  BARBERSHOP: "barber-editorial",
  HAIR_SALON: "salon-editorial",
  BEAUTY_STUDIO: "beauty-editorial",
};

const SIZE_DIMS = {
  "feed-4x5": { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
} as const;

type Font = "sans" | "sansBold";
type TextBlock = { lines: string[]; size: number; height: number };
type Row = { name: TextBlock; price: string; priceWidth: number; height: number };
export type PriceSplitLayout = {
  width: number; height: number;
  contentX: number; contentWidth: number; contentTop: number;
  photoRect: { x: number; y: number; w: number; h: number } | null;
  title: TextBlock;
  rows: Row[]; rowGap: number; rowsTop: number; rowsBottom: number;
  brand: TextBlock; contacts: TextBlock[]; footerTop: number; footerBottom: number;
};

const clean = (value: string) => sanitizeText(value, Infinity).text;
const overflow = () => new AppError(
  "A tabela ficou longa para este formato com texto legível. Reduza os itens ou escolha Retrato ou Story.", 400,
);

function widthOf(value: string, size: number, font: Font): number {
  const glyphs = metrics[font].advance as Record<string, number>;
  return Array.from(value).reduce((sum, char) => sum + (glyphs[String(char.codePointAt(0))] ?? 1) * size * 1.035, 0);
}

function textBlock(value: string, width: number, size: number, font: Font): TextBlock {
  const lines: string[] = [];
  let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    if (widthOf(word, size, font) > width) throw overflow();
    if (line && widthOf(`${line} ${word}`, size, font) > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return { lines, size, height: lines.length * size * 1.3 };
}

function contactLines(data: PriceSplitData): string[] {
  const contacts: string[] = [];
  if (data.whatsapp?.trim()) {
    const raw = data.whatsapp.trim();
    let digits = raw.replace(/\D/g, "");
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
    const phone = digits.length === 10 || digits.length === 11 ? formatPhoneBR(digits) : raw;
    contacts.push(`WhatsApp · ${phone}`);
  }
  if (data.instagram?.trim()) contacts.push(`@${data.instagram.trim().replace(/^@+/, "")}`);
  return contacts;
}

/** Also exported for geometry audits; overflowing content is never silently removed. */
export function priceSplitLayout(data: PriceSplitData, size: PriceSplitSizeKey = "feed-4x5"): PriceSplitLayout {
  if (data.items.length > 8) throw new AppError("A tabela aceita até 8 serviços. Divida a lista em outra publicação.", 400);
  const { w: width, h: height } = SIZE_DIMS[size];
  const story = size === "story";
  const hasPhoto = Boolean(data.photoUrl || SEGMENT_STOCK[data.segment ?? ""]);
  const photoW = data.items.length >= 6 ? 240 : 360;
  const photoRect = !hasPhoto ? null : story
    ? { x: 0, y: 0, w: width, h: data.items.length >= 6 ? 360 : 480 }
    : { x: 0, y: 0, w: photoW, h: height };
  const contentX = photoRect && !story ? photoW + 40 : 64;
  const contentWidth = width - contentX - 56;
  const contentTop = story ? (photoRect ? photoRect.h + 48 : 176) : 48;
  const title = textBlock(clean(data.title || "Tabela de valores").toUpperCase(), contentWidth, story ? 72 : 58, "sansBold");
  const brand = textBlock(clean(data.businessName || "Seu negócio"), contentWidth - (data.logoUrl ? 76 : 0), story ? 48 : 42, "sansBold");
  const contacts = contactLines(data).map(value => textBlock(clean(value), contentWidth, story ? 42 : 39, "sans"));
  const footerHeight = Math.max(brand.height, data.logoUrl ? 64 : 0) + (contacts.length ? 14 : 0)
    + contacts.reduce((sum, contact, i) => sum + contact.height + (i ? 8 : 0), 0);
  const footerBottom = height - (story ? 190 : 48);
  const footerTop = footerBottom - footerHeight;
  const rowsTop = contentTop + title.height + 24;
  const rowFontSize = story ? 48 : 41;
  const rows = data.items.map(item => {
    const name = clean(item.name);
    if (!name) throw new AppError("Informe o nome de cada serviço da tabela.", 400);
    if (item.price !== null && (!Number.isFinite(item.price) || item.price < 0))
      throw new AppError("Informe um preço válido ou deixe o serviço sob consulta.", 400);
    const price = fitPrice(item.price);
    const priceWidth = Math.ceil(widthOf(price, rowFontSize, "sansBold")) + 4;
    const text = textBlock(name, contentWidth - 44 - 24 - priceWidth, rowFontSize, "sansBold");
    return { name: text, price, priceWidth, height: Math.max(text.height, rowFontSize * 1.3) + 20 };
  });
  const minimumRowsHeight = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * 10;
  if (title.lines.length > 4 || rowsTop + minimumRowsHeight > footerTop - 28) throw overflow();
  const spareHeight = footerTop - 28 - rowsTop - minimumRowsHeight;
  const gaps = Math.max(0, rows.length - 1);
  const rowGap = 10 + Math.min(story ? 10 : 6, Math.floor(spareHeight / Math.max(1, gaps * 2)));
  const extraPerRow = Math.min(story ? 40 : 24, (spareHeight - gaps * (rowGap - 10)) / Math.max(rows.length, 1));
  rows.forEach(row => { row.height += extraPerRow; });
  const rowsBottom = rowsTop + rows.reduce((sum, row) => sum + row.height, 0) + gaps * rowGap;
  return { width, height, contentX, contentWidth, contentTop, photoRect, title, rows, rowGap, rowsTop, rowsBottom, brand, contacts, footerTop, footerBottom };
}

function drawText(block: TextBlock, tokens: PostTokens, weight: 400 | 700, color: string): VNode {
  return h("div", { style: { display: "flex", flexDirection: "column", fontFamily: tokens.fontBody, fontWeight: weight, fontSize: block.size, color, lineHeight: 1.3 } },
    ...block.lines.map(line => h("div", { style: { display: "flex", whiteSpace: "nowrap", height: block.size * 1.3 } }, line)));
}

export function priceSplitLayers(data: PriceSplitData, tokens: PostTokens, size: PriceSplitSizeKey = "feed-4x5"): Layer[] {
  const plan = priceSplitLayout(data, size);
  const channels = (hex: string) => (hex.length === 4 ? [...hex.slice(1)].map(c => c + c) : hex.slice(1).match(/../g)!).map(c => parseInt(c, 16));
  const ink = channels(tokens.text);
  const surface = `#${channels(tokens.panel).map((channel, i) => Math.round(channel * .9 + ink[i] * .1).toString(16).padStart(2, "0")).join("")}`;
  const priceInk = contrastRatio(tokens.accent, surface) >= 4.5 ? tokens.accent : tokens.text;
  const segmentStock = SEGMENT_STOCK[data.segment ?? ""];
  const photoSrc = data.photoUrl || segmentStock;
  const nodes: VNode[] = [
    h("div", { style: { position: "absolute", left: 0, top: 0, width: plan.width, height: plan.height, background: tokens.panel } }),
  ];
  if (plan.photoRect && size !== "story") nodes.push(h("div", { style: {
    position: "absolute", left: plan.photoRect.w - 64, top: 0, width: 64, height: plan.height,
    backgroundImage: `linear-gradient(to right, rgba(0,0,0,0), ${tokens.panel})`,
  } }));
  nodes.push(h("div", { style: { position: "absolute", left: plan.contentX, top: plan.contentTop, width: plan.contentWidth, display: "flex", flexDirection: "column" } },
    drawText(plan.title, tokens, 700, tokens.text)));
  let rowY = plan.rowsTop;
  for (const row of plan.rows) {
    nodes.push(h("div", { style: {
      // Satori uses content-box widths: include padding in the planned outer width.
      position: "absolute", left: plan.contentX, top: rowY, width: plan.contentWidth - 44, height: row.height,
      display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 22, paddingRight: 22,
      borderRadius: 12, background: surface,
    } }, drawText(row.name, tokens, 400, tokens.text),
    h("div", { style: { display: "flex", width: row.priceWidth, justifyContent: "flex-end", whiteSpace: "nowrap", fontFamily: tokens.fontBody, fontWeight: 700, fontSize: row.name.size, lineHeight: 1.3, color: priceInk } }, row.price)));
    rowY += row.height + plan.rowGap;
  }
  nodes.push(h("div", { style: {
    position: "absolute", left: plan.contentX, top: plan.footerTop - 14, width: plan.contentWidth, height: 2, background: tokens.accent, opacity: 0.55,
  } }));
  const footer: VNode[] = [h("div", { style: { display: "flex", alignItems: "center", minHeight: data.logoUrl ? 64 : plan.brand.height, gap: 12 } },
    ...(data.logoUrl ? [h("img", { src: data.logoUrl, width: 64, height: 64, style: { objectFit: "contain" } })] : []),
    drawText(plan.brand, tokens, 700, tokens.text))];
  plan.contacts.forEach((contact, i) => footer.push(h("div", { style: { display: "flex", marginTop: i ? 8 : 14 } }, drawText(contact, tokens, 400, tokens.muted))));
  nodes.push(h("div", { style: { position: "absolute", left: plan.contentX, top: plan.footerTop, width: plan.contentWidth, display: "flex", flexDirection: "column" } }, ...footer));

  const photo: Layer[] = photoSrc && plan.photoRect ? [{
    kind: "photo", src: photoSrc, ...(segmentStock ? { fallbackSrc: segmentStock } : {}), rect: plan.photoRect, fit: "cover", focal: data.focal,
  }] : [];
  // Background precedes the photo; content follows it, so a failed photo leaves
  // a quiet neutral panel and never an unrelated photograph.
  const background = nodes.shift()!;
  return [{ kind: "vector", node: h("div", { style: { width: plan.width, height: plan.height, position: "relative", display: "flex" } }, background) },
    ...photo,
    { kind: "vector", node: h("div", { style: { width: plan.width, height: plan.height, position: "relative", display: "flex" } }, ...nodes) }];
}
