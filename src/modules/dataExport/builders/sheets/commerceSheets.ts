/**
 * Abas de comércio: Produtos e estoque, Compras, Reservas, Vendas (PDV),
 * Pacotes e Fiado.
 */
import { prisma } from "@/libs/prismaClient";
import {
  addRow,
  STOCK_MOVEMENT_LABELS,
  setupSheet,
  type ColumnSpec,
  type SheetBuilder,
  type SheetTarget,
  type SheetContext,
} from "../sheetHelpers";
import { anonymizeName, anonymizePhone } from "../../utils/cellSafety";

/** ── Produtos (catálogo) ──────────────────────────────────────────────────── */

const PRODUCT_COLUMNS: ColumnSpec[] = [
  { header: "Nome do produto", type: "text", width: 26 },
  { header: "Categoria", type: "text", width: 20 },
  { header: "Código (SKU)", type: "text", width: 16 },
  { header: "Código de barras", type: "text", width: 18 },
  { header: "Unidade", type: "text", width: 12 },
  { header: "Rótulo da unidade", type: "text", width: 14 },
  { header: "Preço de venda", type: "currency", width: 14 },
  { header: "Custo", type: "currency", width: 13 },
  { header: "Estoque atual", type: "decimal", width: 14 },
  { header: "Estoque mínimo", type: "decimal", width: 14 },
  { header: "Validade", type: "date", width: 12 },
  { header: "Lote", type: "text", width: 14 },
  { header: "Ativo", type: "bool", width: 9 },
  { header: "Tipo", type: "text", width: 14 },
  { header: "ID", type: "text", width: 36 },
];

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  RETAIL: "Revenda",
  CONSUMABLE: "Consumo",
  BOTH: "Revenda e consumo",
};

const STOCK_UNIT_LABELS: Record<string, string> = {
  UNIT: "Unidade",
  ML: "Mililitro",
  L: "Litro",
  G: "Grama",
  KG: "Quilo",
  BOX: "Caixa",
  PACK: "Pacote",
  OTHER: "Outra",
};

export const productsSheet: SheetBuilder = {
  key: "products",
  name: "Produtos",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, PRODUCT_COLUMNS);

    const products = await prisma.product.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        unit: true,
        unitLabel: true,
        salePrice: true,
        averageCost: true,
        stockQty: true,
        minStock: true,
        expirationDate: true,
        lotNumber: true,
        active: true,
        type: true,
        category: { select: { name: true } },
      },
    });

    for (const product of products) {
      addRow(sheet, PRODUCT_COLUMNS, [
        product.name,
        product.category?.name ?? "",
        product.sku,
        product.barcode,
        STOCK_UNIT_LABELS[product.unit] ?? product.unit,
        product.unitLabel,
        product.salePrice,
        product.averageCost,
        product.stockQty,
        product.minStock,
        product.expirationDate,
        product.lotNumber,
        product.active,
        PRODUCT_TYPE_LABELS[product.type] ?? product.type,
        product.id,
      ]);
    }
  },
};

/** ── Movimentos de estoque ────────────────────────────────────────────────── */

const STOCK_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Produto", type: "text", width: 26 },
  { header: "Tipo", type: "text", width: 14 },
  { header: "Quantidade", type: "decimal", width: 12 },
  { header: "Custo unitário", type: "currency", width: 14 },
  { header: "Saldo anterior", type: "decimal", width: 14 },
  { header: "Saldo depois", type: "decimal", width: 14 },
  { header: "Origem", type: "text", width: 16 },
  { header: "Motivo", type: "text", width: 26 },
  { header: "ID", type: "text", width: 36 },
];

export const stockSheet: SheetBuilder = {
  key: "stock",
  name: "Estoque",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, STOCK_COLUMNS);

    const movements = await prisma.stockMovement.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        quantity: true,
        unitCost: true,
        stockBefore: true,
        stockAfter: true,
        sourceType: true,
        reason: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    });

    for (const movement of movements) {
      addRow(sheet, STOCK_COLUMNS, [
        movement.createdAt,
        movement.product?.name ?? "",
        STOCK_MOVEMENT_LABELS[movement.type] ?? movement.type,
        movement.quantity,
        movement.unitCost,
        movement.stockBefore,
        movement.stockAfter,
        movement.sourceType,
        movement.reason,
        movement.id,
      ]);
    }
  },
};

/** ── Compras / recebimentos ───────────────────────────────────────────────── */

const RECEIPT_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Fornecedor", type: "text", width: 26 },
  { header: "Total", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Itens", type: "text", width: 40 },
  { header: "Observações", type: "text", width: 30 },
  { header: "ID", type: "text", width: 36 },
];

export const receiptsSheet: SheetBuilder = {
  key: "receipts",
  name: "Compras",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, RECEIPT_COLUMNS);

    const receipts = await prisma.inventoryReceipt.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { receivedAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { receivedAt: "asc" },
      select: {
        id: true,
        supplierName: true,
        total: true,
        paymentMethod: true,
        receivedAt: true,
        notes: true,
        items: {
          select: {
            quantity: true,
            unitCost: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    for (const receipt of receipts) {
      const items = receipt.items
        .map((item) => `${item.quantity} x ${item.product?.name ?? "Produto"}`)
        .join(", ");
      addRow(sheet, RECEIPT_COLUMNS, [
        receipt.receivedAt,
        receipt.supplierName,
        receipt.total,
        receipt.paymentMethod,
        items,
        receipt.notes,
        receipt.id,
      ]);
    }
  },
};

/** ── Reservas de produto ──────────────────────────────────────────────────── */

const RESERVATION_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Produto", type: "text", width: 26 },
  { header: "Cliente", type: "text", width: 26 },
  { header: "WhatsApp", type: "text", width: 16 },
  { header: "Quantidade", type: "int", width: 12 },
  { header: "Preço unitário", type: "currency", width: 14 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Expira em", type: "datetime", width: 18 },
  { header: "ID", type: "text", width: 36 },
];

export const reservationsSheet: SheetBuilder = {
  key: "reservations",
  name: "Reservas",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, RESERVATION_COLUMNS);

    const reservations = await prisma.productReservation.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        whatsapp: true,
        quantity: true,
        unitPrice: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    });

    for (const reservation of reservations) {
      const name = ctx.options.anonymize
        ? anonymizeName(reservation.customerName)
        : reservation.customerName;
      const phone = ctx.options.anonymize
        ? anonymizePhone(reservation.whatsapp)
        : reservation.whatsapp;
      addRow(sheet, RESERVATION_COLUMNS, [
        reservation.createdAt,
        reservation.product?.name ?? "",
        name,
        phone,
        reservation.quantity,
        reservation.unitPrice,
        reservation.status,
        reservation.expiresAt,
        reservation.id,
      ]);
    }
  },
};

/** ── Vendas (PDV) ─────────────────────────────────────────────────────────── */

const SALE_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Cliente", type: "text", width: 26 },
  { header: "Itens", type: "text", width: 40 },
  { header: "Subtotal", type: "currency", width: 14 },
  { header: "Desconto", type: "currency", width: 14 },
  { header: "Total", type: "currency", width: 14 },
  { header: "Custo", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Vendedor", type: "text", width: 22 },
  { header: "ID", type: "text", width: 36 },
];

export const salesSheet: SheetBuilder = {
  key: "sales",
  name: "Vendas",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, SALE_COLUMNS);

    const sales = await prisma.retailSale.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { soldAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { soldAt: "asc" },
      select: {
        id: true,
        soldAt: true,
        subtotal: true,
        discount: true,
        total: true,
        totalCost: true,
        paymentMethod: true,
        status: true,
        client: { select: { name: true } },
        soldById: true,
        lines: {
          select: {
            productName: true,
            quantity: true,
            unitPrice: true,
            refundedQty: true,
          },
        },
        refunds: { select: { id: true, financialRefund: true } },
      },
    });

    // Nomes dos vendedores (a venda guarda só o id).
    const sellerIds = [...new Set(sales.map((sale) => sale.soldById).filter(Boolean))] as string[];
    const sellers = sellerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : [];
    const sellerName = new Map(sellers.map((seller) => [seller.id, seller.name]));

    for (const sale of sales) {
      const items = sale.lines
        .map(
          (line) =>
            `${line.quantity} x ${line.productName} (${line.refundedQty > 0 ? `devolvido: ${line.refundedQty}; ` : ""}${line.unitPrice.toFixed(2)})`,
        )
        .join(", ");
      const customer = sale.client?.name;
      addRow(sheet, SALE_COLUMNS, [
        sale.soldAt,
        ctx.options.anonymize ? anonymizeName(customer) : customer,
        items,
        sale.subtotal,
        sale.discount,
        sale.total,
        sale.totalCost,
        sale.paymentMethod,
        sale.status,
        sellerName.get(sale.soldById) ?? "",
        sale.id,
      ]);
    }
  },
};

/** ── Pacotes (catálogo) ───────────────────────────────────────────────────── */

const PACKAGE_COLUMNS: ColumnSpec[] = [
  { header: "Nome do pacote", type: "text", width: 26 },
  { header: "Serviço", type: "text", width: 26 },
  { header: "Sessões", type: "int", width: 10 },
  { header: "Preço", type: "currency", width: 14 },
  { header: "Validade (dias)", type: "int", width: 14 },
  { header: "Ativo", type: "bool", width: 9 },
  { header: "ID", type: "text", width: 36 },
];

export const packagesSheet: SheetBuilder = {
  key: "packages",
  name: "Pacotes",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, PACKAGE_COLUMNS);

    const packages = await prisma.servicePackage.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sessionCount: true,
        price: true,
        validityDays: true,
        active: true,
        service: { select: { name: true } },
      },
    });

    for (const item of packages) {
      addRow(sheet, PACKAGE_COLUMNS, [
        item.name,
        item.service?.name ?? "",
        item.sessionCount,
        item.price,
        item.validityDays,
        item.active,
        item.id,
      ]);
    }
  },
};

/** ── Pacotes dos clientes ─────────────────────────────────────────────────── */

const CLIENT_PACKAGE_COLUMNS: ColumnSpec[] = [
  { header: "Cliente", type: "text", width: 28 },
  { header: "WhatsApp", type: "text", width: 16 },
  { header: "Pacote", type: "text", width: 24 },
  { header: "Serviço", type: "text", width: 24 },
  { header: "Sessões totais", type: "int", width: 13 },
  { header: "Sessões restantes", type: "int", width: 16 },
  { header: "Valor pago", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Comprado em", type: "date", width: 13 },
  { header: "Validade", type: "date", width: 13 },
  { header: "ID", type: "text", width: 36 },
];

export const clientPackagesSheet: SheetBuilder = {
  key: "clientPackages",
  name: "Pacotes dos clientes",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, CLIENT_PACKAGE_COLUMNS);

    const packages = await prisma.clientPackage.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { purchasedAt: "desc" },
      select: {
        id: true,
        totalSessions: true,
        remainingSessions: true,
        pricePaid: true,
        paymentMethod: true,
        status: true,
        purchasedAt: true,
        expiresAt: true,
        package: { select: { name: true } },
        service: { select: { name: true } },
        client: { select: { name: true, whatsapp: true } },
      },
    });

    for (const item of packages) {
      const name = ctx.options.anonymize
        ? anonymizeName(item.client?.name)
        : item.client?.name;
      const phone = ctx.options.anonymize
        ? anonymizePhone(item.client?.whatsapp)
        : item.client?.whatsapp;
      addRow(sheet, CLIENT_PACKAGE_COLUMNS, [
        name,
        phone,
        item.package?.name ?? "",
        item.service?.name ?? "",
        item.totalSessions,
        item.remainingSessions,
        item.pricePaid,
        item.paymentMethod,
        item.status,
        item.purchasedAt,
        item.expiresAt,
        item.id,
      ]);
    }
  },
};

/** ── Pacotes recorrentes e uso de sessões ─────────────────────────────────── */

const RECURRING_COLUMNS: ColumnSpec[] = [
  { header: "Cliente", type: "text", width: 28 },
  { header: "Plano", type: "text", width: 24 },
  { header: "Ciclo de cobrança", type: "text", width: 18 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Início", type: "date", width: 12 },
  { header: "Fim do ciclo atual", type: "date", width: 16 },
  { header: "Cancelamento", type: "date", width: 14 },
  { header: "Sessões usadas no período", type: "int", width: 20 },
  { header: "ID", type: "text", width: 36 },
];

export const recurringPackagesSheet: SheetBuilder = {
  key: "recurringPackages",
  name: "Pacotes recorrentes",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, RECURRING_COLUMNS);

    const packages = await prisma.clientRecurringPackage.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        status: true,
        startDate: true,
        currentPeriodEnd: true,
        cancelDate: true,
        plan: { select: { name: true, billingCycle: true } },
        client: { select: { name: true } },
        usages: {
          where: ctx.period.from && ctx.period.to
            ? { usedAt: { gte: ctx.period.from, lte: ctx.period.to } }
            : {},
          select: { id: true },
        },
      },
    });

    for (const item of packages) {
      addRow(sheet, RECURRING_COLUMNS, [
        ctx.options.anonymize ? anonymizeName(item.client?.name) : item.client?.name,
        item.plan?.name ?? "",
        item.plan?.billingCycle ?? "",
        item.status,
        item.startDate,
        item.currentPeriodEnd,
        item.cancelDate,
        item.usages.length,
        item.id,
      ]);
    }
  },
};

/** ── Fiado ────────────────────────────────────────────────────────────────── */

const FIADO_COLUMNS: ColumnSpec[] = [
  { header: "Cliente", type: "text", width: 28 },
  { header: "WhatsApp", type: "text", width: 16 },
  { header: "Descrição", type: "text", width: 34 },
  { header: "Valor original", type: "currency", width: 15 },
  { header: "Pago", type: "currency", width: 14 },
  { header: "Saldo", type: "currency", width: 14 },
  { header: "Vencimento", type: "date", width: 13 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Origem", type: "text", width: 14 },
  { header: "Criado em", type: "datetime", width: 18 },
  { header: "ID", type: "text", width: 36 },
];

const FIADO_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  PARTIAL: "Parcial",
  PAID: "Pago",
  FORGIVEN: "Perdoado",
};

const FIADO_ORIGIN_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  IMPORT: "Importação",
  RETAIL_SALE: "Venda (PDV)",
};

export const fiadoSheet: SheetBuilder = {
  key: "fiado",
  name: "Fiado",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, FIADO_COLUMNS);

    const debts = await prisma.fiado.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        whatsapp: true,
        description: true,
        originalAmount: true,
        paidAmount: true,
        dueDate: true,
        status: true,
        origin: true,
        createdAt: true,
      },
    });

    for (const debt of debts) {
      const name = ctx.options.anonymize ? anonymizeName(debt.customerName) : debt.customerName;
      const phone = ctx.options.anonymize ? anonymizePhone(debt.whatsapp) : debt.whatsapp;
      addRow(sheet, FIADO_COLUMNS, [
        name,
        phone,
        debt.description,
        debt.originalAmount,
        debt.paidAmount,
        Number(debt.originalAmount) - Number(debt.paidAmount),
        debt.dueDate,
        FIADO_STATUS_LABELS[debt.status] ?? debt.status,
        FIADO_ORIGIN_LABELS[debt.origin] ?? debt.origin,
        debt.createdAt,
        debt.id,
      ]);
    }
  },
};

const FIADO_PAYMENT_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Cliente", type: "text", width: 28 },
  { header: "Dívida", type: "text", width: 30 },
  { header: "Valor pago", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Observações", type: "text", width: 30 },
  { header: "ID", type: "text", width: 36 },
];

export const fiadoPaymentsSheet: SheetBuilder = {
  key: "fiadoPayments",
  name: "Pagamentos de fiado",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, FIADO_PAYMENT_COLUMNS);

    const payments = await prisma.fiadoPayment.findMany({
      where: {
        fiado: { barbershopId: ctx.shop.id },
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        notes: true,
        createdAt: true,
        fiado: { select: { customerName: true, description: true } },
      },
    });

    for (const payment of payments) {
      addRow(sheet, FIADO_PAYMENT_COLUMNS, [
        payment.createdAt,
        ctx.options.anonymize
          ? anonymizeName(payment.fiado?.customerName)
          : payment.fiado?.customerName,
        payment.fiado?.description,
        payment.amount,
        payment.paymentMethod,
        payment.notes,
        payment.id,
      ]);
    }
  },
};
