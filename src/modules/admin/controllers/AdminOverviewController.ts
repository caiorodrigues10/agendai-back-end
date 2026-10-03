import { FastifyRequest, FastifyReply } from "fastify";
import { adminOverviewQuerySchema } from "../schemas/adminOverviewSchemas";
import { getAdminOverview } from "../useCases/adminOverview/getAdminOverview";

export class AdminOverviewController {
  async getOverview(request: FastifyRequest, reply: FastifyReply) {
    const { period } = adminOverviewQuerySchema.parse(request.query);
    const overview = await getAdminOverview(period);

    return reply.status(200).send({ success: true, data: overview });
  }
}
