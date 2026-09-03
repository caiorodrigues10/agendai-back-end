import fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { registerRoutes } from "./routes";
import { apiRoutes } from "./routes/api";
import { realtimeHub } from "@/shared/services/realtimeService";
import { healthRoutes } from "./health";
import { correlationIdMiddleware } from "./middlewares/correlationId";
import { setupSwagger } from "@/config/swagger";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { RedisRateLimitStore } from "./redisRateLimitStore";
import { buildSafeAuditDetails, sanitizeSensitiveText } from "@/shared/utils/securitySanitization";

export async function buildApp() {
  const app = fastify({
    // Silencia logs nos testes de inject (NODE_ENV=test)
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(cookie);

  // CORS com whitelist de origens configurável via env
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = (process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

      // Sem origin = requisição server-side (webhook do MP, ferramentas internas) → permitir
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowed.includes(origin)) {
        cb(null, true);
        return;
      }
      // Dev: aceitar localhost / 127.0.0.1 em qualquer porta comum do Vite
      if (process.env.NODE_ENV !== "production") {
        try {
          const url = new URL(origin);
          if (
            (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
            ["http:", "https:"].includes(url.protocol)
          ) {
            cb(null, true);
            return;
          }
        } catch {
          /* ignore invalid origin */
        }
      }
      cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Signature",
      "X-Request-Id",
      "X-Webhook-Signature",
      "X-Correlation-Id",
      "Idempotency-Key",
    ],
    exposedHeaders: ["X-Correlation-Id"],
  });

  // Global correlation ID middleware
  app.addHook("onRequest", correlationIdMiddleware);

  // Health check routes (registered before auth-protected routes)
  await app.register(healthRoutes);

  // Headers de segurança via Helmet
  const isProd = process.env.NODE_ENV === "production";
  await app.register(helmet, {
    contentSecurityPolicy: isProd ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.google.com", "https://www.gstatic.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://www.google.com"],
        frameSrc: ["https://www.google.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    } : false,
    hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: ["'self'"],
    },
  } as any);

  // Rate-limit global — Redis store em produção, in-memory em testes
  const rateLimitWindowMs = 60_000; // 1 minute
  const rateLimitConfig: Record<string, unknown> = {
    global: true,
    max: 400,
    timeWindow: rateLimitWindowMs,
    allowList: (req: { url?: string }) => (req.url ?? "").split("?")[0] === "/api/ws",
    errorResponseBuilder: () => ({
      statusCode: 429,
      success: false,
      message: "Muitas requisições. Tente novamente em alguns instantes.",
    }),
  };
  if (!process.env.VITEST) {
    rateLimitConfig.store = RedisRateLimitStore;
  }
  await app.register(rateLimit, rateLimitConfig);

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

  await app.register(websocket, {
    options: { maxPayload: 16 * 1024 },
  });

  // Rotas
  await registerRoutes(app);
  await app.register(apiRoutes, { prefix: "/api" });

  if (!process.env.VITEST) {
    await realtimeHub.start();
    app.addHook("onClose", async () => {
      await realtimeHub.stop();
    });
  }

  // Hook de auditoria global para mutações autenticadas.
  // Usa "onResponse" (roda DEPOIS do handler) para garantir que
  // request.user já foi populado pelo middleware authenticate.
  // Em "preHandler" global, request.user é undefined porque os
  // middlewares de roda (authenticate) ainda não rodaram.
  app.addHook("onResponse", async (request, reply) => {
    if (
      !["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ||
      !request.user
    ) return;
    if (request.url.includes("/api/admin/audit-logs")) return;
    if (reply.statusCode >= 400) return;

    try {
      await prisma.auditLog.create({
        data: {
          userId: (request.user as any).id,
          action: `${request.method} ${request.url.split("?")[0]}`,
          resource: request.url.split("/")[2] || "API",
          resourceId: (request.params as any)?.id || null,
          details: buildSafeAuditDetails(request.body),
          ipAddress: request.ip,
        },
      });
    } catch (err) {
      request.log.error(err as any, "Failed to create audit log");
    }
  });

  // Handler global de erros
  app.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Log to error_logs table (async, non-blocking)
    prisma.errorLog.create({
      data: {
        userId: (request.user as any)?.id ?? null,
        statusCode,
        code: error.code ?? null,
        message: sanitizeSensitiveText(error.message ?? "Unknown error", 2000) ?? "Unknown error",
        stack: sanitizeSensitiveText(error.stack, 5000),
        path: request.url.split("?")[0],
        method: request.method,
        ipAddress: request.ip ?? null,
      },
    }).catch(() => {}); // Never block the response

    if (error instanceof AppError) {
      let extras: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(error.message);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          extras = parsed as Record<string, unknown>;
        }
      } catch {
        // message é uma string comum — segue o fluxo padrão
      }

      reply.status(error.statusCode).send({
        success: false,
        ...(extras ?? {}),
        ...(error.code ? { code: error.code } : {}),
        message:
          extras && typeof extras.message === "string"
            ? extras.message
            : error.message,
        errors: error.errors,
        correlationId: request.correlationId,
      });
      return;
    }
    // Rate limit errors do @fastify/rate-limit
    if ((error as any).statusCode === 429) {
      reply.status(429).send({
        success: false,
        message: "Muitas requisições. Tente novamente em alguns instantes.",
        correlationId: request.correlationId,
      });
      return;
    }
    request.log.error(error);
    reply.status(500).send({
      success: false,
      message: "Erro interno do servidor",
      correlationId: request.correlationId,
    });
  });

  return app;
}
