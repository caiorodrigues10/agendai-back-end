/**
 * Manifesto do Modelo #1 — "Tabela de valores · Foto + painel" (Ref A).
 *
 * Declara identidade, formatos, campos editáveis e segmentos compatíveis.
 * O editor lê isto para gerar os campos (nada hard-coded por modelo).
 */
export type TemplateSizeKey = "feed-4x5" | "square" | "story";
export type TemplatePhotoMode = "none" | "optional" | "required";

export type TemplateField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "price-list" | "phone" | "insta" | "toggle";
  max?: number;
  required?: boolean;
  placeholder?: string;
};

export const PRICE_SPLIT_MANIFEST = {
  key: "price-split",
  name: "Tabela de valores · Foto + painel",
  description: "Foto à esquerda, painel escuro com linhas em pílula e preços à direita.",
  category: "tabela-de-precos",
  photoMode: "optional" as TemplatePhotoMode,
  sizes: {
    "feed-4x5": { w: 1080, h: 1350 },
    square: { w: 1080, h: 1080 },
    story: { w: 1080, h: 1920 },
  },
  fields: [
    { key: "title", label: "Título", type: "text", max: 40, placeholder: "TABELA DE VALORES" },
    { key: "items", label: "Serviços e preços", type: "price-list", required: true, max: 8 },
    { key: "businessName", label: "Nome do negócio", type: "text", max: 60, required: true },
    { key: "whatsapp", label: "WhatsApp", type: "phone", placeholder: "(11) 99999-9999" },
    { key: "instagram", label: "Instagram", type: "insta", placeholder: "@seuperfil" },
  ] as TemplateField[],
  // Segmentos com ilustração de fallback pronta (stock). Demais usam neutro.
  segments: ["BARBERSHOP", "HAIR_SALON", "BEAUTY_STUDIO", "NAIL_STUDIO", "LASH_BROW_STUDIO", "AESTHETICS", "SPA"],
  /**
   * Regra de saída da arte (decisão registrada em docs/agents/BUSINESS_RULES.md):
   * foto presente (upload ou stock do segmento) → JPEG q90 4:4:4; só tipografia →
   * PNG; prévia do editor → JPEG ~540px. Automática no motor (`RenderSpec.output`
   * omitido = auto) — o manifesto documenta, não controla.
   */
  outputRule: "photo -> jpeg q90; no photo -> png; preview -> jpeg 540px",
} as const;

export type PriceSplitSizeKey = keyof typeof PRICE_SPLIT_MANIFEST.sizes;
