import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { revokeAllSessionsForUser, revokeSessionRow } from "../../services/userSessionService";

@injectable()
export class LogoutUseCase {
  /**
   * Revoga o token de sessão (purpose: 'session') e a `UserSession` ligada ao
   * `sid` do token atual. O dispositivo lembrado é preservado — "contas salvas"
   * continuam funcionando depois do logout normal.
   */
  async execute(userId: string, refreshToken?: string, sid?: string): Promise<number> {
    let count = 0;

    if (refreshToken) {
      const result = await prisma.refreshToken.deleteMany({
        where: { userId, token: refreshToken, purpose: "session" },
      });
      count = result.count;
    }

    if (sid) {
      let row: {
        id: string;
        userId: string;
        revokedAt: Date | null;
        refreshTokenId: string | null;
        rememberedTokenId: string | null;
      } | null = null;
      try {
        row = await prisma.userSession.findUnique({
          where: { id: sid },
          select: {
            id: true,
            userId: true,
            revokedAt: true,
            refreshTokenId: true,
            rememberedTokenId: true,
          },
        });
      } catch {
        row = null;
      }
      if (row && row.userId === userId && !row.revokedAt) {
        await revokeSessionRow(row, { reason: "logout", keepRemembered: true });
      }
    }

    return count;
  }

  /** Revoga SOMENTE os tokens de dispositivo lembrado (purpose: 'remembered_device'). */
  async revokeRememberedDevice(userId: string): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId, purpose: "remembered_device" },
    });
    return result.count;
  }

  /** Revoga TODOS os tokens + todas as `UserSession` ativas do usuário. */
  async revokeAllSessions(userId: string): Promise<{ tokens: number; sessions: number }> {
    const result = await revokeAllSessionsForUser(userId, { reason: "revoke-all-sessions" });
    return { tokens: result.tokens, sessions: result.sessions };
  }
}
