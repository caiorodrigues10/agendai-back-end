/**
 * Abas financeiras: Receitas, Despesas, Caixa, Lucro, Depósitos e Comissões.
 *
 * Os números do Resumo e da aba Lucro saem do mesmo motor de lucro do app
 * (`calculateProfit`), então batem com os relatórios.
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { prisma } from "@/libs/prismaClient";
import {
  addRow,
  APPOINTMENT_STATUS_LABELS,
  MODALITY_LABELS,
  setupSheet,
  type ColumnSpec,
  type SheetBuilder,
  type SheetTarget,
  type SheetContext,
} from "../sheetHelpers";
import { computePeriodSummary } from "../summaryData";

dayjs.extend(utc);
dayjs.extend(timezone);

/** ── Receitas / atendimentos concluídos ───────────────────────────────────── */

const REVENUE_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "date", width: 12 },
  { header: "Origem", type: "text", width: 12 },
  { header: "Cliente", type: "text", width: 28 },
  { header: "Serviço", type: "text", width: 26 },
  { header: "Profissional", type: "text", width: 22 },
  { header: "Valor", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Modalidade", type: "text", width: 14 },
  { header: "Situação", type: "text", width: 14 },
  { header: "ID", type: "text", width: 36 },
];

export const revenueSheet: SheetBuilder = {
  key: "revenue",
  name: "Receitas",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, REVENUE_COLUMNS);
    const where = {
      barbershopId: ctx.shop.id,
      status: "COMPLETED" as const,
      ...(ctx.period.from && ctx.period.to
        ? { date: { gte: ctx.period.from, lte: ctx.period.to } }
        : {}),
    };

    const [appointments, queueItems] = await Promise.all([
      prisma.appointment.findMany({
        where,
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          customerName: true,
          finalPrice: true,
          paymentMethod: true,
          modality: true,
          status: true,
          service: { select: { name: true, price: true } },
          staff: { select: { name: true } },
        },
      }),
      prisma.queueItem.findMany({
        where: {
          barbershopId: ctx.shop.id,
          status: "COMPLETED",
          ...(ctx.period.from && ctx.period.to
            ? { completedAt: { gte: ctx.period.from, lte: ctx.period.to } }
            : {}),
        },
        orderBy: { completedAt: "asc" },
        select: {
          id: true,
          completedAt: true,
          customerName: true,
          finalPrice: true,
          paymentMethod: true,
          service: { select: { name: true, price: true } },
        },
      }),
    ]);

    for (const appointment of appointments) {
      addRow(sheet, REVENUE_COLUMNS, [
        appointment.date,
        "Agenda",
        appointment.customerName,
        appointment.service?.name ?? "",
        appointment.staff?.name ?? "",
        appointment.finalPrice ?? appointment.service?.price ?? 0,
        appointment.paymentMethod,
        MODALITY_LABELS[appointment.modality] ?? appointment.modality,
        APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status,
        appointment.id,
      ]);
    }

    for (const item of queueItems) {
      addRow(sheet, REVENUE_COLUMNS, [
        item.completedAt,
        "Fila",
        item.customerName,
        item.service?.name ?? "",
        "",
        item.finalPrice ?? item.service?.price ?? 0,
        item.paymentMethod,
        "",
        "Concluído",
        item.id,
      ]);
    }
  },
};

/** ── Despesas ─────────────────────────────────────────────────────────────── */

const EXPENSE_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "date", width: 12 },
  { header: "Descrição", type: "text", width: 34 },
  { header: "Categoria", type: "text", width: 22 },
  { header: "Valor", type: "currency", width: 14 },
  { header: "Tipo", type: "text", width: 12 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Pago em", type: "date", width: 12 },
  { header: "Vencimento", type: "date", width: 12 },
  { header: "Fornecedor", type: "text", width: 24 },
  { header: "Observações", type: "text", width: 30 },
  { header: "ID", type: "text", width: 36 },
];

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  FIXED: "Fixa",
  VARIABLE: "Variável",
};

export const expensesSheet: SheetBuilder = {
  key: "expenses",
  name: "Despesas",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, EXPENSE_COLUMNS);

    const expenses = await prisma.expense.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { referenceDate: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { referenceDate: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        type: true,
        paymentMethod: true,
        referenceDate: true,
        paidAt: true,
        dueDate: true,
        supplierName: true,
        notes: true,
        category: { select: { name: true } },
      },
    });

    for (const expense of expenses) {
      addRow(sheet, EXPENSE_COLUMNS, [
        expense.referenceDate,
        expense.description || expense.title,
        expense.category?.name ?? "",
        expense.amount,
        EXPENSE_TYPE_LABELS[expense.type] ?? expense.type,
        expense.paymentMethod,
        expense.paidAt,
        expense.dueDate,
        expense.supplierName,
        expense.notes,
        expense.id,
      ]);
    }
  },
};

/** ── Caixa ────────────────────────────────────────────────────────────────── */

const CASH_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Tipo", type: "text", width: 14 },
  { header: "Entrada", type: "currency", width: 14 },
  { header: "Saída", type: "currency", width: 14 },
  { header: "Valor", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Descrição", type: "text", width: 34 },
  { header: "Origem", type: "text", width: 16 },
  { header: "Profissional", type: "text", width: 22 },
  { header: "ID", type: "text", width: 36 },
];

const CASH_IN_TYPES = ["SALE", "SERVICE", "TIPPING", "PACKAGE_SALE", "DEPOSIT", "RECEIVABLE_PAYMENT", "TIP", "OTHER"];

export const cashSheet: SheetBuilder = {
  key: "cash",
  name: "Caixa",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, CASH_COLUMNS);

    const movements = await prisma.cashMovement.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { occurredAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        type: true,
        amount: true,
        paymentMethod: true,
        description: true,
        sourceType: true,
        occurredAt: true,
        professionalId: true,
      },
    });

    // Nomes dos profissionais (o movimento guarda só o id).
    const professionalIds = [...new Set(movements.map((m) => m.professionalId).filter(Boolean))] as string[];
    const professionals = professionalIds.length
      ? await prisma.user.findMany({
          where: { id: { in: professionalIds } },
          select: { id: true, name: true },
        })
      : [];
    const professionalName = new Map(professionals.map((p) => [p.id, p.name]));

    for (const movement of movements) {
      const value = Number(movement.amount);
      const isIn = CASH_IN_TYPES.includes(movement.type);
      addRow(sheet, CASH_COLUMNS, [
        movement.occurredAt,
        movement.type,
        isIn ? value : null,
        isIn ? null : value,
        value,
        movement.paymentMethod,
        movement.description,
        movement.sourceType,
        movement.professionalId ? (professionalName.get(movement.professionalId) ?? "") : "",
        movement.id,
      ]);
    }
  },
};

/** ── Fechamento diário ────────────────────────────────────────────────────── */

const CLOSEOUT_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "date", width: 12 },
  { header: "Saldo de abertura", type: "currency", width: 16 },
  { header: "Dinheiro recebido", type: "currency", width: 16 },
  { header: "Pix recebido", type: "currency", width: 16 },
  { header: "Cartão recebido", type: "currency", width: 16 },
  { header: "Fiado criado", type: "currency", width: 14 },
  { header: "Fiado pago", type: "currency", width: 14 },
  { header: "Despesas", type: "currency", width: 14 },
  { header: "Comissões", type: "currency", width: 14 },
  { header: "Venda de produtos", type: "currency", width: 16 },
  { header: "Diferença", type: "currency", width: 14 },
  { header: "Movimentos", type: "int", width: 12 },
  { header: "Observações", type: "text", width: 30 },
  { header: "ID", type: "text", width: 36 },
];

export const closeoutSheet: SheetBuilder = {
  key: "closeout",
  name: "Fechamento diário",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, CLOSEOUT_COLUMNS);

    const closeouts = await prisma.dailyCloseout.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { date: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        balanceOpen: true,
        cashReceived: true,
        pixReceived: true,
        cardReceived: true,
        fiadoCreated: true,
        fiadoPaid: true,
        expenses: true,
        commissions: true,
        productSales: true,
        discrepancy: true,
        cashMovementCount: true,
        notes: true,
      },
    });

    for (const closeout of closeouts) {
      addRow(sheet, CLOSEOUT_COLUMNS, [
        closeout.date,
        closeout.balanceOpen,
        closeout.cashReceived,
        closeout.pixReceived,
        closeout.cardReceived,
        closeout.fiadoCreated,
        closeout.fiadoPaid,
        closeout.expenses,
        closeout.commissions,
        closeout.productSales,
        closeout.discrepancy,
        closeout.cashMovementCount,
        closeout.notes,
        closeout.id,
      ]);
    }
  },
};

/** ── Lucro por mês ────────────────────────────────────────────────────────── */

const PROFIT_COLUMNS: ColumnSpec[] = [
  { header: "Mês", type: "text", width: 12 },
  { header: "Receita de serviços", type: "currency", width: 18 },
  { header: "Receita de produtos", type: "currency", width: 18 },
  { header: "Faturamento", type: "currency", width: 16 },
  { header: "Custos indiretos", type: "currency", width: 16 },
  { header: "Custos operacionais", type: "currency", width: 16 },
  { header: "Impostos", type: "currency", width: 14 },
  { header: "Comissões", type: "currency", width: 14 },
  { header: "Lucro líquido", type: "currency", width: 16 },
  { header: "Margem (%)", type: "decimal", width: 12 },
  { header: "Atendimentos", type: "int", width: 13 },
];

export const profitSheet: SheetBuilder = {
  key: "profit",
  name: "Lucro",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, PROFIT_COLUMNS);

    // Meses do período (no fuso do salão). "Tudo" limita a 36 meses.
    const months: string[] = [];
    if (ctx.period.from && ctx.period.to) {
      let cursor = dayjs(ctx.period.from).tz(ctx.period.timezone).startOf("month");
      const end = dayjs(ctx.period.to).tz(ctx.period.timezone).startOf("month");
      while (cursor.isBefore(end) || cursor.isSame(end, "month")) {
        months.push(cursor.format("YYYY-MM"));
        if (months.length >= 36) {
          ctx.warnings.push(
            "A aba Lucro mostra no máximo 36 meses. Reduza o período para ver os meses mais antigos.",
          );
          break;
        }
        cursor = cursor.add(1, "month");
      }
    }

    for (const month of months) {
      const start = dayjs.tz(`${month}-01 00:00:00`, ctx.period.timezone);
      const end = start.add(1, "month").subtract(1, "millisecond");
      const summary = await computePeriodSummary(ctx.shop.id, {
        from: start.toDate(),
        to: end.toDate(),
      });
      addRow(sheet, PROFIT_COLUMNS, [
        month,
        summary.serviceRevenue,
        summary.productRevenue,
        summary.revenue,
        summary.expenses,
        0,
        summary.taxAmount,
        summary.commissions,
        summary.netProfit,
        summary.marginPercent,
        summary.totalAppointments,
      ]);
    }
  },
};

/** ── Depósitos e sinais ───────────────────────────────────────────────────── */

const DEPOSIT_COLUMNS: ColumnSpec[] = [
  { header: "Data do agendamento", type: "date", width: 16 },
  { header: "Cliente", type: "text", width: 28 },
  { header: "Serviço", type: "text", width: 26 },
  { header: "Valor esperado", type: "currency", width: 15 },
  { header: "Valor confirmado", type: "currency", width: 15 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Confirmado em", type: "datetime", width: 18 },
  { header: "Expira em", type: "date", width: 12 },
  { header: "Regra de reembolso", type: "text", width: 18 },
  { header: "ID", type: "text", width: 36 },
];

export const depositsSheet: SheetBuilder = {
  key: "deposits",
  name: "Depósitos",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, DEPOSIT_COLUMNS);

    const deposits = await prisma.appointmentDeposit.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { appointment: { date: { gte: ctx.period.from, lte: ctx.period.to } } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        expectedAmount: true,
        confirmedAmount: true,
        status: true,
        paymentMethod: true,
        confirmedAt: true,
        expiresAt: true,
        refundRule: true,
        appointment: {
          select: {
            date: true,
            customerName: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    for (const deposit of deposits) {
      addRow(sheet, DEPOSIT_COLUMNS, [
        deposit.appointment?.date,
        deposit.appointment?.customerName,
        deposit.appointment?.service?.name,
        deposit.expectedAmount,
        deposit.confirmedAmount,
        deposit.status,
        deposit.paymentMethod,
        deposit.confirmedAt,
        deposit.expiresAt,
        deposit.refundRule,
        deposit.id,
      ]);
    }
  },
};

/** ── Comissões ────────────────────────────────────────────────────────────── */

const COMMISSION_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "date", width: 12 },
  { header: "Profissional", type: "text", width: 24 },
  { header: "Serviço", type: "text", width: 26 },
  { header: "Base de cálculo (%)", type: "decimal", width: 16 },
  { header: "Valor", type: "currency", width: 14 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Origem", type: "text", width: 14 },
  { header: "ID", type: "text", width: 36 },
];

export const commissionsSheet: SheetBuilder = {
  key: "commissions",
  name: "Comissões",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, COMMISSION_COLUMNS);

    const entries = await prisma.commissionEntry.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        percentage: true,
        amount: true,
        createdAt: true,
        appointment: { select: { finalPrice: true, completedAt: true, date: true } },
        queueItem: { select: { finalPrice: true, completedAt: true } },
        professional: { select: { name: true } },
        service: { select: { name: true } },
      },
    });

    for (const entry of entries) {
      const paid = Boolean(entry.appointment?.completedAt || entry.queueItem?.completedAt);
      addRow(sheet, COMMISSION_COLUMNS, [
        entry.appointment?.date ?? entry.createdAt,
        entry.professional?.name ?? "",
        entry.service?.name ?? "",
        entry.percentage,
        entry.amount,
        paid ? "Pago" : "Pendente",
        entry.appointment ? "Agenda" : entry.queueItem ? "Fila" : "Manual",
        entry.id,
      ]);
    }
  },
};
