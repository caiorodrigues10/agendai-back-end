import type { BusinessSegment, OperationMode, TargetAudience } from "@prisma/client";

/**
 * Fonte única da verdade do que cada segmento significa no backend.
 *
 * O frontend tem um espelho em `src/shared/segments`. Como são pacotes
 * separados, a paridade é garantida por teste (`segmentParity.spec.ts`), não
 * por import compartilhado — se alguém mudar uma chave aqui sem mudar lá, o
 * teste reprova.
 */

/** Chaves de vocabulário. O teste de paridade compara este conjunto. */
export const SEGMENT_LABEL_KEYS = [
  "segmentLabel",
  "shopNoun",
  "shopNounPlural",
  "professional",
  "professionalPlural",
  "client",
  "clientPlural",
  "service",
  "servicePlural",
  "queue",
  "appointment",
  "staff",
] as const;

export type SegmentLabelKey = (typeof SEGMENT_LABEL_KEYS)[number];

export type SegmentCatalogCategory = { name: string; icon: string };

export type SegmentCatalogService = {
  name: string;
  price: number;
  avgTimeMinutes: number;
  icon: string;
  categoryName: string;
};

export type SegmentConfig = {
  segment: BusinessSegment;
  /** Oferecido no cadastro e no wizard do master. Os que não são first-class
   *  continuam válidos para quem já os escolheu, mas caem no fallback. */
  firstClass: boolean;
  labels: Record<SegmentLabelKey, string>;
  targetAudience: {
    /** Se o público faz sentido para o segmento (PETSHOP: não). */
    applies: boolean;
    /** Valor sugerido no cadastro. Barbearia sugere MASCULINO. */
    suggested: TargetAudience | null;
  };
  /** Modo sugerido na criação. Só aplicado quando o segmento é informado
   *  explicitamente — salões já existentes não são tocados. */
  suggestedOperationMode: OperationMode;
  catalog: {
    serviceCategories: SegmentCatalogCategory[];
    services: SegmentCatalogService[];
  };
  schedulePreset: Array<{
    dayOfWeek: number;
    isOpen: boolean;
    openTime: string;
    closeTime: string;
  }>;
  onboarding: {
    welcomeTitle: string;
    welcomeDescription: string;
    /** Resumo mostrado ao escolher o segmento no cadastro. */
    segmentSummary: string;
  };
};

/** Seg-Sáb 09:00–19:00, domingo fechado — o preset atual do seed. */
const PRESET_MON_SAT = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isOpen: dayOfWeek !== 0,
  openTime: "09:00",
  closeTime: "19:00",
}));

/** Seg-Sex 09:00–18:00, fim de semana fechado. */
const PRESET_MON_FRI = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isOpen: dayOfWeek >= 1 && dayOfWeek <= 5,
  openTime: "09:00",
  closeTime: "18:00",
}));

/** Seg-Sáb 08:00–18:00 — pet costuma ter sábado e manhã mais cedo. */
const PRESET_PET = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isOpen: dayOfWeek !== 0,
  openTime: "08:00",
  closeTime: "18:00",
}));

export const SEGMENT_CONFIGS: Record<BusinessSegment, SegmentConfig> = {
  BARBERSHOP: {
    segment: "BARBERSHOP",
    firstClass: true,
    labels: {
      segmentLabel: "Barbearia",
      shopNoun: "barbearia",
      shopNounPlural: "barbearias",
      professional: "barbeiro",
      professionalPlural: "barbeiros",
      client: "cliente",
      clientPlural: "clientes",
      service: "atendimento",
      servicePlural: "atendimentos",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "MASCULINO" },
    suggestedOperationMode: "QUEUE_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Cortes", icon: "scissors" },
        { name: "Barba", icon: "user" },
      ],
      services: [
        { name: "Corte", price: 45, avgTimeMinutes: 30, icon: "scissors", categoryName: "Cortes" },
        { name: "Barba", price: 30, avgTimeMinutes: 20, icon: "user", categoryName: "Barba" },
        { name: "Corte + barba", price: 65, avgTimeMinutes: 45, icon: "scissors", categoryName: "Cortes" },
        { name: "Sobrancelha", price: 20, avgTimeMinutes: 15, icon: "sparkles", categoryName: "Cortes" },
        { name: "Pigmentação de barba", price: 35, avgTimeMinutes: 30, icon: "palette", categoryName: "Barba" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque sua barbearia no ar",
      welcomeDescription:
        "Vamos preparar serviços de corte e barba, textos e o horário da sua barbearia.",
      segmentSummary: "Vamos preparar serviços e textos para barbearias.",
    },
  },
  HAIR_SALON: {
    segment: "HAIR_SALON",
    firstClass: true,
    labels: {
      segmentLabel: "Salão de cabelo",
      shopNoun: "salão",
      shopNounPlural: "salões",
      professional: "cabeleireiro(a)",
      professionalPlural: "cabeleireiros(as)",
      client: "cliente",
      clientPlural: "clientes",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "UNISSEX" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Cabelo", icon: "scissors" },
        { name: "Coloração", icon: "palette" },
        { name: "Tratamento", icon: "sparkles" },
      ],
      services: [
        { name: "Corte feminino", price: 80, avgTimeMinutes: 45, icon: "scissors", categoryName: "Cabelo" },
        { name: "Corte masculino", price: 60, avgTimeMinutes: 40, icon: "scissors", categoryName: "Cabelo" },
        { name: "Escova", price: 55, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Cabelo" },
        { name: "Coloração", price: 180, avgTimeMinutes: 120, icon: "palette", categoryName: "Coloração" },
        { name: "Mechas", price: 250, avgTimeMinutes: 150, icon: "palette", categoryName: "Coloração" },
        { name: "Hidratação", price: 70, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Tratamento" },
        { name: "Progressiva", price: 220, avgTimeMinutes: 120, icon: "sparkles", categoryName: "Tratamento" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu salão no ar",
      welcomeDescription:
        "Vamos preparar serviços de corte, coloração e tratamento, textos e o horário do seu salão.",
      segmentSummary: "Vamos preparar serviços e textos para salões de cabelo.",
    },
  },
  NAIL_STUDIO: {
    segment: "NAIL_STUDIO",
    firstClass: true,
    labels: {
      segmentLabel: "Manicure e nails",
      shopNoun: "studio",
      shopNounPlural: "studios",
      professional: "manicure",
      professionalPlural: "manicures",
      client: "cliente",
      clientPlural: "clientes",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "FEMININO" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Unhas naturais", icon: "sparkles" },
        { name: "Alongamento", icon: "palette" },
        { name: "Design", icon: "heart" },
      ],
      services: [
        { name: "Manicure", price: 40, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Unhas naturais" },
        { name: "Pedicure", price: 45, avgTimeMinutes: 45, icon: "sparkles", categoryName: "Unhas naturais" },
        { name: "Esmaltação em gel", price: 70, avgTimeMinutes: 60, icon: "palette", categoryName: "Unhas naturais" },
        { name: "Alongamento em fibra", price: 150, avgTimeMinutes: 120, icon: "palette", categoryName: "Alongamento" },
        { name: "Alongamento em gel", price: 170, avgTimeMinutes: 130, icon: "palette", categoryName: "Alongamento" },
        { name: "Nail art", price: 35, avgTimeMinutes: 30, icon: "heart", categoryName: "Design" },
        { name: "Remoção", price: 30, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Unhas naturais" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu studio no ar",
      welcomeDescription:
        "Vamos preparar serviços de manicure e nails, textos e o horário do seu studio.",
      segmentSummary: "Vamos preparar serviços e textos para manicure e nails.",
    },
  },
  PETSHOP: {
    segment: "PETSHOP",
    firstClass: true,
    labels: {
      segmentLabel: "Petshop",
      shopNoun: "petshop",
      shopNounPlural: "petshops",
      professional: "tosador(a)",
      professionalPlural: "tosadores(as)",
      client: "tutor(a)",
      clientPlural: "tutores(as)",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    // Em petshop não há público por gênero: quem agenda é o tutor, o pet é o
    // atendido. A coluna fica nula.
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Banho", icon: "droplet" },
        { name: "Tosa", icon: "scissors" },
        { name: "Cuidados", icon: "heart" },
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
    },
    schedulePreset: PRESET_PET,
    onboarding: {
      welcomeTitle: "Coloque seu petshop no ar",
      welcomeDescription:
        "Vamos preparar serviços de banho e tosa, textos e o horário do seu petshop.",
      segmentSummary: "Vamos preparar serviços e textos para petshops.",
    },
  },
  BEAUTY_STUDIO: {
    segment: "BEAUTY_STUDIO",
    firstClass: false,
    labels: {
      segmentLabel: "Studio de beleza",
      shopNoun: "studio",
      shopNounPlural: "studios",
      professional: "profissional",
      professionalPlural: "profissionais",
      client: "cliente",
      clientPlural: "clientes",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "FEMININO" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Estética facial", icon: "smile" },
        { name: "Corpo", icon: "heart" },
      ],
      services: [
        { name: "Limpeza de pele", price: 120, avgTimeMinutes: 60, icon: "smile", categoryName: "Estética facial" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu studio no ar",
      welcomeDescription: "Vamos preparar serviços e textos para o seu studio de beleza.",
      segmentSummary: "Vamos preparar serviços e textos para studios de beleza.",
    },
  },
  LASH_BROW_STUDIO: {
    segment: "LASH_BROW_STUDIO",
    firstClass: false,
    labels: {
      segmentLabel: "Cílios e sobrancelhas",
      shopNoun: "studio",
      shopNounPlural: "studios",
      professional: "profissional",
      professionalPlural: "profissionais",
      client: "cliente",
      clientPlural: "clientes",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "FEMININO" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Cílios", icon: "eye" },
        { name: "Sobrancelhas", icon: "sparkles" },
      ],
      services: [
        { name: "Extensão de cílios", price: 150, avgTimeMinutes: 90, icon: "eye", categoryName: "Cílios" },
        { name: "Design de sobrancelha", price: 50, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Sobrancelhas" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu studio no ar",
      welcomeDescription: "Vamos preparar serviços e textos para o seu studio de cílios e sobrancelhas.",
      segmentSummary: "Vamos preparar serviços e textos para cílios e sobrancelhas.",
    },
  },
  AESTHETICS: {
    segment: "AESTHETICS",
    firstClass: false,
    labels: {
      segmentLabel: "Estética",
      shopNoun: "estética",
      shopNounPlural: "estéticas",
      professional: "profissional",
      professionalPlural: "profissionais",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "FEMININO" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Facial", icon: "smile" },
        { name: "Corporal", icon: "heart" },
      ],
      services: [
        { name: "Peeling", price: 180, avgTimeMinutes: 50, icon: "smile", categoryName: "Facial" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque sua estética no ar",
      welcomeDescription: "Vamos preparar sessões e textos para o seu espaço de estética.",
      segmentSummary: "Vamos preparar sessões e textos para estética.",
    },
  },
  SPA: {
    segment: "SPA",
    firstClass: false,
    labels: {
      segmentLabel: "Spa",
      shopNoun: "spa",
      shopNounPlural: "spas",
      professional: "profissional",
      professionalPlural: "profissionais",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "UNISSEX" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Massagem", icon: "heart" },
        { name: "Relaxamento", icon: "sparkles" },
      ],
      services: [
        { name: "Massagem relaxante", price: 160, avgTimeMinutes: 60, icon: "heart", categoryName: "Massagem" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu spa no ar",
      welcomeDescription: "Vamos preparar sessões e textos para o seu spa.",
      segmentSummary: "Vamos preparar sessões e textos para spas.",
    },
  },
  OTHER: {
    segment: "OTHER",
    firstClass: false,
    labels: {
      segmentLabel: "Outro",
      shopNoun: "estabelecimento",
      shopNounPlural: "estabelecimentos",
      professional: "profissional",
      professionalPlural: "profissionais",
      client: "cliente",
      clientPlural: "clientes",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "UNISSEX" },
    suggestedOperationMode: "HYBRID",
    catalog: {
      serviceCategories: [{ name: "Serviços", icon: "sparkles" }],
      services: [
        { name: "Atendimento", price: 50, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Serviços" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque seu estabelecimento no ar",
      welcomeDescription: "Vamos preparar serviços e textos para o seu estabelecimento.",
      segmentSummary: "Vamos preparar serviços e textos para o seu tipo de negócio.",
    },
  },
};

/** Segmentos oferecidos no cadastro e no wizard do master, em ordem de exibição. */
export const FIRST_CLASS_SEGMENTS: BusinessSegment[] = [
  "BARBERSHOP",
  "HAIR_SALON",
  "NAIL_STUDIO",
  "PETSHOP",
];

export const ALL_SEGMENTS: BusinessSegment[] = [
  "BARBERSHOP",
  "HAIR_SALON",
  "NAIL_STUDIO",
  "PETSHOP",
  "BEAUTY_STUDIO",
  "LASH_BROW_STUDIO",
  "AESTHETICS",
  "SPA",
  "OTHER",
];

/** Aceita o valor do enum. Qualquer coisa fora disso cai em OTHER. */
export function getSegmentConfig(segment: BusinessSegment | null | undefined): SegmentConfig {
  if (segment && SEGMENT_CONFIGS[segment]) return SEGMENT_CONFIGS[segment];
  return SEGMENT_CONFIGS.OTHER;
}

/** Público aplicável ao segmento. Em PETSHOP não se aplica. */
export function audienceAppliesTo(segment: BusinessSegment): boolean {
  return getSegmentConfig(segment).targetAudience.applies;
}

/**
 * Normaliza o par segmento/público vindo do cadastro.
 * - segmento desconhecido → OTHER (nunca confiar no front)
 * - público num segmento sem público (PETSHOP) → null
 * - público fora do enum → erro, para o controller responder 400
 */
export function resolveAudienceForSegment(
  segment: BusinessSegment,
  audience: TargetAudience | null | undefined
): TargetAudience | null {
  if (!audienceAppliesTo(segment)) return null;
  return audience ?? getSegmentConfig(segment).targetAudience.suggested;
}

/**
 * Mensagem de erro do par segmento/público, ou null se o par é válido.
 * Extraído para os schemas de registro, Google, admin e PATCH usarem a mesma
 * regra — o Zod descarta `.superRefine` em `.omit()`/`.extend()`, e cada cópia
 * a mais é uma chance de divergir.
 */
export function segmentAudienceError(
  segment: BusinessSegment | null | undefined,
  audience: TargetAudience | null | undefined
): string | null {
  if (audience && segment && !audienceAppliesTo(segment)) {
    return `Público não se aplica ao segmento ${segment}.`;
  }
  return null;
}
