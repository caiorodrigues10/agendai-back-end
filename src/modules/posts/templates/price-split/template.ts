/**
 * Modelo #1 — "Tabela de valores · Foto + painel" (Ref A), formato de CAMADAS.
 *
 * Função pura: (data, tokens, size) => Layer[]. Sem lógica de negócio, sem fetch.
 * Valores nunca no markup — tudo vem de data/tokens.
 */
import { h, type VNode } from "../_shared/h";
import type { Layer } from "../_engine/types";
import type { PostTokens } from "../_engine/tokens";
import { fitPills, nameFontScale, fitName, fitPrice, formatPhoneBR, formatInsta, fitFooter, estimateTitleH } from "../_engine/fit";
import { sanitizeText } from "../_engine/sanitize";
import type { PriceSplitSizeKey } from "./manifest";

export type PriceItem = { name: string; price: number | null };

export type PriceSplitData = {
  title?: string;
  items: PriceItem[];
  businessName: string;
  /** URL de foto ou stock key (ex.: "barber"). Sem foto → stock do segmento. */
  photoUrl?: string | null;
  logoUrl?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  segment?: string;
  focal?: { x: number; y: number };
};

const SEGMENT_STOCK: Record<string, string> = {
  BARBERSHOP: "barber-editorial",
  HAIR_SALON: "salon-editorial",
  BEAUTY_STUDIO: "beauty-editorial",
  NAIL_STUDIO: "promo-beauty-ivory",
  LASH_BROW_STUDIO: "promo-beauty-luxe",
  AESTHETICS: "promo-beauty-ivory",
  SPA: "promo-beauty-luxe",
};

type Geo = { photoW: number; photoH: number; contentX: number; contentY: number; contentW: number; titleY: number };

function geometry(size: PriceSplitSizeKey): Geo {
  if (size === "story") {
    const photoH = Math.round(1920 * 0.4);
    return { photoW: 1080, photoH, contentX: 56, contentY: photoH + 60, contentW: 968, titleY: photoH + 60 };
  }
  if (size === "square") {
    return { photoW: 432, photoH: 1080, contentX: 472, contentY: 0, contentW: 552, titleY: 120 };
  }
  return { photoW: 480, photoH: 1350, contentX: 520, contentY: 0, contentW: 504, titleY: 150 };
}

const SIZE_DIMS: Record<PriceSplitSizeKey, { w: number; h: number }> = {
  "feed-4x5": { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },
};

export function priceSplitLayers(
  data: PriceSplitData,
  tokens: PostTokens,
  size: PriceSplitSizeKey = "feed-4x5"
): Layer[] {
  const { w: canvasW, h: canvasH } = SIZE_DIMS[size];
  const geo = geometry(size);

  // Foto ou fallback de segmento (nunca caixa vazia). `fallbackSrc` cobre o caso
  // de a URL existir e falhar no fetch/decode (host caído, bytes inválidos).
  const segmentStock = SEGMENT_STOCK[data.segment || "BARBERSHOP"] || "barber-editorial";
  const photoSrc = data.photoUrl || segmentStock;

  // Título: 1ª palavra(s) branca(s), última em accent (sanitiza corte em fronteira).
  const rawTitle = sanitizeText(data.title || "TABELA DE VALORES", 40).text || "TABELA DE VALORES";
  const words = rawTitle.split(" ");
  const lastWord = words.pop() || "VALORES";
  const firstPart = words.join(" ") || "TABELA DE";
  const titleFirstSize = size === "story" ? 72 : 64;
  const titleLastSize = size === "story" ? 116 : 100;

  // Rodapé: nome ajustado à coluna e ancorado embaixo (nunca estoura o canvas).
  // Limite 60 p/ o nome completo da marca sobreviver (fit encolhe p/ caber).
  const biz = sanitizeText(data.businessName, 60).text || "SEU NEGÓCIO";
  const bizWords = biz.split(" ");
  const bizFirst = bizWords.shift() || "SEU";
  const bizRest = bizWords.join(" ") || "NEGÓCIO";
  const contactParts: string[] = [];
  if (data.whatsapp) contactParts.push(`WhatsApp · ${formatPhoneBR(data.whatsapp)}`);
  if (data.instagram) contactParts.push(formatInsta(data.instagram));
  const contact = contactParts.join("  ·  ");
  const footer = fitFooter(bizFirst, bizRest, contact, geo.contentW);
  const footerTop = Math.max(geo.titleY + 120, canvasH - 48 - footer.height);

  // Espaço real p/ pílulas: do fim do título até 24px acima do rodapé.
  const titleH = estimateTitleH(firstPart, lastWord, {
    columnW: geo.contentW,
    firstSize: titleFirstSize,
    lastSize: titleLastSize,
  });
  const availableH = footerTop - 24 - (geo.titleY + titleH);

  // Pílulas (fit automático — comprime antes de esconder, nunca sobrepõe rodapé).
  const items = data.items.slice(0, 20);
  const fit = fitPills(items.length, availableH);
  const visible = items.slice(0, fit.visibleCount);
  const pillFontScale = 1;
  const maxNameChars = Math.floor((geo.contentW - 56 - 120) / (fit.fontSize * 0.58));

  const pillNodes: VNode[] = visible.map((it) => {
    const name = sanitizeText(it.name, 48).text;
    const scale = nameFontScale(name) * pillFontScale;
    const fittedName = fitName(name, Math.floor(maxNameChars / scale));
    const price = fitPrice(it.price);
    return h(
      "div",
      {
        style: {
          display: "flex",
          width: geo.contentW,
          height: fit.rowHeight,
          borderRadius: 999,
          background: tokens.accent,
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 28,
          paddingRight: 28,
          marginBottom: 14,
        },
      },
      h("div", { style: { fontFamily: tokens.fontHeading, fontWeight: 800, fontSize: Math.round(fit.fontSize * scale), color: tokens.accentInk } }, fittedName),
      h("div", { style: { fontFamily: tokens.fontHeading, fontWeight: 800, fontSize: fit.fontSize, color: tokens.accentInk, whiteSpace: "nowrap" } }, price)
    );
  });

  if (fit.hiddenCount > 0) {
    pillNodes.push(
      h("div", { style: { fontFamily: tokens.fontBody, fontWeight: 500, fontSize: 24, color: tokens.muted, marginTop: 4 } }, `+${fit.hiddenCount} serviços`)
    );
  }

  // ─── Camada vetorial única (fade + tinta + conteúdo), fundo transparente ────
  const contentNode = h(
    "div",
    { style: { width: canvasW, height: canvasH, position: "relative" } },
    // fade foto→painel (só nos formatos com foto lateral)
    ...(size !== "story"
      ? [
          h("div", {
            style: {
              position: "absolute", left: geo.photoW - 110, top: 0, width: 110, height: canvasH,
              backgroundImage: `linear-gradient(to right, rgba(0,0,0,0), ${tokens.panel})`,
            },
          }),
          // tinta accent diagonal (canto sup esq sobre a foto)
          h("div", {
            style: {
              position: "absolute", left: 0, top: 0, width: geo.photoW, height: Math.round(canvasH * 0.42),
              backgroundImage: `linear-gradient(135deg, ${hexA(tokens.accent, 0.5)}, ${hexA(tokens.accent, 0)} 40%)`,
            },
          }),
        ]
      : [
          // story: fade inferior da foto p/ o painel
          h("div", {
            style: {
              position: "absolute", left: 0, top: geo.photoH - 120, width: canvasW, height: 120,
              backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0), ${tokens.panel})`,
            },
          }),
        ]),
    // coluna de conteúdo (título + pílulas)
    h(
      "div",
      { style: { position: "absolute", left: geo.contentX, top: geo.titleY, width: geo.contentW, display: "flex", flexDirection: "column" } },
      h("div", { style: { fontFamily: tokens.fontHeading, fontWeight: 800, fontSize: titleFirstSize, color: tokens.text, lineHeight: 1 } }, firstPart.toUpperCase()),
      h("div", { style: { fontFamily: tokens.fontHeading, fontWeight: 900, fontSize: titleLastSize, color: tokens.accent, lineHeight: 0.95, marginTop: 4, marginBottom: 40 } }, lastWord.toUpperCase()),
      ...pillNodes
    ),
    // rodapé de marca
    h(
      "div",
      { style: { position: "absolute", left: geo.contentX, top: footerTop, width: geo.contentW, display: "flex", flexDirection: "column", alignItems: "center" } },
      h("div", { style: { fontFamily: tokens.fontHeading, fontWeight: 800, fontSize: footer.firstSize, color: tokens.text, lineHeight: 1 } }, bizFirst.toUpperCase()),
      h("div", { style: { fontFamily: tokens.fontHeading, fontWeight: 900, fontSize: footer.restSize, color: tokens.accent, lineHeight: 1 } }, bizRest.toUpperCase()),
      ...(contact
        ? [h("div", { style: { fontFamily: tokens.fontBody, fontWeight: 500, fontSize: 22, color: tokens.muted, marginTop: 12, lineHeight: 1.35 } }, contact)]
        : [])
    )
  );

  return [
    {
      kind: "photo",
      src: photoSrc,
      fallbackSrc: segmentStock,
      rect: size === "story" ? { x: 0, y: 0, w: canvasW, h: geo.photoH } : { x: 0, y: 0, w: geo.photoW, h: geo.photoH },
      fit: "cover",
      focal: data.focal,
    },
    { kind: "vector", node: contentNode },
  ];
}

/** #rrggbb + alpha (0..1) → rgba() css. */
function hexA(hex: string, a: number): string {
  const hpart = hex.replace("#", "");
  const full = hpart.length === 3 ? hpart.split("").map((c) => c + c).join("") : hpart;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
