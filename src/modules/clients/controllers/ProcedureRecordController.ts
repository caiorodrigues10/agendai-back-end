import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import {
  CreateProcedureRecordUseCase,
  ListProcedureRecordsUseCase,
  GetLatestProcedureRecordUseCase,
  UpdateProcedureRecordUseCase,
  DeleteProcedureRecordUseCase,
} from "../useCases/procedures/procedureUseCases";

export class ProcedureRecordController {
  async create(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateProcedureRecordUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId: string };
    const body = req.body as {
      professionalName: string;
      title: string;
      formula?: string;
      details?: string;
      serviceName?: string;
      queueItemId?: string;
      appointmentId?: string;
      occurredAt?: string;
    };

    const record = await useCase.execute(
      {
        barbershopId,
        clientId,
        professionalName: body.professionalName,
        title: body.title,
        formula: body.formula,
        details: body.details,
        serviceName: body.serviceName,
        queueItemId: body.queueItemId,
        appointmentId: body.appointmentId,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
      },
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(201).send({ success: true, data: record });
  }

  async list(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListProcedureRecordsUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId: string };
    const { limit } = req.query as { limit?: string };

    const records = await useCase.execute(
      barbershopId,
      clientId,
      req.user as { role: string; barbershopId?: string },
      limit ? parseInt(limit, 10) : undefined
    );

    return reply.send({ success: true, data: records });
  }

  async latest(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(GetLatestProcedureRecordUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId: string };

    const record = await useCase.execute(
      barbershopId,
      clientId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: record });
  }

  async update(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateProcedureRecordUseCase);
    const { id: clientId, recordId } = req.params as { id: string; recordId: string };
    const { barbershopId } = req.user as { barbershopId: string };
    const body = req.body as {
      professionalName?: string;
      title?: string;
      formula?: string | null;
      details?: string | null;
      serviceName?: string | null;
    };

    const record = await useCase.execute(
      recordId,
      barbershopId,
      body,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: record });
  }

  async delete(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteProcedureRecordUseCase);
    const { id: clientId, recordId } = req.params as { id: string; recordId: string };
    const { barbershopId } = req.user as { barbershopId: string };

    await useCase.execute(
      recordId,
      barbershopId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(204).send();
  }
}
