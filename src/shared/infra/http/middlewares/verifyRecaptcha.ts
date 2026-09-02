import { FastifyRequest, FastifyReply } from "fastify";
import { getModuleLogger } from "@/shared/utils/logger";
import { AppError } from "@/shared/errors/AppError";

const logger = getModuleLogger("recaptcha");
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY || "";
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE || "0.5");
const VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const TIMEOUT_MS = 5000;

interface RecaptchaResponse {
  success: boolean;
  score?: number;
  action?: string;
  errorCodes?: string[];
}

async function verifyToken(token: string, ip: string, action: string): Promise<RecaptchaResponse> {
  const body = new URLSearchParams({
    secret: RECAPTCHA_SECRET,
    response: token,
    remoteip: ip,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: controller.signal,
    });
    return (await resp.json()) as RecaptchaResponse;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyRecaptcha(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  const isProduction = process.env.NODE_ENV === "production";
  if (!RECAPTCHA_SECRET) {
    if (isProduction) {
      logger.error("RECAPTCHA_SECRET_KEY not set in production");
      throw new AppError("Proteção antiabuso indisponível. Tente novamente mais tarde.", 503, undefined, "RECAPTCHA_UNAVAILABLE");
    }
    logger.warn("RECAPTCHA_SECRET_KEY not set — skipping verification outside production");
    return;
  }

  const { recaptchaToken } = request.body as { recaptchaToken?: string };
  if (!recaptchaToken) {
    logger.warn({ ip: request.ip }, "recaptchaToken ausente");
    throw new AppError("Não foi possível validar a proteção antiabuso.", 400, undefined, "RECAPTCHA_REQUIRED");
  }

  const action = request.url.split("?")[0].replace("/api/auth/", "").replace("/auth/", "");

  try {
    const result = await verifyToken(recaptchaToken, request.ip, action);

    if (!result.success) {
      logger.warn({ errorCodes: result.errorCodes, ip: request.ip }, "reCAPTCHA verification failed");
      throw new AppError("Validação antiabuso recusada.", 403, undefined, "RECAPTCHA_REJECTED");
    }

    if (result.score !== undefined && result.score < RECAPTCHA_MIN_SCORE) {
      logger.warn({ score: result.score, ip: request.ip, action }, "reCAPTCHA score too low");
      throw new AppError("Validação antiabuso recusada.", 403, undefined, "RECAPTCHA_REJECTED");
    }

    logger.debug({ score: result.score, ip: request.ip, action }, "reCAPTCHA OK");
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, ip: request.ip }, "reCAPTCHA service error");
    throw new AppError("Proteção antiabuso temporariamente indisponível.", 503, undefined, "RECAPTCHA_UNAVAILABLE");
  }
}
