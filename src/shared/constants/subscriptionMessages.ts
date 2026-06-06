export const SUBSCRIPTION_STATUS_CONFIG: Record<string, { allowed: boolean; message?: string }> = {
  TRIALING: { allowed: true },
  ACTIVE: { allowed: true },
  PAST_DUE: {
    allowed: false,
    message: "Sua assinatura está com pagamento em atraso. Regularize para continuar."
  },
  CANCELED: {
    allowed: false,
    message: "Sua assinatura foi cancelada. Assine um novo plano para continuar."
  },
  UNPAID: {
    allowed: false,
    message: "Sua assinatura está inadimplente. Efetue o pagamento para continuar."
  },
};

export const SUBSCRIPTION_MESSAGES = {
  TRIAL_EXPIRED: "Período de teste encerrado. Assine um plano para continuar usando a plataforma.",
  NO_SUBSCRIPTION: "Assinatura inativa. Assine um plano para continuar usando a plataforma.",
  LOGIN_EXPIRED: "Seu período de acesso expirou. Assine um plano para continuar.",
  CNPJ_EXPIRED: "Este CNPJ já possui cadastro com acesso expirado. Assine um plano para reativar.",
  CNPJ_DUPLICATE: "Já existe uma barbearia cadastrada com este CNPJ.",
} as const;