import { inject, injectable } from "tsyringe";
import { prisma, Prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { hashInviteToken } from "@/shared/utils/tokenHash";

/** Mensagem única: não revela se o token existe, expirou ou já foi usado. */
const INVALID_MESSAGE = "Link inválido ou expirado. Solicite um novo convite.";

@injectable()
export class AcceptOwnerInviteUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider,
  ) {}

  async execute(token: string, newPassword: string): Promise<{ message: string }> {
    const tokenHash = hashInviteToken(token);

    const invite = await prisma.ownerInvite.findUnique({ where: { tokenHash } });
    if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
      throw new AppError(INVALID_MESSAGE, 400, undefined, "INVITE_INVALID");
    }

    const passwordHash = await this.hashProvider.hash(newPassword);

    // Uso único atômico: a revogação/aceite acontece dentro da transação junto
    // com a troca de senha; se falhar, tudo é desfeito (invite continua PENDING).
    const ownerId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const claimed = await tx.ownerInvite.updateMany({
        where: {
          id: invite.id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new AppError(INVALID_MESSAGE, 400, undefined, "INVITE_INVALID");
      }

      const ownerUser = await tx.user.findFirst({
        where: {
          email: invite.email,
          barbershopId: invite.barbershopId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!ownerUser) {
        throw new AppError(INVALID_MESSAGE, 400, undefined, "INVITE_INVALID");
      }

      await tx.user.update({
        where: { id: ownerUser.id },
        data: { password: passwordHash, emailVerified: true, active: true },
      });

      return ownerUser.id;
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: ownerId,
          action: "OWNER_INVITE_ACCEPT",
          resource: "OwnerInvite",
          resourceId: invite.id,
          details: JSON.stringify({ barbershopId: invite.barbershopId }),
          barbershopId: invite.barbershopId,
        },
      });
    } catch {
      // Aceite já concluído: falha de auditoria não vira erro para o usuário.
    }

    return { message: "Senha definida com sucesso" };
  }
}
