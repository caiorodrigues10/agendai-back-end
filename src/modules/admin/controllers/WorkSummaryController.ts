import { FastifyRequest, FastifyReply } from "fastify";
import { GetWorkSummaryUseCase } from "../useCases/workSummary/GetWorkSummaryUseCase";

export class WorkSummaryController {
  async get(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.id;
    const useCase = new GetWorkSummaryUseCase();
    const summary = await useCase.execute(userId);
    return reply.send({ success: true, data: summary });
  }
}
