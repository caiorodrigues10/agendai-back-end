import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";

/** WhatsApp em dígitos (10–11) para a chave única do CRM; null se inválido/placeholder. */
export function salonClientWhatsappKey(whatsapp: string): string | null {
  if (isPlaceholderWhatsApp(whatsapp)) return null;
  const digits = whatsapp.replace(/\D/g, "");
  const national =
    (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  if (national.length < 10 || national.length > 11) return null;
  return national;
}

export function salonClientDisplayName(name: string): string | null {
  const trimmed = name.trim().slice(0, 200);
  return trimmed.length >= 2 ? trimmed : null;
}

/**
 * A identidade automática do CRM é apenas telefone válido. Nome não é uma
 * identidade: duas pessoas podem ter o mesmo nome e nunca devem ser unidas.
 */
export function salonClientCrmKey(whatsapp: string, name: string): string | null {
  void name;
  return salonClientWhatsappKey(whatsapp);
}

export function isSyntheticSalonClientWhatsapp(whatsapp: string): boolean {
  return whatsapp.startsWith("np:");
}

/** Esconde chave sintética na API (UI mostra “Sem WhatsApp”). */
export function salonClientPublicWhatsapp(whatsapp: string): string {
  return isSyntheticSalonClientWhatsapp(whatsapp) ? "" : whatsapp;
}

type SalonClientWriter = {
  salonClient: {
    findFirst: (args: { where: { barbershopId: string; normalizedWhatsapp: string }; select: { id: true } }) => Promise<{ id: string } | null>;
    create: (args: { data: { barbershopId: string; name: string; whatsapp: string; normalizedWhatsapp: string }; select: { id: true } }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: { name: string }; select: { id: true } }) => Promise<{ id: string }>;
  };
};

/** Cria ou atualiza o CRM do salão a partir de fila/agenda. */
export async function upsertSalonClientRecord(
  db: SalonClientWriter,
  barbershopId: string,
  name: string,
  whatsapp: string
): Promise<{ id: string } | null> {
  const key = salonClientCrmKey(whatsapp, name);
  const displayName = salonClientDisplayName(name);
  if (!key || !displayName) return null;
  const existing = await db.salonClient.findFirst({
    where: { barbershopId, normalizedWhatsapp: key },
    select: { id: true },
  });
  if (existing) {
    return db.salonClient.update({ where: { id: existing.id }, data: { name: displayName }, select: { id: true } });
  }
  return db.salonClient.create({
    data: { barbershopId, name: displayName, whatsapp: key, normalizedWhatsapp: key },
    select: { id: true },
  });
}
