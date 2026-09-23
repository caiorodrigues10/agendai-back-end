import { FastifyRequest, FastifyReply } from "fastify";
import {
  createReportSchema,
  listMyReportsQuerySchema,
  addCommentSchema,
} from "./supportSchema";
import { SupportUseCases } from "./supportUseCases";

export class SupportController {
  private useCases = new SupportUseCases();

  async createReport(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createReportSchema.parse(request.body);

    const ticket = await this.useCases.createReport(
      user.id,
      user.barbershopId ?? null,
      body
    );

    reply.status(201).send({ success: true, data: ticket });
  }

  async listMyReports(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listMyReportsQuerySchema.parse(request.query);

    const result = await this.useCases.listMyReports(user.id, query);

    reply.send({ success: true, data: result.data, meta: result.meta });
  }

  async getMyReport(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const ticket = await this.useCases.getMyReport(user.id, id, user.role);

    reply.send({ success: true, data: ticket });
  }

  async addComment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = addCommentSchema.parse(request.body);

    const comment = await this.useCases.addComment(user.id, id, body.text, user.role);

    reply.status(201).send({ success: true, data: comment });
  }
}
