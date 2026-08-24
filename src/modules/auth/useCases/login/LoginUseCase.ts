import { inject, injectable } from "tsyringe";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { AppError } from "@/shared/errors/AppError";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { issueAuthSession } from "../../services/issueAuthSession";

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

    if (user.barbershopId) {
      await checkBarbershopAccess(user.barbershopId, user.cpf ?? undefined);
    }

    return issueAuthSession(user);
  }
}
