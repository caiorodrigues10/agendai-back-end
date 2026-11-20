import { randomUUID } from "node:crypto";
import { BusinessSegment, Prisma, PrismaClient } from "@prisma/client";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import type { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { PAGE_THEME_DEFAULTS } from "@/modules/barbershops/utils/pageThemeDefaults";
import {
  COVER_IMAGE_SPEC,
  LOGO_IMAGE_SPEC,
  imageSpecFolder,
  imageSpecPublicId,
} from "@/shared/constants/imageSpecs";
import { getSegmentConfig } from "@/shared/segments";
import { seedBarbershopDefaults } from "@/shared/utils/seedBarbershopDefaults";
import { looksLikeProductionEnvironment } from "@/shared/utils/productionEnvironment";
import {
  addDaysToCivilDate,
  civilDateToUtcDate,
  civilDateWeekday,
  saoPauloCivilDate,
  startOfCivilMonth,
  timeToMinutes,
} from "@/shared/utils/demoShowcaseHelpers";
import {
  demoAgendaPresentation,
  seedDemoShowcaseDensity,
} from "@/shared/utils/demoShowcaseDensity";
// Reexporta os helpers de data para manter a API pública deste módulo (spec).
export { addDaysToCivilDate, civilDateToUtcDate, saoPauloCivilDate } from "@/shared/utils/demoShowcaseHelpers";
import {
  DemoShowcaseAssetReport,
  DemoShowcaseManifest,
  DemoShowcaseManifestBusiness,
  DEMO_SHOWCASE_BUSINESS_COUNT,
  DEMO_SHOWCASE_COVER_OVERLAY,
  DEMO_SHOWCASE_SEGMENTS_WITHOUT_IMAGES,
  demoShowcaseFingerprint,
} from "@/shared/utils/demoShowcaseAssets";

type AnyClient = PrismaClient;

const UUID_NAMESPACES = {
  shop: "d1a0b001",
  owner: "d1a0b002",
  staff: "d1a0b003",
  client: "d1a0b004",
  category: "d1a0b005",
  service: "d1a0b006",
  appointment: "d1a0b007",
  staffService: "d1a0b008",
  feedPost: "d1a0b009",
  showcaseEntry: "d1a0b00a",
  plan: "d1a0b023",
  subscription: "d1a0b024",
} as const;

/**
 * Nomes comerciais exibidos (sem marcação de demo). A marcação interna do
 * fixture vive no `id` do manifest/UUIDs determinísticos — é o que `--list`
 * e `--purge` usam para identificar os tenants.
 */
const DEMO_DISPLAY_NAMES: Record<string, string> = {
  barbearia: "Barbearia Navalha de Ouro",
  cilios: "Estúdio Cílios Aurora",
  manicure: "Ateliê Unhas de Cereja",
  maquiagem: "Paetê Makeup Studio",
  spa: "Spa Sereno",
  petshop: "Patinhas Banho e Tosa",
  fisioterapia: "Movimento Fisioterapia",
  nutricao: "Nutrição Vital",
  psicologia: "Psicologia Horizonte",
  lavajato: "Brilho Lava Jato",
  mecanica: "Auto Center Aurora",
  fotografia: "Lume Fotografia",
  tatuagem: "Tinta & Arte Studio",
  diarista: "Casa Organizada",
  domiciliar: "Mãos Que Ajudam",
  advocacia: "Advocacia Horizonte",
};

const BUSINESS_LOCATIONS: Record<
  string,
  { address: string; city: string; latitude: number; longitude: number }
> = {
  barbearia: { address: "Av. Brigadeiro Faria Lima, 1.284 — Bela Vista", city: "São Paulo", latitude: -23.5613, longitude: -46.6565 },
  cilios: { address: "Rua Francisco Glicério, 742 — Cambuí", city: "Campinas", latitude: -22.8932, longitude: -47.0608 },
  manicure: { address: "Av. Industrial, 1.510 — Parque Industrial", city: "Santo André", latitude: -23.6612, longitude: -46.4137 },
  maquiagem: { address: "Rua Haddock Lobo, 156 — Jardins", city: "Rio de Janeiro", latitude: -22.9572, longitude: -43.1654 },
  spa: { address: "Av. Afonso Pena, 1.220 — Savassi", city: "Belo Horizonte", latitude: -19.9218, longitude: -43.9384 },
  petshop: { address: "Alameda Dr. Carlos de Carvalho, 655 — Batel", city: "Curitiba", latitude: -25.4284, longitude: -49.2733 },
  fisioterapia: { address: "Rua Haddock Lobo, 1.312 — Jardins", city: "São Paulo", latitude: -23.5641, longitude: -46.6672 },
  nutricao: { address: "SCS Quadra 2, Bloco C, Sala 814 — Asa Sul", city: "Brasília", latitude: -15.7942, longitude: -47.8822 },
  psicologia: { address: "Av. Mariland, 1.001 — Bom Sucesso", city: "Porto Alegre", latitude: -30.0352, longitude: -51.1167 },
  lavajato: { address: "Av. Kennedy, 428 — Parque Industrial", city: "São Bernardo do Campo", latitude: -23.6921, longitude: -46.5928 },
  mecanica: { address: "Av. Monteiro Lobato, 1.120 — Jardim Modell", city: "Guarulhos", latitude: -23.4567, longitude: -46.4748 },
  fotografia: { address: "Rua Harmonia, 428 — Vila Madalena", city: "São Paulo", latitude: -23.5521, longitude: -46.6902 },
  tatuagem: { address: "Av. Visconde do Rio Branco, 512 — Centro", city: "Niterói", latitude: -22.8832, longitude: -43.1234 },
  diarista: { address: "Av. Casa Verde, 986 — Casa Verde", city: "Diadema", latitude: -23.6908, longitude: -46.5936 },
  domiciliar: { address: "Av. dos Autonomistas, 1.570 — Centro", city: "Osasco", latitude: -23.5325, longitude: -46.7912 },
  advocacia: { address: "Av. Brigadeiro Faria Lima, 3.477 — Itaim Bibi", city: "São Paulo", latitude: -23.5789, longitude: -46.6858 },
};

const BUSINESS_PEOPLE: Record<string, { owner: string; staff: [string, string] }> = {
  barbearia: { owner: "Rafael Monteiro", staff: ["Lucas Prado", "Caio Nogueira"] },
  cilios: { owner: "Mariana Farias", staff: ["Bianca Torres", "Isabela Duarte"] },
  manicure: { owner: "Camila Rezende", staff: ["Larissa Moraes", "Patrícia Campos"] },
  maquiagem: { owner: "Juliana Rocha", staff: ["Letícia Amaral", "Aline Peixoto"] },
  spa: { owner: "Renata Siqueira", staff: ["Carolina Paes", "Tatiane Moreira"] },
  petshop: { owner: "Gustavo Pimentel", staff: ["Fernanda Lopes", "Thiago Maciel"] },
  fisioterapia: { owner: "Helena Vasques", staff: ["Rodrigo Teles", "Bruna Meireles"] },
  nutricao: { owner: "Eduardo Sampaio", staff: ["Aline Moreira", "Fábio Bertoldo"] },
  psicologia: { owner: "Sofia Cavalcanti", staff: ["Marina Bezerra", "Bruno Salgado"] },
  lavajato: { owner: "Anderson Teixeira", staff: ["Vinícius Ramos", "Tiago Moreira"] },
  mecanica: { owner: "Ricardo Bastos", staff: ["Diego Antunes", "Felipe MOURA"] },
  fotografia: { owner: "Natália Furtado", staff: ["Leandro Vilela", "Priscila Gama"] },
  tatuagem: { owner: "Diego Salles", staff: ["Alex Moura", "Renata Leal"] },
  diarista: { owner: "Vanessa Freire", staff: ["Márcia Fontes", "Simone Barros"] },
  domiciliar: { owner: "Patrícia Nunes", staff: ["Sueli Martins", "Joana Pires"] },
  advocacia: { owner: "Henrique Meade", staff: ["Clara Buchanan", "Miguel Sarmento"] },
};

/** Nomes legíveis por negócio; todos fictícios e estáveis. */
function peopleForBusiness(businessId: string): { owner: string; staff: [string, string] } {
  return (
    BUSINESS_PEOPLE[businessId] ?? {
      owner: "Responsável Demonstração",
      staff: ["Profissional Demonstração", "Atendente Demonstração"],
    }
  );
}

const ZERO_PRICE_FALLBACK: Partial<Record<BusinessSegment, number>> = {
  MAKEUP_STUDIO: 180,
  PHYSIOTHERAPY: 140,
  NUTRITION: 160,
  PSYCHOTHERAPY: 170,
  CAR_WASH: 80,
  AUTO_REPAIR: 190,
  PHOTO_STUDIO: 240,
  TATTOO_PIERCING: 220,
  HOME_SERVICES: 160,
  LAW_FIRM: 250,
};

const ADDITIONAL_DEMO_SERVICES: Partial<
  Record<BusinessSegment, Array<{ name: string; price: number; avgTimeMinutes: number; icon: string }>>
> = {
  LASH_BROW_STUDIO: [
    { name: "Reforço de cílios", price: 90, avgTimeMinutes: 60, icon: "eye" },
    { name: "Henna de sobrancelha", price: 65, avgTimeMinutes: 40, icon: "sparkles" },
    { name: "Laminação de cílios", price: 130, avgTimeMinutes: 70, icon: "eye" },
    { name: "Design com linha", price: 55, avgTimeMinutes: 30, icon: "sparkles" },
  ],
  SPA: [
    { name: "Massagem com pedras quentes", price: 190, avgTimeMinutes: 75, icon: "heart" },
    { name: "Banho aromático", price: 95, avgTimeMinutes: 45, icon: "droplets" },
    { name: "Ritual de relaxamento", price: 220, avgTimeMinutes: 90, icon: "sparkles" },
    { name: "Massagem desportiva", price: 175, avgTimeMinutes: 60, icon: "heart" },
    { name: "Reflexologia podal", price: 110, avgTimeMinutes: 45, icon: "heart" },
  ],
  PSYCHOTHERAPY: [
    { name: "Avaliação inicial", price: 180, avgTimeMinutes: 60, icon: "clipboard" },
    { name: "Terapia de casal", price: 240, avgTimeMinutes: 80, icon: "heart" },
    { name: "Acompanhamento mensal", price: 170, avgTimeMinutes: 50, icon: "calendar" },
    { name: "Sessão online", price: 160, avgTimeMinutes: 50, icon: "video" },
    { name: "Orientação breve", price: 150, avgTimeMinutes: 40, icon: "clipboard" },
  ],
  HOME_SERVICES: [
    { name: "Limpeza profunda", price: 220, avgTimeMinutes: 300, icon: "home" },
    { name: "Organização de ambientes", price: 180, avgTimeMinutes: 180, icon: "package" },
    { name: "Manutenção residencial", price: 150, avgTimeMinutes: 90, icon: "wrench" },
    { name: "Atendimento personalizado", price: 120, avgTimeMinutes: 60, icon: "user" },
    { name: "Consultoria de organização", price: 90, avgTimeMinutes: 45, icon: "package" },
  ],
  LAW_FIRM: [
    { name: "Análise documental", price: 180, avgTimeMinutes: 45, icon: "clipboard" },
    { name: "Reunião de estratégia", price: 280, avgTimeMinutes: 60, icon: "calendar" },
    { name: "Retorno jurídico", price: 200, avgTimeMinutes: 40, icon: "user" },
    { name: "Consulta por vídeo", price: 230, avgTimeMinutes: 50, icon: "video" },
  ],
  PHYSIOTHERAPY: [
    { name: "Reeducação postural", price: 120, avgTimeMinutes: 45, icon: "heart" },
    { name: "Terapia manual", price: 150, avgTimeMinutes: 50, icon: "sparkles" },
    { name: "Avaliação postural", price: 100, avgTimeMinutes: 35, icon: "clipboard" },
    { name: "Sessão domiciliar", price: 170, avgTimeMinutes: 60, icon: "home" },
  ],
  NUTRITION: [
    { name: "Avaliação antropométrica", price: 120, avgTimeMinutes: 40, icon: "clipboard" },
    { name: "Plano alimentar", price: 180, avgTimeMinutes: 50, icon: "calendar" },
    { name: "Consulta online", price: 150, avgTimeMinutes: 45, icon: "video" },
    { name: "Reavaliação", price: 130, avgTimeMinutes: 30, icon: "heart" },
  ],
  MAKEUP_STUDIO: [
    { name: "Maquiagem para evento", price: 160, avgTimeMinutes: 75, icon: "palette" },
    { name: "Prova de maquiagem", price: 90, avgTimeMinutes: 45, icon: "sparkles" },
    { name: "Penteado social", price: 130, avgTimeMinutes: 60, icon: "scissors" },
    { name: "Curso de maquiagem", price: 280, avgTimeMinutes: 180, icon: "user" },
  ],
  CAR_WASH: [
    { name: "Lavagem externa", price: 55, avgTimeMinutes: 35, icon: "droplets" },
    { name: "Higienização interna", price: 120, avgTimeMinutes: 60, icon: "sparkles" },
    { name: "Polimento", price: 160, avgTimeMinutes: 90, icon: "palette" },
    { name: "Impermeabilização", price: 140, avgTimeMinutes: 75, icon: "droplets" },
  ],
  AUTO_REPAIR: [
    { name: "Diagnóstico eletrônico", price: 150, avgTimeMinutes: 60, icon: "wrench" },
    { name: "Troca de pastilhas", price: 130, avgTimeMinutes: 50, icon: "clipboard" },
    { name: "Suspensão", price: 260, avgTimeMinutes: 120, icon: "wrench" },
    { name: "Freios", price: 190, avgTimeMinutes: 90, icon: "sparkles" },
  ],
  PHOTO_STUDIO: [
    { name: "Retrato profissional", price: 180, avgTimeMinutes: 60, icon: "camera" },
    { name: "Ensaio externo", price: 320, avgTimeMinutes: 150, icon: "star" },
    { name: "Tratamento de imagem", price: 120, avgTimeMinutes: 60, icon: "palette" },
    { name: "Evento corporativo", price: 450, avgTimeMinutes: 240, icon: "briefcase" },
  ],
  TATTOO_PIERCING: [
    { name: "Prova de desenho", price: 80, avgTimeMinutes: 45, icon: "penTool" },
    { name: "Pequena tatuagem", price: 180, avgTimeMinutes: 90, icon: "penTool" },
    { name: "Rejuvenescimento", price: 150, avgTimeMinutes: 75, icon: "sparkles" },
    { name: "Troca de piercing", price: 50, avgTimeMinutes: 20, icon: "sparkles" },
  ],
  PETSHOP: [
    { name: "Hidratação de patas", price: 30, avgTimeMinutes: 20, icon: "heart" },
    { name: "Corte de pelos", price: 75, avgTimeMinutes: 55, icon: "scissors" },
    { name: "Perfumaria pet", price: 35, avgTimeMinutes: 20, icon: "sparkles" },
    { name: "Banho antipulgas", price: 95, avgTimeMinutes: 60, icon: "droplets" },
  ],
  BARBERSHOP: [
    { name: "Corte degradê", price: 55, avgTimeMinutes: 40, icon: "scissors" },
    { name: "Barba terapia", price: 45, avgTimeMinutes: 30, icon: "user" },
    { name: "Corte infantil", price: 40, avgTimeMinutes: 30, icon: "scissors" },
    { name: "Combo completo", price: 75, avgTimeMinutes: 55, icon: "sparkles" },
  ],
};

export interface DemoShowcaseSeedOptions {
  client: AnyClient;
  hashProvider: IHashProvider;
  storage: IStorageProvider;
  manifest: DemoShowcaseManifest;
  password?: string;
  /**
   * Filtra quais negócios do manifest são processados (id do manifest OU
   * segmento, sem diferenciar maiúsculas). A validação de "exatamente 16"
   * continua valendo sobre o manifest COMPLETO; o filtro é aplicado depois.
   */
  only?: string[];
  /**
   * Reancora somente agenda/dados voláteis na data atual. Não apaga nem
   * reenvia imagens; preserva clientes, serviços e histórico já gravados.
   */
  refresh?: boolean;
}

export interface DemoShowcaseBusinessCounts {
  serviceCount: number;
  professionalCount: number;
  clientCount: number;
  appointmentCount: number;
  appointmentsByStatus: Record<string, number>;
  appointmentsToday: number;
  appointmentsTomorrow: number;
  todayIsOpen: boolean;
  tomorrowIsOpen: boolean;
  reviewCount: number;
  ledgerCount: number;
  commissionCount: number;
  productCount: number;
  expenseCount: number;
  queueCount: number;
  goalCount: number;
  retailSaleCount: number;
  retailSaleLineCount: number;
  stockMovementCount: number;
  fiadoCount: number;
  fiadoPaymentCount: number;
  crmFinancialEventCount: number;
  reviewInvitationCount: number;
  paymentCount: number;
  dailyCloseoutCount: number;
  trafficVisits30d: number;
  revenueCurrentMonth: number;
  revenuePreviousMonth: number;
  overlapCount: number;
  showcaseCount: number;
}

export interface DemoShowcaseSeedBusinessReport extends DemoShowcaseBusinessCounts {
  id: string;
  name: string;
  segment: BusinessSegment;
  shopId: string;
  logoUrl: string;
  logoPublicId: string;
  coverUrl: string;
  coverPublicId: string;
  confirmar: boolean;
}

export interface DemoShowcaseSeedReport {
  businesses: DemoShowcaseSeedBusinessReport[];
  guessedAssets: Array<{ id: string; name: string }>;
  ignoredExtras: Array<{ id: string; files: string[] }>;
  storageProvider: string;
}

export interface DemoShowcaseUploadResult {
  logoUrl: string;
  logoPublicId: string;
  coverUrl: string;
  coverPublicId: string;
  coverWidth: number;
  coverHeight: number;
}

export type DemoShowcasePrivateScreen =
  | "agenda"
  | "crm"
  | "caixa"
  | "estoque"
  | "vendas"
  | "metas";

export interface DemoShowcasePrivateScreenResult {
  screen: DemoShowcasePrivateScreen;
  status: number | null;
  itemCount: number | null;
  applicable: boolean;
}

export interface DemoShowcaseVerificationReport extends DemoShowcaseBusinessCounts {
  id: string;
  name: string;
  segment: BusinessSegment;
  confirmar: boolean;
  approvalStatus: string;
  logoUrl: string;
  coverUrl: string;
  logoHead: { status: number; contentType: string };
  coverHead: { status: number; contentType: string };
  privateScreens: DemoShowcasePrivateScreenResult[];
  liveDate: string;
  fullDate: string;
}

type Tx = any;

export function demoShowcaseUuid(namespace: string, key: string): string {
  if (!/^[0-9a-f]{8}$/u.test(namespace)) {
    throw new Error(`Namespace de UUID inválido: ${namespace}`);
  }
  const hash = demoShowcaseFingerprint(key);
  return `${namespace}-5000-4000-8000-${hash.slice(0, 12)}`;
}

function shopIdFor(business: DemoShowcaseManifestBusiness): string {
  return demoShowcaseUuid(UUID_NAMESPACES.shop, `demo-showcase:shop:${business.id}`);
}

function ownerIdFor(business: DemoShowcaseManifestBusiness): string {
  return demoShowcaseUuid(UUID_NAMESPACES.owner, `demo-showcase:owner:${business.id}`);
}

function staffIdFor(business: DemoShowcaseManifestBusiness, index: number): string {
  return demoShowcaseUuid(UUID_NAMESPACES.staff, `demo-showcase:staff:${business.id}:${index}`);
}

function categoryIdFor(business: DemoShowcaseManifestBusiness, name: string): string {
  return demoShowcaseUuid(UUID_NAMESPACES.category, `demo-showcase:category:${business.id}:${name}`);
}

function serviceIdFor(business: DemoShowcaseManifestBusiness, name: string): string {
  return demoShowcaseUuid(UUID_NAMESPACES.service, `demo-showcase:service:${business.id}:${name}`);
}

function staffServiceIdFor(
  business: DemoShowcaseManifestBusiness,
  staffIndex: number,
  serviceName: string,
): string {
  return demoShowcaseUuid(
    UUID_NAMESPACES.staffService,
    `demo-showcase:staff-service:${business.id}:${staffIndex}:${serviceName}`,
  );
}

function feedPostIdFor(business: DemoShowcaseManifestBusiness): string {
  return demoShowcaseUuid(UUID_NAMESPACES.feedPost, `demo-showcase:post:${business.id}`);
}

function showcaseEntryIdFor(business: DemoShowcaseManifestBusiness): string {
  return demoShowcaseUuid(
    UUID_NAMESPACES.showcaseEntry,
    `demo-showcase:showcase:${business.id}`,
  );
}

function demoShowcasePlanId(): string {
  return demoShowcaseUuid(UUID_NAMESPACES.plan, "demo-showcase:plan:pro");
}

function subscriptionIdFor(business: DemoShowcaseManifestBusiness): string {
  return demoShowcaseUuid(
    UUID_NAMESPACES.subscription,
    `demo-showcase:subscription:${business.id}`,
  );
}

function displayBusinessName(business: DemoShowcaseManifestBusiness): string {
  const configured = DEMO_DISPLAY_NAMES[business.id];
  if (configured) return configured;
  const segmentLabel = getSegmentConfig(business.segmento).labels.segmentLabel;
  return `${segmentLabel} ${business.id}`;
}

/**
 * Nome aceito ao reencontrar um tenant fixture já existente: o nome atual
 * (sem marcação) OU a variante legada com prefixo `[DEMO] ` de execuções
 * anteriores deste seed — assim o re-seed atualiza sem abortar.
 */
function acceptedDemoNames(name: string): string[] {
  return [name, `[DEMO] ${name}`];
}

/** Nome exibido do negócio (sem marcação de demo) — usado pelo CLI. */
export function demoShowcaseDisplayName(business: DemoShowcaseManifestBusiness): string {
  return displayBusinessName(business);
}

function numericFromHash(hash: string, length: number): string {
  const numeric = BigInt(`0x${hash.slice(0, 16)}`).toString();
  return numeric.padStart(length, "0").slice(-length);
}

const BUSINESS_AREA_CODES: Record<string, string> = {
  barbearia: "11",
  cilios: "19",
  manicure: "11",
  maquiagem: "21",
  spa: "31",
  petshop: "41",
  fisioterapia: "11",
  nutricao: "61",
  psicologia: "51",
  lavajato: "11",
  mecanica: "11",
  fotografia: "11",
  tatuagem: "21",
  diarista: "11",
  domiciliar: "11",
  advocacia: "11",
};

function phoneForBusiness(business: DemoShowcaseManifestBusiness): string {
  const areaCode = BUSINESS_AREA_CODES[business.id] ?? "11";
  return `55${areaCode}9${numericFromHash(demoShowcaseFingerprint(`demo-showcase:phone:${business.id}`), 8)}`;
}

function localEmailIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function ownerEmailFor(business: DemoShowcaseManifestBusiness): string {
  return `demo+owner.${localEmailIdPart(business.id)}@agendai.local`;
}

function staffEmailFor(business: DemoShowcaseManifestBusiness, index: number): string {
  return `demo+staff.${localEmailIdPart(business.id)}.${index}@agendai.local`;
}

function shopOwnerEmail(business: DemoShowcaseManifestBusiness): string {
  return ownerEmailFor(business);
}

function shopStaffEmail(business: DemoShowcaseManifestBusiness, index: number): string {
  return staffEmailFor(business, index);
}

// Mantém nomes curtos e estáveis no e-mail sem depender de caracteres Unicode.
export function demoShowcaseBusinessEmails(business: DemoShowcaseManifestBusiness): string[] {
  return [shopOwnerEmail(business), ...[0, 1].map(index => shopStaffEmail(business, index))];
}

function buildServices(business: DemoShowcaseManifestBusiness) {
  const config = getSegmentConfig(business.segmento);
  const fallbackPrice = ZERO_PRICE_FALLBACK[business.segmento] ?? 80;
  const base = config.catalog.services.map(service => ({
    name: service.name,
    price: service.price > 0 ? service.price : fallbackPrice,
    avgTimeMinutes: service.avgTimeMinutes,
    icon: service.icon,
    categoryName: service.categoryName,
  }));
  const additional = ADDITIONAL_DEMO_SERVICES[business.segmento] ?? [];

  // 6–8 serviços por negócio: complementa o catálogo do segmento com extras
  // fictícios até 8 (mínimo de 6 quando o catálogo curto comporta).
  for (const service of additional) {
    if (base.length >= 8) break;
    if (base.some(existing => existing.name === service.name)) continue;
    base.push({
      ...service,
      categoryName: config.catalog.serviceCategories[0]?.name ?? "Serviços",
    });
  }

  return base.slice(0, 8);
}

/** Comissão determinística por serviço, entre 10% e 25%. */
function serviceCommissionPercent(
  business: DemoShowcaseManifestBusiness,
  serviceName: string,
): number {
  const hash = demoShowcaseFingerprint(`demo-showcase:commission:${business.id}:${serviceName}`);
  return 10 + (parseInt(hash.slice(0, 2), 16) % 16);
}

function assertDemoShowcaseTargetAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.SEED_DEMO !== "true") {
    throw new Error("Seed de showcase exige SEED_DEMO=true");
  }
  if (env.NODE_ENV === "production" || looksLikeProductionEnvironment(env, env.DATABASE_URL ?? "")) {
    throw new Error("Seed de showcase bloqueado em ambiente de produção");
  }

  const databaseUrl = env.DATABASE_URL;
  const directUrl = env.DIRECT_URL;
  if (!databaseUrl || !directUrl) {
    throw new Error("Seed de showcase exige DATABASE_URL e DIRECT_URL configurados");
  }

  let database: URL;
  let direct: URL;
  try {
    database = new URL(databaseUrl);
    direct = new URL(directUrl);
  } catch {
    throw new Error("DATABASE_URL/DIRECT_URL inválidos — seed de showcase bloqueado");
  }

  const sameTarget =
    database.hostname.toLowerCase() === direct.hostname.toLowerCase() &&
    database.port === direct.port &&
    database.pathname === direct.pathname;
  if (!sameTarget) {
    throw new Error(
      "DATABASE_URL e DIRECT_URL apontam para bancos diferentes — seed de showcase bloqueado",
    );
  }

  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "db"]);
  const allowedDatabases = new Set(["agendai", "agendai_db", "postgres"]);
  if (!allowedHosts.has(database.hostname.toLowerCase())) {
    throw new Error(
      `Host de banco não permitido para seed de showcase: ${database.hostname} (esperado banco local)`,
    );
  }
  const databaseName = decodeURIComponent(database.pathname.replace(/^\//, ""));
  if (!allowedDatabases.has(databaseName)) {
    throw new Error(
      `Banco não permitido para seed de showcase: ${databaseName} (esperado agendai ou agendai_db)`,
    );
  }
}

export function assertDemoShowcaseSeedAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertDemoShowcaseTargetAllowed(env);
}

function targetAudienceFor(business: DemoShowcaseManifestBusiness) {
  const config = getSegmentConfig(business.segmento);
  return config.targetAudience.applies ? config.targetAudience.suggested : null;
}

/**
 * Filtra os negócios por `--only`: casa com o id do manifest (`barbearia`)
 * OU com o segmento (`BARBERSHOP`), sem diferenciar maiúsculas. Lista vazia
 * mantém os 16.
 */
export function filterDemoShowcaseBusinesses(
  businesses: DemoShowcaseManifestBusiness[],
  only: string[],
): DemoShowcaseManifestBusiness[] {
  const terms = only.map(term => term.trim().toLowerCase()).filter(Boolean);
  if (terms.length === 0) return businesses;
  return businesses.filter(
    business =>
      terms.includes(business.id.toLowerCase()) || terms.includes(business.segmento.toLowerCase()),
  );
}

async function preflightDemoShowcase(client: AnyClient, businesses: DemoShowcaseManifestBusiness[]) {
  const shopIds = businesses.map(shopIdFor);
  const emails = businesses.flatMap(demoShowcaseBusinessEmails);
  const userIds = businesses.flatMap(business => [
    ownerIdFor(business),
    ...[0, 1].map(index => staffIdFor(business, index)),
  ]);
  const postIds = businesses.map(feedPostIdFor);
  const showcaseIds = businesses.map(showcaseEntryIdFor);

  const existingShops = await client.barbershop.findMany({
    where: { id: { in: shopIds } },
    select: { id: true, name: true, businessSegment: true },
  });
  for (const shop of existingShops) {
    const expected = businesses.find(business => shopIdFor(business) === shop.id);
    if (!expected) continue;
    const expectedNames = acceptedDemoNames(displayBusinessName(expected));
    if (!expectedNames.includes(shop.name) || shop.businessSegment !== expected.segmento) {
      throw new Error(
        `UUID de showcase já pertence a outro negócio (${shop.id}: ${shop.name}/${shop.businessSegment}) — abortando`,
      );
    }
  }

  const existingUsers = await client.user.findMany({
    where: { OR: [{ id: { in: userIds } }, { email: { in: emails } }] },
    select: { id: true, email: true, barbershopId: true },
  });
  for (const user of existingUsers) {
    const owningBusiness = businesses.find(business => {
      const ids = [
        ownerIdFor(business),
        ...[0, 1].map(index => staffIdFor(business, index)),
      ];
      return ids.includes(user.id) || demoShowcaseBusinessEmails(business).includes(user.email);
    });
    if (!owningBusiness) {
      throw new Error(`E-mail/ID de usuário fixture já usado fora do showcase: ${user.email || user.id}`);
    }
    if (user.barbershopId && user.barbershopId !== shopIdFor(owningBusiness)) {
      throw new Error(`Usuário fixture pertence a outro salão: ${user.email || user.id}`);
    }
  }

  const existingPosts = await client.feedPost.findMany({
    where: { id: { in: postIds } },
    select: { id: true, barbershopId: true },
  });
  for (const post of existingPosts) {
    const owner = businesses.find(business => feedPostIdFor(business) === post.id);
    if (!owner || post.barbershopId !== shopIdFor(owner)) {
      throw new Error(`UUID de post fixture já pertence a outro salão: ${post.id}`);
    }
  }

  const existingEntries = await client.showcaseEntry.findMany({
    where: { id: { in: showcaseIds } },
    select: { id: true, barbershopId: true },
  });
  for (const entry of existingEntries) {
    const owner = businesses.find(business => showcaseEntryIdFor(business) === entry.id);
    if (!owner || entry.barbershopId !== shopIdFor(owner)) {
      throw new Error(`UUID de showcase fixture já pertence a outro salão: ${entry.id}`);
    }
  }
}

async function upsertDemoBusiness(
  tx: Tx,
  business: DemoShowcaseManifestBusiness,
  passwordHash: string | undefined,
  refresh: boolean,
) {
  const shopId = shopIdFor(business);
  const config = getSegmentConfig(business.segmento);
  const owner = ownerIdFor(business);
  const location = BUSINESS_LOCATIONS[business.id] ?? {
    address: "Av. das Demonstrações, 100 — Centro",
    city: "São Paulo",
    latitude: -23.55,
    longitude: -46.63,
  };
  const people = peopleForBusiness(business.id);
  const generatedServices = buildServices(business).map(service => ({
    ...service,
    id: serviceIdFor(business, service.name),
    commissionPercent: serviceCommissionPercent(business, service.name),
  }));
  let services = generatedServices;
  if (refresh) {
    const existingServices = await tx.service.findMany({
      where: {
        id: { in: generatedServices.map(service => service.id) },
      },
      select: {
        id: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        commissionPercent: true,
      },
    });
    if (existingServices.length !== generatedServices.length) {
      throw new Error(
        `Refresh abortado: serviços fixture ausentes ou alterados para ${business.id}`,
      );
    }
    services = generatedServices.map(generated => {
      const existing = existingServices.find(
        (service: (typeof existingServices)[number]) => service.id === generated.id,
      );
      if (!existing) {
        throw new Error(`Refresh abortado: serviço fixture ausente para ${business.id}`);
      }
      return {
        ...existing,
        categoryName: generated.categoryName,
      };
    });
  }

  await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${shopId}, TRUE)`;
  await tx.barbershop.upsert({
    where: { id: shopId },
    create: {
      id: shopId,
      name: displayBusinessName(business),
      whatsapp: phoneForBusiness(business),
      address: location.address,
      city: location.city,
      latitude: location.latitude,
      longitude: location.longitude,
      operationMode: config.suggestedOperationMode,
      timezone: "America/Sao_Paulo",
      active: true,
      approvalStatus: "APPROVED",
      businessSegment: business.segmento,
      targetAudience: targetAudienceFor(business),
    },
    update: {
      name: displayBusinessName(business),
      whatsapp: phoneForBusiness(business),
      address: location.address,
      city: location.city,
      latitude: location.latitude,
      longitude: location.longitude,
      operationMode: config.suggestedOperationMode,
      active: true,
      approvalStatus: "APPROVED",
      businessSegment: business.segmento,
      targetAudience: targetAudienceFor(business),
    },
  });

  const now = new Date();
  if (!refresh) {
    await tx.plan.upsert({
      where: { id: demoShowcasePlanId() },
      create: {
        id: demoShowcasePlanId(),
        name: "Showcase Pro",
        description: "Plano fictício do showcase de demonstração",
        price: 149.9,
        billingCycle: "MONTHLY",
        maxEmployees: 10,
        hasDashboard: true,
        tierKey: "pro",
        features: ["AGENDA", "CRM", "FINANCEIRO", "ESTOQUE", "RELATORIOS"],
        active: true,
      },
      update: {
        name: "Showcase Pro",
        description: "Plano fictício do showcase de demonstração",
        price: 149.9,
        billingCycle: "MONTHLY",
        maxEmployees: 10,
        hasDashboard: true,
        tierKey: "pro",
        features: ["AGENDA", "CRM", "FINANCEIRO", "ESTOQUE", "RELATORIOS"],
        active: true,
      },
    });

    const subscriptionId = subscriptionIdFor(business);
    const existingSubscription = await tx.subscription.findUnique({
      where: { barbershopId: shopId },
      select: { id: true },
    });
    if (existingSubscription && existingSubscription.id !== subscriptionId) {
      await tx.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId: demoShowcasePlanId(),
          status: "ACTIVE",
          startDate: new Date(now.getTime() - 90 * 86_400_000),
          endDate: new Date(now.getTime() + 365 * 86_400_000),
          cancelDate: null,
        },
      });
    } else {
      await tx.subscription.upsert({
        where: { id: subscriptionId },
        create: {
          id: subscriptionId,
          barbershopId: shopId,
          planId: demoShowcasePlanId(),
          status: "ACTIVE",
          startDate: new Date(now.getTime() - 90 * 86_400_000),
          endDate: new Date(now.getTime() + 365 * 86_400_000),
        },
        update: {
          planId: demoShowcasePlanId(),
          status: "ACTIVE",
          startDate: new Date(now.getTime() - 90 * 86_400_000),
          endDate: new Date(now.getTime() + 365 * 86_400_000),
          cancelDate: null,
        },
      });
    }
  }

  if (refresh) {
    const existingOwner = await tx.user.findUnique({
      where: { id: owner },
      select: { id: true, barbershopId: true },
    });
    if (!existingOwner || existingOwner.barbershopId !== shopId) {
      throw new Error(`Refresh abortado: owner fixture ausente para ${business.id}`);
    }
  } else {
    await tx.user.upsert({
      where: { id: owner },
      create: {
        id: owner,
        name: people.owner,
        email: shopOwnerEmail(business),
        password: passwordHash,
        role: "OWNER",
        barbershopId: shopId,
        emailVerified: true,
        active: true,
        permissions: [],
      },
      update: {
        name: people.owner,
        email: shopOwnerEmail(business),
        password: passwordHash,
        role: "OWNER",
        barbershopId: shopId,
        emailVerified: true,
        active: true,
        permissions: [],
      },
    });
  }

  const staffIds: string[] = [];
  for (const [staffIndex, name] of people.staff.entries()) {
    const staffId = staffIdFor(business, staffIndex);
    staffIds.push(staffId);
    if (refresh) {
      const existingStaff = await tx.user.findUnique({
        where: { id: staffId },
        select: { id: true, barbershopId: true },
      });
      if (!existingStaff || existingStaff.barbershopId !== shopId) {
        throw new Error(`Refresh abortado: funcionário fixture ausente para ${business.id}`);
      }
    } else {
      await tx.user.upsert({
        where: { id: staffId },
        create: {
          id: staffId,
          name,
          email: shopStaffEmail(business, staffIndex),
          password: passwordHash,
          role: "EMPLOYEE",
          barbershopId: shopId,
          emailVerified: true,
          active: true,
          permissions: [],
        },
        update: {
          name,
          email: shopStaffEmail(business, staffIndex),
          password: passwordHash,
          role: "EMPLOYEE",
          barbershopId: shopId,
          emailVerified: true,
          active: true,
          permissions: [],
        },
      });
    }

    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
      const presetDay = config.schedulePreset[dayOfWeek];
      await tx.staffSchedule.upsert({
        where: {
          barbershopId_staffId_dayOfWeek: {
            barbershopId: shopId,
            staffId,
            dayOfWeek,
          },
        },
        create: {
          barbershopId: shopId,
          staffId,
          dayOfWeek,
          startTime: presetDay.openTime,
          endTime: presetDay.closeTime,
          isActive: presetDay.isOpen,
        },
        update: {
          startTime: presetDay.openTime,
          endTime: presetDay.closeTime,
          isActive: presetDay.isOpen,
        },
      });
    }
  }

  const serviceIds = services.map(service => service.id);
  if (!refresh) {
    for (const service of services) {
      const categoryId = categoryIdFor(business, service.categoryName);
      const categoryIcon =
        config.catalog.serviceCategories.find(category => category.name === service.categoryName)
          ?.icon ?? config.catalog.serviceCategories[0]?.icon ?? "sparkles";
      await tx.serviceCategory.upsert({
        where: { id: categoryId },
        create: {
          id: categoryId,
          barbershopId: shopId,
          name: service.categoryName,
          icon: categoryIcon,
        },
        update: {
          name: service.categoryName,
          icon: categoryIcon,
        },
      });

      await tx.service.upsert({
        where: { id: service.id },
        create: {
          id: service.id,
          barbershopId: shopId,
          categoryId,
          name: service.name,
          price: service.price,
          avgTimeMinutes: service.avgTimeMinutes,
          icon: service.icon,
          active: true,
          publicBookable: true,
          commissionPercent: serviceCommissionPercent(business, service.name),
        },
        update: {
          categoryId,
          name: service.name,
          price: service.price,
          avgTimeMinutes: service.avgTimeMinutes,
          icon: service.icon,
          active: true,
          publicBookable: true,
          commissionPercent: serviceCommissionPercent(business, service.name),
        },
      });
    }

    // Execuções antigas podiam gravar serviços homônimos pelo template do
    // segmento (UUID aleatório) — remove as duplicatas; os UUIDs fixture
    // (d1a0b006-) prevalecem e o template não recria homônimos.
    const fixtureServicePrefix = `${UUID_NAMESPACES.service}-`;
    const homonymRows = await tx.service.findMany({
      where: { barbershopId: shopId, name: { in: services.map(service => service.name) } },
      select: { id: true },
    });
    const strayServiceIds = homonymRows
      .filter((row: { id: string }) => !row.id.startsWith(fixtureServicePrefix))
      .map((row: { id: string }) => row.id);
    if (strayServiceIds.length > 0) {
      await tx.service.deleteMany({ where: { id: { in: strayServiceIds } } });
    }

    await seedBarbershopDefaults(tx as any, shopId, business.segmento);

    for (const [staffIndex, staffId] of staffIds.entries()) {
      for (const [serviceIndex, serviceId] of serviceIds.entries()) {
        const serviceName = services[serviceIndex].name;
        const staffServiceId = staffServiceIdFor(business, staffIndex, serviceName);
        await tx.staffService.upsert({
          where: {
            barbershopId_staffId_serviceId: {
              barbershopId: shopId,
              staffId,
              serviceId,
            },
          },
          create: {
            id: staffServiceId,
            barbershopId: shopId,
            staffId,
            serviceId,
            isActive: true,
          },
          update: { isActive: true },
        });
      }
    }
  }

  // Clientes + agenda densa (60 dias de histórico + 14 de futuro), financeiro,
  // reviews, fila e tráfego: ver `seedDemoShowcaseDensity`.

  if (!refresh) {
    await tx.barbershopPageTheme.upsert({
    where: { barbershopId: shopId },
    create: {
      barbershopId: shopId,
      presetKey: null,
      accentColor: PAGE_THEME_DEFAULTS.accentColor,
      backgroundColor: PAGE_THEME_DEFAULTS.backgroundColor,
      surfaceColor: PAGE_THEME_DEFAULTS.surfaceColor,
      textColor: PAGE_THEME_DEFAULTS.textColor,
      textMutedColor: PAGE_THEME_DEFAULTS.textMutedColor,
      radiusStyle: PAGE_THEME_DEFAULTS.radiusStyle,
      buttonStyle: PAGE_THEME_DEFAULTS.buttonStyle,
      mode: "AUTO",
      lightColors: Prisma.DbNull,
      darkColors: themeVariant(PAGE_THEME_DEFAULTS.accentColor),
      coverOverlay: DEMO_SHOWCASE_COVER_OVERLAY,
      coverFocalX: 50,
      coverFocalY: 50,
    },
    update: {
      presetKey: null,
      accentColor: PAGE_THEME_DEFAULTS.accentColor,
      backgroundColor: PAGE_THEME_DEFAULTS.backgroundColor,
      surfaceColor: PAGE_THEME_DEFAULTS.surfaceColor,
      textColor: PAGE_THEME_DEFAULTS.textColor,
      textMutedColor: PAGE_THEME_DEFAULTS.textMutedColor,
      radiusStyle: PAGE_THEME_DEFAULTS.radiusStyle,
      buttonStyle: PAGE_THEME_DEFAULTS.buttonStyle,
      mode: "AUTO",
      lightColors: Prisma.DbNull,
      darkColors: themeVariant(PAGE_THEME_DEFAULTS.accentColor),
      coverOverlay: DEMO_SHOWCASE_COVER_OVERLAY,
      coverFocalX: 50,
      coverFocalY: 50,
    },
  });
  }

  return {
    ownerName: people.owner,
    staff: staffIds.map((id, index) => ({ id, name: people.staff[index] })),
    services: services.map(service => ({
      id: service.id,
      name: service.name,
      price: service.price,
      avgTimeMinutes: service.avgTimeMinutes,
      commissionPercent: service.commissionPercent,
    })),
  };
}

function themeVariant(accentColor: string) {
  return {
    accentColor,
    backgroundColor: PAGE_THEME_DEFAULTS.backgroundColor,
    surfaceColor: PAGE_THEME_DEFAULTS.surfaceColor,
    textColor: PAGE_THEME_DEFAULTS.textColor,
    textMutedColor: PAGE_THEME_DEFAULTS.textMutedColor,
  };
}

function businessesIndexOf(business: DemoShowcaseManifestBusiness): number {
  return Math.max(0, ["barbearia", "cilios", "manicure", "maquiagem", "spa", "petshop", "fisioterapia", "nutricao", "psicologia", "lavajato", "mecanica", "fotografia", "tatuagem", "diarista", "domiciliar", "advocacia"].indexOf(business.id));
}

function versionedAssetUrl(url: string, version: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

async function uploadDemoAssets(
  storage: IStorageProvider,
  business: DemoShowcaseManifestBusiness,
  asset: DemoShowcaseAssetReport,
): Promise<DemoShowcaseUploadResult> {
  const shopId = shopIdFor(business);
  const logoFolder = imageSpecFolder(shopId, LOGO_IMAGE_SPEC);
  const logoPublicId = imageSpecPublicId(shopId, LOGO_IMAGE_SPEC);
  const coverFolder = imageSpecFolder(shopId, COVER_IMAGE_SPEC);
  const coverPublicId = imageSpecPublicId(shopId, COVER_IMAGE_SPEC);
  const assetVersion = `${Date.now()}-${randomUUID()}`;

  const uploadedLogo = await storage.uploadBuffer(logoFolder, LOGO_IMAGE_SPEC.cloudinaryPublicId, asset.logo.buffer, "image/webp", {
    publicId: logoPublicId,
    overwrite: true,
    invalidate: true,
  });
  const uploadedCover = await storage.uploadBuffer(coverFolder, COVER_IMAGE_SPEC.cloudinaryPublicId, asset.banner.buffer, "image/webp", {
    publicId: coverPublicId,
    overwrite: true,
    invalidate: true,
  });

  return {
    // O `publicId` físico continua fixo por tenant. A query de versão na URL
    // invalida cache e garante uma URL nova quando logo/banner são trocados.
    logoUrl: versionedAssetUrl(uploadedLogo.publicUrl, assetVersion),
    logoPublicId: uploadedLogo.objectName,
    coverUrl: versionedAssetUrl(uploadedCover.publicUrl, assetVersion),
    coverPublicId: uploadedCover.objectName,
    coverWidth: asset.banner.width,
    coverHeight: asset.banner.height,
  };
}

async function applyUploadedAssets(
  tx: Tx,
  business: DemoShowcaseManifestBusiness,
  upload: DemoShowcaseUploadResult,
  accentColor: string,
  owner: string,
) {
  const shopId = shopIdFor(business);
  await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${shopId}, TRUE)`;
  await tx.barbershop.update({
    where: { id: shopId },
    data: {
      logoUrl: upload.logoUrl,
      logoPublicId: upload.logoPublicId,
    },
  });
  await tx.barbershopPageTheme.upsert({
    where: { barbershopId: shopId },
    create: {
      barbershopId: shopId,
      accentColor,
      darkColors: themeVariant(accentColor),
      coverOverlay: DEMO_SHOWCASE_COVER_OVERLAY,
      coverUrl: upload.coverUrl,
      coverPublicId: upload.coverPublicId,
      coverWidth: upload.coverWidth,
      coverHeight: upload.coverHeight,
      coverFocalX: 50,
      coverFocalY: 50,
    },
    update: {
      accentColor,
      darkColors: themeVariant(accentColor),
      coverOverlay: DEMO_SHOWCASE_COVER_OVERLAY,
      coverUrl: upload.coverUrl,
      coverPublicId: upload.coverPublicId,
      coverWidth: upload.coverWidth,
      coverHeight: upload.coverHeight,
      coverFocalX: 50,
      coverFocalY: 50,
    },
  });

  const postId = feedPostIdFor(business);
  const entryId = showcaseEntryIdFor(business);
  const publishedAt = new Date();
  await tx.feedPost.upsert({
    where: { id: postId },
    create: {
      id: postId,
      barbershopId: shopId,
      authorId: owner,
      type: "ANNOUNCEMENT",
      title: displayBusinessName(business),
      content: `Conheça ${displayBusinessName(business)} e escolha um horário na agenda.`,
      imageUrl: upload.coverUrl,
      imageAssetName: null,
      publishedAt,
      status: "PUBLISHED",
      postMode: "APPOINTMENTS",
      ctaText: "Agendar agora",
      format: "PORTRAIT",
      paletteKey: "brand",
    },
    update: {
      barbershopId: shopId,
      authorId: owner,
      type: "ANNOUNCEMENT",
      title: displayBusinessName(business),
      content: `Conheça ${displayBusinessName(business)} e escolha um horário na agenda.`,
      imageUrl: upload.coverUrl,
      imageAssetName: null,
      publishedAt,
      status: "PUBLISHED",
      postMode: "APPOINTMENTS",
      ctaText: "Agendar agora",
      format: "PORTRAIT",
      paletteKey: "brand",
    },
  });

  await tx.showcaseEntry.upsert({
    where: { id: entryId },
    create: {
      id: entryId,
      barbershopId: shopId,
      postId,
      title: displayBusinessName(business),
      description: `Agende seus atendimentos com ${displayBusinessName(business)}.`,
      altText: `Imagem de apresentação de ${displayBusinessName(business)}`,
      mode: "DIRECT_SERVICE",
      serviceId: null,
      staffId: null,
      position: 0,
      status: "PUBLISHED",
      imageAuthorization: "TEAM_CONFIRMED",
      authorizedById: owner,
      authorizedAt: publishedAt,
      authorizationNote: "Showcase de demonstração",
      publishedAt,
    },
    update: {
      barbershopId: shopId,
      postId,
      title: displayBusinessName(business),
      description: `Agende seus atendimentos com ${displayBusinessName(business)}.`,
      altText: `Imagem de apresentação de ${displayBusinessName(business)}`,
      mode: "DIRECT_SERVICE",
      serviceId: null,
      staffId: null,
      position: 0,
      status: "PUBLISHED",
      imageAuthorization: "TEAM_CONFIRMED",
      authorizedById: owner,
      authorizedAt: publishedAt,
      authorizationNote: "Showcase de demonstração",
      publishedAt,
    },
  });
}

export interface DemoShowcaseImageSeedOptions {
  client: AnyClient;
  storage: IStorageProvider;
  business: DemoShowcaseManifestBusiness;
  asset: DemoShowcaseAssetReport;
}

/**
 * Reenvia e reaplica somente as imagens de um tenant já existente. Não toca
 * agenda, clientes, serviços ou qualquer outro dado do showcase.
 */
export async function seedDemoShowcaseImages(
  options: DemoShowcaseImageSeedOptions,
): Promise<DemoShowcaseUploadResult> {
  assertDemoShowcaseSeedAllowed();
  const { client, storage, business, asset } = options;
  const shopId = shopIdFor(business);
  const shop = await client.barbershop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, businessSegment: true },
  });
  if (!shop) {
    throw new Error(
      `Negócio fixture não encontrado para as imagens: ${business.id}. Rode o seed antes de trocar imagens.`,
    );
  }
  if (
    !acceptedDemoNames(displayBusinessName(business)).includes(shop.name) ||
    shop.businessSegment !== business.segmento
  ) {
    throw new Error(`Tenant de imagens divergente para ${business.id}: ${shop.name}`);
  }

  const upload = await uploadDemoAssets(storage, business, asset);
  await client.$transaction(async (tx: Tx) => {
    await applyUploadedAssets(
      tx,
      business,
      upload,
      asset.banner.accentColor,
      ownerIdFor(business),
    );
  });
  return upload;
}

async function countBusinessData(client: AnyClient, business: DemoShowcaseManifestBusiness) {
  const shopId = shopIdFor(business);
  const config = getSegmentConfig(business.segmento);
  const today = saoPauloCivilDate(new Date());
  const tomorrow = addDaysToCivilDate(today, 1);

  const statusRows = await client.appointment.groupBy({
    by: ["status"],
    where: { barbershopId: shopId },
    _count: { _all: true },
  });
  const appointmentsByStatus: Record<string, number> = {};
  let appointmentCount = 0;
  for (const row of statusRows) {
    appointmentsByStatus[row.status] = row._count._all;
    appointmentCount += row._count._all;
  }

  // Receita (serviço + pacote) por mês civil de São Paulo — comparação
  // mês corrente × mês anterior usada na verificação.
  const monthStart = startOfCivilMonth(today);
  const previousMonthStart = startOfCivilMonth(addDaysToCivilDate(monthStart, -1));
  const revenueRows = await client.$queryRaw<Array<{ month: string; total: number }>>`
    SELECT to_char(("occurredAt" AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM') AS month,
           COALESCE(SUM("amount"), 0)::float8 AS total
    FROM cash_movements
    WHERE "barbershopId" = ${shopId}
      AND type IN ('SERVICE_SALE', 'PACKAGE_SALE')
      AND ("occurredAt" AT TIME ZONE 'America/Sao_Paulo')::date >= ${previousMonthStart}
    GROUP BY 1`;
  const currentMonthKey = monthStart.slice(0, 7);
  const previousMonthKey = previousMonthStart.slice(0, 7);

  // Sobreposições de agenda por profissional (invariante de planejamento).
  const appointmentRows = await client.appointment.findMany({
    where: { barbershopId: shopId, staffId: { not: null } },
    select: {
      staffId: true,
      date: true,
      time: true,
      service: { select: { avgTimeMinutes: true } },
    },
  });
  const blocksByStaffDay = new Map<string, Array<{ start: number; end: number }>>();
  for (const row of appointmentRows) {
    const key = `${row.staffId}|${row.date.toISOString().slice(0, 10)}`;
    const start = timeToMinutes(row.time);
    const block = { start, end: start + (row.service?.avgTimeMinutes ?? 0) };
    const list = blocksByStaffDay.get(key);
    if (list) list.push(block);
    else blocksByStaffDay.set(key, [block]);
  }
  let overlapCount = 0;
  for (const blocks of blocksByStaffDay.values()) {
    blocks.sort((a, b) => a.start - b.start);
    for (let index = 1; index < blocks.length; index += 1) {
      if (blocks[index].start < blocks[index - 1].end) overlapCount += 1;
    }
  }

  return {
    serviceCount: await client.service.count({
      where: { barbershopId: shopId, active: true, publicBookable: true },
    }),
    professionalCount: await client.user.count({
      where: { barbershopId: shopId, role: { in: ["OWNER", "EMPLOYEE"] }, active: true },
    }),
    clientCount: await client.salonClient.count({ where: { barbershopId: shopId } }),
    appointmentCount,
    appointmentsByStatus,
    appointmentsToday: await client.appointment.count({
      where: { barbershopId: shopId, date: civilDateToUtcDate(today) },
    }),
    appointmentsTomorrow: await client.appointment.count({
      where: { barbershopId: shopId, date: civilDateToUtcDate(tomorrow) },
    }),
    todayIsOpen: config.schedulePreset[civilDateWeekday(today)]?.isOpen ?? true,
    tomorrowIsOpen: config.schedulePreset[civilDateWeekday(tomorrow)]?.isOpen ?? true,
    reviewCount: await client.clientReview.count({ where: { barbershopId: shopId } }),
    ledgerCount: await client.cashMovement.count({ where: { barbershopId: shopId } }),
    commissionCount: await client.commissionEntry.count({ where: { barbershopId: shopId } }),
    productCount: await client.product.count({ where: { barbershopId: shopId } }),
    expenseCount: await client.expense.count({ where: { barbershopId: shopId } }),
    queueCount: await client.queueItem.count({ where: { barbershopId: shopId } }),
    goalCount: await client.professionalGoal.count({ where: { barbershopId: shopId } }),
    retailSaleCount: await client.retailSale.count({ where: { barbershopId: shopId } }),
    retailSaleLineCount: await client.retailSaleLine.count({ where: { barbershopId: shopId } }),
    stockMovementCount: await client.stockMovement.count({ where: { barbershopId: shopId } }),
    fiadoCount: await client.fiado.count({ where: { barbershopId: shopId } }),
    fiadoPaymentCount: await client.fiadoPayment.count({
      where: { fiado: { barbershopId: shopId } },
    }),
    crmFinancialEventCount: await client.crmFinancialEvent.count({ where: { barbershopId: shopId } }),
    reviewInvitationCount: await client.reviewInvitation.count({ where: { barbershopId: shopId } }),
    paymentCount: await client.payment.count({ where: { barbershopId: shopId } }),
    dailyCloseoutCount: await client.dailyCloseout.count({ where: { barbershopId: shopId } }),
    trafficVisits30d:
      (
        await client.salonTrafficDaily.aggregate({
          where: { target: `b:${shopId}`, day: { gte: civilDateToUtcDate(addDaysToCivilDate(today, -29)) } },
          _sum: { visits: true },
        })
      )._sum.visits ?? 0,
    revenueCurrentMonth:
      revenueRows.find(row => row.month === currentMonthKey)?.total ?? 0,
    revenuePreviousMonth:
      revenueRows.find(row => row.month === previousMonthKey)?.total ?? 0,
    overlapCount,
    showcaseCount: await client.showcaseEntry.count({
      where: { barbershopId: shopId, status: "PUBLISHED" },
    }),
  };
}

export async function seedDemoShowcase(
  options: DemoShowcaseSeedOptions & { assets: DemoShowcaseAssetReport[] },
): Promise<DemoShowcaseSeedReport> {
  const { client, hashProvider, storage, manifest, assets } = options;
  assertDemoShowcaseSeedAllowed();

  const manifestBusinesses = manifest.negocios;
  if (manifestBusinesses.length !== DEMO_SHOWCASE_BUSINESS_COUNT) {
    throw new Error(
      `Esperado ${DEMO_SHOWCASE_BUSINESS_COUNT} negócios no manifest, recebido ${manifestBusinesses.length}`,
    );
  }
  const excluded = manifestBusinesses.filter(business =>
    DEMO_SHOWCASE_SEGMENTS_WITHOUT_IMAGES.includes(business.segmento),
  );
  if (excluded.length > 0) {
    throw new Error(
      `Manifest contém segmentos sem material de imagem (excluídos do showcase): ${excluded
        .map(item => item.id)
        .join(", ")}`,
    );
  }
  for (const business of manifestBusinesses) {
    if (options.refresh) break;
    const asset = assets.find(item => item.businessId === business.id);
    if (!asset) throw new Error(`Asset processado ausente para ${business.id}`);
  }

  const businesses = filterDemoShowcaseBusinesses(manifestBusinesses, options.only ?? []);
  if (businesses.length === 0) {
    throw new Error(
      `Filtro --only sem correspondência no manifest (recebido: ${(options.only ?? []).join(", ")})`,
    );
  }

  const refresh = options.refresh ?? false;
  await preflightDemoShowcase(client, businesses);
  const passwordHash = refresh
    ? undefined
    : await hashProvider.hash(
        options.password ??
          (() => {
            throw new Error("Senha obrigatória para o seed normal do showcase");
          })(),
      );
  for (const business of businesses) {
    // Uma transação por negócio: a densidade grava ~10k linhas no total e a
    // transação interativa precisa caber no timeout do Prisma.
    await client.$transaction(
      async (tx: Tx) => {
        const refs = await upsertDemoBusiness(tx, business, passwordHash, refresh);
        await seedDemoShowcaseDensity(tx, {
          business,
          shopId: shopIdFor(business),
          ownerId: ownerIdFor(business),
          ownerName: refs.ownerName,
          staff: refs.staff,
          services: refs.services,
          refresh,
        });
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  // Upload ANTES de gravar as URLs: se falhar, o banco fica sem logoUrl e a
  // próxima execução (idempotente) refez o upload sem deixar URL quebrada.
  // O refresh reancora os dados sem tocar nas imagens já publicadas.
  const uploads = new Map<string, DemoShowcaseUploadResult>();
  if (!refresh) {
    for (const business of businesses) {
      const asset = assets.find(item => item.businessId === business.id)!;
      uploads.set(business.id, await uploadDemoAssets(storage, business, asset));
    }

    await client.$transaction(async (tx: Tx) => {
      for (const business of businesses) {
        const asset = assets.find(item => item.businessId === business.id)!;
        await applyUploadedAssets(
          tx,
          business,
          uploads.get(business.id)!,
          asset.banner.accentColor,
          ownerIdFor(business),
        );
      }
    });
  }

  const report: DemoShowcaseSeedReport = {
    businesses: [],
    guessedAssets: businesses
      .filter(item => item.confirmar)
      .map(item => ({ id: item.id, name: displayBusinessName(item) })),
    ignoredExtras: businesses
      .filter(item => item.extras.length > 0)
      .map(item => ({ id: item.id, files: item.extras })),
    storageProvider: storageProviderLabel(storage),
  };

  for (const business of businesses) {
    const counts = await countBusinessData(client, business);
    const upload = uploads.get(business.id);
    const persistedAssets = upload
      ? null
      : await client.barbershop.findUnique({
          where: { id: shopIdFor(business) },
          select: {
            logoUrl: true,
            logoPublicId: true,
            pageTheme: { select: { coverUrl: true, coverPublicId: true } },
          },
        });
    const logoUrl = upload?.logoUrl ?? persistedAssets?.logoUrl ?? "";
    const logoPublicId = upload?.logoPublicId ?? persistedAssets?.logoPublicId ?? "";
    const coverUrl = upload?.coverUrl ?? persistedAssets?.pageTheme?.coverUrl ?? "";
    const coverPublicId = upload?.coverPublicId ?? persistedAssets?.pageTheme?.coverPublicId ?? "";
    report.businesses.push({
      id: business.id,
      name: displayBusinessName(business),
      segment: business.segmento,
      shopId: shopIdFor(business),
      logoUrl,
      logoPublicId,
      coverUrl,
      coverPublicId,
      confirmar: business.confirmar,
      ...counts,
    });
  }

  return report;
}

function storageProviderLabel(storage: IStorageProvider): string {
  const name = storage.constructor?.name ?? "IStorageProvider";
  if (name.includes("Cloudinary")) return "Cloudinary (ImageStorageProvider)";
  if (name.includes("Local")) return "Armazenamento local de dev";
  return name;
}

/**
 * Remove dependentes com FK RESTRICT antes de excluir o tenant. As demais
 * relações são CASCADE/SET NULL pelo próprio schema. A lista é explícita e
 * cada DELETE é limitado ao UUID do tenant demo selecionado.
 */
async function deleteDemoShowcaseTenantRows(tx: Tx, shopId: string): Promise<void> {
  const tables = [
    "appointment_product_reservations",
    "inventory_receipts",
    "stock_movements",
    "retail_sale_lines",
    "retail_sales",
    "fiado_adjustments",
    "fiados",
    "client_packages",
    "service_packages",
    "commission_entries",
    "queue",
    "appointments",
    "products",
    "services",
    "users",
  ] as const;

  for (const table of tables) {
    await tx.$executeRaw`
      DELETE FROM ${Prisma.raw(`"${table}"`)}
      WHERE "barbershopId" = ${shopId}::uuid
    `;
  }
}

export async function purgeDemoShowcase(
  client: AnyClient,
  storage: IStorageProvider,
  businesses: DemoShowcaseManifestBusiness[],
  confirm: boolean,
): Promise<{ purged: number; skipped: number; leftovers: Record<string, number> }> {
  assertDemoShowcaseSeedAllowed();

  const targetIds = businesses.map(shopIdFor);
  const existingShops = await client.barbershop.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, name: true, businessSegment: true, logoPublicId: true, pageTheme: { select: { coverPublicId: true } } },
  });

  const mismatches = existingShops.filter(shop => {
    const business = businesses.find(item => shopIdFor(item) === shop.id);
    if (!business) return true;
    return (
      !acceptedDemoNames(displayBusinessName(business)).includes(shop.name) ||
      shop.businessSegment !== business.segmento
    );
  });
  if (mismatches.length > 0) {
    throw new Error(
      `Purge abortado; UUID fixture divergente: ${mismatches.map(item => `${item.id} (${item.name})`).join(", ")}`,
    );
  }

  if (!confirm) {
    return { purged: 0, skipped: existingShops.length, leftovers: {} };
  }

  for (const shop of existingShops) {
    const business = businesses.find(item => shopIdFor(item) === shop.id)!;
    const expectedLogoId = imageSpecPublicId(shop.id, LOGO_IMAGE_SPEC);
    const expectedCoverId = imageSpecPublicId(shop.id, COVER_IMAGE_SPEC);
    if (shop.logoPublicId && shop.logoPublicId !== expectedLogoId) {
      throw new Error(`LogoPublicId não pertence ao fixture ${business.id}: ${shop.logoPublicId}`);
    }
    if (shop.pageTheme?.coverPublicId && shop.pageTheme.coverPublicId !== expectedCoverId) {
      throw new Error(`CoverPublicId não pertence ao fixture ${business.id}: ${shop.pageTheme.coverPublicId}`);
    }
  }

  for (const shop of existingShops) {
    await client.$transaction(async (tx: Tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${shop.id}, TRUE)`;
      // Tráfego da página pública não tem FK (chave textual `b:<shopId>`) —
      // apaga explicitamente para não deixar órfãos.
      const trafficTarget = `b:${shop.id}`;
      await tx.salonTrafficOriginDaily.deleteMany({ where: { target: trafficTarget } });
      await tx.salonTrafficSectionDaily.deleteMany({ where: { target: trafficTarget } });
      await tx.salonTrafficHourly.deleteMany({ where: { target: trafficTarget } });
      await tx.salonTrafficDaily.deleteMany({ where: { target: trafficTarget } });
      await deleteDemoShowcaseTenantRows(tx, shop.id);
      await tx.barbershop.delete({ where: { id: shop.id } });
    });
  }

  for (const shop of existingShops) {
    await storage.deleteObject(imageSpecPublicId(shop.id, LOGO_IMAGE_SPEC)).catch(() => undefined);
    await storage.deleteObject(imageSpecPublicId(shop.id, COVER_IMAGE_SPEC)).catch(() => undefined);
  }

  // Auditoria: denuncia qualquer linha órfã por tenant (nada deve sobrar).
  const leftovers = await scanDemoShowcaseLeftovers(client, targetIds);

  return { purged: existingShops.length, skipped: 0, leftovers };
}

/** Conta resíduos por tabela para os UUIDs fixture (vazio = purge completo). */
async function scanDemoShowcaseLeftovers(
  client: AnyClient,
  targetIds: string[],
): Promise<Record<string, number>> {
  const leftovers: Record<string, number> = {};
  if (targetIds.length === 0) return leftovers;

  const scopedTables = await client.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name::text AS table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'barbershopId'
    ORDER BY table_name
  `;
  for (const { table_name: table } of scopedTables) {
    if (!/^[a-z0-9_]+$/u.test(table)) {
      throw new Error(`Nome de tabela inesperado na auditoria de purge: ${table}`);
    }
    const rows = await client.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE "barbershopId" = ANY(${targetIds})`;
    const count = rows[0]?.count ?? 0;
    if (count > 0) leftovers[table] = count;
  }

  // voucher_usages não tem barbershopId — escopo via vouchers do tenant.
  const usageRows = await client.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count
    FROM voucher_usages vu
    INNER JOIN vouchers v ON v.id = vu."voucherId"
    WHERE v."barbershopId" = ANY(${targetIds})`;
  const usageCount = usageRows[0]?.count ?? 0;
  if (usageCount > 0) leftovers.voucher_usages = usageCount;

  const trafficTargets = targetIds.map(id => `b:${id}`);
  const trafficTables = [
    "salon_traffic_daily",
    "salon_traffic_hourly",
    "salon_traffic_section_daily",
    "salon_traffic_origin_daily",
  ] as const;
  for (const table of trafficTables) {
    const rows = await client.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM ${Prisma.raw(table)}
      WHERE target = ANY(${trafficTargets})`;
    const count = rows[0]?.count ?? 0;
    if (count > 0) leftovers[table] = count;
  }

  return leftovers;
}

async function headImage(url: string): Promise<{ status: number; contentType: string }> {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
  };
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`GET ${url} falhou: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { data?: unknown } | unknown;
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data?: unknown }).data ?? payload;
  }
  return payload;
}

interface DemoHttpJsonResult {
  status: number;
  body: any;
}

async function requestDemoJson(
  url: string,
  init?: RequestInit,
): Promise<DemoHttpJsonResult> {
  const response = await fetch(url, { redirect: "follow", ...init });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function loginDemoShowcaseOwner(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const loginUrl = `${baseUrl}/auth/login`;
  const request = () =>
    requestDemoJson(loginUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe: false }),
    });

  let response = await request();
  if (response.status === 429) {
    // O limite padrão de login é 10/min por IP. Em dev, a rota oficial de
    // reset limpa somente o contador do e-mail demonstrativo.
    await requestDemoJson(`${baseUrl}/dev/reset-rate-limit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => undefined);
    response = await request();
  }
  if (response.status !== 200) {
    throw new Error(`Login do owner falhou para ${email}: HTTP ${response.status}`);
  }
  const accessToken = response.body?.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new Error(`Login do owner não retornou accessToken para ${email}`);
  }
  return accessToken;
}

function countPrivateResponseItems(body: unknown): number {
  if (Array.isArray(body)) return body.length;
  if (!body || typeof body !== "object") return 0;

  const envelope = body as { data?: unknown; meta?: { total?: unknown } };
  if (typeof envelope.meta?.total === "number" && Number.isFinite(envelope.meta.total)) {
    return envelope.meta.total;
  }
  const data = "data" in envelope ? envelope.data : body;
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    for (const key of ["items", "appointments", "clients", "products", "sales", "goals"]) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value.length;
    }
    return 1;
  }
  return 0;
}

async function requestDemoPrivateScreen(
  baseUrl: string,
  screen: DemoShowcasePrivateScreen,
  path: string,
  accessToken: string,
): Promise<DemoShowcasePrivateScreenResult> {
  const response = await requestDemoJson(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return {
    screen,
    status: response.status,
    itemCount: countPrivateResponseItems(response.body),
    applicable: true,
  };
}

export async function verifyDemoShowcase(
  client: AnyClient,
  manifest: DemoShowcaseManifest,
  apiBaseUrl: string,
  only: string[] = [],
  password?: string,
): Promise<DemoShowcaseVerificationReport[]> {
  const baseUrl = apiBaseUrl.replace(/\/+$/u, "");
  const reports: DemoShowcaseVerificationReport[] = [];
  const businesses = filterDemoShowcaseBusinesses(manifest.negocios, only);
  if (businesses.length === 0) {
    throw new Error(`Filtro --only sem correspondência no manifest (recebido: ${only.join(", ")})`);
  }
  if (!password) {
    throw new Error(
      "A verificação privada exige SEED_DEMO_SHOWCASE_PASSWORD para autenticar o owner de cada negócio.",
    );
  }

  const now = new Date();
  const today = saoPauloCivilDate(now);
  const momFailures: string[] = [];
  const privateFailures: string[] = [];

  for (const business of businesses) {
    const shopId = shopIdFor(business);
    const shop = await client.barbershop.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        businessSegment: true,
        approvalStatus: true,
        logoUrl: true,
        pageTheme: { select: { coverUrl: true, coverPublicId: true, coverOverlay: true, accentColor: true } },
      },
    });
    if (!shop) throw new Error(`Negócio fixture não encontrado: ${business.id}`);
    if (shop.approvalStatus !== "APPROVED") {
      throw new Error(`Negócio não aprovado para ${business.id}: ${shop.approvalStatus}`);
    }
    if (shop.businessSegment !== business.segmento) {
      throw new Error(
        `Segmento divergente para ${business.id}: ${shop.businessSegment} ≠ ${business.segmento}`,
      );
    }
    if (!shop.logoUrl) throw new Error(`logoUrl ausente para ${business.id}`);
    if (!shop.pageTheme?.coverUrl) throw new Error(`coverUrl ausente para ${business.id}`);
    if (shop.pageTheme.coverOverlay !== DEMO_SHOWCASE_COVER_OVERLAY) {
      throw new Error(`coverOverlay diferente de 40 para ${business.id}`);
    }

    const counts = await countBusinessData(client, business);
    if (counts.serviceCount < 6 || counts.serviceCount > 10) {
      throw new Error(
        `Serviços fora da faixa 6–10 para ${business.id}: ${counts.serviceCount}`,
      );
    }
    if (counts.professionalCount <= 0) throw new Error(`Sem profissionais para ${business.id}`);
    if (counts.clientCount < 25 || counts.clientCount > 40) {
      throw new Error(`Clientes fora da faixa 25–40 para ${business.id}: ${counts.clientCount}`);
    }
    if (counts.appointmentCount < 250) {
      throw new Error(`Agenda densa insuficiente para ${business.id}: ${counts.appointmentCount}`);
    }
    if (counts.todayIsOpen && counts.appointmentsToday <= 0) {
      throw new Error(`Sem agendamentos hoje para ${business.id}`);
    }
    if (counts.tomorrowIsOpen && counts.appointmentsTomorrow <= 0) {
      throw new Error(`Sem agendamentos amanhã para ${business.id}`);
    }
    if (counts.showcaseCount <= 0) throw new Error(`Sem showcase publicado para ${business.id}`);

    // Distribuição de status da agenda (histórico realista).
    const completed = counts.appointmentsByStatus.COMPLETED ?? 0;
    const cancelled = counts.appointmentsByStatus.CANCELLED ?? 0;
    const noShow = counts.appointmentsByStatus.NO_SHOW ?? 0;
    if (completed < 100) throw new Error(`Poucos concluídos (${completed}) para ${business.id}`);
    if (cancelled < 20) throw new Error(`Poucos cancelados (${cancelled}) para ${business.id}`);
    if (noShow < 5) throw new Error(`Poucas faltas (${noShow}) para ${business.id}`);

    // Financeiro: caixa, comissões, despesas, metas de tráfego e avaliações.
    if (counts.ledgerCount < 50) throw new Error(`Ledger de caixa baixo (${counts.ledgerCount}) para ${business.id}`);
    if (counts.commissionCount < 50) throw new Error(`Comissões baixas (${counts.commissionCount}) para ${business.id}`);
    // Segmentos com publicidade restrita (ex.: advocacia) não gravam a
    // despesa de marketing — o piso cai de 20 para 18.
    const minExpenses = getSegmentConfig(business.segmento).advertisingRestricted ? 18 : 20;
    if (counts.expenseCount < minExpenses) {
      throw new Error(`Despesas baixas (${counts.expenseCount}) para ${business.id}`);
    }
    if (
      !getSegmentConfig(business.segmento).advertisingRestricted &&
      counts.reviewCount < 10
    ) {
      throw new Error(`Avaliações baixas (${counts.reviewCount}) para ${business.id}`);
    }
    if (counts.trafficVisits30d < 300) {
      throw new Error(`Tráfego 30d baixo (${counts.trafficVisits30d}) para ${business.id}`);
    }
    if (
      ["QUEUE_ONLY", "HYBRID"].includes(getSegmentConfig(business.segmento).suggestedOperationMode) &&
      counts.queueCount < 2
    ) {
      throw new Error(`Fila vazia (${counts.queueCount}) para ${business.id}`);
    }

    // Invariante: zero sobreposições de agenda por profissional.
    if (counts.overlapCount > 0) {
      throw new Error(`${counts.overlapCount} sobreposição(s) de agenda em ${business.id}`);
    }

    // Agenda viva: manhã concluída, um checked-in, uma confirmação em ~4h;
    // o próximo dia aberto recebe seis horários confirmados por profissional.
    const presentation = demoAgendaPresentation({ business, today, now });
    const liveRows = await client.appointment.findMany({
      where: { barbershopId: shopId, date: civilDateToUtcDate(presentation.liveDate) },
      select: { status: true, time: true, staffId: true },
      orderBy: { time: "asc" },
    });
    const liveStatusCounts = liveRows.reduce<Record<string, number>>((result, row) => {
      result[row.status] = (result[row.status] ?? 0) + 1;
      return result;
    }, {});
    if (
      liveRows.length !== 4 ||
      liveStatusCounts.COMPLETED !== 2 ||
      liveStatusCounts.CHECKED_IN !== 1 ||
      liveStatusCounts.CONFIRMED !== 1
    ) {
      throw new Error(
        `Agenda viva inválida para ${business.id} em ${presentation.liveDate}: ${JSON.stringify(liveStatusCounts)}`,
      );
    }
    const confirmedRows = liveRows.filter(row => row.status === "CONFIRMED");
    const checkedInRows = liveRows.filter(row => row.status === "CHECKED_IN");
    if (
      confirmedRows.length !== 1 ||
      checkedInRows.length !== 1 ||
      timeToMinutes(confirmedRows[0].time) - timeToMinutes(checkedInRows[0].time) !== 240
    ) {
      throw new Error(`Confirmação viva não está 4h após o checked-in para ${business.id}`);
    }

    const fullRows = await client.appointment.findMany({
      where: { barbershopId: shopId, date: civilDateToUtcDate(presentation.fullDate) },
      select: { status: true, staffId: true },
    });
    if (
      fullRows.length !== 12 ||
      fullRows.some(row => row.status !== "CONFIRMED")
    ) {
      throw new Error(
        `Agenda cheia inválida para ${business.id} em ${presentation.fullDate}: ${fullRows.length} linha(s)`,
      );
    }

    // Tendência obrigatória: mês corrente fatura mais que o anterior em TODOS
    // os negócios do showcase.
    if (!(counts.revenueCurrentMonth > counts.revenuePreviousMonth)) {
      momFailures.push(
        `${business.id} (atual ${counts.revenueCurrentMonth.toFixed(2)} ≤ anterior ${counts.revenuePreviousMonth.toFixed(2)})`,
      );
    }

    // Verificação privada autenticada com o owner real do tenant.
    const ownerEmail = demoShowcaseBusinessEmails(business)[0];
    const accessToken = await loginDemoShowcaseOwner(baseUrl, ownerEmail, password);
    const privateScreens: DemoShowcasePrivateScreenResult[] = [];
    const privateDefinitions: Array<{
      screen: DemoShowcasePrivateScreen;
      path: string;
      applicable: boolean;
    }> = [
      {
        screen: "agenda",
        path: `/appointments?barbershopId=${shopId}&limit=100&date=${presentation.liveDate}`,
        applicable: true,
      },
      {
        screen: "crm",
        path: `/crm/overview?barbershopId=${shopId}&compare=true`,
        applicable: true,
      },
      {
        screen: "caixa",
        path: `/barbershops/${shopId}/cash/summary?date=${today}`,
        applicable: true,
      },
      {
        screen: "estoque",
        path: `/products?barbershopId=${shopId}&limit=100`,
        applicable: business.segmento !== "LAW_FIRM",
      },
      {
        screen: "vendas",
        path: `/retail-sales?barbershopId=${shopId}&limit=100`,
        applicable: business.segmento !== "LAW_FIRM",
      },
      {
        screen: "metas",
        path: `/barbershops/${shopId}/goals`,
        applicable: true,
      },
    ];
    for (const definition of privateDefinitions) {
      if (!definition.applicable) {
        privateScreens.push({
          screen: definition.screen,
          status: null,
          itemCount: null,
          applicable: false,
        });
        continue;
      }
      const result = await requestDemoPrivateScreen(
        baseUrl,
        definition.screen,
        definition.path,
        accessToken,
      );
      privateScreens.push(result);
      if (result.status !== 200) {
        privateFailures.push(
          `${business.id}/${definition.screen}: HTTP ${result.status ?? "sem status"}`,
        );
      }
    }

    const logoHead = await headImage(shop.logoUrl);
    const coverHead = await headImage(shop.pageTheme.coverUrl);
    if (logoHead.status !== 200 || !logoHead.contentType.startsWith("image/")) {
      throw new Error(`Logo indisponível para ${business.id}: ${logoHead.status} ${logoHead.contentType}`);
    }
    if (coverHead.status !== 200 || !coverHead.contentType.startsWith("image/")) {
      throw new Error(`Capa indisponível para ${business.id}: ${coverHead.status} ${coverHead.contentType}`);
    }

    const publicShop = await getJson(`${baseUrl}/barbershops/${shopId}`);
    if (publicShop.logoUrl !== shop.logoUrl) {
      throw new Error(`Rota pública sem logoUrl para ${business.id}`);
    }
    const publicTheme = await getJson(`${baseUrl}/barbershops/${shopId}/page-theme`);
    if (publicTheme.coverUrl !== shop.pageTheme.coverUrl) {
      throw new Error(`Rota pública sem coverUrl para ${business.id}`);
    }
    const publicServices = await getJson(`${baseUrl}/services?barbershopId=${shopId}`);
    const publicServiceRows = Array.isArray(publicServices) ? publicServices : publicServices.items ?? [];
    if (publicServiceRows.length <= 0) throw new Error(`Rota pública sem serviços para ${business.id}`);
    const publicStaff = await getJson(`${baseUrl}/barbershops/${shopId}/staff`);
    if (!Array.isArray(publicStaff) || publicStaff.length <= 0) {
      throw new Error(`Rota pública sem equipe para ${business.id}`);
    }
    const publicShowcase = await getJson(`${baseUrl}/barbershops/${shopId}/showcase`);
    if (!Array.isArray(publicShowcase) || publicShowcase.length <= 0) {
      throw new Error(`Rota pública sem showcase para ${business.id}`);
    }

    reports.push({
      id: business.id,
      name: shop.name,
      segment: shop.businessSegment,
      confirmar: business.confirmar,
      approvalStatus: shop.approvalStatus,
      ...counts,
      logoUrl: shop.logoUrl,
      coverUrl: shop.pageTheme.coverUrl,
      logoHead,
      coverHead,
      privateScreens,
      liveDate: presentation.liveDate,
      fullDate: presentation.fullDate,
    });
  }

  if (momFailures.length > 0) {
    throw new Error(
      `Receita do mês corrente não superou a anterior em ${momFailures.length}/${businesses.length} negócios: ${momFailures.join(", ")}`,
    );
  }
  if (privateFailures.length > 0) {
    throw new Error(
      `Telas privadas sem HTTP 200: ${privateFailures.join(", ")}`,
    );
  }

  return reports;
}
