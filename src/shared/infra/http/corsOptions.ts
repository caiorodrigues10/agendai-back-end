import { FastifyCorsOptions } from "@fastify/cors";
import { AppError } from "@/shared/errors/AppError";

/**
 * CORS da API — whitelist de origens configurável via env.
 *
 * Registrado em `routes/api.ts`, portanto o escopo é `/api`: as rotas fora do
 * prefixo (/health, /s/salon/:id, swagger) não servem JSON cross-origin e não
 * recebem cabeçalhos CORS (ver `app.security.spec.ts`).
 */
export const corsOptions: FastifyCorsOptions = {
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
    // Origem fora da whitelist: 403 explícito. Um Error genérico aqui virava
    // 500 "Erro interno do servidor" no error handler (falso alarme em
    // monitoramento e log poluído por requisição cruzada malformada).
    cb(new AppError("Origem não permitida", 403), false);
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
};
