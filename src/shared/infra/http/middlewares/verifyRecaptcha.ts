import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";

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
  if (!RECAPTCHA_SECRET) {
    logger.warn("RECAPTCHA_SECRET_KEY not set — skipping verification");
    return;
  }

  const { recaptchaToken } = request.body as { recaptchaToken?: string };
  if (!recaptchaToken) {
    throw new AppError("Token de verificação ausente", 403);
  }

  const action = request.url.split("?")[0].replace("/api/auth/", "").replace("/auth/", "");

  try {
    const result = await verifyToken(recaptchaToken, request.ip, action);

    if (!result.success) {
      logger.warn({ errorCodes: result.errorCodes, ip: request.ip }, "reCAPTCHA verification failed");
      throw new AppError("Verificação de segurança falhou", 403);
    }

    if (result.score !== undefined && result.score < RECAPTCHA_MIN_SCORE) {
      logger.warn({ score: result.score, ip: request.ip, action }, "reCAPTCHA score too low");
      throw new AppError("Verificação de segurança falhou", 403);
    }

    logger.debug({ score: result.score, ip: request.ip, action }, "reCAPTCHA OK");
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, ip: request.ip }, "reCAPTCHA service error — allowing request (fail open)");
  }
}
