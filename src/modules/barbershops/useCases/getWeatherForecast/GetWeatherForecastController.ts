import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetWeatherForecastUseCase } from "./GetWeatherForecastUseCase";

export class GetWeatherForecastController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const { days } = request.query as { days?: string };
    const parsedDays = days ? Number.parseInt(days, 10) : 7;
    const useCase = container.resolve(GetWeatherForecastUseCase);
    const data = await useCase.execute(id, request.user!, Number.isFinite(parsedDays) ? parsedDays : 7);
    reply.send({ success: true, data });
  }
}
