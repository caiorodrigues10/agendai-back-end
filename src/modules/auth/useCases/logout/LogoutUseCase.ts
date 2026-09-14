import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";

@injectable()
export class LogoutUseCase {
  async execute(userId: string, refreshToken?: string): Promise<number> {
    if (!refreshToken) return 0;

    const result = await prisma.refreshToken.deleteMany({
      where: { userId, token: refreshToken },
    });
    return result.count;
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}
