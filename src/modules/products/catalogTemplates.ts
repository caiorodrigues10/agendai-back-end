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

/** Template dos segmentos ampliados: só serviços de exemplo (preço 0) e
 *  categorias — sem produtos/posts inventados. */
function minimal(
  segment: BusinessSegment,
  extra: Pick<CatalogTemplate, "serviceCategories" | "services">
): CatalogTemplate {
  return {
    version: CATALOG_TEMPLATE_VERSION,
    segment,
    expenseCategories: [STOCK_EXPENSE],
    productCategories: [],
    products: [],
    posts: [],
    ...extra,
  };
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
  PETSHOP: base("PETSHOP", {
    serviceCategories: [
      { name: "Banho", icon: "droplet" },
      { name: "Tosa", icon: "scissors" },
      { name: "Cuidados", icon: "heart" },
    ],
    productCategories: [
      { name: "Higiene pet", icon: "sparkles", color: "#0F766E" },
      { name: "Tosa e cuidados", icon: "scissors", color: "#7C3AED" },
      { name: "Acessórios", icon: "package", color: "#1D4ED8" },
    ],
    services: [
      { name: "Banho", price: 60, avgTimeMinutes: 45, icon: "droplet", categoryName: "Banho" },
      { name: "Tosa higiênica", price: 45, avgTimeMinutes: 30, icon: "scissors", categoryName: "Tosa" },
      { name: "Tosa completa", price: 80, avgTimeMinutes: 60, icon: "scissors", categoryName: "Tosa" },
      { name: "Banho + tosa", price: 110, avgTimeMinutes: 90, icon: "sparkles", categoryName: "Banho" },
      { name: "Hidratação de pelagem", price: 55, avgTimeMinutes: 30, icon: "droplet", categoryName: "Cuidados" },
      { name: "Corte de unhas", price: 25, avgTimeMinutes: 15, icon: "scissors", categoryName: "Cuidados" },
      { name: "Limpeza de ouvidos", price: 20, avgTimeMinutes: 10, icon: "heart", categoryName: "Cuidados" },
    ],
    products: [
      { name: "Shampoo pet", categoryName: "Higiene pet", salePrice: 42, unitLabel: "frasco", type: "BOTH" },
      { name: "Condicionador pet", categoryName: "Higiene pet", salePrice: 38, unitLabel: "frasco", type: "RETAIL" },
      { name: "Antipulgas", categoryName: "Higiene pet", salePrice: 69, unitLabel: "unidade", type: "RETAIL" },
      { name: "Perfume pet", categoryName: "Higiene pet", salePrice: 29, unitLabel: "frasco", type: "RETAIL" },
      { name: "Escova desembaraçadora", categoryName: "Tosa e cuidados", salePrice: 45, unitLabel: "unidade", type: "RETAIL" },
      { name: "Cortador de unhas", categoryName: "Tosa e cuidados", salePrice: 34, unitLabel: "unidade", type: "RETAIL" },
    ],
    posts: [
      { title: "Hora do banho", content: "Leve seu pet no dia em que a pelagem pedir — evite esperar o odor aparecer." },
      { title: "Tosa com conforto", content: "Avisamos na recepção se o pet ficar estressado durante a tosa." },
    ],
  }),
  // Segmentos ampliados (2026-10): template mínimo — categorias e um serviço
  // de exemplo sem preço (o dono preenche). Sem produtos/posts inventados.
  MAKEUP_STUDIO: minimal("MAKEUP_STUDIO", {
    serviceCategories: [{ name: "Maquiagem", icon: "palette" }, { name: "Cabelo", icon: "scissors" }],
    services: [
      { name: "Maquiagem social", price: 0, avgTimeMinutes: 60, icon: "palette", categoryName: "Maquiagem" },
      { name: "Penteado", price: 0, avgTimeMinutes: 45, icon: "scissors", categoryName: "Cabelo" },
    ],
  }),
  PHYSIOTHERAPY: minimal("PHYSIOTHERAPY", {
    serviceCategories: [{ name: "Sessões", icon: "heart" }],
    services: [
      { name: "Sessão de fisioterapia", price: 0, avgTimeMinutes: 50, icon: "heart", categoryName: "Sessões" },
    ],
  }),
  NUTRITION: minimal("NUTRITION", {
    serviceCategories: [{ name: "Consultas", icon: "clipboard" }],
    services: [
      { name: "Consulta de nutrição", price: 0, avgTimeMinutes: 45, icon: "clipboard", categoryName: "Consultas" },
    ],
  }),
  PSYCHOTHERAPY: minimal("PSYCHOTHERAPY", {
    serviceCategories: [{ name: "Sessões", icon: "heart" }],
    services: [
      { name: "Sessão de terapia", price: 0, avgTimeMinutes: 50, icon: "heart", categoryName: "Sessões" },
    ],
  }),
  VETERINARY: minimal("VETERINARY", {
    serviceCategories: [{ name: "Consultas", icon: "stethoscope" }],
    services: [
      { name: "Consulta veterinária", price: 0, avgTimeMinutes: 30, icon: "stethoscope", categoryName: "Consultas" },
    ],
  }),
  CAR_WASH: minimal("CAR_WASH", {
    serviceCategories: [{ name: "Lavagem", icon: "droplets" }],
    services: [
      { name: "Lavagem simples", price: 0, avgTimeMinutes: 30, icon: "droplets", categoryName: "Lavagem" },
    ],
  }),
  AUTO_REPAIR: minimal("AUTO_REPAIR", {
    serviceCategories: [{ name: "Manutenção", icon: "wrench" }],
    services: [
      { name: "Troca de óleo", price: 0, avgTimeMinutes: 40, icon: "wrench", categoryName: "Manutenção" },
    ],
  }),
  PHOTO_STUDIO: minimal("PHOTO_STUDIO", {
    serviceCategories: [{ name: "Ensaio", icon: "camera" }],
    services: [
      { name: "Ensaio fotográfico", price: 0, avgTimeMinutes: 90, icon: "camera", categoryName: "Ensaio" },
    ],
  }),
  TATTOO_PIERCING: minimal("TATTOO_PIERCING", {
    serviceCategories: [{ name: "Tatuagem", icon: "pen" }],
    services: [
      { name: "Sessão de tatuagem", price: 0, avgTimeMinutes: 120, icon: "pen", categoryName: "Tatuagem" },
    ],
  }),
  COACHING: minimal("COACHING", {
    serviceCategories: [{ name: "Sessões", icon: "briefcase" }],
    services: [
      { name: "Sessão de consultoria", price: 0, avgTimeMinutes: 60, icon: "briefcase", categoryName: "Sessões" },
    ],
  }),
  PRIVATE_CLASSES: minimal("PRIVATE_CLASSES", {
    serviceCategories: [{ name: "Aulas", icon: "music" }],
    services: [
      { name: "Aula particular", price: 0, avgTimeMinutes: 60, icon: "music", categoryName: "Aulas" },
    ],
  }),
  TECH_SUPPORT: minimal("TECH_SUPPORT", {
    serviceCategories: [{ name: "Atendimentos", icon: "wrench" }],
    services: [
      { name: "Atendimento técnico", price: 0, avgTimeMinutes: 45, icon: "wrench", categoryName: "Atendimentos" },
    ],
  }),
  HOME_SERVICES: minimal("HOME_SERVICES", {
    serviceCategories: [{ name: "Serviços", icon: "home" }],
    services: [
      { name: "Diária de limpeza", price: 0, avgTimeMinutes: 240, icon: "home", categoryName: "Serviços" },
    ],
  }),
  LAW_FIRM: minimal("LAW_FIRM", {
    serviceCategories: [{ name: "Consultoria", icon: "user" }],
    services: [
      { name: "Consulta inicial", price: 0, avgTimeMinutes: 60, icon: "user", categoryName: "Consultoria" },
    ],
  }),
  OTHER: base("OTHER", {
    serviceCategories: [{ name: "Serviços", icon: "sparkles" }],
    productCategories: [{ name: "Varejo", icon: "package", color: "#6B7280" }],
    services: [{ name: "Serviço", price: 0, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Serviços" }],
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
