import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { createAuditLog } from "@/shared/services/auditLogService";

export interface IDeleteAccountDTO {
  userId: string;
  password: string;
}

@injectable()
export class DeleteAccountUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(data: IDeleteAccountDTO) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true,
        name: true,
        email: true,
        cpf: true,
        googleSub: true,
        active: true,
        deletedAt: true,
        password: true,
        barbershopId: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (!user.active || user.deletedAt) {
      throw new AppError("Conta já foi excluída", 400);
    }

    const passwordOk = await this.hashProvider.compare(data.password, user.password);
    if (!passwordOk) {
      throw new AppError("Senha incorreta", 401);
    }

    const now = new Date();
    const deletedEmail = `deleted-${user.id}@agendai.local`;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: "Usuário Excluído",
          email: deletedEmail,
          cpf: null,
          googleSub: null,
          active: false,
          deletedAt: now,
        },
      });

      await createAuditLog({
        userId: user.id,
        action: "ACCOUNT_DELETED",
        resource: "User",
        resourceId: user.id,
        details: JSON.stringify({ barbershopId: user.barbershopId }),
      });
    });

    return { success: true, message: "Conta excluída com sucesso" };
  }
}