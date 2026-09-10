import { ReputationRepository } from "./reputationRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { respondToReviewSchema } from "./reputationSchema";

type RespondInput = z.infer<typeof respondToReviewSchema>;

export class ReputationUseCases {
  private repo = new ReputationRepository();

  async getReputation(barbershopId: string) {
    const reputation = await this.repo.getReputation(barbershopId);
    if (!reputation) {
      return {
        barbershopId,
        avgRating: 0,
        totalReviews: 0,
        npsScore: null,
        sentimentPositive: 0,
        sentimentNeutral: 0,
        sentimentNegative: 0,
        computedAt: null,
      };
    }
    return reputation;
  }

  async computeReputation(barbershopId: string) {
    const reviews = await this.repo.getReviewsForBarbershop(barbershopId);

    const totalReviews = reviews.length;
    const avgRating =
      totalReviews > 0
        ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / totalReviews
        : 0;

    const sentimentPositive = reviews.filter((r: { rating: number }) => r.rating >= 4).length;
    const sentimentNeutral = reviews.filter((r: { rating: number }) => r.rating === 3).length;
    const sentimentNegative = reviews.filter((r: { rating: number }) => r.rating <= 2).length;

    const promoters = reviews.filter((r: { rating: number }) => r.rating >= 4).length;
    const detractors = reviews.filter((r: { rating: number }) => r.rating <= 2).length;
    const npsScore =
      totalReviews > 0
        ? ((promoters - detractors) / totalReviews) * 100
        : null;

    return this.repo.upsertReputation(barbershopId, {
      avgRating,
      totalReviews,
      npsScore,
      sentimentPositive,
      sentimentNeutral,
      sentimentNegative,
    });
  }

  async respondToReview(reviewId: string, respondedById: string, data: RespondInput) {
    const review = await this.repo.getReviewById(reviewId);
    if (!review) throw new AppError("Review não encontrado", 404);

    return this.repo.createReviewResponse(reviewId, respondedById, data);
  }

  async getReviewResponse(reviewId: string) {
    const response = await this.repo.getReviewResponse(reviewId);
    if (!response) throw new AppError("Resposta não encontrada", 404);
    return response;
  }
}
