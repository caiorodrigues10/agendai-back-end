import { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { isModuleEnabled, type GatedModule } from "@/shared/segments/segmentGate";
import { getBusinessSegment } from "@/shared/segments/segmentCache";

/**
 * Guarda de segmento para endpoints dedicados (produtos, estoque, comissões,
 * gorjeta). Lê o segmento do estabelecimento e nega o módulo quando o gate do
 * segmento o oculta.
 *
 * MASTER_ADMIN passa sempre (operação da plataforma).
 */
export function segmentModuleGuard(module: GatedModule) {
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
    if (!isModuleEnabled(segment, module)) {
      throw new AppError(
        "Recurso indisponível para o segmento deste estabelecimento",
        403,
        undefined,
        "SEGMENT_FEATURE_UNAVAILABLE"
      );
    }
  };
}
