import { FastifyRequest, FastifyReply } from "fastify";
import { validateSchema } from "@/shared/utils/zodValidation";
import { refreshSchema } from "../../schemas/authSchemas";
import { verify, sign, Secret, SignOptions } from "jsonwebtoken";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { UserRepository } from "@/modules/users/infra/repositories/UserRepository";

export const validateRefresh = validateSchema(refreshSchema);

export class RefreshController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { refreshToken } = request.body as { refreshToken: string };
    try {
      const decoded = verify(refreshToken, auth.refreshSecret as Secret) as any;
      const tokenRecord = await prisma.refreshToken.findFirst({ where: { token: refreshToken } });
      if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        return reply.status(401).send({ message: "Refresh token inválido" });
      }
      const userRepo = new UserRepository();
      const user = await userRepo.findById(decoded.sub);
      if (!user) return reply.status(401).send({ message: "Usuário inválido" });
      const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
      const accessToken = sign({ role: user.role, barbershopId: user.barbershopId ?? undefined, cpf: (user as any).cpf ?? undefined }, auth.secret as Secret, accessOpts);
      const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };
      const newRefreshToken = sign({ sub: user.id }, auth.refreshSecret as Secret, refreshOpts);
      // Rotaciona: apaga o token antigo e cria um novo (evita acúmulo no banco)
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      await prisma.refreshToken.create({
        data: {
          token: newRefreshToken,
          userId: decoded.sub,
          expiresAt: new Date(Date.now() + parseDuration(auth.refreshExpiresIn))
        }
      });
      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: mapRole(user.role),
          barbershopId: user.barbershopId ?? undefined
        },
        accessToken,
        refreshToken: newRefreshToken
      });
    } catch {
      return reply.status(401).send({ message: "Refresh token inválido" });
    }
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

function mapRole(role: string): "admin" | "owner" | "employee" | "customer" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  if (role === "CUSTOMER") return "customer";
  return "employee";
}
