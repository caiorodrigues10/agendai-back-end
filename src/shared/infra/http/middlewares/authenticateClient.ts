import { FastifyRequest, FastifyReply } from "fastify";
import { compare } from "bcryptjs";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import { tokenDigest } from "@/shared/utils/tokenDigest";

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token, ...rest] = authorization.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }
  return token;
}

export async function authenticateClient(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    throw new AppError("Token ausente", 401);
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new AppError("Token mal formatado", 401);
  }

  const digest = tokenDigest(token);
  let matchedSession = await prisma.clientSession.findFirst({
    where: { accessTokenHash: digest, revokedAt: null },
  });

  if (!matchedSession) {
    const legacy = await prisma.clientSession.findMany({
      where: { revokedAt: null, accessTokenHash: { startsWith: "$2" } },
    });
    for (const session of legacy) {
      const valid = await compare(token, session.accessTokenHash);
      if (valid) {
        await prisma.clientSession.update({
          where: { id: session.id },
          data: { accessTokenHash: digest },
        });
        matchedSession = { ...session, accessTokenHash: digest };
        break;
      }
    }
  }

  if (!matchedSession) {
    throw new AppError("Token inválido ou sessão expirada", 401);
  }

  if (new Date() > matchedSession.expiresAt) {
    throw new AppError("Sessão expirada", 401);
  }

  request.user = {
    id: matchedSession.identityId,
    role: "CLIENT",
    identityId: matchedSession.identityId,
    sessionId: matchedSession.id,
  } as FastifyRequest["user"];
}
