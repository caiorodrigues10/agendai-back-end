import { AppError } from "@/shared/errors/AppError";

/** Nome estável da instância Evolution desta barbearia (um servidor, N sessões). */
export function shopEvolutionInstanceName(barbershopId: string): string {
  return `shop-${barbershopId}`;
}

export function whatsAppAppError(message: string, statusCode: number, code: string): AppError {
  return new AppError(JSON.stringify({ code, message }), statusCode);
}

export const WHATSAPP_NOT_CONNECTED_MESSAGE =
  "Conecte o WhatsApp do salão em Configurações para enviar mensagens.";

export function whatsAppNotConnectedError(): AppError {
  return whatsAppAppError(WHATSAPP_NOT_CONNECTED_MESSAGE, 409, "WHATSAPP_NOT_CONNECTED");
}

export function evolutionNotConfiguredError(): AppError {
  return whatsAppAppError("WhatsApp da plataforma indisponível.", 503, "EVOLUTION_NOT_CONFIGURED");
}

/** Remove o nome da instância da resposta pública da barbearia. */
export function toPublicBarbershop<T extends { evolutionInstanceName?: string | null }>(
  shop: T
): Omit<T, "evolutionInstanceName"> {
  const { evolutionInstanceName: _ignored, ...rest } = shop;
  return rest;
}
