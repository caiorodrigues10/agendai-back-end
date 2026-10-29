import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  CreateCaseDocumentUseCase,
  CreateCaseEventUseCase,
  CreateCaseTaskUseCase,
  CreateDeadlineUseCase,
  CreateOfficeHolidayUseCase,
  DeleteCaseDocumentUseCase,
  DeleteCaseTaskUseCase,
  DeleteDeadlineUseCase,
  DeleteOfficeHolidayUseCase,
  GetCaseOverviewUseCase,
  GetCasePipelineUseCase,
  GetCaseUseCase,
  ListCaseDocumentsUseCase,
  ListCaseEventsUseCase,
  ListCaseTasksUseCase,
  ListCasesUseCase,
  ListDeadlinesUseCase,
  ListOfficeHolidaysUseCase,
  UpdateCaseTaskUseCase,
  UpdateDeadlineUseCase,
  type RequestingUser,
} from "../useCases/caseManagementUseCases";
import {
  createCaseDocumentSchema,
  createCaseEventSchema,
  createCaseTaskSchema,
  createDeadlineSchema,
  createOfficeHolidaySchema,
  listCasesQuerySchema,
  listDeadlinesQuerySchema,
  listOfficeHolidaysQuerySchema,
  updateCaseTaskSchema,
  updateDeadlineSchema,
} from "../schemas/caseManagementSchemas";
import { CaseManagementRepository } from "../repositories/CaseManagementRepository";

/**
 * Controller da gestão de processos.
 *
 * Todas as rotas são do painel do escritório: exigem usuário autenticado do
 * tenant e nunca expõem dados de caso para o público.
 */
export class CaseManagementController {
  private user(req: FastifyRequest): RequestingUser {
    return req.user as RequestingUser;
  }

  private barbershopId(req: FastifyRequest): string {
    const barbershopId = (req.user as { barbershopId?: string })?.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
    return barbershopId;
  }

  // ─── Casos ────────────────────────────────────────────────────────────────

  async listCases(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListCasesUseCase);
    const query = listCasesQuerySchema.parse(req.query ?? {});
    const cases = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: cases });
  }

  async pipeline(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(GetCasePipelineUseCase);
    const counts = await useCase.execute(
      this.barbershopId(req),
      this.user(req)
    );
    return reply.send({ success: true, data: counts });
  }

  async getCase(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(GetCaseUseCase);
    const { caseId } = req.params as { caseId: string };
    const found = await useCase.execute(
      this.barbershopId(req),
      caseId,
      this.user(req)
    );
    return reply.send({ success: true, data: found });
  }

  async overview(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(GetCaseOverviewUseCase);
    const { caseId } = req.params as { caseId: string };
    const data = await useCase.execute(
      this.barbershopId(req),
      caseId,
      this.user(req)
    );
    return reply.send({ success: true, data });
  }

  async practiceAreaReport(req: FastifyRequest, reply: FastifyReply) {
    const repo = container.resolve(CaseManagementRepository);
    const barbershopId = this.barbershopId(req);
    const user = this.user(req);
    if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    const report = await repo.practiceAreaReport(barbershopId);
    return reply.send({ success: true, data: report });
  }

  // ─── Tarefas ──────────────────────────────────────────────────────────────

  async listTasks(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListCaseTasksUseCase);
    const { caseId } = req.params as { caseId: string };
    const tasks = await useCase.execute(
      this.barbershopId(req),
      caseId,
      this.user(req)
    );
    return reply.send({ success: true, data: tasks });
  }

  async createTask(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateCaseTaskUseCase);
    const { caseId } = req.params as { caseId: string };
    const body = createCaseTaskSchema.parse(req.body);
    const task = await useCase.execute(
      this.barbershopId(req),
      caseId,
      body,
      this.user(req)
    );
    return reply.status(201).send({ success: true, data: task });
  }

  async updateTask(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateCaseTaskUseCase);
    const { caseId, taskId } = req.params as { caseId: string; taskId: string };
    const body = updateCaseTaskSchema.parse(req.body);
    const task = await useCase.execute(
      this.barbershopId(req),
      caseId,
      taskId,
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: task });
  }

  async deleteTask(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteCaseTaskUseCase);
    const { caseId, taskId } = req.params as { caseId: string; taskId: string };
    await useCase.execute(
      this.barbershopId(req),
      caseId,
      taskId,
      this.user(req)
    );
    return reply.status(204).send();
  }

  // ─── Prazos ───────────────────────────────────────────────────────────────

  async listDeadlines(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListDeadlinesUseCase);
    const query = listDeadlinesQuerySchema.parse(req.query ?? {});
    const deadlines = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: deadlines });
  }

  async createDeadline(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateDeadlineUseCase);
    const { caseId } = req.params as { caseId: string };
    const body = createDeadlineSchema.parse(req.body);
    const deadline = await useCase.execute(
      this.barbershopId(req),
      caseId,
      body,
      this.user(req)
    );
    return reply.status(201).send({ success: true, data: deadline });
  }

  async updateDeadline(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateDeadlineUseCase);
    const { deadlineId } = req.params as { deadlineId: string };
    const body = updateDeadlineSchema.parse(req.body);
    const deadline = await useCase.execute(
      this.barbershopId(req),
      deadlineId,
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: deadline });
  }

  async deleteDeadline(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteDeadlineUseCase);
    const { deadlineId } = req.params as { deadlineId: string };
    await useCase.execute(this.barbershopId(req), deadlineId, this.user(req));
    return reply.status(204).send();
  }

  // ─── Andamentos ───────────────────────────────────────────────────────────

  async listEvents(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListCaseEventsUseCase);
    const { caseId } = req.params as { caseId: string };
    const events = await useCase.execute(
      this.barbershopId(req),
      caseId,
      this.user(req)
    );
    return reply.send({ success: true, data: events });
  }

  async createEvent(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateCaseEventUseCase);
    const { caseId } = req.params as { caseId: string };
    const body = createCaseEventSchema.parse(req.body);
    const event = await useCase.execute(
      this.barbershopId(req),
      caseId,
      body,
      this.user(req)
    );
    return reply.status(201).send({ success: true, data: event });
  }

  // ─── Documentos ───────────────────────────────────────────────────────────

  async listDocuments(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListCaseDocumentsUseCase);
    const { caseId } = req.params as { caseId: string };
    const documents = await useCase.execute(
      this.barbershopId(req),
      caseId,
      this.user(req)
    );
    return reply.send({ success: true, data: documents });
  }

  async createDocument(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateCaseDocumentUseCase);
    const { caseId } = req.params as { caseId: string };
    const body = createCaseDocumentSchema.parse(req.body);
    const document = await useCase.execute(
      this.barbershopId(req),
      caseId,
      body,
      this.user(req)
    );
    return reply.status(201).send({ success: true, data: document });
  }

  async deleteDocument(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteCaseDocumentUseCase);
    const { caseId, documentId } = req.params as {
      caseId: string;
      documentId: string;
    };
    await useCase.execute(
      this.barbershopId(req),
      caseId,
      documentId,
      this.user(req)
    );
    return reply.status(204).send();
  }

  // ─── Feriados do escritório ───────────────────────────────────────────────

  async listHolidays(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListOfficeHolidaysUseCase);
    const query = listOfficeHolidaysQuerySchema.parse(req.query ?? {});
    const holidays = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: holidays });
  }

  async createHoliday(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateOfficeHolidayUseCase);
    const body = createOfficeHolidaySchema.parse(req.body);
    const holiday = await useCase.execute(
      this.barbershopId(req),
      body,
      this.user(req)
    );
    return reply.status(201).send({ success: true, data: holiday });
  }

  async deleteHoliday(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteOfficeHolidayUseCase);
    const { holidayId } = req.params as { holidayId: string };
    await useCase.execute(this.barbershopId(req), holidayId, this.user(req));
    return reply.status(204).send();
  }
}
