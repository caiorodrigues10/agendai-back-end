import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { readPublicAppointmentToken } from "../services/publicAppointmentToken";
import { authenticate } from "@/shared/infra/http/middlewares/authenticate";
import { authorize } from "@/shared/infra/http/middlewares/authorize";
import { checkSubscription } from "@/shared/infra/http/middlewares/checkSubscription";
import { setRlsContext } from "@/shared/infra/http/middlewares/setRlsContext";
import { ReviewInvitationService } from "@/modules/reputation/reviewInvitationService";

const reviewSchema = z.object({
  token: z.string().min(20).max(4096),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(200).optional(),
});

const listQuerySchema = z.object({
  staffId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const reviewInvitationService = new ReviewInvitationService();

export async function reviewRoutes(app: FastifyInstance) {
  app.get("/reviews/public/context", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20).max(4096) }).parse(request.query);
    const context = await reviewInvitationService.getContext(token);
    reply.send({ success: true, data: context });
  });

  app.get("/barbershops/:id/reviews", async (request, reply) => {
    const barbershopId = (request.params as { id: string }).id;
    const query = listQuerySchema.parse(request.query);
    const where = {
      barbershopId,
      status: "PUBLISHED" as const,
      ...(query.staffId ? { staffId: query.staffId } : {}),
    };
    const [summary, reviews] = await Promise.all([
      reviewInvitationService.getPublicSummary(barbershopId),
      prisma.clientReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: query.limit,
        select: {
          id: true,
          rating: true,
          comment: true,
          response: true,
          createdAt: true,
          client: { select: { name: true } },
          staff: { select: { name: true } },
          reviewResponse: { select: { content: true, respondedAt: true } },
        },
      }),
    ]);
    reply.send({
      success: true,
      data: {
        ...summary,
        reviews: reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          response: review.reviewResponse?.content ?? review.response ?? null,
          createdAt: review.createdAt,
          clientName: review.client?.name ?? "Cliente",
          staff: review.staff,
        })),
      },
    });
  });

  app.post("/appointments/public/review", async (request, reply) => {
    const body = reviewSchema.parse(request.body);
    const review = await reviewInvitationService.submit(body.token, body.rating, body.comment);
    reply.status(201).send({ success: true, data: review });
  });

  app.post("/appointments/public/review/legacy", async (request, reply) => {
    const body = reviewSchema.parse(request.body);
    const token = readPublicAppointmentToken(body.token, "manage");
    const appointment = await prisma.appointment.findFirst({
      where: { id: token.sub, barbershopId: token.barbershopId, publicAccessVersion: token.version },
      select: { id: true, status: true },
    });
    if (!appointment || appointment.status !== "COMPLETED") {
      throw new AppError("A avaliação ficará disponível após o atendimento.", 409, undefined, "REVIEW_NOT_AVAILABLE");
    }
    await reviewInvitationService.createForAppointment(appointment.id);
    throw new AppError(
      "Este link antigo foi atualizado. Abra o link de avaliação enviado por WhatsApp.",
      409,
      undefined,
      "REVIEW_LINK_UPGRADED",
    );
  });

  app.patch(
    "/reviews/:id",
    { preHandler: [authenticate, authorize(["MASTER_ADMIN", "OWNER"]), checkSubscription, setRlsContext] },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const body = z.object({
        response: z.string().trim().min(2).max(1000).optional(),
        report: z.boolean().optional(),
      }).parse(request.body);
      const review = await prisma.clientReview.findUnique({
        where: { id },
        select: { id: true, barbershopId: true },
      });
      if (!review || (request.user!.role !== "MASTER_ADMIN" && review.barbershopId !== request.user!.barbershopId)) {
        throw new AppError("Avaliação não encontrada", 404);
      }
      const updated = await prisma.clientReview.update({
        where: { id },
        data: {
          ...(body.response !== undefined ? { response: body.response, respondedAt: new Date() } : {}),
          ...(body.report ? { reportedAt: new Date() } : {}),
        },
      });
      reply.send({ success: true, data: updated });
    },
  );
}
