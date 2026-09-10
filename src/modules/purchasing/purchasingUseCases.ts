import { PurchasingRepository } from "./purchasingRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { createOrderSchema, updateOrderSchema, addItemSchema, receiveOrderSchema, orderListQuerySchema } from "./purchasingSchema";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
type AddItemInput = z.infer<typeof addItemSchema>;
type ReceiveOrderInput = z.infer<typeof receiveOrderSchema>;
type ListQuery = z.infer<typeof orderListQuerySchema>;

export class PurchasingUseCases {
  private repo = new PurchasingRepository();

  async listOrders(barbershopId: string, query: ListQuery) {
    return this.repo.listOrders(barbershopId, query.status);
  }

  async getOrderById(id: string, barbershopId: string) {
    const order = await this.repo.findOrderById(id);
    if (!order) throw new AppError("Pedido não encontrado", 404);
    if (order.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return order;
  }

  async createOrder(barbershopId: string, data: CreateOrderInput, createdById: string) {
    return this.repo.createOrder({ ...data, barbershopId }, createdById);
  }

  async updateOrder(id: string, barbershopId: string, data: UpdateOrderInput) {
    const existing = await this.repo.findOrderById(id);
    if (!existing) throw new AppError("Pedido não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.updateOrder(id, data);
  }

  async deleteOrder(id: string, barbershopId: string) {
    const existing = await this.repo.findOrderById(id);
    if (!existing) throw new AppError("Pedido não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.deleteOrder(id);
  }

  async addItem(orderId: string, barbershopId: string, data: AddItemInput) {
    const existing = await this.repo.findOrderById(orderId);
    if (!existing) throw new AppError("Pedido não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.addItem(orderId, data);
  }

  async receiveOrder(orderId: string, barbershopId: string, data: ReceiveOrderInput) {
    const existing = await this.repo.findOrderById(orderId);
    if (!existing) throw new AppError("Pedido não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.receiveOrder(orderId, data);
  }

  async getOrderItems(orderId: string, barbershopId: string) {
    const existing = await this.repo.findOrderById(orderId);
    if (!existing) throw new AppError("Pedido não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.getOrderItems(orderId);
  }
}
