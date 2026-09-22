import { inject, injectable } from "tsyringe";
import { randomBytes } from "crypto";
import { FastifyReply } from "fastify";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/libs/prismaClient";
import { IHashProvider } from "@/shared/container/providers/HashProvider/IHashProvider";
import { AppError } from "@/shared/errors/AppError";
import { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import { normalizeCpf, isValidCpf } from "@/shared/utils/cpfUtils";
import { mapUniqueConstraintError } from "@/shared/utils/prismaErrors";
import { checkCnpjAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { SUBSCRIPTION_MESSAGES } from "@/shared/constants/subscriptionMessages";
import { enqueueEmail } from "@/shared/infra/queue";
import {
  attachReferralOnRegister,
  ensureReferralCode,
} from "@/modules/referrals/services/referralService";
import { validateEmail } from "@/shared/services/emailValidationService";
import { getModuleLogger } from "@/shared/utils/logger";
import { seedBarbershopDefaults } from "@/shared/utils/seedBarbershopDefaults";
import { geocodeCity } from "@/shared/services/geocodeCity";
import { issueAuthSession } from "../../services/issueAuthSession";

const logger = getModuleLogger("register-google");
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";

export interface IRegisterGoogleDTO {
  idToken: string;
  ownerName: string;
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
export class RegisterGoogleUseCase {
  constructor(
    @inject("HashProvider")
    private hashProvider: IHashProvider
  ) {}

  async execute(data: IRegisterGoogleDTO, reply?: FastifyReply) {
    const client = new OAuth2Client(googleClientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: data.idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError("Token Google inválido ou expirado", 401);
    }

    if (!payload || !payload.email || payload.email_verified !== true) {
      throw new AppError("E-mail não verificado pelo Google", 401);
    }

    const email = payload.email.trim().toLowerCase();
    const googleSub = payload.sub;

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

    if (googleSub) {
      const existingGoogle = await prisma.user.findFirst({
        where: { googleSub },
        select: { id: true },
      });
      if (existingGoogle) {
        throw new AppError("Esta conta Google já está cadastrada", 400);
      }
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

    const randomPassword = randomBytes(32).toString("hex");
    const hashedPassword = await this.hashProvider.hash(randomPassword);
    const now = new Date();

    let city = data.city?.trim() || undefined;
    let latitude = data.latitude;
    let longitude = data.longitude;
    if (city && latitude === undefined && longitude === undefined) {
      try {
        const location = await geocodeCity(city);
        city = location.city;
        latitude = location.latitude;
        longitude = location.longitude;
      } catch {
        // Cadastro não deve falhar se o geocoding estiver indisponível.
      }
    }

    let user;
    try {
      user = await prisma.$transaction(async (tx: any) => {
        const barbershop = await tx.barbershop.create({
          data: {
            name: data.barbershopName,
            whatsapp: data.whatsapp.replace(/\D/g, ""),
            approvalStatus: "APPROVED",
            ...(normalizedCnpj ? { cnpj: normalizedCnpj } : {}),
            ...(data.address ? { address: data.address.trim() } : {}),
            ...(city ? { city } : {}),
            ...(latitude !== undefined ? { latitude } : {}),
            ...(longitude !== undefined ? { longitude } : {}),
          },
        });

        await seedBarbershopDefaults(tx, barbershop.id, data.schedule);

        const created = await tx.user.create({
          data: {
            name: data.ownerName.trim(),
            email,
            password: hashedPassword,
            role: "OWNER",
            barbershopId: barbershop.id,
            cpf: normalizedCpf,
            emailVerified: true,
            ...(googleSub ? { googleSub } : {}),
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
            cpf: true,
          },
        });

        return created;
      });
    } catch (error) {
      throw mapUniqueConstraintError(error) ?? error;
    }

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
      kind: "welcome",
      ownerName: user.name,
      barbershopName: data.barbershopName,
      email: user.email,
      deduplicationKey: `welcome:${user.id}`,
    }).catch((err) => {
      logger.error({ err }, "Falha ao enfileirar e-mail de boas-vindas");
    });

    return issueAuthSession(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        barbershopId: user.barbershopId ?? null,
        cpf: user.cpf ?? null,
        emailVerified: true,
      },
      reply
    );
  }
}
