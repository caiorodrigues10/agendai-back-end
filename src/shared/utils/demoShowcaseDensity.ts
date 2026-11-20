import { Prisma, type BusinessSegment } from "@prisma/client";
import type { DemoShowcaseManifestBusiness } from "./demoShowcaseAssets";
import { demoShowcaseFingerprint } from "./demoShowcaseAssets";
import { getSegmentConfig } from "@/shared/segments";
import { CATALOG_TEMPLATES } from "@/modules/products/catalogTemplates";
import {
  DEMO_FINANCIAL_NAMESPACES,
  seedDemoShowcaseFinancial,
  type DemoFinancialSummary,
} from "./demoShowcaseFinancial";
import {
  addDaysToCivilDate,
  civilDateMinutesToUtc,
  civilDateToUtcDate,
  civilDateWeekday,
  demoShowcaseRng,
  demoShowcaseUuid,
  findNextOpenCivilDate,
  minutesToTime,
  pickOne,
  pickWeighted,
  randomInt,
  saoPauloCivilDate,
  saoPauloCivilTime,
  startOfCivilMonth,
  startOfNextCivilMonth,
  timeToMinutes,
  type DemoShowcaseRng,
} from "./demoShowcaseHelpers";

type Tx = any;

/**
 * Densidade do showcase de demonstração: clientes, produtos, agenda de 60+14
 * dias, financeiro (ledger/caixa/comissões/despesas/metas), relacionamento
 * (avaliações/fidelidade/vouchers/pacotes), fila, tráfego da página pública e
 * particularidades por segmento (pets, veículos, casos, endereço em serviço
 * domiciliar).
 *
 * Tudo é determinístico (UUIDs por namespace + PRNG semeado por chave) e
 * idempotente: as execuções apagam e recriam apenas linhas do fixture
 * (prefixo `d1a0b0xx-`), mantendo as mesmas contagens entre rodadas.
 *
 * Este módulo é Puro no planejamento (`planDemoAppointments`,
 * `buildDemoClients`) e faz I/O só em `seedDemoShowcaseDensity`.
 */

// ─── Namespaces de UUID (fixture) ────────────────────────────────────────────
export const DEMO_DENSITY_NAMESPACES = {
  client: "d1a0b004",
  appointment: "d1a0b007",
  product: "d1a0b00b",
  expense: "d1a0b00c",
  review: "d1a0b00d",
  queueItem: "d1a0b00e",
  goal: "d1a0b00f",
  loyaltyEntry: "d1a0b010",
  voucher: "d1a0b011",
  voucherUsage: "d1a0b012",
  servicePackage: "d1a0b013",
  clientPackage: "d1a0b014",
  pet: "d1a0b015",
  vehicle: "d1a0b016",
  case: "d1a0b017",
  procedure: "d1a0b018",
  commission: "d1a0b019",
  completedQueueItem: "d1a0b025",
} as const;

/** Prefixo de UUID usado por TODAS as linhas do fixture (apagar no re-seed). */
export const DEMO_FIXTURE_UUID_PREFIXES = [
  "d1a0b001-", "d1a0b002-", "d1a0b003-", "d1a0b004-", "d1a0b005-", "d1a0b006-",
  "d1a0b007-", "d1a0b008-", "d1a0b009-", "d1a0b00a-", "d1a0b00b-", "d1a0b00c-",
  "d1a0b00d-", "d1a0b00e-", "d1a0b00f-", "d1a0b010-", "d1a0b011-", "d1a0b012-",
  "d1a0b013-", "d1a0b014-", "d1a0b015-", "d1a0b016-", "d1a0b017-", "d1a0b018-",
  "d1a0b019-", "d1a0b020-", "d1a0b021-", "d1a0b022-", "d1a0b023-", "d1a0b024-",
  "d1a0b025-",
] as const;

// ─── Pools de dados fictícios ────────────────────────────────────────────────
const FIRST_NAMES = [
  "Ana", "Beatriz", "Camila", "Daniela", "Fernanda", "Gabriela", "Helena", "Isabela",
  "Juliana", "Larissa", "Mariana", "Natália", "Olívia", "Patrícia", "Renata", "Sofia",
  "Tatiane", "Vanessa", "Adriana", "Bruna", "Carla", "Débora", "Elaine", "Flávia",
  "Gisele", "Ingrid", "Jessica", "Karina", "Letícia", "Priscila", "Rafael", "Thiago",
  "Bruno", "Carlos", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor",
  "João", "Leonardo", "Marcos", "Nelson", "Otávio", "Pedro", "Ricardo", "Samuel",
  "Tiago", "Vinícius", "Wagner", "Alice", "Miguel", "Rita", "Sérgio", "Teresa",
] as const;

const LAST_NAMES = [
  "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Carvalho", "Ribeiro",
  "Almeida", "Costa", "Fernandes", "Gomes", "Martins", "Rocha", "Barbosa", "Alves",
  "Monteiro", "Cardoso", "Teixeira", "Correia", "Duarte", "Freitas", "Machado",
  "Nogueira", "Pinto", "Ramos", "Rezende", "Tavares", "Vieira", "Aragão", "Camargo",
  "Dantas", "Esteves", "Farias", "Guimarães", "Junqueira", "Moraes", "Peixoto",
  "Queiroz", "Sampaio",
] as const;

const PHONE_DDDS = ["11", "21", "31", "41", "47", "51", "61", "62", "71", "81", "85"] as const;

const PET_NAMES = [
  "Thor", "Luna", "Bob", "Mel", "Zeus", "Nina", "Fred", "Maya", "Rex", "Bela",
  "Simba", "Pipoca", "Totó", "Mimi", "Bolt", "Amora",
] as const;

const DOG_BREEDS = ["SRD", "Poodle", "Labrador", "Bulldog", "Shih Tzu", "Golden Retriever", "Yorkshire"] as const;
const CAT_BREEDS = ["SRD", "Persa", "Siamês", "Maine Coon", "Angorá"] as const;

const VEHICLE_MODELS = [
  "Honda Civic", "Toyota Corolla", "Volkswagen Gol", "Chevrolet Onix", "Hyundai HB20",
  "Renault Kwid", "Fiat Argo", "Jeep Renegade", "Ford Ka", "Nissan Kicks",
  "Honda CG 160", "Yamaha Fazer 250", "Toyota Hilux", "Volkswagen Saveiro",
] as const;

const VEHICLE_COLORS = ["Prata", "Branco", "Preto", "Vermelho", "Azul", "Cinza", "Bege"] as const;

const CASE_NICKNAMES = [
  "Ação de cobrança", "Reclamação trabalhista", "Inventário", "Divórcio litigioso",
  "Execução de título", "Ação de despejo", "Indenização por dano", "Guarda e convivência",
  "Revisão de contrato", "Ação de usucapião",
] as const;

const PRACTICE_AREAS = ["Cível", "Trabalhista", "Família", "Consumidor", "Tributário", "Empresarial"] as const;

const COURT_NAMES = [
  "1ª Vara Cível de São Paulo", "2ª Vara de Família de Campinas",
  "Juizado Especial Cível", "3ª Vara Trabalhista de Guarulhos",
  "1ª Vara de Família de Osasco",
] as const;

const CASE_OPPONENTS = [
  "Banco Alfa Participações S.A.", "Construtora Delta Ltda.", "Supermercado Bom Preço",
  "Transportes Zeta S.A.", "Locadora Íris Imobiliária", "Clínica Vita Serviços",
] as const;

const REVIEW_COMMENTS = [
  "Atendimento excelente, recomendo!", "Superou minhas expectativas.",
  "Profissional muito atencioso.", "Amei o resultado, voltarei sempre.",
  "Pontual e caprichoso.", "Ambiente agradável e equipe simpática.",
  "Bom atendimento, só achei o tempo um pouco longo.", "Resolveu meu problema rapidinho.",
  "Excelente serviço, preço justo.", "Muito satisfeito com o serviço.",
  "Fui muito bem atendido.", "Serviço de qualidade, recomendo.",
  "Cheguei sem horário e fui atendido rápido.", "Trabalho impecável, nota 10.",
  "Gostei bastante, voltarei.", "Atendimento demorou um pouco, mas o resultado compensou.",
  "Equipe muito profissional.", "Melhor da região, sem dúvida.",
  "Cordial e eficiente.", "O resultado ficou aquém do esperado.",
  "Bom atendimento, mas o preço poderia ser melhor.", "Recomendo para amigos e familiares.",
  "Tudo muito organizado e limpo.", "Segunda vez que venho e continuou ótimo.",
] as const;

const REVIEW_RESPONSES = [
  "Obrigado pela avaliação!", "Agradecemos a preferência!",
  "Sua satisfação é nossa prioridade.", "Volte sempre!",
  "Obrigado por confiar no nosso trabalho.", "Foi um prazer atender você!",
] as const;

const PROCEDURE_DETAILS = [
  "Paciente relata melhora dos sintomas.", "Orientações de casa fornecidas.",
  "Sessão concluída sem intercorrências.", "Plano atualizado para o próximo mês.",
  "Reforçada a importância da constância nos exercícios.",
] as const;

const CANCEL_REASONS = [
  "Imprevisto do cliente", "Reagendamento solicitado", "Horário indisponível",
  "Cliente doente", "Viagem",
] as const;

const HOME_SERVICE_STREETS = [
  "Rua das Palmeiras", "Avenida Brasil", "Rua Coronel Xavier de Toledo",
  "Rua dos Ipês", "Alameda Santos", "Rua Vinte e Cinco de Março",
] as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────
export interface DemoShowcaseDensityStaff {
  id: string;
  name: string;
}

export interface DemoShowcaseDensityService {
  id: string;
  name: string;
  price: number;
  avgTimeMinutes: number;
  commissionPercent: number;
}

export interface DemoShowcaseDensityInput {
  business: DemoShowcaseManifestBusiness;
  shopId: string;
  ownerId: string;
  ownerName?: string;
  staff: DemoShowcaseDensityStaff[];
  services: DemoShowcaseDensityService[];
  /** Reancora somente os dados volteis, preservando clientes e histórico. */
  refresh?: boolean;
  /** Data civil e instante injetáveis para testes/refresh determinístico. */
  today?: string;
  now?: Date;
}

export type DemoAppointmentStatus =
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "CHECKED_IN"
  | "NO_SHOW";

export interface DemoAppointmentPlan {
  civilDate: string;
  dayOffset: number;
  slot: number;
  staffIndex: number;
  serviceIndex: number;
  clientIndex: number;
  time: string;
  status: DemoAppointmentStatus;
  source: "APP" | "PUBLIC" | "WHATSAPP_OWNER_BOT";
  modality: "IN_PERSON" | "VIDEO" | "PHONE";
  finalPrice: number | null;
  paymentMethod: "pix" | "credit_card" | "cash" | "debit_card" | "fiado" | null;
  completedAt: Date | null;
  createdAt: Date;
  canceledAt: Date | null;
  cancellationSource: "STAFF" | "CUSTOMER" | "SYSTEM" | null;
  cancellationReason: string | null;
  noShowMarkedAt: Date | null;
}

export interface DemoShowcaseClientRecord {
  index: number;
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  whatsapp: string;
  cpf: string;
  email: string;
  notes: string;
  createdAt: Date;
  marketingOptIn: boolean;
}

export interface DemoShowcaseDensitySummary {
  clientCount: number;
  serviceCount: number;
  productCount: number;
  appointmentCount: number;
  appointmentsByStatus: Record<string, number>;
  completedCount: number;
  ledgerCount: number;
  commissionCount: number;
  reviewCount: number;
  expenseCount: number;
  goalCount: number;
  loyaltyAccountCount: number;
  voucherCount: number;
  packageCount: number;
  queueCount: number;
  trafficVisits30d: number;
  petCount: number;
  vehicleCount: number;
  caseCount: number;
  procedureCount: number;
  completedQueueCount: number;
  financial: DemoFinancialSummary;
}

// ─── Helpers de identidade ───────────────────────────────────────────────────
function densityUuid(namespace: string, key: string): string {
  return demoShowcaseUuid(namespace, `demo-showcase:${key}`);
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "");
}

function slugEmailPart(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ".")
    .replace(/^\.+|\.+$/gu, "")
    .slice(0, 40);
}

/** CPF fictício com dígitos verificadores válidos (formato `000.000.000-00`). */
export function fakeDemoCpf(seedKey: string): string {
  const hash = demoShowcaseFingerprint(seedKey);
  const digits: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    digits.push(parseInt(hash[i % hash.length], 16) % 10);
  }
  // Evita sequências óbvias (000.000.000-00 etc.).
  if (digits.every(digit => digit === digits[0])) {
    digits[8] = (digits[8] + 3) % 10;
  }
  const dv = (base: number[], places: number): number => {
    let sum = 0;
    for (let i = 0; i < places; i += 1) sum += base[i] * (places + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const dv1 = dv(digits, 9);
  const dv2 = dv([...digits, dv1], 10);
  const all = [...digits, dv1, dv2];
  const body = all.slice(0, 9).join("");
  return `${body.slice(0, 3)}.${body.slice(3, 6)}.${body.slice(6, 9)}-${all.slice(9).join("")}`;
}

/** Telefone celular fictício no formato `DDD + 9XXXXXXXX` (11 dígitos). */
function fakeDemoPhone(seedKey: string): string {
  const hash = demoShowcaseFingerprint(seedKey);
  const ddd = PHONE_DDDS[parseInt(hash.slice(0, 2), 16) % PHONE_DDDS.length];
  const subscriber = String(parseInt(hash.slice(2, 12), 16) % 100_000_000).padStart(8, "0");
  return `${ddd}9${subscriber}`;
}

// ─── Clientes ────────────────────────────────────────────────────────────────
/** 25–40 clientes por negócio (determinístico), com cadastro nos últimos 6 meses. */
export function demoClientCount(businessId: string): number {
  const hash = demoShowcaseFingerprint(`demo-showcase:client-count:${businessId}`);
  return 26 + (parseInt(hash.slice(0, 4), 16) % 9); // 26..34
}

export function buildDemoClients(
  business: DemoShowcaseManifestBusiness,
  clientCount = demoClientCount(business.id),
): DemoShowcaseClientRecord[] {
  const now = new Date();
  const isHomeServices = business.segmento === "HOME_SERVICES";
  const records: DemoShowcaseClientRecord[] = [];
  const usedEmails = new Set<string>();

  for (let index = 0; index < clientCount; index += 1) {
    const firstName = FIRST_NAMES[(index * 7 + business.id.length) % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(index * 11 + business.id.charCodeAt(0)) % LAST_NAMES.length];
    const name = `${firstName} ${lastName}`;
    const key = `client:${business.id}:${index}`;
    const whatsapp = fakeDemoPhone(key);
    const cpf = fakeDemoCpf(key);
    let email = `${slugEmailPart(firstName)}.${slugEmailPart(lastName)}${index > FIRST_NAMES.length ? index : ""}@demo.agendaja.local`;
    while (usedEmails.has(email)) email = email.replace("@", `${index}@`);
    usedEmails.add(email);

    const notesParts = [`CPF: ${cpf}`, `E-mail: ${email}`];
    if (isHomeServices) {
      const street = pickOne(demoShowcaseRng(`${key}:address`), HOME_SERVICE_STREETS);
      const number = 50 + (parseInt(demoShowcaseFingerprint(key).slice(0, 4), 16) % 950);
      notesParts.push(`Atendimento em: ${street}, ${number} — bairro Centro`);
    }

    const ageDays = parseInt(demoShowcaseFingerprint(`${key}:age`).slice(0, 4), 16) % 180;
    const createdAt = new Date(now.getTime() - ageDays * 24 * 60 * 60 * 1000 - (index % 12) * 3600_000);
    const marketingOptIn = parseInt(demoShowcaseFingerprint(`${key}:optin`).slice(0, 2), 16) % 10 < 7;

    records.push({
      index,
      id: densityUuid(DEMO_DENSITY_NAMESPACES.client, `client:${business.id}:${index}`),
      name,
      firstName,
      lastName,
      whatsapp,
      cpf,
      email,
      notes: notesParts.join(" · "),
      createdAt,
      marketingOptIn,
    });
  }
  return records;
}

// ─── Produtos ────────────────────────────────────────────────────────────────
/** Produtos do template do segmento, complementados até 4 quando o template tem 1–3. */
export function buildDemoProducts(business: DemoShowcaseManifestBusiness): Array<{
  name: string;
  description: string;
  categoryName: string;
  salePrice: number;
  unitLabel: string;
  type: "RETAIL" | "CONSUMABLE" | "BOTH";
}> {
  const template = CATALOG_TEMPLATES[business.segmento];
  const products = template.products.map(product => ({ ...product, description: product.description ?? "" }));
  if (products.length === 0) return [];

  const supplements: Partial<Record<BusinessSegment, Array<typeof products[number]>>> = {
    LASH_BROW_STUDIO: [
      { name: "Removedor de cílios", categoryName: "Home care", salePrice: 34, unitLabel: "frasco", type: "CONSUMABLE", description: "Removedor à base de gel" },
      { name: "Escova de cílios", categoryName: "Home care", salePrice: 18, unitLabel: "unidade", type: "RETAIL", description: "Escova para separação dos fios" },
    ],
    SPA: [
      { name: "Óleo essencial de lavanda", categoryName: "Autocuidado", salePrice: 49, unitLabel: "frasco", type: "RETAIL", description: "Aromaterapia para banho" },
      { name: "Vela aromática", categoryName: "Autocuidado", salePrice: 42, unitLabel: "unidade", type: "RETAIL", description: "Vela de soja com aroma suave" },
    ],
    MAKEUP_STUDIO: [
      { name: "Paleta de sombras", categoryName: "Maquiagem", salePrice: 89, unitLabel: "unidade", type: "RETAIL", description: "Paleta com 12 tons" },
      { name: "Primer facial", categoryName: "Maquiagem", salePrice: 62, unitLabel: "unidade", type: "RETAIL", description: "Base preparadora de pele" },
      { name: "Máscara de cílios", categoryName: "Maquiagem", salePrice: 55, unitLabel: "unidade", type: "RETAIL", description: "Máscara volumizadora" },
      { name: "Batom líquido", categoryName: "Maquiagem", salePrice: 47, unitLabel: "unidade", type: "RETAIL", description: "Batom de longa duração" },
    ],
    PHYSIOTHERAPY: [
      { name: "Faixa elástica", categoryName: "Cuidados", salePrice: 39, unitLabel: "unidade", type: "RETAIL", description: "Resistência média para exercícios" },
      { name: "Bola de pilates", categoryName: "Cuidados", salePrice: 79, unitLabel: "unidade", type: "RETAIL", description: "Bola de 22 cm" },
      { name: "Alongador de pés", categoryName: "Cuidados", salePrice: 29, unitLabel: "unidade", type: "RETAIL", description: "Acessório para relaxamento" },
      { name: "Álcool gel", categoryName: "Cuidados", salePrice: 15, unitLabel: "frasco", type: "CONSUMABLE", description: "Higienização das mãos" },
    ],
    NUTRITION: [
      { name: "Shaker", categoryName: "Cuidados", salePrice: 35, unitLabel: "unidade", type: "RETAIL", description: "Copo misturador 500 ml" },
      { name: "Ceia proteica", categoryName: "Cuidados", salePrice: 68, unitLabel: "unidade", type: "RETAIL", description: "Mistura pronta para a noite" },
      { name: "Frasco de medição", categoryName: "Cuidados", salePrice: 12, unitLabel: "unidade", type: "RETAIL", description: "Medida de 30 g" },
      { name: "Chá detox (10 sachês)", categoryName: "Cuidados", salePrice: 27, unitLabel: "caixa", type: "RETAIL", description: "Blend de ervas" },
    ],
    PSYCHOTHERAPY: [
      { name: "Caderno de registro", categoryName: "Cuidados", salePrice: 32, unitLabel: "unidade", type: "RETAIL", description: "Para anotações de sessão" },
      { name: "Aromaterapia relaxante", categoryName: "Cuidados", salePrice: 54, unitLabel: "frasco", type: "RETAIL", description: "Spray para ambientes" },
      { name: "Chá calmante (20 sachês)", categoryName: "Cuidados", salePrice: 24, unitLabel: "caixa", type: "RETAIL", description: "Blend de camomila e lavanda" },
      { name: "Vela de soja", categoryName: "Cuidados", salePrice: 45, unitLabel: "unidade", type: "RETAIL", description: "Aroma relaxante" },
    ],
    CAR_WASH: [
      { name: "Cera líquida", categoryName: "Estética", salePrice: 58, unitLabel: "frasco", type: "CONSUMABLE", description: "Proteção e brilho" },
      { name: "Kit limpador interno", categoryName: "Estética", salePrice: 44, unitLabel: "kit", type: "RETAIL", description: "Pano microfibra + limpeza" },
      { name: "Perfume automotivo", categoryName: "Estética", salePrice: 25, unitLabel: "unidade", type: "RETAIL", description: "Ambientador de longa duração" },
      { name: "Pasta de pneu", categoryName: "Estética", salePrice: 37, unitLabel: "frasco", type: "CONSUMABLE", description: "Realça o preto do pneu" },
    ],
    AUTO_REPAIR: [
      { name: "Óleo 5W30 (1 L)", categoryName: "Manutenção", salePrice: 49, unitLabel: "litro", type: "CONSUMABLE", description: "Óleo sintético" },
      { name: "Filtro de ar", categoryName: "Manutenção", salePrice: 65, unitLabel: "unidade", type: "RETAIL", description: "Filtro de cabine" },
      { name: "Fluido de freio", categoryName: "Manutenção", salePrice: 32, unitLabel: "frasco", type: "CONSUMABLE", description: "DOT 4" },
      { name: "Limpador de bicos", categoryName: "Manutenção", salePrice: 29, unitLabel: "frasco", type: "CONSUMABLE", description: "Aditivo de limpeza" },
    ],
    PHOTO_STUDIO: [
      { name: "Impressão 20×30", categoryName: "Serviços", salePrice: 45, unitLabel: "unidade", type: "RETAIL", description: "Papel fotográfico mate" },
      { name: "Álbum 30 fotos", categoryName: "Serviços", salePrice: 180, unitLabel: "unidade", type: "RETAIL", description: "Álbum capa dura" },
      { name: "Moldura 20×30", categoryName: "Serviços", salePrice: 60, unitLabel: "unidade", type: "RETAIL", description: "Moldura de madeira" },
      { name: "Cartão de agradecimento", categoryName: "Serviços", salePrice: 15, unitLabel: "unidade", type: "RETAIL", description: "Impressão personalizada" },
    ],
    TATTOO_PIERCING: [
      { name: "Pomada cicatrizante", categoryName: "Cuidados", salePrice: 36, unitLabel: "frasco", type: "CONSUMABLE", description: "Pós-tatuagem" },
      { name: "Sabonete líquido", categoryName: "Cuidados", salePrice: 22, unitLabel: "frasco", type: "CONSUMABLE", description: "Higienização da pele" },
      { name: "Protetor solar pós-tattoo", categoryName: "Cuidados", salePrice: 48, unitLabel: "unidade", type: "RETAIL", description: "FPS 60" },
      { name: "Piercing de titânio", categoryName: "Acessórios", salePrice: 70, unitLabel: "unidade", type: "RETAIL", description: "Hipoalergênico" },
    ],
    HOME_SERVICES: [
      { name: "Kit de limpeza", categoryName: "Insumos", salePrice: 89, unitLabel: "kit", type: "RETAIL", description: "Produtos de uso doméstico" },
      { name: "Pano de microfibra (3 un)", categoryName: "Insumos", salePrice: 27, unitLabel: "pacote", type: "RETAIL", description: "Alto poder de absorção" },
      { name: "Desengordurante", categoryName: "Insumos", salePrice: 33, unitLabel: "frasco", type: "CONSUMABLE", description: "Cozinha e fogão" },
      { name: "Luvas de borracha", categoryName: "Insumos", salePrice: 19, unitLabel: "par", type: "RETAIL", description: "Proteção das mãos" },
    ],
    LAW_FIRM: [
      { name: "Pasta processual", categoryName: "Material", salePrice: 25, unitLabel: "unidade", type: "RETAIL", description: "Pasta com divisórias" },
      { name: "Cópia certificada", categoryName: "Material", salePrice: 12, unitLabel: "folha", type: "RETAIL", description: "Conforme cartório" },
      { name: "Malote", categoryName: "Material", salePrice: 18, unitLabel: "unidade", type: "RETAIL", description: "Envio de documentos" },
      { name: "Bloco de protocolo", categoryName: "Material", salePrice: 15, unitLabel: "unidade", type: "RETAIL", description: "50 folhas numeradas" },
    ],
  };

  const extra = supplements[business.segmento] ?? [];
  for (const product of extra) {
    if (products.length >= 4) break;
    if (products.some(existing => existing.name === product.name)) continue;
    products.push(product);
  }
  return products.slice(0, 8);
}

// ─── Planejamento da agenda (puro) ───────────────────────────────────────────
export interface DemoAppointmentPlanInput {
  business: DemoShowcaseManifestBusiness;
  /** Data civil de hoje em America/Sao_Paulo. */
  today: string;
  services: DemoShowcaseDensityService[];
  clientCount: number;
  /** Instante real usado para ancorar a agenda viva. */
  now?: Date;
  /** Overrides determinísticos para teste ("HH:MM" em São Paulo). */
  nowCivilTime?: string;
}

const PAST_STATUS_WEIGHTS: Array<[DemoAppointmentStatus, number]> = [
  ["COMPLETED", 0.75],
  ["CANCELLED", 0.12],
  ["NO_SHOW", 0.06],
  ["CONFIRMED", 0.07],
];

const TODAY_STATUS_WEIGHTS: Array<[DemoAppointmentStatus, number]> = [
  ["COMPLETED", 0.48],
  ["CONFIRMED", 0.47],
  ["CANCELLED", 0.05],
];

const FUTURE_STATUS_WEIGHTS: Array<[DemoAppointmentStatus, number]> = [
  ["CONFIRMED", 0.93],
  ["CANCELLED", 0.07],
];

/**
 * Meta de atendimentos por profissional/dia:
 *  - histórico (meses anteriores ao corrente): 3 — volume constante;
 *  - mês corrente: 6 (pico) — é o que garante `mês corrente > mês anterior`
 *    mesmo com o mês corrente incompleto;
 *  - futuro: 5 — agenda cheia à frente;
 *  - hoje e amanhã sempre 6; sábado com metade (fim de semana mais leve).
 */
export function demoDailyTarget(dayOffset: number, weekday: number, today: string): number {
  const civilDate = addDaysToCivilDate(today, dayOffset);
  if (civilDate === today || civilDate === addDaysToCivilDate(today, 1)) return 6;
  const monthKey = civilDate.slice(0, 7);
  const currentMonthKey = today.slice(0, 7);
  let target: number;
  if (monthKey > currentMonthKey) target = 5;
  else if (monthKey === currentMonthKey) target = 6;
  else {
    // O mês anterior fica mais leve para que o mês corrente seja maior mesmo
    // nos primeiros dias do calendário; meses mais antigos continuam densos.
    const previousMonthKey = startOfCivilMonth(addDaysToCivilDate(`${currentMonthKey}-01`, -1)).slice(0, 7);
    target = monthKey === previousMonthKey ? 1 : 2;
  }
  if (weekday === 6) return Math.max(2, Math.round(target / 2));
  return target;
}

export interface DemoAgendaPresentation {
  /** Dia com a agenda viva (hoje quando ainda há janela útil; senão próximo aberto). */
  liveDate: string;
  /** Primeiro dia aberto depois da agenda viva; recebe a agenda cheia. */
  fullDate: string;
  /** Minuto civil usado como referência do atendimento em andamento. */
  anchorMinutes: number;
}

/**
 * Calcula o par de dias de apresentação. O dia vivo fica no próximo dia
 * aberto quando já não existe janela de 4–6 horas antes do fechamento.
 */
export function demoAgendaPresentation(input: {
  business: DemoShowcaseManifestBusiness;
  today: string;
  now?: Date;
  nowCivilTime?: string;
}): DemoAgendaPresentation {
  const config = getSegmentConfig(input.business.segmento);
  const isOpen = (civilDate: string) =>
    Boolean(config.schedulePreset[civilDateWeekday(civilDate)]?.isOpen);
  const currentMinutes = timeToMinutes(
    input.nowCivilTime ?? saoPauloCivilTime(input.now ?? new Date()),
  );
  const todayPreset = config.schedulePreset[civilDateWeekday(input.today)];
  const openMinutes = timeToMinutes(todayPreset?.openTime ?? "09:00");
  const closeMinutes = timeToMinutes(todayPreset?.closeTime ?? "19:00");

  // Reserva cinco horas: uma hora de duração possível para o atendimento em
  // andamento + quatro horas até a confirmação. Isso evita que a confirmação
  // "dentro de 4h" seja descartada por ultrapassar o fechamento.
  if (todayPreset?.isOpen && currentMinutes + 300 <= closeMinutes) {
    const anchorMinutes = Math.max(openMinutes + 60, Math.floor(currentMinutes / 15) * 15);
    return {
      liveDate: input.today,
      fullDate: findNextOpenCivilDate(addDaysToCivilDate(input.today, 1), isOpen),
      anchorMinutes,
    };
  }

  const liveDate = findNextOpenCivilDate(addDaysToCivilDate(input.today, 1), isOpen);
  const livePreset = config.schedulePreset[civilDateWeekday(liveDate)];
  const liveOpen = timeToMinutes(livePreset?.openTime ?? "09:00");
  const liveClose = timeToMinutes(livePreset?.closeTime ?? "19:00");
  const anchorMinutes = Math.min(liveClose - 300, liveOpen + 120);
  return {
    liveDate,
    fullDate: findNextOpenCivilDate(addDaysToCivilDate(liveDate, 1), isOpen),
    anchorMinutes,
  };
}

/**
 * Planeja a agenda de 60 dias de histórico + 14 de futuro.
 * Invariantes garantidas por construção:
 *  - dia aberto conforme o preset do segmento; nunca além do expediente;
 *  - sem sobreposição por profissional (slots espaçados ≥ duração);
 *  - 3/dia por profissional no histórico, 6 no mês corrente (5 no futuro),
 *    com metade no sábado;
 *  - status: ~75% concluído / ~12% cancelado / ~6% falta no passado;
 *  - hoje e amanhã cheios (6 por profissional) quando o dia é aberto.
 */
export function planDemoAppointments(input: DemoAppointmentPlanInput): DemoAppointmentPlan[] {
  const { business, today, services, clientCount } = input;
  const now = input.now ?? new Date();
  if (services.length === 0 || clientCount === 0) return [];
  const config = getSegmentConfig(business.segmento);
  const plans: DemoAppointmentPlan[] = [];

  for (let dayOffset = -60; dayOffset <= 14; dayOffset += 1) {
    const civilDate = addDaysToCivilDate(today, dayOffset);
    const weekday = civilDateWeekday(civilDate);
    const presetDay = config.schedulePreset[weekday];
    if (!presetDay?.isOpen) continue;

    const openMinutes = timeToMinutes(presetDay.openTime);
    const closeMinutes = timeToMinutes(presetDay.closeTime);
    const usable = closeMinutes - openMinutes;
    const rng = demoShowcaseRng(`demo-showcase:agenda:${business.id}:${civilDate}`);
    const progress = Math.min(1, Math.max(0, (dayOffset + 60) / 74));

    for (let staffIndex = 0; staffIndex < 2; staffIndex += 1) {
      const target = demoDailyTarget(dayOffset, weekday, today);
      const spacing = Math.floor(usable / target);
      if (spacing < 45) continue;

      let slot = 0;
      for (let k = 0; k < target; k += 1) {
        const isLast = k === target - 1;
        const jitter = isLast ? 0 : randomInt(rng, 0, Math.min(15, Math.max(0, spacing - 45)));
        const startMinutes = openMinutes + k * spacing + jitter;
        const remaining = closeMinutes - startMinutes;
        if (remaining < 15) break;

        // Candidatas: serviço que cabe no intervalo; no último slot vale o
        // tempo restante até o fechamento (permite serviços longos).
        // Mix conforme o tempo passa: serviços longos (> ~60–130min) entram
        // aos poucos — no histórico valem atendimentos curtos/médios e o
        // mês corrente concentra os serviços premium ("heavier mix recent").
        const limit = isLast ? remaining : spacing - 15;
        const maxDuration = Math.round(60 + 70 * progress);
        let candidates = services.filter(
          service => service.avgTimeMinutes <= limit && service.avgTimeMinutes <= maxDuration,
        );
        if (candidates.length === 0) {
          candidates = services.filter(service => service.avgTimeMinutes <= limit);
        }
        if (candidates.length === 0) {
          const shortest = [...services].sort((a, b) => a.avgTimeMinutes - b.avgTimeMinutes)[0];
          if (shortest.avgTimeMinutes <= remaining) candidates = [shortest];
          else break;
        }
        // Crescimento: serviços mais caros ganham peso conforme o tempo passa.
        const weighted = candidates.map(
          service => [service, Math.max(1, service.price) * (0.5 + progress)] as [DemoShowcaseDensityService, number],
        );
        const service = pickWeighted(rng, weighted);
        const serviceIndex = services.findIndex(item => item.id === service.id);

        // Cliente: 65% de recorrência entre os10 primeiros (fiéis).
        const frequentSpan = Math.min(10, clientCount);
        const clientIndex =
          rng() < 0.65
            ? Math.floor(rng() * frequentSpan) % clientCount
            : Math.floor(rng() * clientCount) % clientCount;

        let status: DemoAppointmentStatus;
        if (dayOffset < 0) status = pickWeighted(rng, PAST_STATUS_WEIGHTS);
        else if (dayOffset === 0) status = pickWeighted(rng, TODAY_STATUS_WEIGHTS);
        else status = pickWeighted(rng, FUTURE_STATUS_WEIGHTS);

        const endUtc = civilDateMinutesToUtc(civilDate, startMinutes + service.avgTimeMinutes);
        if (status === "COMPLETED" && endUtc.getTime() > now.getTime()) {
          // Ainda não terminou (hoje): não pode estar concluído.
          status = "CONFIRMED";
        }

        const finalPrice =
          status === "COMPLETED"
            ? Math.round(service.price * (0.8 + 0.5 * progress + 0.1 * rng()) * 100) / 100
            : null;
        const paymentMethod =
          status === "COMPLETED"
            ? pickWeighted<"pix" | "credit_card" | "cash" | "debit_card">(rng, [
                ["pix", 0.42],
                ["credit_card", 0.32],
                ["cash", 0.21],
                ["debit_card", 0.05],
              ])
            : null;
        const completedAt =
          status === "COMPLETED"
            ? new Date(Math.min(endUtc.getTime(), now.getTime() - 60_000))
            : null;
        const canceledAt =
          status === "CANCELLED"
            ? civilDateMinutesToUtc(addDaysToCivilDate(civilDate, -1), 10 * 60 + randomInt(rng, 0, 480))
            : null;
        const createdAtBase = Math.min(civilDateToUtcDate(civilDate).getTime(), now.getTime());

        plans.push({
          civilDate,
          dayOffset,
          slot,
          staffIndex,
          serviceIndex,
          clientIndex,
          time: minutesToTime(startMinutes),
          status,
          source: pickWeighted(rng, [
            ["APP", 0.65],
            ["PUBLIC", 0.3],
            ["WHATSAPP_OWNER_BOT", 0.05],
          ]),
          modality:
            business.segmento === "LAW_FIRM"
              ? pickWeighted(rng, [["VIDEO", 0.35], ["IN_PERSON", 0.55], ["PHONE", 0.1]] as const)
              : service.name.toLowerCase().includes("online")
                ? "VIDEO"
                : "IN_PERSON",
          finalPrice,
          paymentMethod,
          completedAt,
          createdAt: new Date(createdAtBase - randomInt(rng, 1, 9) * 24 * 60 * 60 * 1000),
          canceledAt,
          cancellationSource:
            status === "CANCELLED"
              ? pickWeighted(rng, [["CUSTOMER", 0.6], ["STAFF", 0.35], ["SYSTEM", 0.05]] as const)
              : null,
          cancellationReason:
            status === "CANCELLED" ? pickOne(rng, CANCEL_REASONS) : null,
          noShowMarkedAt:
            status === "NO_SHOW"
              ? civilDateMinutesToUtc(civilDate, Math.min(1439, startMinutes + service.avgTimeMinutes + 30))
              : null,
        });
        slot += 1;
      }
    }
  }

  // Exatamente um atendimento histórico concluído é pago em fiado. A escolha
  // é estável e terminal; nenhum pagamento em dinheiro é convertido depois.
  // Isso materializa o Fiado de atendimento em todos os segmentos, inclusive
  // nos que não possuem catálogo de produtos para venda de varejo.
  const serviceFiadoCandidate = [...plans]
    .filter(
      plan =>
        plan.status === "COMPLETED" &&
        plan.civilDate < today &&
        plan.completedAt !== null &&
        plan.finalPrice !== null,
    )
    .sort(
      (left, right) =>
        right.civilDate.localeCompare(left.civilDate) ||
        right.staffIndex - left.staffIndex ||
        right.slot - left.slot,
    )[0];
  if (serviceFiadoCandidate) {
    serviceFiadoCandidate.paymentMethod = "fiado";
  }

  // Agenda viva determinística: manhã concluída, um em andamento, uma
  // confirmação daqui a 4 horas e o restante da tarde livre. O dia seguinte
  // aberto recebe a agenda cheia. Se hoje estiver fechado (ou a janela de 4–6
  // horas já passou), o par avança para os próximos dias abertos.
  const presentation = demoAgendaPresentation({
    business,
    today,
    now: input.now,
    nowCivilTime: input.nowCivilTime,
  });
  const livePreset = config.schedulePreset[civilDateWeekday(presentation.liveDate)];
  const liveOpen = timeToMinutes(livePreset?.openTime ?? "09:00");
  const liveClose = timeToMinutes(livePreset?.closeTime ?? "19:00");
  const specialDates = new Set([presentation.liveDate, presentation.fullDate]);
  const regularPlans = plans.filter(plan => !specialDates.has(plan.civilDate));
  const livePlans: DemoAppointmentPlan[] = [];
  const fullPlans: DemoAppointmentPlan[] = [];
  const liveRng = demoShowcaseRng(
    `demo-showcase:agenda-live:${business.id}:${presentation.liveDate}`,
  );
  const fullRng = demoShowcaseRng(
    `demo-showcase:agenda-full:${business.id}:${presentation.fullDate}`,
  );

  const liveServices = [...services].sort(
    (left, right) => left.avgTimeMinutes - right.avgTimeMinutes || left.price - right.price,
  );
  const liveClient = (offset: number) =>
    Math.floor(liveRng() * Math.min(10, clientCount)) % clientCount;
  const liveServiceFitting = (startMinutes: number) =>
    liveServices.find(service => startMinutes + service.avgTimeMinutes <= liveClose) ??
    liveServices[0];

  const liveSpecs: Array<{
    status: DemoAppointmentStatus;
    staffIndex: number;
    slot: number;
    minutes: number;
    service: DemoShowcaseDensityService;
    clientIndex: number;
  }> = [
    {
      status: "COMPLETED",
      staffIndex: 0,
      slot: 0,
      minutes: liveOpen,
      service: liveServiceFitting(liveOpen),
      clientIndex: liveClient(0),
    },
    {
      status: "COMPLETED",
      staffIndex: 1,
      slot: 0,
      minutes: liveOpen + 90,
      service: liveServiceFitting(liveOpen + 90),
      clientIndex: liveClient(1),
    },
    {
      status: "CHECKED_IN",
      staffIndex: 0,
      slot: 1,
      minutes: presentation.anchorMinutes,
      service: liveServiceFitting(presentation.anchorMinutes),
      clientIndex: liveClient(2),
    },
    {
      status: "CONFIRMED",
      staffIndex: 1,
      slot: 1,
      minutes: presentation.anchorMinutes + 240,
      service: liveServiceFitting(presentation.anchorMinutes + 240),
      clientIndex: liveClient(3),
    },
  ];

  for (const spec of liveSpecs) {
    const endMinutes = spec.minutes + spec.service.avgTimeMinutes;
    if (spec.minutes < liveOpen || endMinutes > liveClose) continue;
    const endUtc = civilDateMinutesToUtc(presentation.liveDate, endMinutes);
    const completedAt =
      spec.status === "COMPLETED"
        ? presentation.liveDate === today
          ? new Date(Math.min(endUtc.getTime(), now.getTime() - 60_000))
          : endUtc
        : null;
    livePlans.push({
      civilDate: presentation.liveDate,
      dayOffset:
        Math.round(
          (Date.parse(`${presentation.liveDate}T00:00:00Z`) -
            Date.parse(`${today}T00:00:00Z`)) /
            86_400_000,
        ),
      slot: spec.slot,
      staffIndex: spec.staffIndex,
      serviceIndex: services.findIndex(service => service.id === spec.service.id),
      clientIndex: spec.clientIndex,
      time: minutesToTime(spec.minutes),
      status: spec.status,
      source: pickWeighted(liveRng, [
        ["APP", 0.62],
        ["PUBLIC", 0.33],
        ["WHATSAPP_OWNER_BOT", 0.05],
      ]),
      modality:
        business.segmento === "LAW_FIRM"
          ? pickWeighted(liveRng, [["VIDEO", 0.3], ["IN_PERSON", 0.65], ["PHONE", 0.05]] as const)
          : "IN_PERSON",
      finalPrice:
        spec.status === "COMPLETED"
          ? Math.round(spec.service.price * (0.95 + liveRng() * 0.15) * 100) / 100
          : null,
      paymentMethod:
        spec.status === "COMPLETED"
          ? pickWeighted(liveRng, [
              ["pix", 0.46],
              ["credit_card", 0.34],
              ["cash", 0.2],
            ])
          : null,
      completedAt,
      createdAt: new Date(now.getTime() - randomInt(liveRng, 2, 36) * 3600_000),
      canceledAt: null,
      cancellationSource: null,
      cancellationReason: null,
      noShowMarkedAt: null,
    });
  }

  const fullPreset = config.schedulePreset[civilDateWeekday(presentation.fullDate)];
  const fullOpen = timeToMinutes(fullPreset?.openTime ?? "09:00");
  const fullClose = timeToMinutes(fullPreset?.closeTime ?? "19:00");
  const fullSpacing = Math.floor((fullClose - fullOpen) / 6);
  for (let staffIndex = 0; staffIndex < 2; staffIndex += 1) {
    for (let slot = 0; slot < 6; slot += 1) {
      const isLast = slot === 5;
      const jitter = isLast ? 0 : randomInt(fullRng, 0, Math.min(12, Math.max(0, fullSpacing - 45)));
      const minutes = fullOpen + slot * fullSpacing + jitter;
      const limit = isLast ? fullClose - minutes : fullSpacing - 15;
      const candidates = services.filter(service => service.avgTimeMinutes <= limit);
      const service =
        candidates.length > 0
          ? pickWeighted(
              fullRng,
              candidates.map(item => [item, Math.max(1, item.price)] as [DemoShowcaseDensityService, number]),
            )
          : [...services].sort((left, right) => left.avgTimeMinutes - right.avgTimeMinutes)[0];
      if (minutes + service.avgTimeMinutes > fullClose) continue;
      fullPlans.push({
        civilDate: presentation.fullDate,
        dayOffset:
          Math.round(
            (Date.parse(`${presentation.fullDate}T00:00:00Z`) -
              Date.parse(`${today}T00:00:00Z`)) /
              86_400_000,
          ),
        slot,
        staffIndex,
        serviceIndex: services.findIndex(item => item.id === service.id),
        clientIndex: Math.floor(fullRng() * Math.min(10, clientCount)) % clientCount,
        time: minutesToTime(minutes),
        status: "CONFIRMED",
        source: pickWeighted(fullRng, [
          ["APP", 0.58],
          ["PUBLIC", 0.37],
          ["WHATSAPP_OWNER_BOT", 0.05],
        ]),
        modality:
          business.segmento === "LAW_FIRM"
            ? pickWeighted(fullRng, [["VIDEO", 0.32], ["IN_PERSON", 0.63], ["PHONE", 0.05]] as const)
            : "IN_PERSON",
        finalPrice: null,
        paymentMethod: null,
        completedAt: null,
        createdAt: new Date(now.getTime() - randomInt(fullRng, 1, 72) * 3600_000),
        canceledAt: null,
        cancellationSource: null,
        cancellationReason: null,
        noShowMarkedAt: null,
      });
    }
  }

  return [...regularPlans, ...livePlans, ...fullPlans];
}

/** Estoque inicial determinístico usado para recalcular o saldo após as vendas. */
export function demoProductInitialStock(businessId: string, index: number): number {
  return 18 + (parseInt(demoShowcaseFingerprint(`${businessId}:stock:${index}`).slice(0, 4), 16) % 28);
}

// ─── Semente da densidade ────────────────────────────────────────────────────
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function fixtureAppointmentIds(business: DemoShowcaseManifestBusiness, today: string): string[] {
  const ids: string[] = [];
  for (let dayOffset = -60; dayOffset <= 14; dayOffset += 1) {
    const civilDate = addDaysToCivilDate(today, dayOffset);
    for (let staffIndex = 0; staffIndex < 2; staffIndex += 1) {
      for (let slot = 0; slot < 6; slot += 1) {
        ids.push(
          demoShowcaseUuid(
            "d1a0b007",
            `demo-showcase:appointment:${business.id}:${civilDate}:${staffIndex}:${slot}`,
          ),
        );
      }
    }
  }
  // Legado do seed anterior (2 atendimentos fixos de hoje/amanhã).
  for (const dayOffset of [0, 1]) {
    for (let slot = 0; slot < 2; slot += 1) {
      ids.push(
        demoShowcaseUuid(
          "d1a0b007",
          `demo-showcase:appointment:${business.id}:${dayOffset}:${slot}`,
        ),
      );
    }
  }
  return ids;
}

export function demoAppointmentId(
  business: DemoShowcaseManifestBusiness,
  plan: Pick<DemoAppointmentPlan, "civilDate" | "staffIndex" | "slot">,
): string {
  return demoShowcaseUuid(
    "d1a0b007",
    `demo-showcase:appointment:${business.id}:${plan.civilDate}:${plan.staffIndex}:${plan.slot}`,
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Distribui `total` em pesos inteiros (maior resto). */
function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, value) => acc + value, 0) || 1;
  const exact = weights.map(weight => (total * weight) / sum);
  const floors = exact.map(value => Math.floor(value));
  let remainder = total - floors.reduce((acc, value) => acc + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  for (const item of order) {
    if (remainder <= 0) break;
    floors[item.index] += 1;
    remainder -= 1;
  }
  return floors;
}

export async function seedDemoShowcaseDensity(
  tx: Tx,
  input: DemoShowcaseDensityInput,
): Promise<DemoShowcaseDensitySummary> {
  const { business, shopId, ownerId, staff, services } = input;
  const config = getSegmentConfig(business.segmento);
  const advertisingRestricted = Boolean(config.advertisingRestricted);
  const segment = business.segmento;
  const refresh = input.refresh ?? false;
  const now = input.now ?? new Date();
  const today = input.today ?? saoPauloCivilDate(now);

  const summary: DemoShowcaseDensitySummary = {
    clientCount: 0,
    serviceCount: services.length,
    productCount: 0,
    appointmentCount: 0,
    appointmentsByStatus: {},
    completedCount: 0,
    ledgerCount: 0,
    commissionCount: 0,
    reviewCount: 0,
    expenseCount: 0,
    goalCount: 0,
    loyaltyAccountCount: 0,
    voucherCount: 0,
    packageCount: 0,
    queueCount: 0,
    trafficVisits30d: 0,
    petCount: 0,
    vehicleCount: 0,
    caseCount: 0,
    procedureCount: 0,
    completedQueueCount: 0,
    financial: {
      retailSaleCount: 0,
      retailLineCount: 0,
      stockMovementCount: 0,
      fiadoCount: 0,
      fiadoPaymentCount: 0,
      crmFinancialEventCount: 0,
      reviewInvitationCount: 0,
      paymentCount: 0,
      dailyCloseoutCount: 0,
    },
  };

  // ── 1. Clientes ───────────────────────────────────────────────────────────
  const clients = buildDemoClients(business);
  summary.clientCount = clients.length;
  const existingClientIds = refresh
    ? new Set(
        (
          await tx.salonClient.findMany({
            where: { id: { in: clients.map(client => client.id) } },
            select: { id: true },
          })
        ).map((client: { id: string }) => client.id),
      )
    : new Set<string>();
  for (const client of clients) {
    const create = {
      id: client.id,
      barbershopId: shopId,
      name: client.name,
      whatsapp: client.whatsapp,
      normalizedWhatsapp: client.whatsapp,
      notes: client.notes,
      marketingOptIn: client.marketingOptIn,
      marketingOptInAt: client.marketingOptIn ? client.createdAt : null,
      marketingOptInSource: client.marketingOptIn ? "cadastro_manual" : null,
      createdAt: client.createdAt,
    };
    if (refresh) {
      // Clientes são preservados no refresh. Não executamos um update mesmo
      // sem campos: o hooks de `updatedAt` ainda alteraria a linha.
      if (!existingClientIds.has(client.id)) {
        await tx.salonClient.create({ data: create });
      }
      continue;
    }
    await tx.salonClient.upsert({
      where: { id: client.id },
      create,
      update: create,
    });
  }

  // ── 2. Produtos com estoque ───────────────────────────────────────────────
  const products = buildDemoProducts(business);
  summary.productCount = products.length;
  if (products.length > 0) {
    const categoryIds = new Map<string, string | null>();
    for (const product of products) {
      if (categoryIds.has(product.categoryName)) continue;
      const category = await tx.productCategory.findFirst({
        where: { barbershopId: shopId, name: product.categoryName },
        select: { id: true },
      });
      categoryIds.set(product.categoryName, category?.id ?? null);
    }
    for (const [index, product] of products.entries()) {
      const productId = densityUuid(DEMO_DENSITY_NAMESPACES.product, `product:${business.id}:${index}`);
      const stock = demoProductInitialStock(business.id, index);
      const data = {
        barbershopId: shopId,
        categoryId: categoryIds.get(product.categoryName) ?? null,
        name: product.name,
        description: product.description,
        sku: `DEMO-${business.id.slice(0, 4).toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
        unitLabel: product.unitLabel,
        salePrice: product.salePrice,
        averageCost: round2(product.salePrice * 0.62),
        stockQty: stock,
        minStock: 4,
        active: true,
        type: product.type,
        trackStock: true,
      };
      if (refresh) {
        // No refresh o produto e seu saldo são estado preservado. Um upsert com
        // update vazio ainda pode tocar `updatedAt`; portanto, só criamos o
        // fixture quando ele realmente não existe.
        const existing = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true },
        });
        if (!existing) {
          await tx.product.create({ data: { id: productId, ...data } });
        }
      } else {
        await tx.product.upsert({
          where: { id: productId },
          create: { id: productId, ...data },
          // `stockQty` é propriedade da cadeia canônica de movimentos. Uma
          // reexecução do seed não pode repor o saldo inicial e apagar o efeito
          // das vendas já registradas; o financeiro reconcilia a cadeia depois.
          update: { ...data, stockQty: undefined },
        });
      }
    }
  }

  // ── 3. Agenda (apaga e recria apenas linhas do fixture) ───────────────────
  const allPlans = planDemoAppointments({
    business,
    today,
    services,
    clientCount: clients.length,
    now,
  });
  // No refresh, o passado é intocável: somente o dia corrente e o futuro
  // volátil são recriados. No seed normal, a janela completa é reconstruída.
  const plans = refresh
    ? allPlans.filter(plan => plan.civilDate >= today)
    : allPlans;
  const appointmentIds = fixtureAppointmentIds(business, today);
  const futureFixtureRows = refresh
    ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM appointments
        WHERE "barbershopId" = ${shopId}::uuid
          AND id::text LIKE ${`${DEMO_DENSITY_NAMESPACES.appointment}-%`}
          AND date >= ${civilDateToUtcDate(today)}
      `
    : [];
  const idsToRecreate = refresh
    ? [...new Set(futureFixtureRows.map((row: { id: string }) => row.id))]
    : appointmentIds;

  // Somente estados operacionais voláteis são recriados. Concluídos,
  // cancelados, faltas, ledger, eventos CRM, pagamentos e avaliações são
  // estados terminais e permanecem imutáveis — inclusive no refresh.
  await tx.queueItem.deleteMany({
    where: {
      barbershopId: shopId,
      appointmentId: { in: idsToRecreate },
      status: { in: ["WAITING", "IN_CHAIR"] },
    },
  });
  await tx.clientProcedureRecord.deleteMany({
    where: { barbershopId: shopId, appointmentId: { in: idsToRecreate } },
  });
  await tx.appointment.deleteMany({
    where: {
      id: { in: idsToRecreate },
      status: { in: ["CONFIRMED", "CHECKED_IN"] },
    },
  });

  // Particularidades por segmento (pets/veículos/casos) — necessárias antes
  // da agenda para vincular petId/caseId aos atendimentos.
  const petsByClient = new Map<string, { id: string; name: string }>();
  const casesByClient = new Map<string, { id: string; nickname: string; practiceArea: string }>();
  const vehiclesByClient = new Map<string, { id: string; plate: string; model: string; color: string }>();

  if (segment === "PETSHOP") {
    const species = ["DOG", "CAT", "OTHER"] as const;
    const sizes = ["SMALL", "MEDIUM", "LARGE"] as const;
    for (const client of clients) {
      if (client.index % 3 !== 0) continue;
      const rng = demoShowcaseRng(`demo-showcase:pet:${business.id}:${client.index}`);
      const petId = densityUuid(DEMO_DENSITY_NAMESPACES.pet, `pet:${business.id}:${client.index}`);
      const name = pickOne(rng, PET_NAMES);
      const speciesValue = pickWeighted(rng, [["DOG", 0.6], ["CAT", 0.3], ["OTHER", 0.1]] as const);
      const breed =
        speciesValue === "DOG" ? pickOne(rng, DOG_BREEDS) : speciesValue === "CAT" ? pickOne(rng, CAT_BREEDS) : "SRD";
      const data = {
        barbershopId: shopId,
        clientId: client.id,
        name,
        species: speciesValue,
        breed,
        size: pickOne(rng, sizes),
        coat: pickOne(rng, ["curta", "longa", "sem pelo", "ondulada"]),
        notes: "Pet fictício do showcase de demonstração.",
        active: true,
      };
      await tx.clientPet.upsert({ where: { id: petId }, create: { id: petId, ...data }, update: data });
      petsByClient.set(client.id, { id: petId, name });
      summary.petCount += 1;
    }
  }

  if (segment === "CAR_WASH" || segment === "AUTO_REPAIR") {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const client of clients) {
      if (client.index % 3 !== 0) continue;
      const rng = demoShowcaseRng(`demo-showcase:vehicle:${business.id}:${client.index}`);
      const vehicleId = densityUuid(DEMO_DENSITY_NAMESPACES.vehicle, `vehicle:${business.id}:${client.index}`);
      const plate = `${letters[Math.floor(rng() * 26)]}${letters[Math.floor(rng() * 26)]}${letters[Math.floor(rng() * 26)]}${Math.floor(rng() * 10)}${letters[Math.floor(rng() * 26)]}${Math.floor(rng() * 10)}${Math.floor(rng() * 10)}`;
      const model = pickOne(rng, VEHICLE_MODELS);
      const color = pickOne(rng, VEHICLE_COLORS);
      const data = {
        barbershopId: shopId,
        clientId: client.id,
        plate,
        vehicleModel: model,
        color,
        notes: "Veículo fictício do showcase de demonstração.",
        active: true,
      };
      await tx.clientVehicle.upsert({ where: { id: vehicleId }, create: { id: vehicleId, ...data }, update: data });
      vehiclesByClient.set(client.id, { id: vehicleId, plate, model, color });
      summary.vehicleCount += 1;
    }
  }

  if (segment === "LAW_FIRM") {
    const statuses = ["LEAD", "ACTIVE", "AWAITING_CLIENT", "IN_COURT", "SUSPENDED", "CLOSED", "ARCHIVED"] as const;
    const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
    for (const client of clients) {
      if (client.index % 2 !== 0) continue;
      const rng = demoShowcaseRng(`demo-showcase:case:${business.id}:${client.index}`);
      const caseId = densityUuid(DEMO_DENSITY_NAMESPACES.case, `case:${business.id}:${client.index}`);
      const nickname = pickOne(rng, CASE_NICKNAMES);
      const practiceArea = pickOne(rng, PRACTICE_AREAS);
      const year = 2024 + Math.floor(rng() * 2);
      const caseNumber = `${String(Math.floor(rng() * 1_000_000_000_000)).padStart(12, "0")}-${String(Math.floor(rng() * 100)).padStart(2, "0")}.${year}.${Math.floor(rng() * 2) + 1}.${String(Math.floor(rng() * 100)).padStart(2, "0")}.${String(Math.floor(rng() * 10000)).padStart(4, "0")}`;
      const openedAt = new Date(now.getTime() - randomInt(rng, 10, 420) * 24 * 60 * 60 * 1000);
      const status = pickWeighted(rng, statuses.map(value => [value, 1] as [string, number])) as (typeof statuses)[number];
      const data = {
        barbershopId: shopId,
        clientId: client.id,
        nickname,
        practiceArea,
        caseNumber,
        notes: "Caso fictício do showcase de demonstração (uso interno).",
        active: status !== "ARCHIVED",
        status,
        priority: pickOne(rng, priorities),
        title: nickname,
        courtName: pickOne(rng, COURT_NAMES),
        opponent: pickOne(rng, CASE_OPPONENTS),
        claimedAmount: new Prisma.Decimal(round2(5000 + rng() * 95_000)),
        responsibleStaffId: staff[client.index % staff.length]?.id ?? null,
        openedAt,
        shareWithClient: false,
      };
      await tx.clientCase.upsert({ where: { id: caseId }, create: { id: caseId, ...data }, update: data });
      casesByClient.set(client.id, { id: caseId, nickname, practiceArea });
      summary.caseCount += 1;
    }
  }

  // ── 3b. Persiste a agenda ────────────────────────────────────────────────
  const appointmentRows: any[] = [];
  const commissionRows: any[] = [];
  const ledgerRows: any[] = [];
  const statusCounts: Record<string, number> = {};
  const completedByClient = new Map<string, number>();
  const totalByClient = new Map<string, number>();
  const lastVisitByClient = new Map<string, Date>();
  const cancelledByClient = new Map<string, number>();
  const noShowByClient = new Map<string, number>();
  const completedPlans: Array<{ plan: DemoAppointmentPlan; appointmentId: string; clientId: string; serviceId: string; staffId: string }> = [];

  if (refresh) {
    const preservedRows = await tx.appointment.findMany({
      where: {
        barbershopId: shopId,
        id: { notIn: idsToRecreate },
        clientId: { not: null },
      },
      select: {
        clientId: true,
        status: true,
        completedAt: true,
      },
    });
    for (const row of preservedRows) {
      if (!row.clientId) continue;
      totalByClient.set(row.clientId, (totalByClient.get(row.clientId) ?? 0) + 1);
      if (row.status === "COMPLETED" && row.completedAt) {
        completedByClient.set(row.clientId, (completedByClient.get(row.clientId) ?? 0) + 1);
        const previousVisit = lastVisitByClient.get(row.clientId);
        if (!previousVisit || row.completedAt > previousVisit) {
          lastVisitByClient.set(row.clientId, row.completedAt);
        }
      } else if (row.status === "CANCELLED") {
        cancelledByClient.set(row.clientId, (cancelledByClient.get(row.clientId) ?? 0) + 1);
      } else if (row.status === "NO_SHOW") {
        noShowByClient.set(row.clientId, (noShowByClient.get(row.clientId) ?? 0) + 1);
      }
    }
  }

  for (const plan of plans) {
    const appointmentId = demoAppointmentId(business, plan);
    const service = services[plan.serviceIndex];
    const client = clients[plan.clientIndex % clients.length];
    const staffMember = staff[plan.staffIndex % staff.length];
    const pet = petsByClient.get(client.id);
    const caseRecord = casesByClient.get(client.id);

    statusCounts[plan.status] = (statusCounts[plan.status] ?? 0) + 1;
    totalByClient.set(client.id, (totalByClient.get(client.id) ?? 0) + 1);
    appointmentRows.push({
      id: appointmentId,
      barbershopId: shopId,
      serviceId: service.id,
      staffId: staffMember.id,
      clientId: client.id,
      customerName: client.name,
      whatsapp: client.whatsapp,
      date: civilDateToUtcDate(plan.civilDate),
      time: plan.time,
      status: plan.status,
      source: plan.source,
      modality: plan.modality,
      meetingLink:
        plan.modality === "VIDEO"
          ? `https://meet.google.com/demo-${demoShowcaseFingerprint(appointmentId).slice(0, 12)}`
          : null,
      createdAt: plan.createdAt,
      finalPrice: plan.finalPrice,
      paymentMethod: plan.paymentMethod,
      completedAt: plan.completedAt,
      completedBy: plan.status === "COMPLETED" ? staffMember.id : null,
      canceledAt: plan.canceledAt,
      cancellationSource: plan.cancellationSource,
      cancellationReason: plan.cancellationReason,
      noShowMarkedAt: plan.noShowMarkedAt,
      petId: pet?.id ?? null,
      petName: pet?.name ?? null,
      caseId: caseRecord?.id ?? null,
      caseName: caseRecord?.nickname ?? null,
      practiceArea: caseRecord?.practiceArea ?? (segment === "LAW_FIRM" ? pickOne(demoShowcaseRng(appointmentId), PRACTICE_AREAS) : null),
    });

    if (plan.status === "COMPLETED" && plan.finalPrice !== null && plan.completedAt) {
      summary.completedCount += 1;
      completedByClient.set(client.id, (completedByClient.get(client.id) ?? 0) + 1);
      const previousVisit = lastVisitByClient.get(client.id);
      if (!previousVisit || plan.completedAt > previousVisit) lastVisitByClient.set(client.id, plan.completedAt);
      completedPlans.push({
        plan,
        appointmentId,
        clientId: client.id,
        serviceId: service.id,
        staffId: staffMember.id,
      });

      const commissionPercent = service.commissionPercent;
      commissionRows.push({
        id: densityUuid(DEMO_DENSITY_NAMESPACES.commission, `commission:${appointmentId}`),
        barbershopId: shopId,
        appointmentId,
        serviceId: service.id,
        professionalId: staffMember.id,
        percentage: commissionPercent,
        amount: round2((plan.finalPrice * commissionPercent) / 100),
        createdAt: plan.completedAt,
      });

      ledgerRows.push({
        idempotencyKey: `${shopId}:APPOINTMENT:${appointmentId}:SERVICE_SALE`,
        barbershopId: shopId,
        type: "SERVICE_SALE",
        amount: plan.finalPrice,
        paymentMethod: normalizeLedgerMethod(plan.paymentMethod ?? "other"),
        description: `Atendimento: ${service.name}`,
        sourceType: "APPOINTMENT",
        sourceId: appointmentId,
        occurredAt: plan.completedAt,
        professionalId: staffMember.id,
        clientId: client.id,
        createdBy: ownerId,
      });
    }
    if (plan.status === "CANCELLED") {
      cancelledByClient.set(client.id, (cancelledByClient.get(client.id) ?? 0) + 1);
    }
    if (plan.status === "NO_SHOW") {
      noShowByClient.set(client.id, (noShowByClient.get(client.id) ?? 0) + 1);
    }
  }

  for (const rows of chunk(appointmentRows, 400)) {
    await tx.appointment.createMany({ data: rows, skipDuplicates: true });
  }
  for (const rows of chunk(commissionRows, 400)) {
    await tx.commissionEntry.createMany({ data: rows, skipDuplicates: true });
  }
  summary.appointmentCount = appointmentRows.length;
  summary.appointmentsByStatus = statusCounts;
  summary.commissionCount = commissionRows.length;

  // Ledger do ledger do caixa (SERVIÇO) — normaliza método como o app faz.
  const normalizedLedgerRows = ledgerRows.map(row => ({
    ...row,
    paymentMethod: normalizeLedgerMethod(row.paymentMethod),
  }));
  for (const rows of chunk(normalizedLedgerRows, 400)) {
    await tx.cashMovement.createMany({ data: rows, skipDuplicates: true });
  }
  summary.ledgerCount = normalizedLedgerRows.length;

  // ── 3c. Fila concluída para CRM, reativação e metas de receita ──────────
  const completedForQueue = await tx.appointment.findMany({
    where: {
      barbershopId: shopId,
      status: "COMPLETED",
      clientId: { not: null },
      completedAt: { not: null },
      finalPrice: { not: null },
    },
    select: {
      id: true,
      clientId: true,
      serviceId: true,
      staffId: true,
      finalPrice: true,
      paymentMethod: true,
      completedAt: true,
      service: { select: { avgTimeMinutes: true } },
    },
    orderBy: { completedAt: "asc" },
  });
  const selectedQueueAppointments = new Map<string, (typeof completedForQueue)[number]>();
  const byClient = new Map<string, Array<(typeof completedForQueue)[number]>>();
  for (const appointment of completedForQueue) {
    if (!appointment.clientId) continue;
    const rows = byClient.get(appointment.clientId) ?? [];
    rows.push(appointment);
    byClient.set(appointment.clientId, rows);
  }
  for (const rows of byClient.values()) {
    // A visita antiga + a mais recente forma clientes recorrentes/reativados;
    // clientes sem segunda visita continuam aparecendo como inativos no CRM.
    const selected = new Set([rows[0]?.id, rows.at(-1)?.id]);
    for (const id of selected) {
      const appointment = rows.find(row => row.id === id);
      if (appointment) selectedQueueAppointments.set(appointment.id, appointment);
    }
  }
  // Garante progresso recente em cada meta REVENUE por profissional.
  for (const member of staff) {
    const candidates = completedForQueue
      .filter(
        (row: any) =>
          row.staffId === member.id &&
          row.completedAt &&
          row.completedAt >= civilDateToUtcDate(startOfCivilMonth(today)),
      )
      .slice(-3);
    for (const appointment of candidates) selectedQueueAppointments.set(appointment.id, appointment);
  }
  const clientById = new Map(clients.map(client => [client.id, client]));
  for (const appointment of selectedQueueAppointments.values()) {
    if (!appointment.clientId || !appointment.completedAt || !appointment.staffId) continue;
    const client = clientById.get(appointment.clientId);
    const duration = appointment.service.avgTimeMinutes;
    const queueId = densityUuid(
      DEMO_DENSITY_NAMESPACES.completedQueueItem,
      `completed-queue:${business.id}:${appointment.id}`,
    );
    const data = {
      barbershopId: shopId,
      serviceId: appointment.serviceId,
      customerId: densityUuid(
        DEMO_DENSITY_NAMESPACES.completedQueueItem,
        `completed-customer:${business.id}:${appointment.id}`,
      ),
      customerName: client?.name ?? "Cliente",
      whatsapp: client?.whatsapp ?? "",
      joinedAt: new Date(appointment.completedAt.getTime() - (duration + 20) * 60_000),
      calledAt: new Date(appointment.completedAt.getTime() - duration * 60_000),
      status: "COMPLETED" as const,
      estimatedStartAt: new Date(appointment.completedAt.getTime() - duration * 60_000),
      addedByStaff: true,
      completedAt: appointment.completedAt,
      completedBy: appointment.staffId,
      finalPrice: appointment.finalPrice ?? 0,
      paymentMethod: appointment.paymentMethod ?? "pix",
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      activeIdentityKey: `demo-showcase:${business.id}:${appointment.id}`,
    };
    await tx.queueItem.upsert({ where: { id: queueId }, create: { id: queueId, ...data }, update: data });
    summary.completedQueueCount += 1;
  }

  // ── 4. Despesas fixas + variáveis (6 meses) com ledger ───────────────────
  const monthStart = startOfCivilMonth(today);
  const months: string[] = [];
  for (let back = 5; back >= 0; back -= 1) {
    const [year, month] = monthStart.split("-").map(Number);
    const base = new Date(Date.UTC(year, month - 1 - back, 1));
    months.push(base.toISOString().slice(0, 10));
  }
  const expenseSpecs: Array<{ title: string; type: "FIXED" | "VARIABLE"; recurrence: "MONTHLY" | "ONCE"; amount: number; paidDay: number }> = [
    { title: "Aluguel", type: "FIXED", recurrence: "MONTHLY", amount: 2600 + (parseInt(demoShowcaseFingerprint(`${business.id}:rent`).slice(0, 3), 16) % 9) * 100, paidDay: 5 },
    { title: "Salários", type: "FIXED", recurrence: "MONTHLY", amount: 3100 + (parseInt(demoShowcaseFingerprint(`${business.id}: payroll`).slice(0, 3), 16) % 7) * 150, paidDay: 7 },
    { title: "Energia e água", type: "VARIABLE", recurrence: "MONTHLY", amount: 320 + (parseInt(demoShowcaseFingerprint(`${business.id}:utilities`).slice(0, 3), 16) % 16) * 20, paidDay: 12 },
  ];
  if (!advertisingRestricted) {
    expenseSpecs.push({
      title: "Marketing",
      type: "VARIABLE",
      recurrence: "MONTHLY",
      amount: 240 + (parseInt(demoShowcaseFingerprint(`${business.id}:marketing`).slice(0, 3), 16) % 12) * 30,
      paidDay: 15,
    });
  }

  const expenseLedgerRows: any[] = [];
  for (const [monthIndex, month] of months.entries()) {
    const [year, monthNum] = month.split("-").map(Number);
    const isCurrentMonth = month === monthStart;
    const dayOfMonth = Number(today.slice(8, 10));
    for (const [specIndex, spec] of expenseSpecs.entries()) {
      const isLastMonth = monthIndex === months.length - 1;
      if (isLastMonth && spec.recurrence === "ONCE") continue;
      const expenseId = densityUuid(
        DEMO_DENSITY_NAMESPACES.expense,
        `expense:${business.id}:${month}:${spec.title}`,
      );
      const paidDay = Math.min(spec.paidDay, 28);
      const paidDate = `${year}-${String(monthNum).padStart(2, "0")}-${String(paidDay).padStart(2, "0")}`;
      const paid = !isCurrentMonth || dayOfMonth >= paidDay;
      const amount = spec.amount + (monthIndex % 3) * 15;
      const data = {
        barbershopId: shopId,
        title: spec.title,
        description: null,
        amount,
        type: spec.type,
        recurrence: spec.recurrence,
        referenceDate: civilDateToUtcDate(month),
        paidAt: paid ? civilDateMinutesToUtc(paidDate, 10 * 60 + specIndex * 30) : null,
        dueDate: civilDateToUtcDate(paidDate),
        paymentMethod: specIndex % 2 === 0 ? "PIX" : "DINHEIRO",
        supplierName: spec.title === "Aluguel" ? "Imobiliária Demonstração" : null,
        notes: "Despesa fictícia do showcase de demonstração.",
        createdById: ownerId,
        updatedById: ownerId,
      };
      await tx.expense.upsert({ where: { id: expenseId }, create: { id: expenseId, ...data }, update: data });
      summary.expenseCount += 1;
      if (data.paidAt) {
        expenseLedgerRows.push({
          idempotencyKey: `${shopId}:EXPENSE:${expenseId}:EXPENSE`,
          barbershopId: shopId,
          type: "EXPENSE",
          amount,
          paymentMethod: specIndex % 2 === 0 ? "PIX" : "CASH",
          description: `Despesa: ${spec.title}`,
          sourceType: "EXPENSE",
          sourceId: expenseId,
          occurredAt: data.paidAt,
          professionalId: null,
          clientId: null,
          createdBy: ownerId,
        });
      }
    }
  }
  for (const row of expenseLedgerRows) {
    await tx.cashMovement.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: row,
      // Ledger financeiro é imutável: a primeira gravação é a verdade do
      // caixa. Reprocessar a despesa não reescreve valor, método ou data.
      update: {},
    });
  }
  summary.ledgerCount += expenseLedgerRows.length;

  // ── 5. Pacotes (venda no mês corrente pesa no faturamento) ────────────────
  const packageLedgerRows: any[] = [];
  if (services.length > 0) {
    const packageSpecs = [
      { sessions: 5, discount: 0.9, suffix: "5 sessões" },
      { sessions: 10, discount: 0.85, suffix: "10 sessões" },
    ];
    // Pacotes empacotam os serviços mais caros (ticket alto; o mês corrente
    // concentra 8 das 10 compras e reforça a tendência de alta da receita).
    const rankedServices = [...services].sort((a, b) => b.price - a.price);
    const rankedSlot = (packageIndex: number) =>
      rankedServices[packageIndex % Math.min(2, rankedServices.length)];
    const packageIds: string[] = [];
    for (const [index, spec] of packageSpecs.entries()) {
      const service = rankedSlot(index);
      const packageId = densityUuid(
        DEMO_DENSITY_NAMESPACES.servicePackage,
        `service-package:${business.id}:${spec.sessions}`,
      );
      packageIds.push(packageId);
      const data = {
        barbershopId: shopId,
        serviceId: service.id,
        name: `Pacote ${spec.suffix} — ${service.name}`,
        sessionCount: spec.sessions,
        price: Math.round(service.price * spec.sessions * spec.discount * 100) / 100,
        validityDays: 150,
        active: true,
      };
      if (refresh) {
        // Pacotes são históricos: no refresh não são reescritos nem mesmo
        // tocados no carimbo `updatedAt`.
        const existing = await tx.servicePackage.findUnique({
          where: { id: packageId },
          select: { id: true },
        });
        if (!existing) {
          await tx.servicePackage.create({ data: { id: packageId, ...data } });
        }
      } else {
        await tx.servicePackage.upsert({
          where: { id: packageId },
          create: { id: packageId, ...data },
          update: data,
        });
      }
      summary.packageCount += 1;
    }

    const rng = demoShowcaseRng(`demo-showcase:packages:${business.id}`);
    const purchaseCount = 10;
    for (let index = 0; index < purchaseCount; index += 1) {
      const packageIndex = index % packageIds.length;
      const spec = packageSpecs[packageIndex];
      const service = rankedSlot(packageIndex);
      const client = clients[(index * 5 + 3) % clients.length];
      // 8 de 10 compras caem no mês corrente (reforça a tendência de alta).
      const purchaseDay =
        index < 8
          ? addDaysToCivilDate(monthStart, Math.min(24, randomInt(rng, 0, Math.max(0, Number(today.slice(8, 10)) - 2))))
          : addDaysToCivilDate(monthStart, -randomInt(rng, 12, 45));
      const purchaseMonth = purchaseDay.slice(0, 7);
      const clientPackageId = densityUuid(
        DEMO_DENSITY_NAMESPACES.clientPackage,
        `client-package:${business.id}:${purchaseMonth}:${index}`,
      );
      const purchasedAt = civilDateMinutesToUtc(purchaseDay, 11 * 60 + index * 35);
      const totalSessions = spec.sessions;
      const remaining = index % 4 === 3 ? 0 : randomInt(rng, 1, totalSessions - 1);
      const status = remaining === 0 ? "DEPLETED" : purchaseDay < addDaysToCivilDate(monthStart, -120) ? "EXPIRED" : "ACTIVE";
      const paymentMethod = pickOne<"cash" | "pix" | "card" | "other">(rng, ["pix", "card", "cash", "pix"]);
      const data = {
        barbershopId: shopId,
        clientId: client.id,
        packageId: packageIds[packageIndex],
        serviceId: service.id,
        totalSessions,
        remainingSessions: remaining,
        pricePaid: Math.round(service.price * totalSessions * spec.discount * 100) / 100,
        paymentMethod,
        status,
        purchasedAt,
        expiresAt: civilDateToUtcDate(addDaysToCivilDate(purchaseDay, 150)),
        soldById: staff[index % staff.length].id,
      };
      await tx.clientPackage.upsert({
        where: { id: clientPackageId },
        create: { id: clientPackageId, ...data },
        // Compra e consumo de pacote são históricos; não reescreve o que já
        // foi vendido ou debitado.
        update: {},
      });
      summary.packageCount += 1;
      packageLedgerRows.push({
        idempotencyKey: `${shopId}:PACKAGE_SALE:${clientPackageId}:PACKAGE_SALE`,
        barbershopId: shopId,
        type: "PACKAGE_SALE",
        amount: data.pricePaid,
        paymentMethod: normalizeLedgerMethod(paymentMethod),
        description: "Venda de pacote",
        sourceType: "PACKAGE_SALE",
        sourceId: clientPackageId,
        occurredAt: purchasedAt,
        professionalId: data.soldById,
        clientId: client.id,
        createdBy: ownerId,
      });
    }
  }
  for (const rows of chunk(packageLedgerRows, 400)) {
    await tx.cashMovement.createMany({ data: rows, skipDuplicates: true });
  }
  summary.ledgerCount += packageLedgerRows.length;

  // ── 6. Avaliações dos atendimentos concluídos ────────────────────────────
  if (advertisingRestricted) {
    // Remove somente fixtures antigos deste showcase. Dados criados fora dos
    // UUIDs determinísticos não são tocados.
    await tx.$executeRaw`
      DELETE FROM client_reviews
      WHERE "barbershopId" = ${shopId}::uuid
        AND id::text LIKE ${`${DEMO_DENSITY_NAMESPACES.review}-%`}
    `;
    await tx.$executeRaw`
      DELETE FROM review_invitations
      WHERE "barbershopId" = ${shopId}::uuid
        AND id::text LIKE ${`${DEMO_FINANCIAL_NAMESPACES.reviewInvitation}-%`}
    `;
  }
  const reviewRows: any[] = [];
  const recentCompleted = completedPlans.filter(
    item => item.plan.completedAt && now.getTime() - item.plan.completedAt.getTime() <= 45 * 24 * 60 * 60 * 1000,
  );
  // Segmentos com publicidade restrita (ex.: advocacia) não recebem
  // avaliações nem convites de reputação.
  for (const item of advertisingRestricted ? [] : recentCompleted) {
    const rng = demoShowcaseRng(`demo-showcase:review:${item.appointmentId}`);
    if (rng() >= 0.4) continue;
    const rating = pickWeighted(rng, [[5, 0.45], [4, 0.4], [3, 0.15]] as Array<[number, number]>);
    const comment = pickOne(rng, REVIEW_COMMENTS);
    const createdAt = new Date(Math.min(item.plan.completedAt!.getTime() + randomInt(rng, 4, 40) * 3600_000, now.getTime()));
    const responded = rng() < 0.35;
    reviewRows.push({
      id: densityUuid(DEMO_DENSITY_NAMESPACES.review, `review:${item.appointmentId}`),
      barbershopId: shopId,
      appointmentId: item.appointmentId,
      clientId: item.clientId,
      staffId: item.staffId,
      rating,
      comment,
      response: responded ? pickOne(rng, REVIEW_RESPONSES) : null,
      status: "PUBLISHED",
      respondedAt: responded ? new Date(createdAt.getTime() + 20 * 3600_000) : null,
      createdAt,
    });
  }
  for (const rows of chunk(reviewRows, 400)) {
    await tx.clientReview.createMany({ data: rows, skipDuplicates: true });
  }
  summary.reviewCount = reviewRows.length;

  // ── 7. Fidelidade (ignorado em segmentos sem divulgação) ─────────────────
  if (!advertisingRestricted) {
    for (const client of clients) {
      const visits = completedByClient.get(client.id) ?? 0;
      if (visits <= 0) continue;
      const accountId = `${shopId}:${client.id}`;
      const account = await tx.loyaltyAccount.upsert({
        where: { barbershopId_clientId: { barbershopId: shopId, clientId: client.id } },
        create: { barbershopId: shopId, clientId: client.id, totalVisits: visits, rewardCount: 0 },
        update: { totalVisits: visits },
      });
      summary.loyaltyAccountCount += 1;
      const earned = Math.min(visits, 12);
      const redeemed = Math.min(Math.floor(visits / 10), 2);
      const entries = [];
      for (let visit = 1; visit <= earned; visit += 1) {
        entries.push({
          id: densityUuid(DEMO_DENSITY_NAMESPACES.loyaltyEntry, `loyalty:${client.id}:visit:${visit}`),
          barbershopId: shopId,
          accountId: account.id,
          type: "VISIT_EARNED",
          description: "Visita registrada",
          idempotencyKey: `${shopId}:loyalty:${client.id}:visit:${visit}`,
        });
      }
      for (let reward = 1; reward <= redeemed; reward += 1) {
        entries.push({
          id: densityUuid(DEMO_DENSITY_NAMESPACES.loyaltyEntry, `loyalty:${client.id}:reward:${reward}`),
          barbershopId: shopId,
          accountId: account.id,
          type: "REWARD_REDEEMED",
          description: "Cortesia resgatada",
          idempotencyKey: `${shopId}:loyalty:${client.id}:reward:${reward}`,
        });
      }
      await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: { rewardCount: redeemed },
      });
      if (entries.length > 0) await tx.loyaltyLedgerEntry.createMany({ data: entries, skipDuplicates: true });
    }
  }

  // ── 8. Vouchers + usos ───────────────────────────────────────────────────
  if (!advertisingRestricted) {
    const voucherId = densityUuid(DEMO_DENSITY_NAMESPACES.voucher, `voucher:${business.id}:boas-vindas`);
    const voucherRng = demoShowcaseRng(`demo-showcase:voucher:${business.id}`);
    const usedCount = randomInt(voucherRng, 3, 6);
    const voucherData = {
      barbershopId: shopId,
      code: "BOASVINDAS10",
      description: "10% de desconto na primeira visita",
      type: "PERCENT" as const,
      value: 10,
      maxUses: 50,
      usedCount,
      perClientLimit: 1,
      startAt: civilDateToUtcDate(addDaysToCivilDate(today, -60)),
      endAt: civilDateToUtcDate(addDaysToCivilDate(today, 60)),
      isActive: true,
    };
    await tx.voucher.upsert({
      where: { id: voucherId },
      create: { id: voucherId, ...voucherData },
      update: {},
    });
    summary.voucherCount = 1;
    // Usos de voucher são históricos e não podem ser duplicados/revertidos
    // por uma nova execução do fixture.
    const usageRows = [];
    for (let index = 0; index < usedCount; index += 1) {
      const client = clients[(index * 7 + 2) % clients.length];
      usageRows.push({
        id: densityUuid(DEMO_DENSITY_NAMESPACES.voucherUsage, `voucher-usage:${business.id}:${index}`),
        voucherId,
        clientId: client.id,
        discountAmount: 10,
        usedAt: civilDateMinutesToUtc(addDaysToCivilDate(today, -randomInt(voucherRng, 3, 55)), 14 * 60),
      });
    }
    await tx.voucherUsage.createMany({ data: usageRows, skipDuplicates: true });
  }

  // ── 9. Fila (segmentos com fila) ─────────────────────────────────────────
  if (refresh) {
    // Itens de espera são voláteis; a fila concluída/histórica permanece.
    await tx.$executeRaw`
      DELETE FROM queue
      WHERE "barbershopId" = ${shopId}::uuid
        AND id::text LIKE ${`${DEMO_DENSITY_NAMESPACES.queueItem}-%`}
        AND status = 'WAITING'
    `;
  }
  if (config.suggestedOperationMode === "QUEUE_ONLY" || config.suggestedOperationMode === "HYBRID") {
    const queueRng = demoShowcaseRng(`demo-showcase:queue:${business.id}:${today}`);
    const queueCount = randomInt(queueRng, 2, 4);
    for (let index = 0; index < queueCount; index += 1) {
      const queueId = densityUuid(DEMO_DENSITY_NAMESPACES.queueItem, `queue:${business.id}:${today}:${index}`);
      const client = clients[(index * 4 + 1) % clients.length];
      const service = services[Math.floor(queueRng() * services.length) % services.length];
      const joinedAt = new Date(now.getTime() - (8 + index * 17 + Math.floor(queueRng() * 25)) * 60_000);
      const pet = petsByClient.get(client.id);
      const data = {
        barbershopId: shopId,
        serviceId: service.id,
        customerId: densityUuid(DEMO_DENSITY_NAMESPACES.queueItem, `queue-customer:${business.id}:${today}:${index}`),
        customerName: client.name,
        whatsapp: client.whatsapp,
        joinedAt,
        status: "WAITING" as const,
        estimatedStartAt: new Date(joinedAt.getTime() + (20 + index * 10) * 60_000),
        addedByStaff: index % 2 === 0,
        clientId: client.id,
        petId: pet?.id ?? null,
        petName: pet?.name ?? null,
      };
      await tx.queueItem.upsert({ where: { id: queueId }, create: { id: queueId, ...data }, update: data });
      summary.queueCount += 1;
    }
  }

  // ── 10. Tráfego da página pública (últimos 30 dias) ──────────────────────
  const trafficTarget = `b:${shopId}`;
  await tx.salonTrafficDaily.deleteMany({ where: { target: trafficTarget } });
  await tx.salonTrafficHourly.deleteMany({ where: { target: trafficTarget } });
  await tx.salonTrafficSectionDaily.deleteMany({ where: { target: trafficTarget } });
  const trafficDailyRows: any[] = [];
  const trafficHourlyRows: any[] = [];
  const trafficSectionRows: any[] = [];
  const hourWeights = [3, 5, 7, 9, 10, 9, 7, 6, 7, 9, 9, 7, 4]; // 08..20
  const sectionSpecs: Array<[string, number]> = [
    ["profile", 40],
    ["appointments", 30],
    ["queue", 15],
    ["products", 10],
    ["other", 5],
  ];
  for (let dayOffset = -29; dayOffset <= 0; dayOffset += 1) {
    const civilDate = addDaysToCivilDate(today, dayOffset);
    const rng = demoShowcaseRng(`demo-showcase:traffic:${business.id}:${civilDate}`);
    const weekday = civilDateWeekday(civilDate);
    const growth = (dayOffset + 29) / 29; // 0 (antigo) → 1 (hoje)
    const base = (14 + growth * 26) * (weekday === 0 || weekday === 6 ? 1.3 : 1);
    const visits = Math.max(4, Math.round(base * (0.75 + rng() * 0.5)));
    const visitors = Math.max(1, Math.min(visits, Math.round(visits * (0.55 + rng() * 0.25))));
    const day = civilDateToUtcDate(civilDate);
    trafficDailyRows.push({ day, target: trafficTarget, visits, visitors });

    const hourlyVisits = distribute(visits, hourWeights);
    const hourlyVisitors = distribute(visitors, hourWeights);
    for (const [hourIndex, weight] of hourWeights.entries()) {
      if (hourlyVisits[hourIndex] === 0 && hourlyVisitors[hourIndex] === 0) continue;
      trafficHourlyRows.push({
        day,
        hour: hourIndex + 8,
        target: trafficTarget,
        visits: hourlyVisits[hourIndex],
        visitors: hourlyVisitors[hourIndex],
      });
    }
    const sectionVisits = distribute(visits, sectionSpecs.map(([, weight]) => weight));
    const sectionVisitors = distribute(visitors, sectionSpecs.map(([, weight]) => weight));
    for (const [sectionIndex, [section]] of sectionSpecs.entries()) {
      trafficSectionRows.push({
        day,
        target: trafficTarget,
        section,
        visits: sectionVisits[sectionIndex],
        visitors: sectionVisitors[sectionIndex],
      });
    }
  }
  await tx.salonTrafficDaily.createMany({ data: trafficDailyRows, skipDuplicates: true });
  await tx.salonTrafficHourly.createMany({ data: trafficHourlyRows, skipDuplicates: true });
  await tx.salonTrafficSectionDaily.createMany({ data: trafficSectionRows, skipDuplicates: true });
  summary.trafficVisits30d = trafficDailyRows.reduce((sum, row) => sum + row.visits, 0);

  // ── 11. Registros de procedimento (segmentos de saúde) ────────────────────
  if (segment === "PHYSIOTHERAPY" || segment === "NUTRITION" || segment === "PSYCHOTHERAPY") {
    const procedureRows: any[] = [];
    for (const item of completedPlans) {
      const rng = demoShowcaseRng(`demo-showcase:procedure:${item.appointmentId}`);
      if (rng() >= 0.18) continue;
      procedureRows.push({
        id: densityUuid(DEMO_DENSITY_NAMESPACES.procedure, `procedure:${item.appointmentId}`),
        barbershopId: shopId,
        clientId: item.clientId,
        professionalName: staff.find(member => member.id === item.staffId)?.name ?? "Profissional",
        title: services.find(service => service.id === item.serviceId)?.name ?? "Sessão",
        formula: null,
        details: pickOne(rng, PROCEDURE_DETAILS),
        serviceName: services.find(service => service.id === item.serviceId)?.name ?? null,
        appointmentId: item.appointmentId,
        occurredAt: item.plan.completedAt,
      });
    }
    for (const rows of chunk(procedureRows, 400)) {
      await tx.clientProcedureRecord.createMany({ data: rows, skipDuplicates: true });
    }
    summary.procedureCount = procedureRows.length;
  }

  // ── 11b. Financeiro detalhado: varejo, estoque, fiado, CRM e caixa ───────
  summary.financial = await seedDemoShowcaseFinancial(tx, {
    business,
    shopId,
    ownerId,
    staff: staff.map(member => ({ id: member.id, name: member.name })),
    clients: clients.map(client => ({
      id: client.id,
      name: client.name,
      whatsapp: client.whatsapp,
    })),
    products: products.map((product, index) => ({
      id: densityUuid(DEMO_DENSITY_NAMESPACES.product, `product:${business.id}:${index}`),
      name: product.name,
      salePrice: product.salePrice,
      averageCost: round2(product.salePrice * 0.62),
      initialStock: demoProductInitialStock(business.id, index),
    })),
    today,
    now,
    refresh,
  });

  // ── 12. Metas mensais por profissional ───────────────────────────────────
  const [currentYear, currentMonth] = monthStart.split("-").map(Number);
  const currentMonthEnd = new Date(Date.UTC(currentYear, currentMonth, 0));
  const goalProfessionals = [
    { id: ownerId, name: input.ownerName ?? "Responsável" },
    ...staff,
  ];
  for (const member of goalProfessionals) {
    const goalSpecs: Array<{ metric: "APPOINTMENTS" | "REVENUE"; target: number }> = [
      {
        metric: "APPOINTMENTS",
        target: 70 + (parseInt(demoShowcaseFingerprint(`${business.id}:goal:${member.id}`).slice(0, 3), 16) % 6) * 10,
      },
      {
        metric: "REVENUE",
        target: 5_000 + (parseInt(demoShowcaseFingerprint(`${business.id}:revenue-goal:${member.id}`).slice(0, 3), 16) % 4) * 1_000,
      },
    ];
    for (const spec of goalSpecs) {
      // Compósito: (barbershopId, professionalId, metric, startDate).
      const where = {
        barbershopId_professionalId_metric_startDate: {
          barbershopId: shopId,
          professionalId: member.id,
          metric: spec.metric,
          startDate: civilDateToUtcDate(monthStart),
        },
      };
      const goalData = {
        barbershopId: shopId,
        professionalId: member.id,
        metric: spec.metric,
        target: new Prisma.Decimal(spec.target),
        period: "MONTHLY",
        startDate: civilDateToUtcDate(monthStart),
        endDate: currentMonthEnd,
      };
      await tx.professionalGoal.upsert({
        where,
        create: {
          ...goalData,
          id: densityUuid(
            DEMO_DENSITY_NAMESPACES.goal,
            `goal:${business.id}:${member.id}:${spec.metric}:${monthStart}`,
          ),
        },
        update: goalData,
      });
      summary.goalCount += 1;
    }
  }

  // ── 13. Agregados do CRM por cliente ─────────────────────────────────────
  // No refresh os clientes são preservados integralmente. Reescrever apenas
  // estes agregados mudaria o `updatedAt` de todos os clientes, mesmo sem
  // alterar seu conteúdo, e esconderia a preservação do cadastro.
  if (!refresh) {
    for (const client of clients) {
      const completed = completedByClient.get(client.id) ?? 0;
      const cancelled = cancelledByClient.get(client.id) ?? 0;
      const noShows = noShowByClient.get(client.id) ?? 0;
      const total = totalByClient.get(client.id) ?? 0;
      const attendanceBase = completed + noShows;
      await tx.salonClient.update({
        where: { id: client.id },
        data: {
          totalAppointments: total,
          totalCancellations: cancelled,
          totalNoShows: noShows,
          lastVisitAt: lastVisitByClient.get(client.id) ?? null,
          attendanceRate: attendanceBase > 0 ? Math.round((completed / attendanceBase) * 1000) / 10 : null,
          riskLevel: noShows >= 3 ? "MEDIUM" : "NONE",
        },
      });
    }
  }

  return summary;
}

/** Normaliza a forma de pagamento para o vocabulário canônico do ledger. */
function normalizeLedgerMethod(raw: string): string {
  const value = raw.trim().toUpperCase().replace(/-/g, "_");
  switch (value) {
    case "CASH":
    case "DINHEIRO":
      return "CASH";
    case "PIX":
      return "PIX";
    case "CREDIT_CARD":
    case "CARD":
      return "CREDIT_CARD";
    case "DEBIT_CARD":
      return "DEBIT_CARD";
    case "FIADO":
      return "FIADO";
    default:
      return "OTHER";
  }
}
