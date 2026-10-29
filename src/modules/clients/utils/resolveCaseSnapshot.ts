import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

/**
 * Valida o caso/processo no tenant e devolve o snapshot gravado no agendamento.
 * `caseName` vem do banco (não do cliente): a exibição sobrevive à exclusão
 * do caso e não confia em apelido forjado.
 *
 * Quando o `clientId` é conhecido, o caso precisa ser do mesmo cliente — um
 * agendamento não pode apontar para o caso de outra ficha.
 */
export async function resolveCaseSnapshot(
  barbershopId: string,
  caseId: string | null | undefined,
  clientId?: string | null
): Promise<{ caseId: string | null; caseName: string | null }> {
  if (!caseId) return { caseId: null, caseName: null };

  const clientCase = await prisma.clientCase.findFirst({
    where: {
      id: caseId,
      barbershopId,
      ...(clientId ? { clientId } : {}),
    },
    select: { nickname: true },
  });
  if (!clientCase) {
    throw new AppError("Caso inválido para este cliente", 400);
  }
  return { caseId, caseName: clientCase.nickname };
}
