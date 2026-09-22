import { FastifyRequest, FastifyReply } from "fastify";
import { CreateTicketUseCase } from "../useCases/tickets/CreateTicketUseCase";
import { ListTicketsUseCase } from "../useCases/tickets/ListTicketsUseCase";
import { GetTicketUseCase } from "../useCases/tickets/GetTicketUseCase";
import { UpdateTicketUseCase } from "../useCases/tickets/UpdateTicketUseCase";
import { AddTicketCommentUseCase } from "../useCases/tickets/AddTicketCommentUseCase";
import {
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
  createTicketCommentSchema,
} from "../schemas/internalSchemas";

export class TicketController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = listTicketsQuerySchema.parse(request.query);
    const useCase = new ListTicketsUseCase();
    const result = await useCase.execute({
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      priority: query.priority,
      assignedToId: query.assignedToId,
      barbershopId: query.barbershopId,
      channel: query.channel,
      category: query.category,
      unassigned: query.unassigned === "true",
      userId: request.user!.id,
    });
    return reply.send({ success: true, ...result });
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = createTicketSchema.parse(request.body);
    const useCase = new CreateTicketUseCase();
    const ticket = await useCase.execute({
      ...body,
      createdById: request.user!.id,
    });
    return reply.status(201).send({ success: true, data: ticket });
  }

  async get(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const useCase = new GetTicketUseCase();
    const ticket = await useCase.execute(id);
    return reply.send({ success: true, data: ticket });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = updateTicketSchema.parse(request.body);
    const useCase = new UpdateTicketUseCase();
    const ticket = await useCase.execute({
      ticketId: id,
      performedById: request.user!.id,
      ...body,
    });
    return reply.send({ success: true, data: ticket });
  }

  async addComment(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = createTicketCommentSchema.parse(request.body);
    const useCase = new AddTicketCommentUseCase();
    const comment = await useCase.execute({
      ticketId: id,
      authorId: request.user!.id,
      text: body.text,
    });
    return reply.status(201).send({ success: true, data: comment });
  }
}
