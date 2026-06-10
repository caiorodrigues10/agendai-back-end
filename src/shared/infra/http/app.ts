import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes";
import { apiRoutes } from "./routes/api";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export async function buildApp() {
  const app = fastify({ logger: true });

  // BUG-3: CORS habilitado com whitelist de origens
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .filter(Boolean);
      // Sem origin = requisição server-side (webhook do MP, ferramentas internas) → permitir
      if (!origin || allowed.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Signature", "X-Request-Id"]
  });

  // BUG-3: Helmet para headers de segurança
  await app.register(helmet, {
    // contentSecurityPolicy false para não quebrar o Swagger UI em dev
    contentSecurityPolicy: process.env.NODE_ENV === "production"
  });

  // BUG-3: Rate-limit global — mais permissivo para APIs internas, mais rígido para público
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      success: false,
      message: "Muitas requisições. Tente novamente em alguns instantes."
    })
  });

  
  // Multipart/form-data — suporte a upload de arquivos (logos, etc.)
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB máximo por arquivo
      files: 1,                   // apenas 1 arquivo por requisição
      fields: 5,                  // máximo de campos de texto extras
    },
  });

  await registerRoutes(app);
  await app.register(apiRoutes, { prefix: "/api" });

  // Global Audit Log Hook for all API mutations
  app.addHook("preHandler", async (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && request.user) {
      if (request.url.includes("/api/admin/audit-logs")) return;

      try {
        await prisma.auditLog.create({
          data: {
            userId: (request.user as any).id,
            action: `${request.method} ${request.url.split("?")[0]}`,
            resource: request.url.split("/")[2] || "API",
            resourceId: (request.params as any)?.id || null,
            details: JSON.stringify(request.body).substring(0, 500),
            ipAddress: request.ip
          }
        });
      } catch (err) {
        request.log.error(err as any, "Failed to create audit log");
      }
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: error.errors
      });
      return;
    }
    // Rate limit errors do @fastify/rate-limit
    if ((error as any).statusCode === 429) {
      reply.status(429).send({
        success: false,
        message: "Muitas requisições. Tente novamente em alguns instantes."
      });
      return;
    }
    request.log.error(error);
    reply.status(500).send({
      success: false,
      message: "Erro interno do servidor"
    });
  });

  return app;
}
