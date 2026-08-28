import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";

const SYNTHETIC_PREFIX = "np:";

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
 * Chave única do CRM: telefone válido, ou `np:{slug}` quando a fila/agenda
 * não tem WhatsApp (VarChar(20); um registro por salão + nome normalizado).
 */
export function salonClientCrmKey(whatsapp: string, name: string): string | null {
  const phone = salonClientWhatsappKey(whatsapp);
  if (phone) return phone;
  const display = salonClientDisplayName(name);
  if (!display) return null;
  const slug = display
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 17);
  if (slug.length < 2) return null;
  return `${SYNTHETIC_PREFIX}${slug}`.slice(0, 20);
}

export function isSyntheticSalonClientWhatsapp(whatsapp: string): boolean {
  return whatsapp.startsWith(SYNTHETIC_PREFIX);
}

/** Esconde chave sintética na API (UI mostra “Sem WhatsApp”). */
export function salonClientPublicWhatsapp(whatsapp: string): string {
  return isSyntheticSalonClientWhatsapp(whatsapp) ? "" : whatsapp;
}

type SalonClientWriter = {
  salonClient: {
    upsert: (args: {
      where: { barbershopId_whatsapp: { barbershopId: string; whatsapp: string } };
      create: { barbershopId: string; name: string; whatsapp: string };
      update: { name: string };
      select: { id: true };
    }) => Promise<{ id: string }>;
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

  return db.salonClient.upsert({
    where: { barbershopId_whatsapp: { barbershopId, whatsapp: key } },
    create: { barbershopId, name: displayName, whatsapp: key },
    update: { name: displayName },
    select: { id: true },
  });
}
