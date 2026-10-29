import { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { getBusinessSegment } from "@/shared/segments/segmentCache";
import { isAdvertisingRestricted } from "@/shared/segments/advertising";

/**
 * Guarda de publicidade por segmento.
 *
 * Alguns segmentos (advocacia) não fazem divulgação comercial: indicação
 * (referrals), fidelidade (loyalty), campanhas, avaliação/NPS e preços
 * públicos ficam desligados. A regra vem da config do segmento
 * (`advertisingRestricted`) — nunca de um `if (segment === ...)` espalhado.
 *
 * MASTER_ADMIN passa sempre (operação da plataforma).
 */
export function advertisingGuard() {
  return async (request: FastifyRequest): Promise<void> => {
    const user = request.user as
      | { role?: string; barbershopId?: string }
      | undefined;
    if (!user) throw new AppError("Não autenticado", 401);
    if (user.role === "MASTER_ADMIN") return;
    if (!user.barbershopId) {
      throw new AppError("Usuário não vinculado a nenhum salão", 400);
    }

    const segment = await getBusinessSegment(user.barbershopId);
    if (isAdvertisingRestricted(segment)) {
      throw new AppError(
        "Recurso indisponível para o segmento deste estabelecimento",
        403,
        undefined,
        "ADVERTISING_FEATURE_UNAVAILABLE"
      );
    }
  };
}
