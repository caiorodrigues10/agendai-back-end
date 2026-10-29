import { FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { hasSegmentFeature, type SegmentFeature } from "@/shared/segments";
import { getBusinessSegment } from "@/shared/segments/segmentCache";

/**
 * Guarda de **feature de segmento** para endpoints dedicados.
 *
 * Diferente do `segmentModuleGuard` (que nega módulos listados como
 * "ocultos"), esta guarda exige que o segmento **declare** a feature — por
 * exemplo, `caseManagement` (gestão de processos), que existe no escritório
 * de advocacia. Segmentos sem a feature recebem 403.
 *
 * MASTER_ADMIN passa sempre (operação da plataforma).
 */
export function segmentFeatureGuard(feature: SegmentFeature) {
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
    if (!hasSegmentFeature(segment, feature)) {
      throw new AppError(
        "Recurso indisponível para o segmento deste estabelecimento",
        403,
        undefined,
        "SEGMENT_FEATURE_UNAVAILABLE"
      );
    }
  };
}
