import { prisma } from "@/libs/prismaClient";

export type OrgAccessLevel = "FULL" | "OPERATIONAL" | "NONE";

/**
 * Resolve o nível de acesso de um usuário a um salão que pode não ser o da própria sessão.
 * FULL         → vê financeiro/faturamento (dono direto do salão, MASTER_ADMIN, ou OWNER/ADMIN
 *                 da organização dona do salão)
 * OPERATIONAL  → vê dados operacionais (fila/agenda "ao vivo") mas não faturamento
 *                 (MEMBER/VIEWER da organização)
 * NONE         → sem acesso
 *
 * Segurança RLS das 3 queries:
 * - `users` tem RLS (tenant_isolation por barbershopId da sessão), mas isso não muda o
 *   resultado: o 1º filtro só pode casar quando a linha tem `barbershopId = salão-alvo`,
 *   e nesse caso a row é visível justamente quando o contexto aponta para o salão-alvo
 *   (ou quando não há contexto, como no handshake do /ws, em que current='' libera tudo).
 *   Se o contexto é o da sessão e difere do alvo, a row nem casaria no WHERE — null do mesmo
 *   jeito, e o caminho cai na organização.
 * - `barbershops` e `organization_members` não têm RLS (relrowsecurity = f, verificado no
 *   Postgres dev), então o caminho da organização é imune a qual contexto estiver ativo.
 * Nunca há leitura cross-tenant aqui: só metadados de acesso (quem é dono de quê), nunca
 * dados operacionais/financeiros.
 */
export async function resolveOrgAccessToBarbershop(
  userId: string,
  role: string,
  barbershopId: string,
): Promise<OrgAccessLevel> {
  if (role === "MASTER_ADMIN") return "FULL";

  const requester = await prisma.user.findFirst({
    where: { id: userId, barbershopId, role: "OWNER", active: true, deletedAt: null },
    select: { id: true },
  });
  if (requester) return "FULL";

  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: { organizationId: true },
  });
  if (!shop?.organizationId) return "NONE";

  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: shop.organizationId, userId } },
    select: { role: true },
  });
  if (!member) return "NONE";
  if (["OWNER", "ADMIN"].includes(member.role)) return "FULL";
  return "OPERATIONAL"; // MEMBER ou VIEWER
}
