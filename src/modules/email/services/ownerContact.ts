import { prisma } from "@/libs/prismaClient";

/**
 * Retorna o contato do owner de um salão para envio de e-mails
 * transacionais/operacionais. Nunca retorna contatos de clientes finais.
 */
export async function getOwnerContactForBarbershop(
  barbershopId: string
): Promise<{ id: string; email: string; name: string } | null> {
  const owner = await prisma.user.findFirst({
    where: { barbershopId, role: "OWNER", active: true, deletedAt: null },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner?.email) return null;
  return owner;
}
