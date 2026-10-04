import { FastifyReply, FastifyRequest } from "fastify";
import {
  createSurveysForShop,
  listSurveys,
  npsSummary,
} from "../services/npsService";
import type {
  NpsCreateSurveysBody,
  NpsListQuery,
  NpsSummaryQuery,
} from "../npsSchemas";

/**
 * NPS real do painel master: criação de pesquisas elegíveis, listagem
 * (contato mascarado) e agregado de 90 dias com flag "sem dados suficientes".
 */
export class AdminNpsController {
  async createSurveys(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as NpsCreateSurveysBody;
    const result = await createSurveysForShop({
      barbershopId: body.barbershopId,
      limit: body.limit,
      requestedBy: request.user!.id,
      ipAddress: request.ip,
    });
    return reply.status(201).send({ success: true, data: result });
  }

  async summary(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as NpsSummaryQuery;
    const data = await npsSummary(query.barbershopId);
    return reply.status(200).send({ success: true, data });
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as NpsListQuery;
    const data = await listSurveys({
      barbershopId: query.barbershopId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    return reply.status(200).send({ success: true, data });
  }
}
