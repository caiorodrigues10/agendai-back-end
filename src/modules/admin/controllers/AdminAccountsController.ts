import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  adminAccountsQuerySchema,
  adminAccountIdParamsSchema,
} from "../schemas/adminAccountsSchemas";

type AccountAttention = {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  description: string;
  to?: string;
};

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "PAST_DUE", "TRIALING"] as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function accountWhere(query: {
  search?: string;
  status?: "active" | "inactive";
  approval?: "PENDING" | "APPROVED" | "REJECTED";
}): any {
  const where: any = {};
  if (query.status === "active") where.active = true;
  if (query.status === "inactive") where.active = false;
  if (query.approval) where.approvalStatus = query.approval;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { cnpj: { contains: query.search } },
      { whatsapp: { contains: query.search } },
      { address: { contains: query.search, mode: "insensitive" } },
      { city: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export class AdminAccountsController {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const { page, limit, search, status, approval, sort } =
      adminAccountsQuerySchema.parse(request.query);

    const where = accountWhere({ search, status, approval });
    const orderBy =
      sort === "name"
        ? { name: "asc" as const }
        : sort === "oldest"
          ? { createdAt: "asc" as const }
          : { createdAt: "desc" as const };

    const [accounts, total, activeCount, inactiveCount, pendingApproval] =
      await Promise.all([
        prisma.barbershop.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy,
          select: {
            id: true,
            name: true,
            whatsapp: true,
            cnpj: true,
            address: true,
            city: true,
            active: true,
            approvalStatus: true,
            createdAt: true,
            _count: {
              select: { users: true, appointments: true, tickets: true, queue: true },
            },
            subscriptions: {
              where: { status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                status: true,
                startDate: true,
                endDate: true,
                plan: { select: { id: true, name: true, price: true, billingCycle: true } },
              },
            },
          },
        }),
        prisma.barbershop.count({ where }),
        prisma.barbershop.count({ where: { ...where, active: true } }),
        prisma.barbershop.count({ where: { ...where, active: false } }),
        prisma.barbershop.count({
          where: { ...where, approvalStatus: "PENDING" },
        }),
      ]);

    const data = accounts.map(
      (account: {
        id: string;
        name: string;
        whatsapp: string;
        cnpj: string | null;
        address: string | null;
        city: string | null;
        active: boolean;
        approvalStatus: string;
        createdAt: Date;
        _count: { users: number; appointments: number; tickets: number; queue: number };
        subscriptions: {
          status: string;
          startDate: Date;
          endDate: Date | null;
          plan: { id: string; name: string; price: number; billingCycle: string };
        }[];
      }) => ({
        id: account.id,
        name: account.name,
        whatsapp: account.whatsapp,
        cnpj: account.cnpj,
        address: account.address,
        city: account.city,
        active: account.active,
        approvalStatus: account.approvalStatus,
        createdAt: account.createdAt,
        counts: account._count,
        subscription: account.subscriptions[0] ?? null,
      }),
    );

    return reply.status(200).send({
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary: { total, active: activeCount, inactive: inactiveCount, pendingApproval },
      },
    });
  }

  async getAccount(request: FastifyRequest, reply: FastifyReply) {
    const { id } = adminAccountIdParamsSchema.parse(request.params);

    const shop = await prisma.barbershop.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        cnpj: true,
        address: true,
        city: true,
        active: true,
        approvalStatus: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        operationMode: true,
        businessSegment: true,
        onboardingCompletedAt: true,
        onboardingCurrentStep: true,
        organizationId: true,
      },
    });

    if (!shop) throw new AppError("Conta não encontrada", 404);

    const now = Date.now();
    const since30d = new Date(now - THIRTY_DAYS_MS);
    const since14d = new Date(now - FOURTEEN_DAYS_MS);

    const [
      roleGroups,
      activeUsers,
      appointmentsTotal,
      appointments30d,
      completed30d,
      queueEntries,
      ticketsTotal,
      servicesActive,
      productsActive,
      clientsTotal,
      subscription,
      invoicesTotal,
      invoicesPaid,
      invoicesOverdue,
      invoicesPending,
      lastAppointment,
    ] = await Promise.all([
      prisma.user.groupBy({
        by: ["role"],
        where: { barbershopId: id, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.user.count({ where: { barbershopId: id, deletedAt: null, active: true } }),
      prisma.appointment.count({ where: { barbershopId: id } }),
      prisma.appointment.count({ where: { barbershopId: id, createdAt: { gte: since30d } } }),
      prisma.appointment.count({
        where: { barbershopId: id, status: "COMPLETED", createdAt: { gte: since30d } },
      }),
      prisma.queueItem.count({ where: { barbershopId: id } }),
      prisma.ticket.count({ where: { barbershopId: id } }),
      prisma.service.count({ where: { barbershopId: id, active: true } }),
      prisma.product.count({ where: { barbershopId: id, active: true } }),
      prisma.salonClient.count({ where: { barbershopId: id } }),
      prisma.subscription.findUnique({
        where: { barbershopId: id },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          cancelDate: true,
          cancelReason: true,
          createdAt: true,
          plan: { select: { id: true, name: true, price: true, billingCycle: true } },
        },
      }),
      prisma.invoice.count({ where: { subscription: { barbershopId: id } } }),
      prisma.invoice.aggregate({
        where: { subscription: { barbershopId: id }, status: "PAID" },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.invoice.count({ where: { subscription: { barbershopId: id }, status: "OVERDUE" } }),
      prisma.invoice.count({ where: { subscription: { barbershopId: id }, status: "PENDING" } }),
      prisma.appointment.findFirst({
        where: { barbershopId: id },
        orderBy: [{ date: "desc" }, { time: "desc" }],
        select: { id: true, date: true, time: true, status: true },
      }),
    ]);

    const membersByRole: Record<string, number> = {};
    roleGroups.forEach((row: { role: string; _count: { _all: number } }) => {
      membersByRole[row.role] = row._count._all;
    });

    const membersTotal = roleGroups.reduce(
      (sum: number, row: { _count: { _all: number } }) => sum + row._count._all,
      0,
    );

    const owners = membersByRole.OWNER ?? 0;
    const attention: AccountAttention[] = [];

    if (!shop.active) {
      attention.push({
        id: "inactive-shop",
        severity: "danger",
        title: "Conta inativa",
        description: "Os usuários deste salão não conseguem acessar o painel.",
        to: "/master/accounts",
      });
    }
    if (shop.approvalStatus === "PENDING") {
      attention.push({
        id: "pending-approval",
        severity: "warning",
        title: "Aprovação pendente",
        description: "O cadastro deste salão ainda não foi aprovado.",
        to: "/master/accounts",
      });
    }
    if (shop.approvalStatus === "REJECTED") {
      attention.push({
        id: "rejected",
        severity: "danger",
        title: "Cadastro rejeitado",
        description: shop.rejectionReason || "O cadastro deste salão foi rejeitado.",
        to: "/master/accounts",
      });
    }
    if (invoicesOverdue > 0) {
      attention.push({
        id: "overdue-invoices",
        severity: "danger",
        title: "Cobranças vencidas",
        description: `${invoicesOverdue} fatura(s) vencida(s) sem pagamento.`,
        to: "/master/billing",
      });
    }
    if (!subscription) {
      attention.push({
        id: "no-subscription",
        severity: "info",
        title: "Sem assinatura",
        description: "Este salão não possui assinatura ativa no momento.",
        to: "/master/billing",
      });
    }
    if (membersTotal > 0 && owners === 0) {
      attention.push({
        id: "no-owner",
        severity: "warning",
        title: "Sem dono na conta",
        description: "Nenhum usuário com papel de dono está vinculado a este salão.",
        to: "/master/accounts",
      });
    }
    if (appointmentsTotal > 0 && (!lastAppointment || lastAppointment.date.getTime() < since14d.getTime())) {
      attention.push({
        id: "inactive-14d",
        severity: "warning",
        title: "Sem agendamentos recentes",
        description: "Nenhum agendamento criado ou marcado nas últimas 2 semanas.",
        to: "/master/accounts",
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        shop,
        members: {
          total: membersTotal,
          active: activeUsers,
          byRole: membersByRole,
        },
        subscription,
        billing: {
          invoicesTotal,
          paid: invoicesPaid._count._all,
          overdue: invoicesOverdue,
          pending: invoicesPending,
          sumPaid: invoicesPaid._sum.amount ?? 0,
        },
        usage: {
          appointments: appointmentsTotal,
          appointments30d,
          completed30d,
          queueEntries,
          tickets: ticketsTotal,
          servicesActive,
          productsActive,
          clients: clientsTotal,
          lastAppointment,
        },
        attention,
      },
    });
  }
}
