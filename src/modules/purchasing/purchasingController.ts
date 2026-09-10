import { FastifyRequest, FastifyReply } from "fastify";
import {
  createOrderSchema,
  updateOrderSchema,
  addItemSchema,
  receiveOrderSchema,
  orderListQuerySchema,
} from "./purchasingSchema";
import { PurchasingUseCases } from "./purchasingUseCases";
import { AppError } from "@/shared/errors/AppError";

export class PurchasingController {
  private useCases = new PurchasingUseCases();

  async listOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = orderListQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const orders = await this.useCases.listOrders(resolvedBarbershopId, query);
    reply.send({ success: true, data: orders });
  }

  async getOrderById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const order = await this.useCases.getOrderById(id, resolvedBarbershopId);
    reply.send({ success: true, data: order });
  }

  async createOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const body = createOrderSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? (request.params as any).barbershopId
        : user.barbershopId ?? (request.params as any).barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const order = await this.useCases.createOrder(
      resolvedBarbershopId,
      { ...body, barbershopId: resolvedBarbershopId },
      user.id
    );
    reply.status(201).send({ success: true, data: order });
  }

  async updateOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updateOrderSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const order = await this.useCases.updateOrder(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: order });
  }

  async deleteOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.deleteOrder(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Pedido removido" });
  }

  async addItem(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = addItemSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const item = await this.useCases.addItem(id, resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: item });
  }

  async receiveOrder(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = receiveOrderSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const order = await this.useCases.receiveOrder(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: order });
  }

  async getOrderItems(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const items = await this.useCases.getOrderItems(id, resolvedBarbershopId);
    reply.send({ success: true, data: items });
  }
}
