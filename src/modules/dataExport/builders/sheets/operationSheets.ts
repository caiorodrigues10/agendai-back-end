/**
 * Abas operacionais: Agendamentos, Clientes, Serviços e Equipe.
 *
 * **Agendamentos, Clientes e Serviços são reimportáveis**: as primeiras
 * colunas usam exatamente os cabeçalhos aceitos pelo assistente de importação
 * (`Nome`, `WhatsApp`, `Nome do serviço`, `Preço`, `Data`, `Hora`…), e as
 * colunas extras ficam no fim.
 */
import { prisma } from "@/libs/prismaClient";
import {
  addRow,
  APPOINTMENT_SOURCE_LABELS,
  APPOINTMENT_STATUS_LABELS,
  formatCell,
  MODALITY_LABELS,
  paginate,
  setupSheet,
  WEEKDAY_LABELS,
  type ColumnSpec,
  type SheetBuilder,
  type SheetTarget,
  type SheetContext,
} from "../sheetHelpers";
import { anonymizeEmail, anonymizeName, anonymizePhone } from "../../utils/cellSafety";
import { MAX_ROWS_PER_SHEET } from "../../dataExport.constants";

/** ── Agendamentos ─────────────────────────────────────────────────────────── */

const APPOINTMENT_COLUMNS: ColumnSpec[] = [
  // Reimportáveis (mesmos rótulos aceitos pelo assistente de importação).
  { header: "Data", type: "date", width: 12 },
  { header: "Hora", type: "time", width: 8 },
  { header: "Nome do cliente", type: "text", width: 28 },
  { header: "WhatsApp do cliente", type: "text", width: 16 },
  { header: "Serviço", type: "text", width: 26 },
  { header: "Profissional", type: "text", width: 22 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Valor", type: "currency", width: 14 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "Modalidade", type: "text", width: 14 },
  // Extras (no fim, para não atrapalhar o mapeamento).
  { header: "Duração (minutos)", type: "int", width: 14 },
  { header: "Origem", type: "text", width: 12 },
  { header: "Concluído em", type: "datetime", width: 18 },
  { header: "Cancelamento (motivo)", type: "text", width: 26 },
  { header: "Cancelamento (origem)", type: "text", width: 18 },
  { header: "Falta registrada em", type: "datetime", width: 18 },
  { header: "Pet", type: "text", width: 18 },
  { header: "Observações", type: "text", width: 30 },
  { header: "ID do agendamento", type: "text", width: 36 },
];

export const appointmentsSheet: SheetBuilder = {
  key: "appointments",
  name: "Agendamentos",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    const columns = [...APPOINTMENT_COLUMNS];
    if (ctx.options.includeCase) {
      columns.splice(10, 0, { header: "Caso/processo", type: "text", width: 22 });
    }
    setupSheet(sheet, columns);

    const where = {
      barbershopId: ctx.shop.id,
      ...(ctx.period.from && ctx.period.to
        ? { date: { gte: ctx.period.from, lte: ctx.period.to } }
        : {}),
    };

    let count = 0;
    for await (const appointment of paginate(
      (cursor) =>
        prisma.appointment.findMany({
          where,
          take: 500,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            date: true,
            time: true,
            customerName: true,
            whatsapp: true,
            status: true,
            finalPrice: true,
            paymentMethod: true,
            modality: true,
            source: true,
            completedAt: true,
            canceledAt: true,
            cancellationSource: true,
            cancellationReason: true,
            noShowMarkedAt: true,
            petName: true,
            caseName: true,
            service: { select: { name: true, avgTimeMinutes: true } },
            staff: { select: { name: true } },
          },
        }),
      500,
    )) {
      if (count >= MAX_ROWS_PER_SHEET) {
        ctx.warnings.push(
          `A aba Agendamentos atingiu o limite de ${MAX_ROWS_PER_SHEET.toLocaleString("pt-BR")} linhas. Reduza o período para exportar o restante.`,
        );
        break;
      }
      count += 1;
      const name = ctx.options.anonymize
        ? anonymizeName(appointment.customerName)
        : appointment.customerName;
      const phone = ctx.options.anonymize
        ? anonymizePhone(appointment.whatsapp)
        : appointment.whatsapp;
      const values: unknown[] = [
        appointment.date,
        appointment.time,
        name,
        phone,
        appointment.service?.name ?? "",
        appointment.staff?.name ?? "",
        APPOINTMENT_STATUS_LABELS[appointment.status] ?? appointment.status,
        appointment.finalPrice,
        appointment.paymentMethod,
        MODALITY_LABELS[appointment.modality] ?? appointment.modality,
        appointment.service?.avgTimeMinutes,
        APPOINTMENT_SOURCE_LABELS[appointment.source] ?? appointment.source,
        appointment.completedAt,
        appointment.cancellationReason,
        appointment.cancellationSource,
        appointment.noShowMarkedAt,
        appointment.petName,
        "",
        appointment.id,
      ];
      if (ctx.options.includeCase) {
        values.splice(10, 0, appointment.caseName);
      }
      addRow(sheet, columns, values);
    }
  },
};

/** ── Clientes ─────────────────────────────────────────────────────────────── */

const CLIENT_COLUMNS: ColumnSpec[] = [
  // Reimportáveis.
  { header: "Nome", type: "text", width: 28 },
  { header: "WhatsApp", type: "text", width: 16 },
  { header: "Observações", type: "text", width: 30 },
  // Extras.
  { header: "Cadastrado em", type: "date", width: 13 },
  { header: "Última visita", type: "date", width: 13 },
  { header: "Total de visitas", type: "int", width: 13 },
  { header: "Gasto no período", type: "currency", width: 16 },
  { header: "Gasto total", type: "currency", width: 16 },
  { header: "Aceita marketing", type: "bool", width: 14 },
  { header: "Pacotes ativos", type: "int", width: 13 },
  { header: "Dívidas em aberto", type: "currency", width: 16 },
  { header: "ID do cliente", type: "text", width: 36 },
];

export const clientsSheet: SheetBuilder = {
  key: "clients",
  name: "Clientes",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, CLIENT_COLUMNS);

    const periodFilter =
      ctx.period.from && ctx.period.to
        ? { gte: ctx.period.from, lte: ctx.period.to }
        : undefined;

    // Gasto por cliente: duas agregações no total (nada de N+1).
    const [periodSpend, totalSpend] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["clientId"],
        where: {
          barbershopId: ctx.shop.id,
          clientId: { not: null },
          status: "COMPLETED",
          ...(periodFilter ? { date: periodFilter } : {}),
        },
        _sum: { finalPrice: true },
      }),
      prisma.appointment.groupBy({
        by: ["clientId"],
        where: { barbershopId: ctx.shop.id, clientId: { not: null }, status: "COMPLETED" },
        _sum: { finalPrice: true },
      }),
    ]);
    const periodSpendMap = new Map(
      periodSpend.map((row) => [row.clientId, row._sum.finalPrice ?? 0]),
    );
    const totalSpendMap = new Map(totalSpend.map((row) => [row.clientId, row._sum.finalPrice ?? 0]));

    let count = 0;
    for await (const client of paginate(
      (cursor) =>
        prisma.salonClient.findMany({
          where: { barbershopId: ctx.shop.id },
          take: 500,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            whatsapp: true,
            notes: true,
            marketingOptIn: true,
            totalAppointments: true,
            lastVisitAt: true,
            createdAt: true,
            packages: {
              where: { status: "ACTIVE" },
              select: { id: true },
            },
            fiados: {
              where: { status: { in: ["PENDING", "PARTIAL"] } },
              select: { originalAmount: true, paidAmount: true },
            },
          },
        }),
      500,
    )) {
      if (count >= MAX_ROWS_PER_SHEET) {
        ctx.warnings.push(
          `A aba Clientes atingiu o limite de ${MAX_ROWS_PER_SHEET.toLocaleString("pt-BR")} linhas. Reduza o período para exportar o restante.`,
        );
        break;
      }
      count += 1;

      const debt = client.fiados.reduce(
        (sum, fiado) => sum + (Number(fiado.originalAmount) - Number(fiado.paidAmount)),
        0,
      );

      const name = ctx.options.anonymize ? anonymizeName(client.name) : client.name;
      const phone = ctx.options.anonymize ? anonymizePhone(client.whatsapp) : client.whatsapp;

      addRow(sheet, CLIENT_COLUMNS, [
        name,
        phone,
        client.notes,
        client.createdAt,
        client.lastVisitAt,
        client.totalAppointments,
        periodSpendMap.get(client.id) ?? 0,
        totalSpendMap.get(client.id) ?? 0,
        client.marketingOptIn,
        client.packages.length,
        debt,
        client.id,
      ]);
    }
  },
};

/** ── Serviços ─────────────────────────────────────────────────────────────── */

const SERVICE_COLUMNS: ColumnSpec[] = [
  // Reimportáveis.
  { header: "Nome do serviço", type: "text", width: 28 },
  { header: "Preço", type: "currency", width: 13 },
  { header: "Duração (minutos)", type: "int", width: 15 },
  { header: "Categoria", type: "text", width: 20 },
  // Extras.
  { header: "Ativo", type: "bool", width: 9 },
  { header: "Público", type: "bool", width: 10 },
  { header: "Comissão padrão (%)", type: "decimal", width: 16 },
  { header: "Variações", type: "text", width: 26 },
  { header: "Adicionais", type: "text", width: 26 },
  { header: "Combos", type: "text", width: 26 },
  { header: "Quantidade realizada", type: "int", width: 16 },
  { header: "Receita no período", type: "currency", width: 16 },
  { header: "ID do serviço", type: "text", width: 36 },
];

export const servicesSheet: SheetBuilder = {
  key: "services",
  name: "Serviços",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, SERVICE_COLUMNS);

    const services = await prisma.service.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        active: true,
        publicBookable: true,
        commissionPercent: true,
        category: { select: { name: true } },
        variations: { select: { name: true, price: true, isPublic: true } },
        addons: { select: { name: true, price: true, isPublic: true } },
        comboItems: { select: { comboId: true } },
      },
    });

    // Quantidade e receita por serviço no período (uma consulta agregada).
    const performed = await prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        barbershopId: ctx.shop.id,
        status: "COMPLETED",
        ...(ctx.period.from && ctx.period.to
          ? { date: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      _count: { _all: true },
      _sum: { finalPrice: true },
    });
    const performedMap = new Map(
      performed.map((row) => [row.serviceId, { count: row._count._all, revenue: row._sum.finalPrice ?? 0 }]),
    );

    const comboIds = [...new Set(services.flatMap((s) => s.comboItems.map((item) => item.comboId)))];
    const combos = comboIds.length
      ? await prisma.serviceCombo.findMany({
          where: { id: { in: comboIds } },
          select: { id: true, name: true },
        })
      : [];
    const comboName = new Map(combos.map((combo) => [combo.id, combo.name]));

    for (const service of services) {
      const stats = performedMap.get(service.id);
      addRow(sheet, SERVICE_COLUMNS, [
        service.name,
        service.price,
        service.avgTimeMinutes,
        service.category?.name ?? "",
        service.active,
        service.publicBookable,
        service.commissionPercent,
        service.variations.map((v) => v.name).join(", "),
        service.addons.map((a) => a.name).join(", "),
        service.comboItems
          .map((item) => comboName.get(item.comboId))
          .filter(Boolean)
          .join(", "),
        stats?.count ?? 0,
        stats?.revenue ?? 0,
        service.id,
      ]);
    }
  },
};

/** ── Equipe ───────────────────────────────────────────────────────────────── */

const TEAM_COLUMNS: ColumnSpec[] = [
  { header: "Profissional", type: "text", width: 26 },
  { header: "Função", type: "text", width: 14 },
  { header: "Ativo", type: "bool", width: 9 },
  { header: "Comissão padrão (%)", type: "decimal", width: 16 },
  { header: "Serviços que executa", type: "text", width: 34 },
  { header: "Horário de trabalho", type: "text", width: 40 },
  { header: "Folgas e bloqueios no período", type: "text", width: 30 },
  { header: "Atendimentos no período", type: "int", width: 16 },
  { header: "Receita no período", type: "currency", width: 16 },
  { header: "Comissão no período", type: "currency", width: 16 },
  { header: "Meta", type: "text", width: 22 },
  { header: "ID do profissional", type: "text", width: 36 },
];

export const teamSheet: SheetBuilder = {
  key: "team",
  name: "Equipe",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, TEAM_COLUMNS);

    const staff = await prisma.user.findMany({
      where: { barbershopId: ctx.shop.id, role: { in: ["OWNER", "EMPLOYEE"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        role: true,
        active: true,
        staffServices: {
          where: { isActive: true },
          select: { service: { select: { name: true, commissionPercent: true } } },
        },
        staffSchedules: {
          where: { isActive: true },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
        staffTimeOff: {
          where: ctx.period.from && ctx.period.to
            ? { endAt: { gte: ctx.period.from }, startAt: { lte: ctx.period.to } }
            : {},
          orderBy: { startAt: "asc" },
          select: { startAt: true, endAt: true, reason: true, status: true },
        },
        professionalGoals: {
          select: { metric: true, target: true, period: true, startDate: true, endDate: true },
        },
      },
    });

    const periodFilter =
      ctx.period.from && ctx.period.to
        ? { date: { gte: ctx.period.from, lte: ctx.period.to } }
        : {};

    const stats = await prisma.appointment.groupBy({
      by: ["staffId"],
      where: {
        barbershopId: ctx.shop.id,
        status: "COMPLETED",
        ...periodFilter,
      },
      _count: { _all: true },
      _sum: { finalPrice: true },
    });
    const statsMap = new Map(
      stats.map((row) => [row.staffId, { count: row._count._all, revenue: row._sum.finalPrice ?? 0 }]),
    );

    const commissions = await prisma.commissionEntry.groupBy({
      by: ["professionalId"],
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      _sum: { amount: true },
    });
    const commissionMap = new Map(
      commissions.map((row) => [row.professionalId, row._sum.amount ?? 0]),
    );

    const ROLE_LABELS: Record<string, string> = {
      OWNER: "Dono",
      MANAGER: "Gerente",
      EMPLOYEE: "Profissional",
    };

    for (const person of staff) {
      const scheduleText = person.staffSchedules
        .map(
          (schedule) =>
            `${WEEKDAY_LABELS[schedule.dayOfWeek] ?? schedule.dayOfWeek}: ${schedule.startTime}-${schedule.endTime}`,
        )
        .join("; ");
      const timeOffText = person.staffTimeOff
        .map((off) => {
          const start = off.startAt.toLocaleDateString("pt-BR", { timeZone: "UTC" });
          const end = off.endAt.toLocaleDateString("pt-BR", { timeZone: "UTC" });
          return `${start} a ${end}${off.reason ? ` (${off.reason})` : ""}`;
        })
        .join("; ");
      const defaultCommission = person.staffServices[0]?.service.commissionPercent ?? 0;
      const goalsText = person.professionalGoals
        .map(
          (goal) =>
            `${goal.metric}: ${Number(goal.target)} (${goal.period})`,
        )
        .join("; ");

      addRow(sheet, TEAM_COLUMNS, [
        person.name,
        ROLE_LABELS[person.role] ?? person.role,
        person.active,
        defaultCommission,
        person.staffServices.map((item) => item.service.name).join(", "),
        scheduleText,
        timeOffText,
        statsMap.get(person.id)?.count ?? 0,
        statsMap.get(person.id)?.revenue ?? 0,
        commissionMap.get(person.id) ?? 0,
        goalsText,
        person.id,
      ]);
    }
  },
};
