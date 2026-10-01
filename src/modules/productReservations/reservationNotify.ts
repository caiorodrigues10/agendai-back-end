import { prisma } from "@/libs/prismaClient";
import { enqueueEmail, enqueueWhatsApp } from "@/shared/infra/queue";
import { getOwnerContactForBarbershop } from "@/modules/email/services/ownerContact";
import { getFrontendUrl } from "@/shared/constants/env";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("productReservations:notify");

export type ReservationNotifyInput = {
  barbershopId: string;
  reservationId: string;
  /** Nome/fuso do salão já carregados pelo caller — cada canal lê só o que falta. */
  shopName: string;
  shopTimezone: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  customerName: string;
  whatsapp: string;
  expiresAt: Date;
};

/**
 * Nome vem de formulário público: tags HTML, quebra de linha e asterisco
 * (negrito/marcador do WhatsApp) viram texto simples, com máx. de 60 chars.
 */
export function sanitizeCustomerName(name: string): string {
  return name
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function formatPhoneBR(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Data/hora no fuso do salão (a expiração é gravada em UTC). */
function shopDateTime(value: Date, timeZone: string): string {
  try {
    return value.toLocaleString("pt-BR", {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value.toLocaleString("pt-BR");
  }
}

function shopPanelUrl(): string {
  return `${getFrontendUrl()}/app/products`;
}

async function notifyShopWhatsApp(input: ReservationNotifyInput): Promise<void> {
  try {
    const shop = await prisma.barbershop.findUnique({
      where: { id: input.barbershopId },
      select: { whatsapp: true, evolutionInstanceName: true },
    });
    const instanceName = shop?.evolutionInstanceName?.trim();
    if (!shop?.whatsapp || !instanceName) return;

    const total = Number((input.quantity ?? 0) * (input.unitPrice ?? 0));
    const message =
      `*Nova reserva de produto*\n\n` +
      `*${input.shopName}*\n` +
      `Produto: ${input.quantity}× ${input.productName}\n` +
      `Cliente: ${sanitizeCustomerName(input.customerName)}\n` +
      `Contato: ${formatPhoneBR(input.whatsapp)}\n` +
      `Total: ${money(total)}\n` +
      `Retirada até: ${shopDateTime(input.expiresAt, input.shopTimezone || "America/Sao_Paulo")}`;

    await enqueueWhatsApp({
      phone: shop.whatsapp,
      message,
      instanceName,
      deduplicationKey: `product-reservation:${input.reservationId}:whatsapp`,
      notificationType: "PRODUCT_RESERVED_SHOP_ALERT",
      barbershopId: input.barbershopId,
      sourceType: "PRODUCT_RESERVATION",
      sourceId: input.reservationId,
    });
  } catch (err) {
    logger.warn({ err, reservationId: input.reservationId }, "Falha ao enfileirar aviso de reserva no WhatsApp");
  }
}

async function notifyShopEmail(input: ReservationNotifyInput): Promise<void> {
  try {
    const owner = await getOwnerContactForBarbershop(input.barbershopId);
    if (!owner) return;

    await enqueueEmail({
      kind: "product_reservation_alert",
      email: owner.email,
      ownerName: owner.name,
      barbershopName: input.shopName,
      productName: input.productName,
      quantity: input.quantity,
      customerName: input.customerName,
      customerWhatsapp: input.whatsapp,
      total: Number((input.quantity ?? 0) * (input.unitPrice ?? 0)),
      expiresAt: input.expiresAt,
      panelUrl: shopPanelUrl(),
      deduplicationKey: `product-reservation:${input.reservationId}:email`,
    });
  } catch (err) {
    logger.warn({ err, reservationId: input.reservationId }, "Falha ao enfileirar aviso de reserva por e-mail");
  }
}

/**
 * Avisa o salão depois que a reserva já existe. WhatsApp e e-mail são
 * independentes (cada um com o próprio try/catch e as próprias leituras):
 * falha de um não afeta o outro nem a criação da reserva, e nada é enviado
 * ao cliente.
 *
 * Chamado **sem await** pelo use case — a resposta 201 não espera o envio.
 */
export async function notifyShopAboutReservation(input: ReservationNotifyInput): Promise<void> {
  await Promise.all([notifyShopWhatsApp(input), notifyShopEmail(input)]);
}
