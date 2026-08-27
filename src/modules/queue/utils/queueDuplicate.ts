/** WhatsApp placeholder quando o staff não informa contato. */
export const STAFF_QUEUE_PLACEHOLDER_WHATSAPP = "00000000000";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function digits(whatsapp: string): string {
  return whatsapp.replace(/\D/g, "");
}

/**
 * Duplicata na fila ativa:
 * - mesmo customerId (mesma sessão do aparelho), ou
 * - mesmo WhatsApp e mesmo nome (envio duplo).
 * Mesmo WhatsApp com outro nome = outra pessoa (família) — permitido.
 */
export function isActiveQueueDuplicate(
  existing: { customerId: string; whatsapp: string; customerName: string },
  incoming: { customerId: string; whatsappDigits: string; customerName: string }
): boolean {
  if (existing.customerId === incoming.customerId) return true;

  const existingDigits = digits(existing.whatsapp);
  if (
    !incoming.whatsappDigits ||
    incoming.whatsappDigits === STAFF_QUEUE_PLACEHOLDER_WHATSAPP ||
    existingDigits === STAFF_QUEUE_PLACEHOLDER_WHATSAPP
  ) {
    return false;
  }
  if (existingDigits !== incoming.whatsappDigits) return false;
  return normalizeName(existing.customerName) === normalizeName(incoming.customerName);
}
