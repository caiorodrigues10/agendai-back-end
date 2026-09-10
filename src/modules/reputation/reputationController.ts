import { FastifyRequest, FastifyReply } from "fastify";
import { respondToReviewSchema, reputationQuerySchema } from "./reputationSchema";
import { ReputationUseCases } from "./reputationUseCases";
import { AppError } from "@/shared/errors/AppError";

export class ReputationController {
  private useCases = new ReputationUseCases();

  async getReputation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const reputation = await this.useCases.getReputation(barbershopId);
    reply.send({ success: true, data: reputation });
  }

  async computeReputation(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const reputation = await this.useCases.computeReputation(resolvedBarbershopId);
    reply.send({ success: true, data: reputation });
  }

  async respondToReview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, reviewId } = request.params as { barbershopId: string; reviewId: string };
    const body = respondToReviewSchema.parse(request.body);

    const response = await this.useCases.respondToReview(reviewId, user.id, body);
    reply.status(201).send({ success: true, data: response });
  }

  async getReviewResponse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { reviewId } = request.params as { reviewId: string };
    const response = await this.useCases.getReviewResponse(reviewId);
    reply.send({ success: true, data: response });
  }
}
