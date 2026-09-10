import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createOrderSchema,
  updateOrderSchema,
  addItemSchema,
  receiveOrderSchema,
} from "./purchasingSchema";
import type { z } from "zod";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
type AddItemInput = z.infer<typeof addItemSchema>;
type ReceiveOrderInput = z.infer<typeof receiveOrderSchema>;

const orderSelect = {
  id: true,
  barbershopId: true,
  supplierId: true,
  status: true,
  totalAmount: true,
  notes: true,
  expectedAt: true,
  receivedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    select: {
      id: true,
      orderId: true,
      productId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      total: true,
    },
  },
} as const;

const itemSelect = {
  id: true,
  orderId: true,
  productId: true,
  description: true,
  quantity: true,
  unitPrice: true,
  total: true,
} as const;

export class PurchasingRepository {
  async listOrders(barbershopId: string, status?: string) {
    return prisma.purchaseOrder.findMany({
      where: {
        barbershopId,
        ...(status ? { status: status as any } : {}),
      },
      select: orderSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOrderById(id: string) {
    return prisma.purchaseOrder.findUnique({
      where: { id },
      select: orderSelect,
    });
  }

  async createOrder(data: CreateOrderInput, createdById: string) {
    return prisma.purchaseOrder.create({
      data: {
        barbershopId: data.barbershopId,
        supplierId: data.supplierId ?? null,
        notes: data.notes ?? null,
        expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
        createdById,
      },
      select: orderSelect,
    });
  }

  async updateOrder(id: string, data: UpdateOrderInput) {
    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Pedido não encontrado", 404);

    if (data.status && existing.status !== "DRAFT") {
      if (data.status === "SENT" && existing.status !== "SENT") {
        // allowed: DRAFT -> SENT
      } else if (data.status === "RECEIVED" && existing.status !== "SENT") {
        throw new AppError("Apenas pedidos enviados podem ser recebidos", 400);
      } else if (data.status === "CANCELED" && existing.status === "RECEIVED") {
        throw new AppError("Pedido já recebido não pode ser cancelado", 400);
      }
    }

    return prisma.purchaseOrder.update({
      where: { id },
      data: {
        ...(data.supplierId !== undefined && { supplierId: data.supplierId }),
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.expectedAt !== undefined && {
          expectedAt: data.expectedAt ? new Date(data.expectedAt) : null,
        }),
      },
      select: orderSelect,
    });
  }

  async deleteOrder(id: string) {
    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Pedido não encontrado", 404);
    if (existing.status !== "DRAFT") {
      throw new AppError("Apenas pedidos em rascunho podem ser excluídos", 400);
    }

    await prisma.purchaseOrder.delete({ where: { id } });
  }

  async addItem(orderId: string, data: AddItemInput) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("Pedido não encontrado", 404);
    if (order.status !== "DRAFT") {
      throw new AppError("Itens só podem ser adicionados a pedidos em rascunho", 400);
    }

    const total = data.quantity * data.unitPrice;

    const item = await prisma.purchaseOrderItem.create({
      data: {
        orderId,
        productId: data.productId ?? null,
        description: data.description,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        total,
      },
      select: itemSelect,
    });

    const sum = await prisma.purchaseOrderItem.aggregate({
      where: { orderId },
      _sum: { total: true },
    });

    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: { totalAmount: sum._sum.total ?? 0 },
    });

    return item;
  }

  async receiveOrder(orderId: string, data: ReceiveOrderInput) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new AppError("Pedido não encontrado", 404);
    if (order.status !== "SENT") {
      throw new AppError("Apenas pedidos enviados podem ser recebidos", 400);
    }

    const tx = await prisma.$transaction(async (tx: any) => {
      // Update stock for items with productId
      for (const item of order.items) {
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQty: { increment: item.quantity },
            },
          });
        }
      }

      // Mark order as received
      const updated = await tx.purchaseOrder.update({
        where: { id: orderId },
        data: { status: "RECEIVED", receivedAt: new Date() },
        select: orderSelect,
      });

      return updated;
    });

    return tx;
  }

  async getOrderItems(orderId: string) {
    return prisma.purchaseOrderItem.findMany({
      where: { orderId },
      select: itemSelect,
    });
  }
}
