import { sign, Secret, SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { FastifyReply } from "fastify";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: string;
  barbershopId: string | null;
  cpf: string | null;
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

export async function issueAuthSession(user: UserLike, reply?: FastifyReply) {
  const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
  const accessToken = sign(
    { role: user.role, barbershopId: user.barbershopId ?? undefined, cpf: user.cpf ?? undefined },
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
    where: { userId: user.id, expiresAt: { lt: new Date() } }
  });

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt }
  });

  if (reply) {
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  const session = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: mapRole(user.role),
      barbershopId: user.barbershopId ?? undefined
    },
    accessToken,
  };

  return reply ? session : { ...session, refreshToken };
}
