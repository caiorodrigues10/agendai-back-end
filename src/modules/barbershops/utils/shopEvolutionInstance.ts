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

/**
 * Remove da resposta pública da barbearia tudo que não é dado de vitrine:
 * o nome da instância Evolution (infra) e o CNPJ (dado sensível).
 * Usado por GET /barbershops e GET /barbershops/:id, que são rotas sem autenticação.
 */
export function toPublicBarbershop<
  T extends { evolutionInstanceName?: string | null; cnpj?: string | null },
>(shop: T): Omit<T, "evolutionInstanceName" | "cnpj"> {
  const { evolutionInstanceName: _ignored, cnpj: _cnpj, ...rest } = shop;
  return rest;
}
