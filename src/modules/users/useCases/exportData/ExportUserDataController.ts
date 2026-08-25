import { FastifyReply, FastifyRequest } from "fastify";
import { ExportUserDataUseCase } from "./ExportUserDataUseCase";

export class ExportUserDataController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const { id: userId } = request.user as { id: string; role: string; barbershopId?: string; cpf?: string };
    const { format } = request.query as { format?: "json" | "csv" };

    const exportUserDataUseCase = new ExportUserDataUseCase();

    const result = await exportUserDataUseCase.execute({ userId, format });

    if (format === "csv") {
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header(
        "Content-Disposition",
        `attachment; filename="export-${userId}-${Date.now()}.csv"`
      );
      return reply.send(result);
    }

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header(
      "Content-Disposition",
      `attachment; filename="export-${userId}-${Date.now()}.json"`
    );
    return reply.send(result);
  }
}