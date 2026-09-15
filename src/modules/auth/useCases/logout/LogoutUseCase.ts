import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";

@injectable()
export class LogoutUseCase {
  /** Revoga SOMENTE o token de sessão (purpose: 'session'). */
  async execute(userId: string, refreshToken?: string): Promise<number> {
    if (!refreshToken) return 0;

    const result = await prisma.refreshToken.deleteMany({
      where: { userId, token: refreshToken, purpose: "session" },
    });
    return result.count;
  }

  /** Revoga SOMENTE os tokens de dispositivo lembrado (purpose: 'remembered_device'). */
  async revokeRememberedDevice(userId: string): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId, purpose: "remembered_device" },
    });
    return result.count;
  }

  /** Revoga TODOS os tokens (session + remembered_device). */
  async revokeAllSessions(userId: string): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
