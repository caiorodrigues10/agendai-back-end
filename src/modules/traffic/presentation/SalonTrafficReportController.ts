import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import {
  GetSalonTrafficReportUseCase,
  type SalonTrafficPayload,
} from "../application/useCases/GetSalonTrafficReportUseCase";
import type { SalonTrafficQueryInput } from "../schemas/trafficSchemas";

/**
 * Presentation for the salon owner's traffic report
 * (`GET /barbershops/:id/traffic`).
 *
 * Authorization happens in the route preHandlers (bearer + role do dono +
 * vínculo com o salão da rota). The payload carries counters only — no IP,
 * no user agent, no visitor hash, no data from another salon.
 */
export class SalonTrafficReportController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const { id } = request.params as { id: string };
    const query = request.query as SalonTrafficQueryInput;
    const user = request.user;

    const useCase = container.resolve(GetSalonTrafficReportUseCase);
    const payload = await useCase.execute({
      period: query.period,
      barbershopId: id,
      readerId: user?.id ?? "",
      readerRole: user?.role ?? "",
    });

    return reply.status(200).send({ success: true, data: payload });
  }
}

/** Reexport for tests that want the payload type without the use case. */
export type { SalonTrafficPayload };
