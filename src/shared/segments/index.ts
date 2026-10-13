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

/** Grupos exibidos no cadastro. `other` sempre por último. */
export const SEGMENT_GROUPS = ["beauty", "wellness", "health", "pet", "automotive", "services", "other"] as const;
export type SegmentGroup = (typeof SEGMENT_GROUPS)[number];

/** Rótulos de grupo (front espelha; paridade compara só segmentos/labels). */
export const SEGMENT_GROUP_LABELS: Record<SegmentGroup, string> = {
  beauty: "Beleza e cabelo",
  wellness: "Bem-estar",
  health: "Saúde",
  pet: "Pet",
  automotive: "Automotivo",
  services: "Outros serviços",
  other: "Outros",
};

export type SegmentAuxiliaryProfile = "pet" | "vehicle";

export type SegmentConfig = {
  segment: BusinessSegment;
  group: SegmentGroup;
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
  /**
   * Aviso exibido no cadastro e nas configurações em segmentos de saúde:
   * o sistema é agenda e relacionamento, não prontuário. Obrigatório nos
   * segmentos de saúde; ausente nos demais.
   */
  complianceNote?: string;
  /**
   * Ficha auxiliar opcional do cliente: `pet` (reusa o MVP de pets) ou
   * `vehicle` (placa/modelo na ficha). Ausente = nenhuma.
   */
  auxiliaryProfile?: SegmentAuxiliaryProfile;
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
    group: "beauty",
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
    group: "beauty",
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
    group: "beauty",
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
    group: "pet",
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
    // O MVP de pets nasceu aqui: o petshop abre a ficha de pet, como a
    // veterinária (antes só a veterinária tinha a ficha ligada).
    auxiliaryProfile: "pet",
    catalog: {
      serviceCategories: [
        { name: "Banho", icon: "droplets" },
        { name: "Tosa", icon: "scissors" },
        { name: "Cuidados", icon: "heart" },
      ],
      services: [
        { name: "Banho", price: 60, avgTimeMinutes: 45, icon: "droplets", categoryName: "Banho" },
        { name: "Tosa higiênica", price: 45, avgTimeMinutes: 30, icon: "scissors", categoryName: "Tosa" },
        { name: "Tosa completa", price: 80, avgTimeMinutes: 60, icon: "scissors", categoryName: "Tosa" },
        { name: "Banho + tosa", price: 110, avgTimeMinutes: 90, icon: "sparkles", categoryName: "Banho" },
        { name: "Hidratação de pelagem", price: 55, avgTimeMinutes: 30, icon: "droplets", categoryName: "Cuidados" },
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
    group: "beauty",
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
    group: "beauty",
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
    group: "beauty",
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
    group: "wellness",
    labels: {
      segmentLabel: "Spa e massagem",
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
  MAKEUP_STUDIO: {
    segment: "MAKEUP_STUDIO",
    group: "beauty",
    labels: {
      segmentLabel: "Maquiagem e penteado",
      shopNoun: "estúdio",
      shopNounPlural: "estúdios",
      professional: "maquiador(a)",
      professionalPlural: "maquiadores",
      client: "cliente",
      clientPlural: "clientes",
      service: "atendimento",
      servicePlural: "atendimentos",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: true, suggested: "FEMININO" },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Maquiagem", icon: "palette" },
        { name: "Cabelo", icon: "scissors" },
      ],
      services: [
        { name: "Maquiagem social", price: 0, avgTimeMinutes: 60, icon: "palette", categoryName: "Maquiagem" },
        { name: "Maquiagem noiva", price: 0, avgTimeMinutes: 90, icon: "sparkles", categoryName: "Maquiagem" },
        { name: "Penteado", price: 0, avgTimeMinutes: 45, icon: "scissors", categoryName: "Cabelo" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu estúdio no ar",
      welcomeDescription: "Vamos preparar serviços e textos para o seu estúdio de maquiagem.",
      segmentSummary: "Vamos preparar serviços e textos para estúdios de maquiagem.",
    },
  },
  PHYSIOTHERAPY: {
    segment: "PHYSIOTHERAPY",
    group: "health",
    labels: {
      segmentLabel: "Fisioterapia e quiropraxia",
      shopNoun: "consultório",
      shopNounPlural: "consultórios",
      professional: "fisioterapeuta",
      professionalPlural: "fisioterapeutas",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    complianceNote:
      "O sistema organiza agenda e relacionamento com clientes. Não é prontuário clínico e não substitui documentação profissional regulada.",
    catalog: {
      serviceCategories: [
        { name: "Sessões", icon: "heart" },
        { name: "Avaliação", icon: "clipboard" },
      ],
      services: [
        { name: "Sessão de fisioterapia", price: 0, avgTimeMinutes: 50, icon: "heart", categoryName: "Sessões" },
        { name: "Sessão de quiropraxia", price: 0, avgTimeMinutes: 40, icon: "sparkles", categoryName: "Sessões" },
        { name: "Avaliação inicial", price: 0, avgTimeMinutes: 30, icon: "clipboard", categoryName: "Avaliação" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu consultório no ar",
      welcomeDescription: "Vamos preparar sessões e textos para o seu consultório de fisioterapia.",
      segmentSummary: "Vamos preparar sessões e textos para fisioterapia e quiropraxia.",
    },
  },
  NUTRITION: {
    segment: "NUTRITION",
    group: "health",
    labels: {
      segmentLabel: "Nutrição",
      shopNoun: "consultório",
      shopNounPlural: "consultórios",
      professional: "nutricionista",
      professionalPlural: "nutricionistas",
      client: "cliente",
      clientPlural: "clientes",
      service: "consulta",
      servicePlural: "consultas",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    complianceNote:
      "O sistema organiza agenda e relacionamento com clientes. Não é prontuário clínico e não substitui documentação profissional regulada.",
    catalog: {
      serviceCategories: [
        { name: "Consultas", icon: "clipboard" },
        { name: "Acompanhamento", icon: "calendar" },
      ],
      services: [
        { name: "Consulta de nutrição", price: 0, avgTimeMinutes: 45, icon: "clipboard", categoryName: "Consultas" },
        { name: "Consulta de retorno", price: 0, avgTimeMinutes: 30, icon: "calendar", categoryName: "Acompanhamento" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu consultório no ar",
      welcomeDescription: "Vamos preparar consultas e textos para o seu consultório de nutrição.",
      segmentSummary: "Vamos preparar consultas e textos para nutrição.",
    },
  },
  PSYCHOTHERAPY: {
    segment: "PSYCHOTHERAPY",
    group: "health",
    labels: {
      segmentLabel: "Psicologia e terapia",
      shopNoun: "consultório",
      shopNounPlural: "consultórios",
      professional: "terapeuta",
      professionalPlural: "terapeutas",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    complianceNote:
      "O sistema organiza agenda e relacionamento com clientes. Não é prontuário clínico e não substitui documentação profissional regulada.",
    catalog: {
      serviceCategories: [{ name: "Sessões", icon: "heart" }],
      services: [
        { name: "Sessão de terapia", price: 0, avgTimeMinutes: 50, icon: "heart", categoryName: "Sessões" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu consultório no ar",
      welcomeDescription: "Vamos preparar sessões e textos para o seu espaço de terapia.",
      segmentSummary: "Vamos preparar sessões e textos para psicologia e terapia.",
    },
  },
  VETERINARY: {
    segment: "VETERINARY",
    group: "pet",
    labels: {
      segmentLabel: "Veterinária",
      shopNoun: "clínica",
      shopNounPlural: "clínicas",
      professional: "veterinário(a)",
      professionalPlural: "veterinários",
      client: "tutor(a)",
      clientPlural: "tutores",
      service: "consulta",
      servicePlural: "consultas",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "HYBRID",
    auxiliaryProfile: "pet",
    catalog: {
      serviceCategories: [
        { name: "Consultas", icon: "stethoscope" },
        { name: "Procedimentos", icon: "sparkles" },
      ],
      services: [
        { name: "Consulta veterinária", price: 0, avgTimeMinutes: 30, icon: "stethoscope", categoryName: "Consultas" },
        { name: "Vacinação", price: 0, avgTimeMinutes: 20, icon: "sparkles", categoryName: "Procedimentos" },
        { name: "Banho terapêutico", price: 0, avgTimeMinutes: 45, icon: "droplets", categoryName: "Procedimentos" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque sua clínica no ar",
      welcomeDescription: "Vamos preparar consultas e textos para a sua clínica veterinária.",
      segmentSummary: "Vamos preparar consultas e textos para veterinárias.",
    },
  },
  CAR_WASH: {
    segment: "CAR_WASH",
    group: "automotive",
    labels: {
      segmentLabel: "Lava jato",
      shopNoun: "lava jato",
      shopNounPlural: "lava jatos",
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
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "HYBRID",
    auxiliaryProfile: "vehicle",
    catalog: {
      serviceCategories: [
        { name: "Lavagem", icon: "droplets" },
        { name: "Estética", icon: "sparkles" },
      ],
      services: [
        { name: "Lavagem simples", price: 0, avgTimeMinutes: 30, icon: "droplets", categoryName: "Lavagem" },
        { name: "Lavagem completa", price: 0, avgTimeMinutes: 60, icon: "sparkles", categoryName: "Lavagem" },
        { name: "Enceramento", price: 0, avgTimeMinutes: 45, icon: "sparkles", categoryName: "Estética" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque seu lava jato no ar",
      welcomeDescription: "Vamos preparar serviços e textos para o seu lava jato.",
      segmentSummary: "Vamos preparar serviços e textos para lava jatos.",
    },
  },
  AUTO_REPAIR: {
    segment: "AUTO_REPAIR",
    group: "automotive",
    labels: {
      segmentLabel: "Mecânica e oficina",
      shopNoun: "oficina",
      shopNounPlural: "oficinas",
      professional: "mecânico(a)",
      professionalPlural: "mecânicos",
      client: "cliente",
      clientPlural: "clientes",
      service: "serviço",
      servicePlural: "serviços",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    auxiliaryProfile: "vehicle",
    catalog: {
      serviceCategories: [
        { name: "Manutenção", icon: "wrench" },
        { name: "Revisão", icon: "clipboard" },
      ],
      services: [
        { name: "Troca de óleo", price: 0, avgTimeMinutes: 40, icon: "wrench", categoryName: "Manutenção" },
        { name: "Revisão periódica", price: 0, avgTimeMinutes: 90, icon: "clipboard", categoryName: "Revisão" },
        { name: "Alinhamento e balanceamento", price: 0, avgTimeMinutes: 60, icon: "wrench", categoryName: "Manutenção" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque sua oficina no ar",
      welcomeDescription: "Vamos preparar serviços e textos para a sua oficina.",
      segmentSummary: "Vamos preparar serviços e textos para mecânicas e oficinas.",
    },
  },
  PHOTO_STUDIO: {
    segment: "PHOTO_STUDIO",
    group: "services",
    labels: {
      segmentLabel: "Fotografia",
      shopNoun: "estúdio",
      shopNounPlural: "estúdios",
      professional: "fotógrafo(a)",
      professionalPlural: "fotógrafos",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Ensaio", icon: "camera" },
        { name: "Evento", icon: "star" },
      ],
      services: [
        { name: "Ensaio fotográfico", price: 0, avgTimeMinutes: 90, icon: "camera", categoryName: "Ensaio" },
        { name: "Cobertura de evento", price: 0, avgTimeMinutes: 180, icon: "star", categoryName: "Evento" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque seu estúdio no ar",
      welcomeDescription: "Vamos preparar sessões e textos para o seu estúdio de fotografia.",
      segmentSummary: "Vamos preparar sessões e textos para estúdios de fotografia.",
    },
  },
  TATTOO_PIERCING: {
    segment: "TATTOO_PIERCING",
    group: "services",
    labels: {
      segmentLabel: "Tatuagem e piercing",
      shopNoun: "estúdio",
      shopNounPlural: "estúdios",
      professional: "tatuador(a)",
      professionalPlural: "tatuadores",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [
        { name: "Tatuagem", icon: "penTool" },
        { name: "Piercing", icon: "sparkles" },
      ],
      services: [
        { name: "Sessão de tatuagem", price: 0, avgTimeMinutes: 120, icon: "penTool", categoryName: "Tatuagem" },
        { name: "Aplicação de piercing", price: 0, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Piercing" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque seu estúdio no ar",
      welcomeDescription: "Vamos preparar sessões e textos para o seu estúdio de tatuagem.",
      segmentSummary: "Vamos preparar sessões e textos para tatuagem e piercing.",
    },
  },
  COACHING: {
    segment: "COACHING",
    group: "services",
    labels: {
      segmentLabel: "Consultoria e coaching",
      shopNoun: "consultório",
      shopNounPlural: "consultórios",
      professional: "consultor(a)",
      professionalPlural: "consultores",
      client: "cliente",
      clientPlural: "clientes",
      service: "sessão",
      servicePlural: "sessões",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [{ name: "Sessões", icon: "briefcase" }],
      services: [
        { name: "Sessão de consultoria", price: 0, avgTimeMinutes: 60, icon: "briefcase", categoryName: "Sessões" },
        { name: "Sessão de acompanhamento", price: 0, avgTimeMinutes: 45, icon: "calendar", categoryName: "Sessões" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque sua consultoria no ar",
      welcomeDescription: "Vamos preparar sessões e textos para a sua consultoria.",
      segmentSummary: "Vamos preparar sessões e textos para consultoria e coaching.",
    },
  },
  PRIVATE_CLASSES: {
    segment: "PRIVATE_CLASSES",
    group: "services",
    labels: {
      segmentLabel: "Aulas particulares",
      shopNoun: "espaço",
      shopNounPlural: "espaços",
      professional: "professor(a)",
      professionalPlural: "professores",
      client: "aluno(a)",
      clientPlural: "alunos",
      service: "aula",
      servicePlural: "aulas",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "APPOINTMENTS_ONLY",
    catalog: {
      serviceCategories: [{ name: "Aulas", icon: "music" }],
      services: [
        { name: "Aula particular", price: 0, avgTimeMinutes: 60, icon: "music", categoryName: "Aulas" },
        { name: "Aula experimental", price: 0, avgTimeMinutes: 45, icon: "star", categoryName: "Aulas" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque seu espaço no ar",
      welcomeDescription: "Vamos preparar aulas e textos para o seu espaço de ensino.",
      segmentSummary: "Vamos preparar aulas e textos para aulas particulares (música, idiomas, reforço, yoga e pilates).",
    },
  },
  TECH_SUPPORT: {
    segment: "TECH_SUPPORT",
    group: "services",
    labels: {
      segmentLabel: "Assistência técnica",
      shopNoun: "assistência",
      shopNounPlural: "assistências",
      professional: "técnico(a)",
      professionalPlural: "técnicos",
      client: "cliente",
      clientPlural: "clientes",
      service: "atendimento",
      servicePlural: "atendimentos",
      queue: "fila",
      appointment: "agenda",
      staff: "equipe",
    },
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "HYBRID",
    catalog: {
      serviceCategories: [
        { name: "Atendimentos", icon: "wrench" },
        { name: "Entrega", icon: "package" },
      ],
      services: [
        { name: "Atendimento técnico", price: 0, avgTimeMinutes: 45, icon: "wrench", categoryName: "Atendimentos" },
        { name: "Visita técnica", price: 0, avgTimeMinutes: 60, icon: "package", categoryName: "Atendimentos" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque sua assistência no ar",
      welcomeDescription: "Vamos preparar atendimentos e textos para a sua assistência técnica.",
      segmentSummary: "Vamos preparar atendimentos e textos para assistências técnicas.",
    },
  },
  HOME_SERVICES: {
    segment: "HOME_SERVICES",
    group: "services",
    labels: {
      segmentLabel: "Serviços domiciliares",
      shopNoun: "empresa",
      shopNounPlural: "empresas",
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
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "HYBRID",
    catalog: {
      serviceCategories: [{ name: "Serviços", icon: "home" }],
      services: [
        { name: "Diária de limpeza", price: 0, avgTimeMinutes: 240, icon: "home", categoryName: "Serviços" },
        { name: "Visita técnica", price: 0, avgTimeMinutes: 90, icon: "wrench", categoryName: "Serviços" },
      ],
    },
    schedulePreset: PRESET_MON_FRI,
    onboarding: {
      welcomeTitle: "Coloque sua empresa no ar",
      welcomeDescription: "Vamos preparar serviços e textos para os seus serviços domiciliares.",
      segmentSummary: "Vamos preparar serviços e textos para serviços domiciliares.",
    },
  },
  OTHER: {
    segment: "OTHER",
    group: "other",
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
    // OUTRO é o modo padrão/genérico: sem público (não perguntamos gênero),
    // todos os módulos disponíveis, catálogo com um único serviço de exemplo
    // (a UI exige pelo menos um) e o MESMO preset de horário que o app usava
    // antes dos segmentos — nada de comportamento exclusivo.
    targetAudience: { applies: false, suggested: null },
    suggestedOperationMode: "HYBRID",
    catalog: {
      serviceCategories: [{ name: "Serviços", icon: "sparkles" }],
      services: [
        { name: "Serviço", price: 0, avgTimeMinutes: 30, icon: "sparkles", categoryName: "Serviços" },
      ],
    },
    schedulePreset: PRESET_MON_SAT,
    onboarding: {
      welcomeTitle: "Coloque seu estabelecimento no ar",
      welcomeDescription: "Vamos preparar serviços e textos para o seu estabelecimento.",
      segmentSummary: "Você pode ajustar serviços e textos depois, nas configurações.",
    },
  },
};

export const ALL_SEGMENTS: BusinessSegment[] = [
  "BARBERSHOP",
  "HAIR_SALON",
  "NAIL_STUDIO",
  "PETSHOP",
  "BEAUTY_STUDIO",
  "LASH_BROW_STUDIO",
  "AESTHETICS",
  "SPA",
  "MAKEUP_STUDIO",
  "PHYSIOTHERAPY",
  "NUTRITION",
  "PSYCHOTHERAPY",
  "VETERINARY",
  "CAR_WASH",
  "AUTO_REPAIR",
  "PHOTO_STUDIO",
  "TATTOO_PIERCING",
  "COACHING",
  "PRIVATE_CLASSES",
  "TECH_SUPPORT",
  "HOME_SERVICES",
  "OTHER",
];

/** Segmentos agrupados para exibição no cadastro (ordem dos grupos + ordem interna). */
export const SEGMENTS_BY_GROUP: Array<{ group: SegmentGroup; segments: BusinessSegment[] }> =
  SEGMENT_GROUPS.map((group) => ({
    group,
    segments: ALL_SEGMENTS.filter((segment) => SEGMENT_CONFIGS[segment].group === group),
  }));

/** Ordem de exibição achatada, usada pelo teclado no radiogroup do cadastro. */
export const FIRST_CLASS_SEGMENTS: BusinessSegment[] = SEGMENTS_BY_GROUP.flatMap(
  (entry) => entry.segments
);

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

/** Teto do texto livre "Qual é o seu tipo de negócio?" (OTHER). */
export const SEGMENT_OTHER_MAX_LENGTH = 80;

/**
 * Normaliza o texto livre enviado junto com o segmento OTHER.
 *
 * - Segmento !== OTHER → null (o texto nunca é gravado fora de OTHER, mesmo
 *   que um cliente antigo envie junto).
 * - OTHER sem texto → null (campo opcional).
 * - Espaços das pontas e controles (`\n`, `\t`, …) são removidos; espaços
 *   internos consecutivos viram um só. O corte é por chars UTF-8, que é o
 *   que o `@db.VarChar(80)` do Postgres conta.
 */
export function normalizeSegmentOther(
  segment: BusinessSegment | null | undefined,
  text: string | null | undefined
): string | null {
  if (segment !== "OTHER") return null;
  if (!text) return null;
  // Controles viram espaço (não somem) para "a\tb" não virar "ab"; depois
  // colapsa espaços consecutivos e aponta as pontas.
  const cleaned = text
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEGMENT_OTHER_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

/** Mensagem de erro do texto livre de OTHER, ou null se válido. */
export function segmentOtherError(
  segment: BusinessSegment | null | undefined,
  text: string | null | undefined
): string | null {
  if (segment !== "OTHER") return null;
  if (!text) return null;
  if (text.trim().length > SEGMENT_OTHER_MAX_LENGTH) {
    return `Descreva seu negócio em até ${SEGMENT_OTHER_MAX_LENGTH} caracteres.`;
  }
  return null;
}
