import fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes";
import { apiRoutes } from "./routes/api";
import { setupSwagger } from "@/config/swagger";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export async function buildApp() {
  const app = fastify({ logger: true });

  // CORS com whitelist de origens configurável via env
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
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Signature",
      "X-Request-Id",
    ],
  });

  // Headers de segurança via Helmet
  await app.register(helmet, {
    contentSecurityPolicy: process.env.NODE_ENV === "production",
  });

  // Rate-limit global
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      success: false,
      message: "Muitas requisições. Tente novamente em alguns instantes.",
    }),
  });

  // Suporte a upload multipart/form-data
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB máximo por arquivo
      files: 1,
      fields: 5,
    },
  });

  // Swagger (documentação automática da API)
  await setupSwagger(app);

  // Rotas
  await registerRoutes(app);
  await app.register(apiRoutes, { prefix: "/api" });

  // Hook de auditoria global para mutações autenticadas
  app.addHook("preHandler", async (request) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      request.user
    ) {
      if (request.url.includes("/api/admin/audit-logs")) return;

      try {
        await prisma.auditLog.create({
          data: {
            userId: (request.user as any).id,
            action: `${request.method} ${request.url.split("?")[0]}`,
            resource: request.url.split("/")[2] || "API",
            resourceId: (request.params as any)?.id || null,
            details: JSON.stringify(request.body).substring(0, 500),
            ipAddress: request.ip,
          },
        });
      } catch (err) {
        request.log.error(err as any, "Failed to create audit log");
      }
    }
  });

  // Handler global de erros
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: error.errors,
      });
      return;
    }
    // Rate limit errors do @fastify/rate-limit
    if ((error as any).statusCode === 429) {
      reply.status(429).send({
        success: false,
        message: "Muitas requisições. Tente novamente em alguns instantes.",
      });
      return;
    }
    request.log.error(error);
    reply.status(500).send({
      success: false,
      message: "Erro interno do servidor",
    });
  });

  return app;
}
