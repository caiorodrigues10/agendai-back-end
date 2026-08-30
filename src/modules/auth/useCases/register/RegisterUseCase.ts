import { inject, injectable } from "tsyringe";
import { sign, Secret, SignOptions } from "jsonwebtoken";
import { randomBytes, randomUUID } from "crypto";
import { FastifyReply } from "fastify";
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
import { mapRole, parseDuration } from "@/shared/utils/authUtils";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("register");

export interface IRegisterDTO {
  ownerName: string;
  email: string;
  password: string;
  cpf: string;
  barbershopName: string;
  whatsapp: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  cnpj?: string;
  referralCode?: string;
  termsVersion: string;
  termsAccepted: boolean;
  marketingOptIn: boolean;
  lgpdConsent: boolean;
  schedule?: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>;
}

@injectable()
export class RegisterUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(data: IRegisterDTO, reply?: FastifyReply) {
    const email = data.email.trim().toLowerCase();
    const emailValidation = await validateEmail(email);
    if (!emailValidation.valid) {
      throw new AppError("E-mail inválido", 400);
    }

    const normalizedCpf = normalizeCpf(data.cpf);
    if (!isValidCpf(normalizedCpf)) {
      throw new AppError("CPF inválido", 400);
    }

    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
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
    const now = new Date();

    const user = await prisma.$transaction(async (tx: any) => {
      const barbershop = await tx.barbershop.create({
        data: {
          name: data.barbershopName,
          whatsapp: data.whatsapp.replace(/\D/g, ""),
          ...(normalizedCnpj ? { cnpj: normalizedCnpj } : {}),
          ...(data.address ? { address: data.address.trim() } : {}),
          ...(data.city ? { city: data.city.trim() } : {}),
          ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
          ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
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

      // Horário de funcionamento — fallback seguro se o campo não vier
      const DEFAULT_SCHEDULE = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        isOpen: dayOfWeek !== 0,
        openTime: "09:00",
        closeTime: "19:00",
      }));
      const scheduleToCreate =
        data.schedule?.length === 7 ? data.schedule : DEFAULT_SCHEDULE;

      await tx.schedule.createMany({
        data: scheduleToCreate.map((s) => ({
          barbershopId: barbershop.id,
          dayOfWeek: s.dayOfWeek,
          isOpen: s.isOpen,
          openTime: s.openTime,
          closeTime: s.closeTime,
        })),
      });

      const created = await tx.user.create({
        data: {
          name: data.ownerName,
          email,
          password: hashedPassword,
          role: "OWNER",
          barbershopId: barbershop.id,
          cpf: normalizedCpf,
          emailVerified: false,
          termsVersion: data.termsVersion,
          termsAcceptedAt: data.termsAccepted ? now : null,
          marketingOptIn: data.marketingOptIn,
          marketingOptInAt: data.marketingOptIn ? now : null,
          lgpdConsentAt: data.lgpdConsent ? now : null,
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
        logger.error({ err }, "Falha ao gerar código de indicação");
      });

      await attachReferralOnRegister({
        referralCode: data.referralCode,
        refereeUserId: user.id,
        refereeBarbershopId: user.barbershopId,
        refereeOwnerName: user.name,
        refereeEmail: user.email,
        refereeCpf: normalizedCpf,
      }).catch((err) => {
        logger.error({ err }, "Falha ao anexar indicação");
      });
    }

    await enqueueEmail({
      kind: "verify_email",
      ownerName: user.name,
      email: user.email,
      token: verificationToken,
      deduplicationKey: `verify-email:${user.id}`,
    }).catch((err) => {
      logger.error({ err }, "Falha ao enfileirar verificação de e-mail");
    });

    // Boas-vindas (não bloqueia cadastro se fila/e-mail falhar)
    await enqueueEmail({
      kind: "welcome",
      ownerName: user.name,
      barbershopName: data.barbershopName,
      email: user.email,
      deduplicationKey: `welcome:${user.id}`,
    }).catch((err) => {
      logger.error({ err }, "Falha ao enfileirar e-mail de boas-vindas");
    });

    if (reply) {
      reply.setCookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
        maxAge: parseDuration(auth.refreshExpiresIn) / 1000,
      });
    }

    const session = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: mapRole(user.role),
        barbershopId: user.barbershopId ?? undefined,
      },
      accessToken,
    };

    return reply ? session : { ...session, refreshToken };
  }
}
