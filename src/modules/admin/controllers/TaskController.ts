import { FastifyRequest, FastifyReply } from "fastify";
import { CreateTaskUseCase } from "../useCases/tasks/CreateTaskUseCase";
import { ListTasksUseCase } from "../useCases/tasks/ListTasksUseCase";
import { GetTaskUseCase } from "../useCases/tasks/GetTaskUseCase";
import { UpdateTaskUseCase } from "../useCases/tasks/UpdateTaskUseCase";
import { AddTaskCommentUseCase } from "../useCases/tasks/AddTaskCommentUseCase";
import {
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
  createTaskCommentSchema,
} from "../schemas/internalSchemas";

export class TaskController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = listTasksQuerySchema.parse(request.query);
    const useCase = new ListTasksUseCase();
    const result = await useCase.execute({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      priority: query.priority,
      assignedToId: query.assignedToId,
      barbershopId: query.barbershopId,
      ticketId: query.ticketId,
      dueBefore: query.dueBefore,
      dueAfter: query.dueAfter,
    });
    return reply.send({ success: true, ...result });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createTaskSchema.parse(request.body);
    const useCase = new CreateTaskUseCase();
    const task = await useCase.execute({
      ...body,
      createdById: request.user!.id,
    });
    return reply.status(201).send({ success: true, data: task });
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const useCase = new GetTaskUseCase();
    const task = await useCase.execute(id);
    return reply.send({ success: true, data: task });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateTaskSchema.parse(request.body);
    const useCase = new UpdateTaskUseCase();
    const task = await useCase.execute({
      taskId: id,
      performedById: request.user!.id,
      ...body,
    });
    return reply.send({ success: true, data: task });
  }

  async addComment(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = createTaskCommentSchema.parse(request.body);
    const useCase = new AddTaskCommentUseCase();
    const comment = await useCase.execute({
      taskId: id,
      authorId: request.user!.id,
      text: body.text,
    });
    return reply.status(201).send({ success: true, data: comment });
  }
}
