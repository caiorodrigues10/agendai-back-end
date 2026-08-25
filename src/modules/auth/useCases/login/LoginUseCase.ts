import { inject, injectable } from "tsyringe";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { AppError } from "@/shared/errors/AppError";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { issueAuthSession } from "../../services/issueAuthSession";
import { prisma } from "@/libs/prismaClient";

const CURRENT_TERMS_VERSION = "1.0";

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: string;
  barbershopId: string | null;
  cpf: string | null;
}

@injectable()
export class LoginUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) { }

  async execute(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.active) {
      throw new AppError("Credenciais inválidas", 401);
    }

    const passwordOk = await this.hashProvider.compare(password, user.password!);
    if (!passwordOk) {
      throw new AppError("Credenciais inválidas", 401);
    }

    if (user.termsVersion !== CURRENT_TERMS_VERSION) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          termsVersion: CURRENT_TERMS_VERSION,
          termsAcceptedAt: new Date(),
        },
      });
    }

    if (user.barbershopId) {
      await checkBarbershopAccess(user.barbershopId, user.cpf ?? undefined);
    }

    const userLike: UserLike = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      barbershopId: user.barbershopId ?? null,
      cpf: user.cpf ?? null,
    };

    return issueAuthSession(userLike);
  }
}
