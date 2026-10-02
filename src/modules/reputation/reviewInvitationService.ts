import crypto from "crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getFrontendUrl } from "@/shared/constants/env";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";

const REVIEW_TOKEN_BYTES = 32;
const REVIEW_EXPIRY_DAYS = 14;
const PUBLIC_REVIEW_MIN_COUNT = 3;

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function publicReviewUrl(token: string): string {
  return `${getFrontendUrl()}/avaliar#token=${encodeURIComponent(token)}`;
}

function maskClientName(name?: string | null): string {
  const clean = name?.trim();
  if (!clean) return "Cliente";
  const [first, second] = clean.split(/\s+/);
  return second ? `${first} ${second[0]}.` : first;
}

export class ReviewInvitationService {
  async createForAppointment(appointmentId: string): Promise<{ token: string; url: string } | null> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        barbershopId: true,
        clientId: true,
        staffId: true,
        status: true,
        customerName: true,
        whatsapp: true,
        service: { select: { name: true } },
        barbershop: { select: { name: true, evolutionInstanceName: true } },
      },
    });
    if (!appointment || appointment.status !== "COMPLETED") return null;
    return this.createAndNotify({
      barbershopId: appointment.barbershopId,
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      staffId: appointment.staffId,
      customerName: appointment.customerName,
      whatsapp: appointment.whatsapp,
      serviceName: appointment.service?.name ?? "atendimento",
      shopName: appointment.barbershop.name,
      instanceName: appointment.barbershop.evolutionInstanceName,
      deduplicationKey: `review:appointment:${appointment.id}`,
      sourceType: "APPOINTMENT",
      sourceId: appointment.id,
    });
  }

  async createForQueueItem(queueItemId: string): Promise<{ token: string; url: string } | null> {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      select: {
        id: true,
        barbershopId: true,
        appointmentId: true,
        clientId: true,
        completedBy: true,
        status: true,
        customerName: true,
        whatsapp: true,
        service: { select: { name: true } },
        barbershop: { select: { name: true, evolutionInstanceName: true } },
      },
    });
    if (!item || item.status !== "COMPLETED") return null;
    if (item.appointmentId) return this.createForAppointment(item.appointmentId);
    return this.createAndNotify({
      barbershopId: item.barbershopId,
      queueItemId: item.id,
      clientId: item.clientId,
      staffId: item.completedBy,
      customerName: item.customerName,
      whatsapp: item.whatsapp,
      serviceName: item.service?.name ?? "atendimento",
      shopName: item.barbershop.name,
      instanceName: item.barbershop.evolutionInstanceName,
      deduplicationKey: `review:queue:${item.id}`,
      sourceType: "QUEUE_ITEM",
      sourceId: item.id,
    });
  }

  async getContext(token: string) {
    const invitation = await this.findValidInvitation(token, { markOpened: true });
    return {
      id: invitation.id,
      expiresAt: invitation.expiresAt,
      alreadySubmitted: invitation.status === "SUBMITTED" || Boolean(invitation.review),
      barbershop: {
        id: invitation.barbershop.id,
        name: invitation.barbershop.name,
        logoUrl: invitation.barbershop.logoUrl,
        googleReviewUrl: this.googleReviewUrl(invitation.barbershop.googleReviewUrl),
      },
      serviceName: invitation.appointment?.service?.name ?? invitation.queueItem?.service?.name ?? "Atendimento",
      staffName: invitation.appointment?.staff?.name ?? null,
      customerName: invitation.appointment?.customerName ?? invitation.queueItem?.customerName ?? null,
    };
  }

  async submit(token: string, rating: number, comment?: string | null) {
    const invitation = await this.findValidInvitation(token);
    if (invitation.status === "SUBMITTED" || invitation.review) {
      throw new AppError("Este atendimento já foi avaliado.", 409, undefined, "REVIEW_ALREADY_SUBMITTED");
    }
    const safeComment = comment?.trim() || null;
    try {
      return await prisma.$transaction(async (tx) => {
        const review = await tx.clientReview.create({
          data: {
            barbershopId: invitation.barbershopId,
            appointmentId: invitation.appointmentId,
            queueItemId: invitation.queueItemId,
            invitationId: invitation.id,
            clientId: invitation.clientId,
            staffId: invitation.staffId,
            rating,
            comment: safeComment,
          },
          select: {
            id: true,
            rating: true,
            comment: true,
            createdAt: true,
          },
        });
        await tx.reviewInvitation.update({
          where: { id: invitation.id },
          data: { status: "SUBMITTED", submittedAt: new Date() },
        });
        return review;
      });
    } catch (error: any) {
      if (error?.code === "P2002") {
        throw new AppError("Este atendimento já foi avaliado.", 409, undefined, "REVIEW_ALREADY_SUBMITTED");
      }
      throw error;
    }
  }

  async getPublicSummary(barbershopId: string) {
    const where = { barbershopId, status: "PUBLISHED" as const };
    const [aggregate, reviews] = await Promise.all([
      prisma.clientReview.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      prisma.clientReview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          response: true,
          reviewResponse: { select: { content: true, respondedAt: true } },
          client: { select: { name: true } },
          staff: { select: { name: true } },
        },
      }),
    ]);
    const count = aggregate._count._all;
    return {
      average: count >= PUBLIC_REVIEW_MIN_COUNT ? aggregate._avg.rating ?? null : null,
      count,
      threshold: PUBLIC_REVIEW_MIN_COUNT,
      showAverage: count >= PUBLIC_REVIEW_MIN_COUNT,
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        clientName: maskClientName(review.client?.name),
        staff: review.staff,
        response: review.reviewResponse?.content ?? review.response ?? null,
      })),
    };
  }

  private async createAndNotify(input: {
    barbershopId: string;
    appointmentId?: string;
    queueItemId?: string;
    clientId?: string | null;
    staffId?: string | null;
    customerName: string;
    whatsapp: string;
    serviceName: string;
    shopName: string;
    instanceName?: string | null;
    deduplicationKey: string;
    sourceType: "APPOINTMENT" | "QUEUE_ITEM";
    sourceId: string;
  }): Promise<{ token: string; url: string } | null> {
    if (!input.appointmentId && !input.queueItemId) return null;
    const token = crypto.randomBytes(REVIEW_TOKEN_BYTES).toString("base64url");
    const tokenHash = sha256(token);
    const expiresAt = addDays(new Date(), REVIEW_EXPIRY_DAYS);
    const existing = await prisma.reviewInvitation.findFirst({
      where: input.appointmentId
        ? { appointmentId: input.appointmentId }
        : { queueItemId: input.queueItemId! },
      select: { id: true },
    });
    const invitation = existing
      ? await prisma.reviewInvitation.update({
          where: { id: existing.id },
          data: {
            clientId: input.clientId ?? null,
            staffId: input.staffId ?? null,
            tokenHash,
            status: "PENDING",
            sentAt: null,
            openedAt: null,
            submittedAt: null,
            revokedAt: null,
            expiresAt,
          },
          select: { id: true },
        })
      : await prisma.reviewInvitation.create({
          data: {
            barbershopId: input.barbershopId,
            appointmentId: input.appointmentId,
            queueItemId: input.queueItemId,
            clientId: input.clientId ?? null,
            staffId: input.staffId ?? null,
            tokenHash,
            expiresAt,
          },
          select: { id: true },
        });
    const url = publicReviewUrl(token);
    if (!isPlaceholderWhatsApp(input.whatsapp) && input.instanceName?.trim()) {
      await enqueueWhatsApp({
        phone: input.whatsapp,
        instanceName: input.instanceName.trim(),
        message: [
          `Olá ${input.customerName}! Obrigado por escolher ${input.shopName}.`,
          `Pode avaliar seu ${input.serviceName} em até 5 estrelas? É rapidinho: ${url}`,
        ].join("\n\n"),
        deduplicationKey: input.deduplicationKey,
        notificationType: "REVIEW_REQUESTED",
        barbershopId: input.barbershopId,
        clientId: input.clientId ?? undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
      await prisma.reviewInvitation.update({
        where: { id: invitation.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    }
    return { token, url };
  }

  private async findValidInvitation(token: string, options: { markOpened?: boolean } = {}) {
    const invitation = await prisma.reviewInvitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        review: true,
        barbershop: { select: { id: true, name: true, logoUrl: true, googleReviewUrl: true } },
        appointment: {
          select: {
            id: true,
            customerName: true,
            status: true,
            service: { select: { name: true } },
            staff: { select: { name: true } },
          },
        },
        queueItem: {
          select: {
            id: true,
            customerName: true,
            status: true,
            service: { select: { name: true } },
          },
        },
      },
    });
    if (!invitation || invitation.status === "REVOKED") {
      throw new AppError("Link de avaliação inválido.", 401, undefined, "INVALID_REVIEW_TOKEN");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      await prisma.reviewInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      }).catch(() => undefined);
      throw new AppError("O prazo para avaliar este atendimento terminou.", 410, undefined, "REVIEW_EXPIRED");
    }
    const appointmentCompleted = invitation.appointment?.status === "COMPLETED";
    const queueCompleted = invitation.queueItem?.status === "COMPLETED";
    if (!appointmentCompleted && !queueCompleted) {
      throw new AppError("A avaliação ficará disponível após o atendimento.", 409, undefined, "REVIEW_NOT_AVAILABLE");
    }
    if (options.markOpened && invitation.status === "SENT") {
      await prisma.reviewInvitation.update({
        where: { id: invitation.id },
        data: { status: "OPENED", openedAt: new Date() },
      }).catch(() => undefined);
    }
    return invitation;
  }

  private googleReviewUrl(value?: string | null): string | null {
    return value?.trim() || null;
  }
}
