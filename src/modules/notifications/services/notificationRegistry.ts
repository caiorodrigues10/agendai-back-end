export const NOTIFICATION_TYPES = [
  "AUTH_VERIFY_EMAIL",
  "AUTH_WELCOME",
  "AUTH_FORGOT_PASSWORD",
  "AUTH_PASSWORD_CHANGED",
  "AUTH_WELCOME_STAFF",
  "REFERRAL_APPLIED",
  "REFERRAL_CONVERTED",
  "REFERRAL_REVOKED",
  "QUEUE_JOINED_SHOP_ALERT",
  "QUEUE_CAPACITY_ALERT",
  "QUEUE_JOINED_CLIENT",
  "QUEUE_POSITION",
  "QUEUE_CALLED",
  "QUEUE_CANCELED",
  "APPOINTMENT_CONFIRMATION",
  "APPOINTMENT_REMINDER",
  "APPOINTMENT_QUEUE_UPDATE",
  "APPOINTMENT_CANCELED",
  "APPOINTMENT_URGENT_CANCELLED",
  "APPOINTMENT_URGENT_RESCHEDULED",
  "CRM_CAMPAIGN",
  "FIADO_CHARGE",
  "CONTACT_ALERT",
  "MANUAL",
  "SUBSCRIPTION_PAYMENT_APPROVED",
  "SUBSCRIPTION_PAYMENT_FAILED",
  "SUBSCRIPTION_TRIAL_ENDING",
  "SUBSCRIPTION_CANCELED",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_RENEWAL_FAILED",
  "SUBSCRIPTION_TRIAL_ENDED",
  "DAILY_DIGEST",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannelName = "EMAIL" | "WHATSAPP";

const LABELS: Record<NotificationType, string> = {
  AUTH_VERIFY_EMAIL: "Verificação de e-mail",
  AUTH_WELCOME: "Boas-vindas",
  AUTH_FORGOT_PASSWORD: "Redefinição de senha",
  AUTH_PASSWORD_CHANGED: "Senha alterada",
  AUTH_WELCOME_STAFF: "Boas-vindas da equipe",
  REFERRAL_APPLIED: "Indicação aplicada",
  REFERRAL_CONVERTED: "Indicação convertida",
  REFERRAL_REVOKED: "Indicação revogada",
  QUEUE_JOINED_SHOP_ALERT: "Entrada na fila — aviso ao salão",
  QUEUE_CAPACITY_ALERT: "Fila acima do limite — aviso ao salão",
  QUEUE_JOINED_CLIENT: "Entrada na fila — confirmação ao cliente",
  QUEUE_POSITION: "Atualização da posição na fila",
  QUEUE_CALLED: "Cliente chamado",
  QUEUE_CANCELED: "Cancelamento na fila",
  APPOINTMENT_CONFIRMATION: "Confirmação de agendamento",
  APPOINTMENT_REMINDER: "Lembrete de agendamento",
  APPOINTMENT_QUEUE_UPDATE: "Fila do agendamento",
  APPOINTMENT_CANCELED: "Cancelamento de agendamento",
  APPOINTMENT_URGENT_CANCELLED: "Cancelamento urgente (24h)",
  APPOINTMENT_URGENT_RESCHEDULED: "Reagendamento urgente (24h)",
  CRM_CAMPAIGN: "Campanha do CRM",
  FIADO_CHARGE: "Cobrança de fiado",
  CONTACT_ALERT: "Contato com a plataforma",
  MANUAL: "Mensagem manual",
  SUBSCRIPTION_PAYMENT_APPROVED: "Pagamento confirmado",
  SUBSCRIPTION_PAYMENT_FAILED: "Falha na cobrança",
  SUBSCRIPTION_TRIAL_ENDING: "Período grátis terminando",
  SUBSCRIPTION_CANCELED: "Assinatura cancelada",
  SUBSCRIPTION_RENEWED: "Assinatura renovada",
  SUBSCRIPTION_RENEWAL_FAILED: "Falha na renovação",
  SUBSCRIPTION_TRIAL_ENDED: "Período grátis encerrado",
  DAILY_DIGEST: "Resumo diário",
};

const OWNER_CONFIGURABLE = new Set<NotificationType>([
  "QUEUE_JOINED_CLIENT",
  "QUEUE_POSITION",
  "QUEUE_CALLED",
  "QUEUE_CANCELED",
  "APPOINTMENT_CONFIRMATION",
  "APPOINTMENT_REMINDER",
  "APPOINTMENT_QUEUE_UPDATE",
  "APPOINTMENT_CANCELED",
]);

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function listNotificationPreferences() {
  return NOTIFICATION_TYPES.filter((type) => OWNER_CONFIGURABLE.has(type)).map((type) => ({
    type,
    channel: "WHATSAPP" as const,
    label: LABELS[type],
    defaultEnabled: true,
  }));
}

export function notificationTypeLabel(type: string): string {
  return isNotificationType(type) ? LABELS[type] : type;
}

export function canOwnerConfigureNotification(type: string): boolean {
  return isNotificationType(type) && OWNER_CONFIGURABLE.has(type);
}
