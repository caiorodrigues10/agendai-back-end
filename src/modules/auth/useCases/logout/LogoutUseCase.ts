import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";

@injectable()
export class LogoutUseCase {
  async execute(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: { userId },
    });
    return result.count;
  }
}