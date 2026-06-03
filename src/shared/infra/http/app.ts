import fastify from "fastify";
// import cors from "@fastify/cors";
// import helmet from "@fastify/helmet";
// import rateLimit from "@fastify/rate-limit";
// import { setupSwagger } from "@/config/swagger";
import { registerRoutes } from "./routes";
import { apiRoutes } from "./routes/api";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

export async function buildApp() {
  const app = fastify({ logger: true });

  // await app.register(cors, {
  //   origin: (origin, cb) => {
  //     const allowed = (process.env.ALLOWED_ORIGINS || "")
  //       .split(",")
  //       .filter(Boolean);
  //     if (!origin || allowed.includes(origin)) {
  //       cb(null, true);
  //       return;
  //     }
  //     cb(new Error("Origin not allowed"), false);
  //   }
  // });
  // await app.register(helmet);
  // await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  // await setupSwagger(app);

  await registerRoutes(app);
  await app.register(apiRoutes, { prefix: "/api" });

  // Global Audit Log Hook for all API mutations
  app.addHook("preHandler", async (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && request.user) {
      // Avoid circular logging of audit logs themselves if needed, but here it's fine
      if (request.url.includes("/api/admin/audit-logs")) return;

      try {
        await prisma.auditLog.create({
          data: {
            userId: (request.user as any).id,
            action: `${request.method} ${request.url.split('?')[0]}`,
            resource: request.url.split('/')[2] || "API",
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

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        success: false,
        message: error.message,
        errors: error.errors
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
