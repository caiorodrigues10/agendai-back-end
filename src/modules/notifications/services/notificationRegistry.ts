export const NOTIFICATION_TYPES = [
  "AUTH_VERIFY_EMAIL",
  "AUTH_WELCOME",
  "AUTH_FORGOT_PASSWORD",
  "REFERRAL_APPLIED",
  "REFERRAL_CONVERTED",
  "REFERRAL_REVOKED",
  "QUEUE_JOINED_SHOP_ALERT",
  "QUEUE_JOINED_CLIENT",
  "QUEUE_POSITION",
  "QUEUE_CALLED",
  "QUEUE_CANCELED",
  "APPOINTMENT_CONFIRMATION",
  "APPOINTMENT_REMINDER",
  "APPOINTMENT_QUEUE_UPDATE",
  "APPOINTMENT_CANCELED",
  "CRM_CAMPAIGN",
  "FIADO_CHARGE",
  "CONTACT_ALERT",
  "MANUAL",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationChannelName = "EMAIL" | "WHATSAPP";

const LABELS: Record<NotificationType, string> = {
  AUTH_VERIFY_EMAIL: "Verificação de e-mail",
  AUTH_WELCOME: "Boas-vindas",
  AUTH_FORGOT_PASSWORD: "Redefinição de senha",
  REFERRAL_APPLIED: "Indicação aplicada",
  REFERRAL_CONVERTED: "Indicação convertida",
  REFERRAL_REVOKED: "Indicação revogada",
  QUEUE_JOINED_SHOP_ALERT: "Entrada na fila — aviso ao salão",
  QUEUE_JOINED_CLIENT: "Entrada na fila — confirmação ao cliente",
  QUEUE_POSITION: "Atualização da posição na fila",
  QUEUE_CALLED: "Cliente chamado",
  QUEUE_CANCELED: "Cancelamento na fila",
  APPOINTMENT_CONFIRMATION: "Confirmação de agendamento",
  APPOINTMENT_REMINDER: "Lembrete de agendamento",
  APPOINTMENT_QUEUE_UPDATE: "Fila do agendamento",
  APPOINTMENT_CANCELED: "Cancelamento de agendamento",
  CRM_CAMPAIGN: "Campanha do CRM",
  FIADO_CHARGE: "Cobrança de fiado",
  CONTACT_ALERT: "Contato com a plataforma",
  MANUAL: "Mensagem manual",
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
