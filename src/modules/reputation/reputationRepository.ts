import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { respondToReviewSchema } from "./reputationSchema";

type RespondInput = z.infer<typeof respondToReviewSchema>;

const reputationSelect = {
  id: true,
  barbershopId: true,
  avgRating: true,
  totalReviews: true,
  npsScore: true,
  sentimentPositive: true,
  sentimentNeutral: true,
  sentimentNegative: true,
  computedAt: true,
  updatedAt: true,
} as const;

const reviewResponseSelect = {
  id: true,
  reviewId: true,
  respondedById: true,
  content: true,
  respondedAt: true,
  respondedBy: { select: { id: true, name: true } },
} as const;

export class ReputationRepository {
  async getReputation(barbershopId: string) {
    return prisma.salonReputation.findUnique({
      where: { barbershopId },
      select: reputationSelect,
    });
  }

  async upsertReputation(barbershopId: string, data: {
    avgRating: number;
    totalReviews: number;
    npsScore: number | null;
    sentimentPositive: number;
    sentimentNeutral: number;
    sentimentNegative: number;
  }) {
    return prisma.salonReputation.upsert({
      where: { barbershopId },
      create: { barbershopId, ...data },
      update: { ...data, computedAt: new Date() },
      select: reputationSelect,
    });
  }

  async getReviewsForBarbershop(barbershopId: string) {
    return prisma.clientReview.findMany({
      where: { barbershopId, status: "PUBLISHED" },
      select: { id: true, rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getReviewById(reviewId: string) {
    return prisma.clientReview.findUnique({
      where: { id: reviewId },
      select: { id: true, barbershopId: true, rating: true, comment: true },
    });
  }

  async getReviewResponse(reviewId: string) {
    return prisma.reviewResponse.findUnique({
      where: { reviewId },
      select: reviewResponseSelect,
    });
  }

  async createReviewResponse(reviewId: string, respondedById: string, data: RespondInput) {
    const existing = await prisma.reviewResponse.findUnique({ where: { reviewId } });
    if (existing) throw new AppError("Review já possui resposta", 409);

    const response = await prisma.reviewResponse.create({
      data: {
        reviewId,
        respondedById,
        content: data.content,
      },
      select: reviewResponseSelect,
    });

    await prisma.clientReview.update({
      where: { id: reviewId },
      data: { respondedAt: new Date() },
    });

    return response;
  }
}
