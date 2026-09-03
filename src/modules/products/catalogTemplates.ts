import type { BusinessSegment } from "@/modules/barbershops/dtos/IBarbershopResponseDTO";

export const CATALOG_TEMPLATE_VERSION = "v1";

export type CatalogTemplate = {
  version: string;
  segment: BusinessSegment;
  serviceCategories: Array<{ name: string; icon?: string; color?: string }>;
  productCategories: Array<{ name: string; icon: string; color: string }>;
  expenseCategories: Array<{ name: string }>;
  services: Array<{ name: string; price: number; avgTimeMinutes: number; icon: string; categoryName?: string }>;
  products: Array<{
    name: string;
    description?: string;
    categoryName: string;
    salePrice: number;
    unitLabel: string;
    type: "RETAIL" | "CONSUMABLE" | "BOTH";
  }>;
  posts: Array<{ title: string; content: string }>;
};

const STOCK_EXPENSE = { name: "Compra de estoque" };

function base(segment: BusinessSegment, extra: Omit<CatalogTemplate, "version" | "segment" | "expenseCategories">): CatalogTemplate {
  return { version: CATALOG_TEMPLATE_VERSION, segment, expenseCategories: [STOCK_EXPENSE], ...extra };
}

export const CATALOG_TEMPLATES: Record<BusinessSegment, CatalogTemplate> = {
  BARBERSHOP: base("BARBERSHOP", {
    serviceCategories: [{ name: "Cortes", icon: "scissors" }, { name: "Barba", icon: "user" }],
    productCategories: [
      { name: "Finalizadores", icon: "droplet", color: "#0F766E" },
      { name: "Higiene", icon: "sparkles", color: "#1D4ED8" },
    ],
    services: [
      { name: "Corte masculino", price: 45, avgTimeMinutes: 30, icon: "scissors", categoryName: "Cortes" },
      { name: "Barba", price: 35, avgTimeMinutes: 20, icon: "user", categoryName: "Barba" },
    ],
    products: [
      { name: "Pomada modeladora", categoryName: "Finalizadores", salePrice: 42, unitLabel: "unidade", type: "RETAIL", description: "Fixação média para cabelo" },
      { name: "Shampoo masculino", categoryName: "Higiene", salePrice: 38, unitLabel: "frasco", type: "BOTH" },
      { name: "Balm para barba", categoryName: "Finalizadores", salePrice: 36, unitLabel: "unidade", type: "RETAIL" },
      { name: "Óleo para barba", categoryName: "Finalizadores", salePrice: 34, unitLabel: "frasco", type: "RETAIL" },
    ],
    posts: [
      { title: "Cuide da barba em casa", content: "Leve o óleo ou o balm que usamos no salão e mantenha o visual entre as visitas." },
      { title: "Pomada da casa", content: "Pergunte ao profissional qual finalizador combina com o seu corte." },
    ],
  }),
  HAIR_SALON: base("HAIR_SALON", {
    serviceCategories: [{ name: "Cabelo", icon: "sparkles" }, { name: "Coloração", icon: "palette" }],
    productCategories: [
      { name: "Home care", icon: "heart", color: "#BE185D" },
      { name: "Tratamento", icon: "droplet", color: "#7C3AED" },
    ],
    services: [
      { name: "Corte feminino", price: 80, avgTimeMinutes: 45, icon: "scissors", categoryName: "Cabelo" },
      { name: "Hidratação", price: 70, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Cabelo" },
    ],
    products: [
      { name: "Shampoo profissional", categoryName: "Home care", salePrice: 68, unitLabel: "frasco", type: "BOTH" },
      { name: "Máscara de tratamento", categoryName: "Tratamento", salePrice: 79, unitLabel: "pote", type: "RETAIL" },
      { name: "Leave-in", categoryName: "Home care", salePrice: 54, unitLabel: "frasco", type: "RETAIL" },
      { name: "Tonalizante", categoryName: "Tratamento", salePrice: 49, unitLabel: "unidade", type: "RETAIL" },
    ],
    posts: [
      { title: "Leve o tratamento para casa", content: "A máscara e o leave-in mantêm o resultado do salão por mais tempo." },
      { title: "Home care indicado", content: "Peça ao profissional o shampoo certo para o seu tipo de cabelo." },
    ],
  }),
  BEAUTY_STUDIO: base("BEAUTY_STUDIO", {
    serviceCategories: [{ name: "Estética facial", icon: "smile" }, { name: "Corpo", icon: "heart" }],
    productCategories: [{ name: "Home care", icon: "sparkles", color: "#C026D3" }],
    services: [
      { name: "Limpeza de pele", price: 120, avgTimeMinutes: 60, icon: "smile", categoryName: "Estética facial" },
    ],
    products: [
      { name: "Sérum hidratante", categoryName: "Home care", salePrice: 89, unitLabel: "frasco", type: "RETAIL" },
      { name: "Protetor solar", categoryName: "Home care", salePrice: 72, unitLabel: "frasco", type: "RETAIL" },
    ],
    posts: [
      { title: "Continue o cuidado em casa", content: "Sérum e protetor solar potencializam o resultado da sessão." },
    ],
  }),
  NAIL_STUDIO: base("NAIL_STUDIO", {
    serviceCategories: [{ name: "Unhas", icon: "sparkles" }],
    productCategories: [
      { name: "Esmaltes", icon: "palette", color: "#DB2777" },
      { name: "Cuidados", icon: "heart", color: "#EA580C" },
    ],
    services: [
      { name: "Manicure", price: 40, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Unhas" },
      { name: "Pedicure", price: 45, avgTimeMinutes: 45, icon: "sparkles", categoryName: "Unhas" },
    ],
    products: [
      { name: "Esmalte", categoryName: "Esmaltes", salePrice: 18, unitLabel: "unidade", type: "RETAIL" },
      { name: "Kit de manutenção", categoryName: "Cuidados", salePrice: 32, unitLabel: "kit", type: "RETAIL" },
      { name: "Óleo para cutículas", categoryName: "Cuidados", salePrice: 24, unitLabel: "frasco", type: "RETAIL" },
      { name: "Lixa e palito", categoryName: "Cuidados", salePrice: 12, unitLabel: "kit", type: "RETAIL" },
    ],
    posts: [
      { title: "Mantenha as unhas entre as visitas", content: "Leve óleo de cutícula e o kit de manutenção indicado pela nail designer." },
    ],
  }),
  LASH_BROW_STUDIO: base("LASH_BROW_STUDIO", {
    serviceCategories: [{ name: "Cílios", icon: "eye" }, { name: "Sobrancelhas", icon: "sparkles" }],
    productCategories: [{ name: "Home care", icon: "heart", color: "#4F46E5" }],
    services: [
      { name: "Extensão de cílios", price: 150, avgTimeMinutes: 90, icon: "eye", categoryName: "Cílios" },
      { name: "Design de sobrancelha", price: 50, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Sobrancelhas" },
    ],
    products: [
      { name: "Sérum para cílios", categoryName: "Home care", salePrice: 79, unitLabel: "frasco", type: "RETAIL" },
      { name: "Escovinha de cílios", categoryName: "Home care", salePrice: 15, unitLabel: "unidade", type: "RETAIL" },
    ],
    posts: [
      { title: "Cuide da extensão em casa", content: "Use o sérum e a escovinha indicados para alongar o resultado." },
    ],
  }),
  AESTHETICS: base("AESTHETICS", {
    serviceCategories: [{ name: "Facial", icon: "smile" }, { name: "Corporal", icon: "heart" }],
    productCategories: [{ name: "Home care", icon: "sparkles", color: "#0D9488" }],
    services: [
      { name: "Peeling", price: 180, avgTimeMinutes: 50, icon: "smile", categoryName: "Facial" },
    ],
    products: [
      { name: "Protetor solar", categoryName: "Home care", salePrice: 86, unitLabel: "frasco", type: "RETAIL" },
      { name: "Sérum antioxidante", categoryName: "Home care", salePrice: 120, unitLabel: "frasco", type: "RETAIL" },
      { name: "Hidratante home care", categoryName: "Home care", salePrice: 95, unitLabel: "pote", type: "RETAIL" },
    ],
    posts: [
      { title: "Protocolo home care", content: "Protetor solar e sérum são essenciais para manter o resultado da sessão." },
    ],
  }),
  SPA: base("SPA", {
    serviceCategories: [{ name: "Massagem", icon: "heart" }, { name: "Relaxamento", icon: "sparkles" }],
    productCategories: [{ name: "Autocuidado", icon: "flower", color: "#047857" }],
    services: [
      { name: "Massagem relaxante", price: 160, avgTimeMinutes: 60, icon: "heart", categoryName: "Massagem" },
    ],
    products: [
      { name: "Óleo corporal", categoryName: "Autocuidado", salePrice: 64, unitLabel: "frasco", type: "BOTH" },
      { name: "Kit de relaxamento", categoryName: "Autocuidado", salePrice: 98, unitLabel: "kit", type: "RETAIL" },
      { name: "Vela aromática", categoryName: "Autocuidado", salePrice: 45, unitLabel: "unidade", type: "RETAIL" },
    ],
    posts: [
      { title: "Leve o spa para casa", content: "Óleos, velas e kits de relaxamento prolongam a experiência." },
    ],
  }),
  OTHER: base("OTHER", {
    serviceCategories: [{ name: "Serviços", icon: "sparkles" }],
    productCategories: [{ name: "Varejo", icon: "package", color: "#6B7280" }],
    services: [{ name: "Atendimento", price: 50, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Serviços" }],
    products: [
      { name: "Produto de varejo", categoryName: "Varejo", salePrice: 40, unitLabel: "unidade", type: "RETAIL" },
    ],
    posts: [
      { title: "Produtos à pronta entrega", content: "Pergunte à equipe quais itens combinam com o seu atendimento." },
    ],
  }),
};

export function getCatalogTemplate(segment: BusinessSegment): CatalogTemplate {
  return CATALOG_TEMPLATES[segment] ?? CATALOG_TEMPLATES.OTHER;
}
