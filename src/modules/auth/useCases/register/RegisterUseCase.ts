import { inject, injectable } from "tsyringe";
import { sign, Secret, SignOptions } from "jsonwebtoken";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "@/libs/prismaClient";
import auth from "@/config/auth";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { AppError } from "@/shared/errors/AppError";
import { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import { normalizeCpf, isValidCpf } from "@/shared/utils/cpfUtils";
import { checkCnpjAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { SUBSCRIPTION_MESSAGES } from "@/shared/constants/subscriptionMessages";
import { enqueueEmail } from "@/shared/infra/queue";
import {
  attachReferralOnRegister,
  ensureReferralCode,
} from "@/modules/referrals/services/referralService";
import { validateEmail } from "@/shared/services/emailValidationService";

export interface IRegisterDTO {
  ownerName: string;
  email: string;
  password: string;
  cpf: string;
  barbershopName: string;
  whatsapp: string;
  cnpj?: string;
  referralCode?: string;
}

function mapRole(role: string): "admin" | "owner" | "employee" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}

function parseDuration(input: string): number {
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}

@injectable()
export class RegisterUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(data: IRegisterDTO) {
    const emailValidation = await validateEmail(data.email);
    if (!emailValidation.valid) {
      throw new AppError("E-mail inválido", 400);
    }

    const normalizedCpf = normalizeCpf(data.cpf);
    if (!isValidCpf(normalizedCpf)) {
      throw new AppError("CPF inválido", 400);
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) {
      throw new AppError("E-mail já cadastrado", 400);
    }

    const existingCpf = await prisma.user.findFirst({ where: { cpf: normalizedCpf } });
    if (existingCpf) {
      throw new AppError("CPF já cadastrado", 400);
    }

    await assertCpfNotBlocked(normalizedCpf);

    const normalizedCnpj = data.cnpj?.replace(/\D/g, "") || undefined;
    if (normalizedCnpj) {
      const existingShop = await prisma.barbershop.findFirst({
        where: { cnpj: normalizedCnpj },
        select: { id: true },
      });
      if (existingShop) {
        throw new AppError(SUBSCRIPTION_MESSAGES.CNPJ_DUPLICATE, 400);
      }
      await checkCnpjAccess(normalizedCnpj);
    }

    const hashedPassword = await this.hashProvider.hash(data.password);
    const verificationToken = randomBytes(32).toString("hex");
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.$transaction(async (tx) => {
      const barbershop = await tx.barbershop.create({
        data: {
          name: data.barbershopName,
          whatsapp: data.whatsapp.replace(/\D/g, ""),
          ...(normalizedCnpj ? { cnpj: normalizedCnpj } : {}),
        },
      });

      // Serviços iniciais — mix comum em salão / barbearia / unissex
      await tx.service.createMany({
        data: [
          {
            barbershopId: barbershop.id,
            name: "Corte",
            price: 45,
            avgTimeMinutes: 30,
            icon: "scissors",
          },
          {
            barbershopId: barbershop.id,
            name: "Escova",
            price: 40,
            avgTimeMinutes: 40,
            icon: "sparkles",
          },
          {
            barbershopId: barbershop.id,
            name: "Barba",
            price: 30,
            avgTimeMinutes: 20,
            icon: "razor",
          },
        ],
      });

      const created = await tx.user.create({
        data: {
          name: data.ownerName,
          email: data.email,
          password: hashedPassword,
          role: "OWNER",
          barbershopId: barbershop.id,
          cpf: normalizedCpf,
          emailVerified: false,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          barbershopId: true,
        },
      });

      await tx.verificationToken.create({
        data: {
          token: verificationToken,
          userId: created.id,
          expiresAt: tokenExpires,
        },
      });

      return created;
    });

    const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
    const accessToken = sign(
      { role: user.role, barbershopId: user.barbershopId ?? undefined, cpf: normalizedCpf },
      auth.secret as Secret,
      accessOpts
    );

    const expiresAt = new Date(Date.now() + parseDuration(auth.refreshExpiresIn));
    const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
    const refreshToken = sign(
      { sub: user.id, jti: randomUUID() },
      auth.refreshSecret as Secret,
      refreshOpts
    );

    await prisma.refreshToken.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    // Código de indicação do novo owner (para compartilhar depois)
    if (user.barbershopId) {
      await ensureReferralCode({
        ownerUserId: user.id,
        barbershopId: user.barbershopId,
      }).catch((err) => {
        console.warn("[Register] Falha ao gerar código de indicação:", err?.message ?? err);
      });

      await attachReferralOnRegister({
        referralCode: data.referralCode,
        refereeUserId: user.id,
        refereeBarbershopId: user.barbershopId,
        refereeOwnerName: user.name,
        refereeEmail: user.email,
        refereeCpf: normalizedCpf,
      }).catch((err) => {
        console.warn("[Register] Falha ao anexar indicação:", err?.message ?? err);
      });
    }

    await enqueueEmail({
      kind: "verify_email",
      ownerName: user.name,
      email: user.email,
      token: verificationToken,
      deduplicationKey: `verify-email:${user.id}`,
    }).catch((err) => {
      console.warn("[Register] Falha ao enfileirar verificação de e-mail:", err?.message ?? err);
    });

    // Boas-vindas (não bloqueia cadastro se fila/e-mail falhar)
    await enqueueEmail({
      kind: "welcome",
      ownerName: user.name,
      barbershopName: data.barbershopName,
      email: user.email,
      deduplicationKey: `welcome:${user.id}`,
    }).catch((err) => {
      console.warn("[Register] Falha ao enfileirar e-mail de boas-vindas:", err?.message ?? err);
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(user.role),
        barbershopId: user.barbershopId ?? undefined,
      },
      accessToken,
      refreshToken,
    };
  }
}
