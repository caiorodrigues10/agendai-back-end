import { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate";
import { authorize } from "../middlewares/authorize";
import { setRlsContext } from "../middlewares/setRlsContext";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import {
  canReceiveEmail,
  getBarbershopEmailSettings,
  getEmailRecipients,
  setEmailPreference,
  updateBarbershopEmailSettings,
  verifyUnsubscribeToken,
  signUnsubscribeToken,
  emailCategoryLabel,
  categoryForTemplate,
  type EmailCategoryValue,
} from "@/modules/email/services/emailPreferenceService";

const VALID_CATEGORIES = new Set<EmailCategoryValue>(["ESSENTIAL", "OPERATION", "MARKETING"]);

const settingsBodySchema = z.object({
  dailyDigestEnabled: z.boolean().optional(),
  dailyDigestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timezone: z.string().max(64).optional(),
  urgentAppointmentWindowHours: z.number().int().min(1).max(168).optional(),
  lowStockEnabled: z.boolean().optional(),
  performanceSummaryFrequency: z.enum(["weekly", "monthly", "off"]).optional(),
});

function requester(request: FastifyRequest) {
  const user = request.user!;
  return { id: user.id, role: user.role, barbershopId: user.barbershopId };
}

function resolveBarbershopId(user: { id: string; role: string; barbershopId?: string | null }, paramId: string): string {
  if (user.role === "MASTER_ADMIN") return paramId;
  if (user.barbershopId !== paramId) throw new AppError("Acesso negado", 403);
  return paramId;
}

export async function emailPreferenceRoutes(app: FastifyInstance) {
  // ── Autenticadas ───────────────────────────────────────────────

  app.get("/barbershops/:barbershopId/email-preferences",
    { preHandler: [authenticate, setRlsContext] },
    async (request, reply) => {
      const user = requester(request);
      const { barbershopId } = request.params as { barbershopId: string };
      resolveBarbershopId(user, barbershopId);

      const prefs = await prisma.salonEmailPreference.findMany({
        where: { userId: user.id, barbershopId },
        select: { category: true, enabled: true },
      });

      const map = new Map(prefs.map((p: { category: string; enabled: boolean }) => [p.category, p.enabled]));
      const categories = (["ESSENTIAL", "OPERATION", "MARKETING"] as const).map((category) => ({
        category,
        label: emailCategoryLabel(category),
        enabled: map.get(category) ?? (category !== "MARKETING"),
        canDisable: category !== "ESSENTIAL",
      }));

      return reply.send({ success: true, data: categories });
    });

  app.patch("/barbershops/:barbershopId/email-preferences/me",
    { preHandler: [authenticate, setRlsContext] },
    async (request, reply) => {
      const user = requester(request);
      const { barbershopId } = request.params as { barbershopId: string };
      resolveBarbershopId(user, barbershopId);

      const body = z.object({
        category: z.enum(["OPERATION", "MARKETING"]),
        enabled: z.boolean(),
      }).parse(request.body);

      await setEmailPreference(user.id, barbershopId, body.category, body.enabled);
      return reply.send({ success: true });
    });

  app.get("/barbershops/:barbershopId/email-settings",
    { preHandler: [authenticate, authorize(["OWNER", "MASTER_ADMIN"]), setRlsContext] },
    async (request, reply) => {
      const user = requester(request);
      const { barbershopId } = request.params as { barbershopId: string };
      resolveBarbershopId(user, barbershopId);
      const settings = await getBarbershopEmailSettings(barbershopId);
      return reply.send({ success: true, data: settings });
    });

  app.patch("/barbershops/:barbershopId/email-settings",
    { preHandler: [authenticate, authorize(["OWNER", "MASTER_ADMIN"]), setRlsContext] },
    async (request, reply) => {
      const user = requester(request);
      const { barbershopId } = request.params as { barbershopId: string };
      resolveBarbershopId(user, barbershopId);
      const body = settingsBodySchema.parse(request.body);
      const updated = await updateBarbershopEmailSettings(barbershopId, body);
      return reply.send({ success: true, data: updated });
    });

  // ── Histórico (só dono/admin, e nunca expõe conteúdo) ─────────

  app.get("/barbershops/:barbershopId/email-history",
    { preHandler: [authenticate, authorize(["OWNER", "MASTER_ADMIN"]), setRlsContext] },
    async (request, reply) => {
      const user = requester(request);
      const { barbershopId } = request.params as { barbershopId: string };
      resolveBarbershopId(user, barbershopId);

      const query = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        category: z.enum(["ESSENTIAL", "OPERATION", "MARKETING"]).optional(),
        status: z.string().optional(),
        search: z.string().max(200).optional(),
      }).parse(request.query);

      const where = {
        barbershopId,
        ...(query.category && { category: query.category }),
        ...(query.status && { status: query.status.toUpperCase() }),
        ...(query.search && { subject: { contains: query.search, mode: "insensitive" as const } }),
      };

      const [logs, total] = await Promise.all([
        prisma.emailDeliveryLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          select: {
            id: true, template: true, category: true, to: true, recipientMasked: true,
            subject: true, status: true, attemptCount: true, providerId: true,
            errorCode: true, errorMessage: true, sentAt: true, deliveredAt: true,
            createdAt: true, idempotencyKey: true,
          },
        }),
        prisma.emailDeliveryLog.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: logs,
        meta: { total, page: query.page, limit: query.limit },
      });
    });

  // ── Públicas: descadastro via token assinado ───────────────────

  app.get("/public/email-preferences/unsubscribe",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { token } = request.query as { token?: string };
      if (!token) throw new AppError("Token é obrigatório", 400);
      const payload = verifyUnsubscribeToken(token);

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { name: true },
      });
      if (!user) throw new AppError("Usuário não encontrado", 404);

      return reply.send({
        success: true,
        data: {
          userName: user.name,
          category: payload.category,
          categoryLabel: emailCategoryLabel(payload.category as EmailCategoryValue),
          barbershopId: payload.barbershopId,
        },
      });
    });

  app.post("/public/email-preferences/unsubscribe",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = z.object({
        token: z.string(),
        reason: z.string().max(300).optional(),
      }).parse(request.body);
      const payload = verifyUnsubscribeToken(body.token);

      await setEmailPreference(
        payload.userId,
        payload.barbershopId,
        payload.category as EmailCategoryValue,
        false
      );

      return reply.send({ success: true, message: "Preferência atualizada." });
    });
}
