import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

/**
 * Valida o pet no tenant e devolve o snapshot gravado no agendamento/fila.
 * `petName` vem do banco (não do cliente): a exibição sobrevive à exclusão
 * do pet e não confia em nome forjado.
 */
export async function resolvePetSnapshot(
  barbershopId: string,
  petId: string | null | undefined
): Promise<{ petId: string | null; petName: string | null }> {
  if (!petId) return { petId: null, petName: null };

  const pet = await prisma.clientPet.findFirst({
    where: { id: petId, barbershopId },
    select: { name: true },
  });
  if (!pet) {
    throw new AppError("Pet inválido para este estabelecimento", 400);
  }
  return { petId, petName: pet.name };
}
