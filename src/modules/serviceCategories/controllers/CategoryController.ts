import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import {
  ServiceCategoryRepository,
  ExpenseCategoryRepository,
} from "../infra/repositories/CategoryRepository";
import {
  createServiceCategorySchema,
  updateServiceCategorySchema,
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
} from "../schemas/categorySchemas";

const serviceCatRepo = new ServiceCategoryRepository();
const expenseCatRepo = new ExpenseCategoryRepository();

// ─── Service Categories ───────────────────────────────────────────────────────

export class ServiceCategoryController {
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId
        : user.barbershopId;

    const data = await serviceCatRepo.list(barbershopId, true);
    reply.send({ success: true, data });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createServiceCategorySchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.body as any).barbershopId ?? null)
        : user.barbershopId ?? null;

    const data = await serviceCatRepo.create({ ...body, barbershopId });
    reply.status(201).send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateServiceCategorySchema.parse(request.body);

    const existing = await serviceCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    const data = await serviceCatRepo.update(id, body);
    reply.send({ success: true, data });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };

    const existing = await serviceCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    await serviceCatRepo.delete(id);
    reply.status(204).send();
  }
}

// ─── Expense Categories ───────────────────────────────────────────────────────

export class ExpenseCategoryController {
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId
        : user.barbershopId;

    const data = await expenseCatRepo.list(barbershopId, true);
    reply.send({ success: true, data });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createExpenseCategorySchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? ((request.body as any).barbershopId ?? null)
        : user.barbershopId ?? null;

    const data = await expenseCatRepo.create({ ...body, barbershopId });
    reply.status(201).send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateExpenseCategorySchema.parse(request.body);

    const existing = await expenseCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    const data = await expenseCatRepo.update(id, body);
    reply.send({ success: true, data });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };

    const existing = await expenseCatRepo.findById(id);
    if (!existing) throw new AppError("Categoria não encontrada", 404);

    const user = request.user!;
    if (
      user.role !== "MASTER_ADMIN" &&
      existing.barbershopId !== user.barbershopId
    ) {
      throw new AppError("Acesso negado", 403);
    }

    await expenseCatRepo.delete(id);
    reply.status(204).send();
  }
}
