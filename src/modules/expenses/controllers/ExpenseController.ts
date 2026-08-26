import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesQuerySchema,
  expenseSummaryQuerySchema,
} from "../schemas/expenseSchemas";
import {
  CreateExpenseUseCase,
  ListExpensesUseCase,
  GetExpenseUseCase,
  UpdateExpenseUseCase,
  DeleteExpenseUseCase,
  GetExpenseSummaryUseCase,
} from "../useCases/expenseUseCases";
import { AppError } from "@/shared/errors/AppError";

export class ExpenseController {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createExpenseSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? body.barbershopId
        : user.barbershopId;

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(CreateExpenseUseCase);
    const expense = await useCase.execute(
      { ...body, barbershopId, createdById: user.id },
      user
    );

    reply.status(201).send({ success: true, data: expense });
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const query = listExpensesQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId ?? ""
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(ListExpensesUseCase);
    const result = await useCase.execute({ ...query, barbershopId }, user);

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  }

  async get(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(GetExpenseUseCase);
    const expense = await useCase.execute(id, request.user!);
    reply.send({ success: true, data: expense });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const data = updateExpenseSchema.parse(request.body);
    const useCase = container.resolve(UpdateExpenseUseCase);
    const expense = await useCase.execute(id, data, request.user!);
    reply.send({ success: true, data: expense });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(DeleteExpenseUseCase);
    await useCase.execute(id, request.user!);
    reply.status(204).send();
  }

  async summary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { from, to } = expenseSummaryQuerySchema.parse(request.query);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId ?? ""
        : user.barbershopId ?? "";

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(GetExpenseSummaryUseCase);
    const summary = await useCase.execute(barbershopId, user, from, to);
    reply.send({ success: true, data: summary });
  }
}