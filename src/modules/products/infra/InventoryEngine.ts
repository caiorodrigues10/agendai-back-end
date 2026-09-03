import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { recordCrmFinancialEvent } from "@/modules/crm/services/crmLedger";
import {
  CatalogProductSnapshot,
  nextStockQty,
  planPurchaseLines,
  planRetailSaleLines,
  remainingFiadoAmount,
  roundMoney,
  SalePlanItem,
  weightedAverageCost,
} from "../inventoryMath";

type Tx = any;

async function lockProduct(tx: Tx, productId: string): Promise<CatalogProductSnapshot> {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError("Produto não encontrado", 404);
  return product as CatalogProductSnapshot;
}

async function writeMovement(
  tx: Tx,
  input: {
    barbershopId: string;
    productId: string;
    type: "PURCHASE_RECEIPT" | "SALE" | "SALE_REFUND" | "INTERNAL_CONSUMPTION" | "MANUAL_ADJUSTMENT" | "PURCHASE_REVERSAL";
    quantity: number;
    unitCost: number;
    stockBefore: number;
    stockAfter: number;
    sourceType: string;
    sourceId: string;
    reason?: string | null;
    createdById: string;
  }
) {
  await tx.stockMovement.create({
    data: {
      barbershopId: input.barbershopId,
      productId: input.productId,
      type: input.type,
      quantity: input.quantity,
      unitCost: input.unitCost,
      stockBefore: input.stockBefore,
      stockAfter: input.stockAfter,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reason: input.reason ?? null,
      createdById: input.createdById,
    },
  });
}

@injectable()
export class InventoryEngine {
  async createRetailSale(input: {
    barbershopId: string;
    soldById: string;
    clientId?: string | null;
    queueItemId?: string | null;
    appointmentId?: string | null;
    paymentMethod: string;
    items: SalePlanItem[];
    discount?: number;
    idempotencyKey: string;
    allowPriceOverride: boolean;
    customerName?: string;
    whatsapp?: string;
  }) {
    const existing = await prisma.retailSale.findUnique({
      where: { barbershopId_idempotencyKey: { barbershopId: input.barbershopId, idempotencyKey: input.idempotencyKey } },
      include: { lines: true, refunds: true, fiado: true },
    });
    if (existing) return existing;

    if (input.queueItemId) {
      const queue = await prisma.queueItem.findFirst({ where: { id: input.queueItemId, barbershopId: input.barbershopId } });
      if (!queue) throw new AppError("Item da fila não pertence a este salão", 403);
    }
    if (input.appointmentId) {
      const appt = await prisma.appointment.findFirst({ where: { id: input.appointmentId, barbershopId: input.barbershopId } });
      if (!appt) throw new AppError("Agendamento não pertence a este salão", 403);
    }
    if (input.clientId) {
      const client = await prisma.salonClient.findFirst({ where: { id: input.clientId, barbershopId: input.barbershopId } });
      if (!client) throw new AppError("Cliente não pertence a este salão", 403);
    }
    if (input.paymentMethod === "fiado" && !input.clientId) {
      throw new AppError("Venda fiada exige cliente identificado", 400);
    }

    return prisma.$transaction(async (tx: any) => {
      const locked = [];
      for (const item of input.items) locked.push(await lockProduct(tx, item.productId));
      const lines = planRetailSaleLines(locked, input.items, {
        barbershopId: input.barbershopId,
        allowPriceOverride: input.allowPriceOverride,
      });
      const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
      const discount = roundMoney(Math.min(input.discount ?? 0, subtotal));
      const total = roundMoney(subtotal - discount);
      const totalCost = roundMoney(lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));

      const sale = await tx.retailSale.create({
        data: {
          barbershopId: input.barbershopId,
          clientId: input.clientId ?? null,
          soldById: input.soldById,
          queueItemId: input.queueItemId ?? null,
          appointmentId: input.appointmentId ?? null,
          paymentMethod: input.paymentMethod,
          subtotal,
          discount,
          total,
          totalCost,
          status: "COMPLETED",
          idempotencyKey: input.idempotencyKey,
          lines: {
            create: lines.map((line) => ({
              barbershopId: input.barbershopId,
              productId: line.productId,
              productName: line.name,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              unitCost: line.unitCost,
            })),
          },
        },
        include: { lines: true, refunds: true, fiado: true },
      });

      for (const line of lines) {
        if (line.trackStock) {
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQty: line.stockAfter },
          });
          await writeMovement(tx, {
            barbershopId: input.barbershopId,
            productId: line.productId,
            type: "SALE",
            quantity: -line.quantity,
            unitCost: line.unitCost,
            stockBefore: line.stockBefore,
            stockAfter: line.stockAfter,
            sourceType: "retail_sale",
            sourceId: sale.id,
            createdById: input.soldById,
          });
        }
      }

      if (input.paymentMethod === "fiado" && input.clientId) {
        const client = await tx.salonClient.findUnique({ where: { id: input.clientId } });
        await tx.fiado.create({
          data: {
            barbershopId: input.barbershopId,
            customerName: input.customerName || client?.name || "Cliente",
            whatsapp: input.whatsapp || client?.whatsapp || "",
            clientId: input.clientId,
            description: `Venda de produtos (${sale.id})`,
            originalAmount: total,
            origin: "RETAIL_SALE",
            retailSaleId: sale.id,
            createdById: input.soldById,
          },
        });
      }

      return tx.retailSale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { lines: true, refunds: true, fiado: true },
      });
    }).then(async (sale: any) => {
      if (sale.clientId) {
        const fiado = sale.paymentMethod === "fiado";
        await recordCrmFinancialEvent({
          barbershopId: sale.barbershopId,
          clientId: sale.clientId,
          kind: "PRODUCT_SOLD",
          sourceType: "retail_sale",
          sourceId: sale.id,
          grossAmount: sale.total,
          receivedAmount: fiado ? 0 : sale.total,
          outstandingDelta: fiado ? sale.total : 0,
          occurredAt: sale.soldAt,
          metadata: { paymentMethod: sale.paymentMethod },
        });
      }
      return sale;
    });
  }

  async refundRetailSale(input: {
    barbershopId: string;
    saleId: string;
    createdById: string;
    reason: string;
    restock: boolean;
    refundMethod: string;
    items: Array<{ productId: string; quantity: number }>;
  }) {
    return prisma.$transaction(async (tx: any) => {
      const sale = await tx.retailSale.findFirst({
        where: { id: input.saleId, barbershopId: input.barbershopId },
        include: { lines: true, fiado: true },
      });
      if (!sale) throw new AppError("Venda não encontrada", 404);
      if (sale.status === "CANCELED") throw new AppError("Esta venda não foi concluída", 400);

      const refundLines = [];
      for (const item of input.items) {
        const line = sale.lines.find((row: { productId: string }) => row.productId === item.productId);
        if (!line) throw new AppError("Item não pertence a esta venda", 400);
        const available = roundMoney(line.quantity - line.refundedQty);
        if (item.quantity - available > 0.0001) {
          throw new AppError(`Não é possível estornar mais que ${available} de ${line.productName}`, 400);
        }
        refundLines.push({
          line,
          quantity: item.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
        });
      }

      const financialGross = roundMoney(refundLines.reduce((sum, row) => sum + row.unitPrice * row.quantity, 0));
      let financialRefund = financialGross;
      let outstandingCredit = 0;

      if (sale.paymentMethod === "fiado" && sale.fiado) {
        const remaining = remainingFiadoAmount(
          sale.fiado.originalAmount,
          sale.fiado.paidAmount,
          sale.fiado.creditAdjustedAmount
        );
        outstandingCredit = roundMoney(Math.min(remaining, financialGross));
        financialRefund = roundMoney(financialGross - outstandingCredit);
        if (outstandingCredit > 0) {
          const nextCredit = roundMoney(sale.fiado.creditAdjustedAmount + outstandingCredit);
          const nextRemaining = remainingFiadoAmount(sale.fiado.originalAmount, sale.fiado.paidAmount, nextCredit);
          await tx.fiadoAdjustment.create({
            data: {
              barbershopId: input.barbershopId,
              fiadoId: sale.fiado.id,
              amount: outstandingCredit,
              reason: input.reason,
              createdById: input.createdById,
            },
          });
          await tx.fiado.update({
            where: { id: sale.fiado.id },
            data: {
              creditAdjustedAmount: nextCredit,
              status: nextRemaining <= 0 ? "PAID" : sale.fiado.paidAmount > 0 ? "PARTIAL" : "PENDING",
            },
          });
        }
      }

      const refund = await tx.retailSaleRefund.create({
        data: {
          barbershopId: input.barbershopId,
          saleId: sale.id,
          reason: input.reason,
          restock: input.restock,
          refundMethod: input.refundMethod,
          financialRefund,
          outstandingCredit,
          createdById: input.createdById,
          lines: {
            create: refundLines.map((row) => ({
              barbershopId: input.barbershopId,
              productId: row.line.productId,
              quantity: row.quantity,
              unitPrice: row.unitPrice,
              unitCost: row.unitCost,
            })),
          },
        },
      });

      for (const row of refundLines) {
        await tx.retailSaleLine.update({
          where: { id: row.line.id },
          data: { refundedQty: roundMoney(row.line.refundedQty + row.quantity) },
        });
        if (input.restock) {
          const product = await lockProduct(tx, row.line.productId);
          const stockAfter = nextStockQty(product.stockQty, row.quantity, false);
          await tx.product.update({
            where: { id: product.id },
            data: { stockQty: stockAfter },
          });
          await writeMovement(tx, {
            barbershopId: input.barbershopId,
            productId: product.id,
            type: "SALE_REFUND",
            quantity: row.quantity,
            unitCost: row.unitCost,
            stockBefore: product.stockQty,
            stockAfter,
            sourceType: "retail_refund",
            sourceId: refund.id,
            reason: input.reason,
            createdById: input.createdById,
          });
        }
      }

      const updatedLines = await tx.retailSaleLine.findMany({ where: { saleId: sale.id } });
      const fullyRefunded = updatedLines.every((line: { refundedQty: number; quantity: number }) => line.refundedQty + 0.0001 >= line.quantity);
      await tx.retailSale.update({
        where: { id: sale.id },
        data: { status: fullyRefunded ? "REFUNDED" : "COMPLETED" },
      });

      return { refundId: refund.id, financialRefund, outstandingCredit, financialGross };
    }).then(async (result: { refundId: string; financialRefund: number; outstandingCredit: number; financialGross: number }) => {
      const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: input.saleId } });
      if (sale.clientId) {
        await recordCrmFinancialEvent({
          barbershopId: sale.barbershopId,
          clientId: sale.clientId,
          kind: "PRODUCT_REFUNDED",
          sourceType: "retail_refund",
          sourceId: result.refundId,
          grossAmount: -result.financialGross,
          receivedAmount: sale.paymentMethod === "fiado" ? -result.financialRefund : -result.financialGross,
          outstandingDelta: sale.paymentMethod === "fiado" ? -result.outstandingCredit : 0,
          occurredAt: new Date(),
          metadata: { restock: input.restock, refundMethod: input.refundMethod },
        });
      }
      return prisma.retailSale.findUniqueOrThrow({
        where: { id: sale.id },
        include: { lines: true, refunds: { include: { lines: true } }, fiado: true },
      });
    });
  }

  async createReceipt(input: {
    barbershopId: string;
    createdById: string;
    supplierId?: string | null;
    supplierName?: string | null;
    receivedAt?: Date;
    paymentMethod?: string | null;
    notes?: string | null;
    createExpense?: boolean;
    skipExpenseReason?: string;
    items: Array<{ productId: string; quantity: number; unitCost: number }>;
  }) {
    const createExpense = input.createExpense !== false;
    if (!createExpense && !input.skipExpenseReason?.trim()) {
      throw new AppError("Informe o motivo para não registrar a despesa (estoque inicial, brinde ou correção).", 400);
    }
    let supplierName = input.supplierName ?? null;
    if (input.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: input.supplierId, barbershopId: input.barbershopId },
      });
      if (!supplier) throw new AppError("Fornecedor não encontrado neste salão", 404);
      supplierName = supplier.name;
    }

    return prisma.$transaction(async (tx: any) => {
      const locked = [];
      for (const item of input.items) locked.push(await lockProduct(tx, item.productId));
      const lines = planPurchaseLines(locked, input.items, input.barbershopId);
      const total = roundMoney(lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
      const receipt = await tx.inventoryReceipt.create({
        data: {
          barbershopId: input.barbershopId,
          supplierId: input.supplierId ?? null,
          supplierName,
          receivedAt: input.receivedAt ?? new Date(),
          paymentMethod: input.paymentMethod ?? null,
          total,
          notes: input.notes ?? null,
          createExpense,
          skipExpenseReason: createExpense ? null : input.skipExpenseReason,
          createdById: input.createdById,
          items: {
            create: lines.map((line) => ({
              barbershopId: input.barbershopId,
              productId: line.productId,
              quantity: line.quantity,
              unitCost: line.unitCost,
            })),
          },
        },
        include: { items: true, expenses: true },
      });

      for (const line of lines) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: line.stockAfter, averageCost: line.averageCostAfter },
        });
        await writeMovement(tx, {
          barbershopId: input.barbershopId,
          productId: line.productId,
          type: "PURCHASE_RECEIPT",
          quantity: line.quantity,
          unitCost: line.unitCost,
          stockBefore: line.stockBefore,
          stockAfter: line.stockAfter,
          sourceType: "inventory_receipt",
          sourceId: receipt.id,
          createdById: input.createdById,
        });
      }

      if (createExpense) {
        const category = await tx.expenseCategory.findFirst({
          where: {
            name: { equals: "Compra de estoque", mode: "insensitive" },
            OR: [{ barbershopId: input.barbershopId }, { barbershopId: null }],
          },
        });
        await tx.expense.create({
          data: {
            barbershopId: input.barbershopId,
            categoryId: category?.id ?? null,
            title: "Compra de estoque",
            amount: total,
            type: "VARIABLE",
            recurrence: "ONCE",
            referenceDate: receipt.receivedAt,
            paidAt: receipt.receivedAt,
            paymentMethod: input.paymentMethod ?? null,
            supplierName,
            notes: input.notes ?? null,
            createdById: input.createdById,
            inventoryReceiptId: receipt.id,
            locked: true,
          },
        });
      }

      return tx.inventoryReceipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { items: true, expenses: true },
      });
    });
  }

  async reverseReceipt(input: { barbershopId: string; receiptId: string; createdById: string; reason: string }) {
    return prisma.$transaction(async (tx: any) => {
      const receipt = await tx.inventoryReceipt.findFirst({
        where: { id: input.receiptId, barbershopId: input.barbershopId },
        include: { items: true, expenses: true },
      });
      if (!receipt) throw new AppError("Compra não encontrada", 404);
      if (receipt.reversedAt) throw new AppError("Esta compra já foi revertida", 409);

      for (const item of receipt.items) {
        const product = await lockProduct(tx, item.productId);
        const stockAfter = nextStockQty(product.stockQty, -item.quantity, true);
        const averageCost = weightedAverageCost(product.stockQty, product.averageCost, -item.quantity, item.unitCost);
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: stockAfter, averageCost },
        });
        await writeMovement(tx, {
          barbershopId: input.barbershopId,
          productId: product.id,
          type: "PURCHASE_REVERSAL",
          quantity: -item.quantity,
          unitCost: item.unitCost,
          stockBefore: product.stockQty,
          stockAfter,
          sourceType: "inventory_receipt",
          sourceId: receipt.id,
          reason: input.reason,
          createdById: input.createdById,
        });
      }

      if (receipt.expenses[0]) {
        await tx.expense.create({
          data: {
            barbershopId: input.barbershopId,
            categoryId: receipt.expenses[0].categoryId,
            title: "Estorno de compra de estoque",
            amount: -receipt.total,
            type: "VARIABLE",
            recurrence: "ONCE",
            referenceDate: new Date(),
            paidAt: new Date(),
            supplierName: receipt.supplierName,
            notes: input.reason,
            createdById: input.createdById,
            inventoryReceiptId: null,
            locked: true,
          },
        });
      }

      return tx.inventoryReceipt.update({
        where: { id: receipt.id },
        data: { reversedAt: new Date(), reversedById: input.createdById, notes: [receipt.notes, input.reason].filter(Boolean).join(" | ") },
        include: { items: true, expenses: true },
      });
    });
  }

  async adjustStock(input: {
    barbershopId: string;
    productId: string;
    quantity: number;
    reason: string;
    createdById: string;
    type?: "MANUAL_ADJUSTMENT" | "INTERNAL_CONSUMPTION";
  }) {
    return prisma.$transaction(async (tx: any) => {
      const product = await lockProduct(tx, input.productId);
      if (product.barbershopId !== input.barbershopId) throw new AppError("Produto não encontrado neste salão", 404);
      const type = input.quantity < 0 && input.type === "INTERNAL_CONSUMPTION" ? "INTERNAL_CONSUMPTION" : "MANUAL_ADJUSTMENT";
      const stockAfter = nextStockQty(product.stockQty, input.quantity, true);
      await tx.product.update({ where: { id: product.id }, data: { stockQty: stockAfter } });
      await writeMovement(tx, {
        barbershopId: input.barbershopId,
        productId: product.id,
        type,
        quantity: input.quantity,
        unitCost: product.averageCost,
        stockBefore: product.stockQty,
        stockAfter,
        sourceType: "manual_adjustment",
        sourceId: product.id,
        reason: input.reason,
        createdById: input.createdById,
      });
      return tx.product.findUniqueOrThrow({ where: { id: product.id } });
    });
  }
}
