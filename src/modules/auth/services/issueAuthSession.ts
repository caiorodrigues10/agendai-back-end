import { sign, Secret, SignOptions } from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { FastifyReply } from "fastify";
import auth from "@/config/auth";
import { prisma } from "@/libs/prismaClient";
import { parseDuration } from "@/shared/utils/authUtils";
import { getAuthCookieSecurityOptions } from "../utils/authCookieOptions";

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: string;
  barbershopId: string | null;
  cpf: string | null;
  emailVerified?: boolean;
}

function mapRole(role: string): "admin" | "owner" | "employee" {
  if (role === "MASTER_ADMIN") return "admin";
  if (role === "OWNER") return "owner";
  return "employee";
}

/**
 * Emite uma sessão de autenticação com DOIS refresh tokens independentes:
 *
 * 1. **Token de sessão** (`purpose: 'session'`) — cookie `refresh_token`.
 *    - Rotacionado a cada /refresh.
 *    - Revogado no /logout (Sair normal).
 *    - Se rememberMe=false, NÃO tem maxAge (session cookie — morre ao fechar o browser).
 *
 * 2. **Token de dispositivo lembrado** (`purpose: 'remembered_device'`) — cookie `saved_refresh_{userId}`.
 *    - SEMPRE tem maxAge (sobrevive ao fechar o browser).
 *    - Criado em todo login, independente de rememberMe.
 *    - NÃO é rotacionado no /refresh.
 *    - NÃO é revogado no /logout (Sair normal).
 *    - Revogado apenas no /forget-account ou /revoke-all-sessions.
 */
export async function issueAuthSession(user: UserLike, reply?: FastifyReply, rememberMe = true) {
  const accessOpts: SignOptions = { subject: user.id, expiresIn: auth.expiresIn as any };
  const accessToken = sign(
    { role: user.role, barbershopId: user.barbershopId ?? undefined },
    auth.secret as Secret,
    accessOpts
  );

  const refreshExpiresMs = parseDuration(auth.refreshExpiresIn);
  const expiresAt = new Date(Date.now() + refreshExpiresMs);
  const refreshOpts: SignOptions = { expiresIn: auth.refreshExpiresIn as any };

  // --- Token de sessão (purpose: 'session') ---
  const sessionToken = sign(
    { sub: user.id, jti: randomUUID(), persistent: rememberMe, purpose: "session" as const },
    auth.refreshSecret as Secret,
    refreshOpts
  );

  // --- Token de dispositivo lembrado (purpose: 'remembered_device') — SEMPRE criado ---
  const rememberedDeviceToken = sign(
    { sub: user.id, jti: randomUUID(), persistent: true, purpose: "remembered_device" as const },
    auth.refreshSecret as Secret,
    refreshOpts
  );

  // Limpar tokens expirados deste usuário
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, expiresAt: { lt: new Date() } }
  });

  // Criar registro de sessão
  await prisma.refreshToken.create({
    data: { token: sessionToken, userId: user.id, purpose: "session", expiresAt }
  });

  // Criar registro de dispositivo lembrado (sempre)
  await prisma.refreshToken.create({
    data: { token: rememberedDeviceToken, userId: user.id, purpose: "remembered_device", expiresAt }
  });

  if (reply) {
    // Cookie de sessão — SEM maxAge quando rememberMe=false (session cookie)
    reply.setCookie('refresh_token', sessionToken, {
      ...getAuthCookieSecurityOptions(),
      ...(rememberMe ? { maxAge: refreshExpiresMs / 1000 } : {}),
    });

    // Cookie de dispositivo lembrado — SEMPRE com maxAge
    reply.setCookie(`saved_refresh_${user.id}`, rememberedDeviceToken, {
      ...getAuthCookieSecurityOptions(),
      maxAge: refreshExpiresMs / 1000,
    });
  }

  const session = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: mapRole(user.role),
      barbershopId: user.barbershopId ?? undefined,
      emailVerified: user.emailVerified ?? false,
    },
    accessToken,
  };

  return reply ? session : { ...session, refreshToken: sessionToken };
}
