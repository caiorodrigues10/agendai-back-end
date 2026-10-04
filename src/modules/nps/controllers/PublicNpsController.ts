import { FastifyReply, FastifyRequest } from "fastify";
import { getPublicSurvey, recordResponse } from "../services/npsService";
import type { NpsAnswerBody } from "../npsSchemas";

/**
 * Fluxo público do NPS: dados da pesquisa (só nome do salão + contato
 * mascarado) e registro da resposta com consentimento LGPD obrigatório.
 */
export class PublicNpsController {
  async get(request: FastifyRequest, reply: FastifyReply) {
    const { surveyId } = request.params as { surveyId: string };
    const data = await getPublicSurvey(surveyId);
    return reply.status(200).send({ success: true, data });
  }

  async answer(request: FastifyRequest, reply: FastifyReply) {
    const { surveyId } = request.params as { surveyId: string };
    const body = request.body as NpsAnswerBody;
    const data = await recordResponse(surveyId, body);
    return reply.status(201).send({ success: true, data });
  }
}
