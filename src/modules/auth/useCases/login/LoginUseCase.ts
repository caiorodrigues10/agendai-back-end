import { inject, injectable } from "tsyringe";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { sign, Secret, SignOptions } from "jsonwebtoken";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";

function mapRole(role: string): "admin" | "owner" | "employee" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
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
      throw new Error("Credenciais inválidas");
    }

    const passwordOk = await this.hashProvider.compare(password, user.password!);
    if (!passwordOk) {
      throw new Error("Credenciais inválidas");
    }

    // Verifica assinatura da barbearia e bloqueio do CPF.
    // MASTER_ADMIN não tem barbershopId então é ignorado automaticamente.
    if (user.barbershopId) {
      await checkBarbershopAccess(user.barbershopId, user.cpf ?? undefined);
    }

    const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
    const accessToken = sign(
      { role: user.role, barbershopId: user.barbershopId ?? undefined },
      auth.secret as Secret,
      accessOpts
    );

    const expiresAt = new Date(Date.now() + parseDuration(auth.refreshExpiresIn));
    const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
    const refreshToken = sign({ sub: user.id }, auth.refreshSecret as Secret, refreshOpts);

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } }
    });

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt }
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(user.role),
        barbershopId: user.barbershopId ?? undefined
      },
      accessToken,
      refreshToken
    };
  }
}

function parseDuration(input: string): number {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}