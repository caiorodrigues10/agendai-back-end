import fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { registerRoutes } from "./routes";
import { apiRoutes } from "./routes/api";
import { setupSwagger } from "@/config/swagger";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { RedisRateLimitStore } from "./redisRateLimitStore";

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
    ],
  });

  // Health check endpoints (no rate limit)
  app.get("/health", async () => {
    const dbHealthy = await checkDatabase();
    const redisHealthy = await checkRedis();

    return {
      status: dbHealthy && redisHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        db: dbHealthy ? "healthy" : "unhealthy",
        redis: redisHealthy ? "healthy" : "unhealthy",
      },
    };
  });

  app.get("/ready", async (request, reply) => {
    const dbHealthy = await checkDatabase();
    const redisHealthy = await checkRedis();

    if (dbHealthy && redisHealthy) {
      return { status: "ready" };
    }
    reply.status(503);
    return { status: "not ready" };
  });

  async function checkDatabase(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async function checkRedis(): Promise<boolean> {
    let client: import("ioredis").default | null = null;
    try {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) return false;
      const IORedis = (await import("ioredis")).default;
      client = new IORedis(redisUrl, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 0,
        lazyConnect: true,
        retryStrategy: () => null,
      });
      await new Promise<void>((resolve, reject) => {
        client!.on("error", reject);
        client!.connect().then(resolve, reject);
      });
      const pong = await client.ping();
      return pong === "PONG";
    } catch {
      return false;
    } finally {
      if (client) {
        try { client.disconnect(); } catch { /* ignore */ }
      }
    }
  }

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
  });

  // Rate-limit global — Redis store em produção, in-memory em testes
  const rateLimitWindowMs = 60_000; // 1 minute
  const rateLimitConfig: Record<string, unknown> = {
    global: true,
    max: 400,
    timeWindow: rateLimitWindowMs,
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

  // Rotas
  await registerRoutes(app);
  await app.register(apiRoutes, { prefix: "/api" });

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
          details: JSON.stringify(request.body).substring(0, 500),
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
        message: (error.message ?? "Unknown error").substring(0, 2000),
        stack: error.stack?.substring(0, 5000) ?? null,
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
        message:
          extras && typeof extras.message === "string"
            ? extras.message
            : error.message,
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
