import { randomInt } from "crypto";
import { hash, compare } from "bcryptjs";
import { prisma } from "@/libs/prismaClient";
import { ClientPortalRepository } from "./clientPortalRepository";
import { AppError } from "@/shared/errors/AppError";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_EXPIRY_DAYS = 30;
const BCRYPT_ROUNDS = 10;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new AppError("Telefone inválido", 400);
  }
  return digits;
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, "0");
}

export class ClientPortalRepositoryInstance {
  constructor(private repo: ClientPortalRepository = new ClientPortalRepository()) {}

  // ─── OTP ─────────────────────────────────────────────────────
  async requestOtp(phone: string, name: string, ip?: string) {
    const normalized = normalizePhone(phone);

    const existing = await this.repo.findIdentityByPhone(normalized);
    let identityId = existing?.id;

    if (!existing) {
      const identity = await this.repo.createIdentity({
        name,
        phone,
        normalizedPhone: normalized,
      });
      identityId = identity.id;
    }

    const code = generateOtpCode();
    const codeHash = await hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

    await this.repo.createOtpChallenge({
      phone,
      normalizedPhone: normalized,
      codeHash,
      identityId,
      ipAddress: ip,
      expiresAt,
    });

    return { code, expiresAt, identityId };
  }

  async verifyOtp(phone: string, code: string) {
    const normalized = normalizePhone(phone);

    const challenge = await this.repo.findLatestPendingOtp(normalized);
    if (!challenge) {
      throw new AppError("Código expirado ou não encontrado", 400);
    }

    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await this.repo.markOtpFailed(challenge.id);
      throw new AppError("Máximo de tentativas excedido", 429);
    }

    const valid = await compare(code, challenge.codeHash);
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await this.repo.incrementOtpAttempts(challenge.id, attempts);
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.repo.markOtpFailed(challenge.id);
      }
      throw new AppError(
        `Código inválido. ${OTP_MAX_ATTEMPTS - attempts} tentativa(s) restante(s)`,
        400
      );
    }

    const identityId = challenge.identityId;
    if (!identityId) {
      throw new AppError("Erro interno: challenge sem identity", 500);
    }

    await this.repo.markOtpVerified(challenge.id, identityId);
    await this.repo.markPhoneVerified(identityId);

    const session = await this.createSession(identityId, phone);

    const identity = await this.repo.findIdentityByPhone(normalized);

    return {
      identity: identity!,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  // ─── Sessions ────────────────────────────────────────────────
  async createSession(identityId: string, ip?: string) {
    const accessToken = this.generateToken();
    const refreshToken = this.generateToken();
    const accessTokenHash = await hash(accessToken, BCRYPT_ROUNDS);
    const refreshTokenHash = await hash(refreshToken, BCRYPT_ROUNDS);

    const expiresAt = new Date(
      Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60_000
    );

    const session = await this.repo.createSession({
      identityId,
      accessTokenHash,
      refreshTokenHash,
      ipAddress: ip,
      expiresAt,
    });

    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
      expiresAt,
    };
  }

  async refreshSession(refreshToken: string) {
    const sessions = await prisma.clientSession.findMany({
      where: { revokedAt: null },
    });

    for (const session of sessions) {
      const valid = await compare(refreshToken, session.refreshTokenHash);
      if (valid) {
        if (new Date() > session.expiresAt) {
          await this.repo.revokeSession(session.id);
          continue;
        }

        await this.repo.revokeSession(session.id);
        const newSession = await this.createSession(session.identityId);
        return newSession;
      }
    }

    throw new AppError("Refresh token inválido", 401);
  }

  private generateToken(): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let token = "";
    for (let i = 0; i < 64; i++) {
      token += chars[randomInt(0, chars.length)];
    }
    return token;
  }

  // ─── Salon Links ─────────────────────────────────────────────
  async requestLink(identityId: string, barbershopId: string, salonClientId?: string) {
    const existing = await this.repo.findLinkByIdentityAndSalon(
      identityId,
      barbershopId
    );
    if (existing) {
      if (existing.status === "REVOKED") {
        throw new AppError("Vínculo foi revogado. Aguarde reaprovação.", 403);
      }
      if (existing.status === "CONFIRMED") {
        throw new AppError("Já vinculado a este salão", 409);
      }
      throw new AppError("Solicitação de vínculo já pendente", 409);
    }

    return this.repo.createSalonLink({
      identityId,
      barbershopId,
      salonClientId,
    });
  }

  async confirmLink(linkId: string, barbershopId: string, confirmedById?: string, salonClientId?: string) {
    const existing = await prisma.clientSalonLink.findUnique({
      where: { id: linkId },
    });
    if (!existing) throw new AppError("Vínculo não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Vínculo não pertence a esta barbearia", 403);
    }
    if (existing.status !== "PENDING") {
      throw new AppError("Vínculo não está pendente", 400);
    }
    return this.repo.confirmSalonLink(linkId, confirmedById, salonClientId);
  }

  async rejectLink(linkId: string, barbershopId: string, rejectedById?: string, reason?: string) {
    const existing = await prisma.clientSalonLink.findUnique({
      where: { id: linkId },
    });
    if (!existing) throw new AppError("Vínculo não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Vínculo não pertence a esta barbearia", 403);
    }
    if (existing.status !== "PENDING") {
      throw new AppError("Vínculo não está pendente", 400);
    }
    return this.repo.rejectSalonLink(linkId, rejectedById, reason);
  }

  async revokeLink(linkId: string, barbershopId: string) {
    const existing = await prisma.clientSalonLink.findUnique({
      where: { id: linkId },
    });
    if (!existing) throw new AppError("Vínculo não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Vínculo não pertence a esta barbearia", 403);
    }
    return this.repo.revokeSalonLink(linkId);
  }

  async listPendingLinks(barbershopId: string) {
    return this.repo.listLinksByBarbershop(barbershopId, "PENDING");
  }

  async listAllLinks(barbershopId: string) {
    return this.repo.listLinksByBarbershop(barbershopId);
  }

  async listMyLinks(identityId: string) {
    return this.repo.listLinksByIdentity(identityId);
  }

  async getMe(identityId: string) {
    const identity = await this.repo.findIdentityById(identityId);
    if (!identity) throw new AppError("Identidade não encontrada", 404);
    return identity;
  }

  async logout(sessionId: string) {
    await this.repo.revokeSession(sessionId);
  }

  async logoutAll(identityId: string) {
    await this.repo.revokeAllSessions(identityId);
  }

  async revokeOwnLink(identityId: string, linkId: string) {
    const link = await this.repo.findLinkById(linkId);
    if (!link || link.identityId !== identityId) {
      throw new AppError("Vínculo não encontrado", 404);
    }
    if (link.status === "REVOKED") {
      throw new AppError("Vínculo já revogado", 400);
    }
    return this.repo.revokeSalonLink(linkId);
  }

  // ─── Care Instructions ───────────────────────────────────────
  async createCareTemplate(
    barbershopId: string,
    data: { serviceId?: string; title: string; content: string }
  ) {
    return this.repo.createCareTemplate({ barbershopId, ...data });
  }

  async updateCareTemplate(
    id: string,
    barbershopId: string,
    data: { title?: string; content?: string; serviceId?: string; isActive?: boolean }
  ) {
    const result = await this.repo.updateCareTemplate(id, barbershopId, data);
    if (result.count === 0) {
      throw new AppError("Template não encontrado", 404);
    }
    return this.repo.findCareTemplate(id);
  }

  async listCareTemplates(barbershopId: string) {
    return this.repo.listCareTemplates(barbershopId);
  }

  async deleteCareTemplate(id: string, barbershopId: string) {
    const result = await this.repo.deleteCareTemplate(id, barbershopId);
    if (result.count === 0) {
      throw new AppError("Template não encontrado", 404);
    }
  }

  async sendCareInstruction(
    barbershopId: string,
    data: {
      identityId: string;
      appointmentId?: string;
      templateId?: string;
      title: string;
      content: string;
      sentById?: string;
    }
  ) {
    let templateVersion = 1;
    if (data.templateId) {
      const template = await this.repo.findCareTemplate(data.templateId);
      if (template) templateVersion = template.version;
    }

    return this.repo.createCareInstruction({
      barbershopId,
      ...data,
      templateVersion,
    });
  }

  async listCareInstructions(barbershopId: string, identityId?: string) {
    return this.repo.listCareInstructions(barbershopId, identityId);
  }

  async markCareInstructionRead(id: string, identityId: string) {
    const instruction = await prisma.clientCareInstruction.findUnique({
      where: { id },
      select: { id: true, identityId: true },
    });
    if (!instruction) throw new AppError("Instrução não encontrada", 404);
    if (instruction.identityId !== identityId) {
      throw new AppError("Instrução não pertence a este cliente", 403);
    }
    return this.repo.markCareInstructionRead(id);
  }

  async listMyCareInstructions(identityId: string, barbershopId?: string) {
    return this.repo.listCareInstructionsByIdentity(identityId, barbershopId);
  }

  // ─── Portal Dashboard ────────────────────────────────────────
  async getPortalDashboard(barbershopId: string, identityId: string) {
    return this.repo.getPortalDashboard(barbershopId, identityId);
  }

  async getPortalHistory(barbershopId: string, identityId: string, page = 1, limit = 20) {
    return this.repo.getPortalHistory(barbershopId, identityId, page, limit);
  }
}
