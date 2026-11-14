/**
 * Catálogo central de mensagens exibidas ao usuário (pt-BR).
 *
 * Chaves em inglês, texto em pt-BR. Código referencia `MESSAGES.<módulo>.<chave>`
 * (ex.: `AppError(MESSAGES.addons.notFound, 404)`).
 * Nenhuma mensagem de UI pode ser traduzida para inglês.
 */
export const MESSAGES = {
  addons: {
    notFound: "Adicional não encontrado",
    serviceNotFound: "Serviço não encontrado",
    accessDenied: "Acesso negado",
    barbershopRequired: "barbershopId is required",
    nameRequired: "Nome do adicional é obrigatório",
    priceInvalid: "Preço do adicional inválido",
    quantityOutOfRange: "Quantidade do adicional fora do limite permitido",
    addonInactive: "Adicional indisponível",
    addonNotLinked: "Adicional não está disponível para este serviço",
    tooManyDistinctAddons: "Limite de adicionais distintos por agendamento excedido",
    duplicateAddonLink: "Vínculo serviço ↔ adicional já existe",
    invalidOverride: "Override de preço/tempo inválido",
    appointmentNotFound: "Agendamento não encontrado",
    addonCatalogEmpty: "Nenhum adicional encontrado",
  },
} as const;
