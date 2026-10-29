import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  CreateClientCaseUseCase,
  ListClientCasesUseCase,
  UpdateClientCaseUseCase,
  DeleteClientCaseUseCase,
} from "../useCases/cases/caseUseCases";
import { createCaseSchema, updateCaseSchema } from "../schemas/caseSchemas";

export class CaseController {
  async create(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateClientCaseUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId?: string };
    const body = createCaseSchema.parse(req.body);

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const clientCase = await useCase.execute(
      {
        ...body,
        practiceArea: body.practiceArea ?? null,
        caseNumber: body.caseNumber ?? null,
        notes: body.notes ?? null,
        title: body.title ?? null,
        courtName: body.courtName ?? null,
        opponent: body.opponent ?? null,
        claimedAmount: body.claimedAmount ?? null,
        awardedAmount: body.awardedAmount ?? null,
        responsibleStaffId: body.responsibleStaffId ?? null,
        barbershopId,
        clientId,
      },
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(201).send({ success: true, data: clientCase });
  }

  async list(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListClientCasesUseCase);
    const { id: clientId } = req.params as { id: string };
    const { barbershopId } = req.user as { barbershopId?: string };

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const cases = await useCase.execute(
      barbershopId,
      clientId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: cases });
  }

  async update(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateClientCaseUseCase);
    const { id: clientId, caseId } = req.params as { id: string; caseId: string };
    const { barbershopId } = req.user as { barbershopId?: string };
    const body = updateCaseSchema.parse(req.body);

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const clientCase = await useCase.execute(
      caseId,
      barbershopId,
      body,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.send({ success: true, data: clientCase });
  }

  async delete(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteClientCaseUseCase);
    const { id: clientId, caseId } = req.params as { id: string; caseId: string };
    const { barbershopId } = req.user as { barbershopId?: string };

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    await useCase.execute(
      caseId,
      barbershopId,
      req.user as { role: string; barbershopId?: string }
    );

    return reply.status(204).send();
  }
}
