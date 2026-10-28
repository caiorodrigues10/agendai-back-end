import { randomUUID } from "node:crypto";
import { container } from "tsyringe";
import {
  CancelAppointmentUseCase,
  CreateAppointmentUseCase,
  ListAppointmentsUseCase,
  UpdateAppointmentUseCase,
} from "@/modules/appointments/useCases/appointmentUseCases";
import { GetAvailabilityUseCase } from "@/modules/appointments/useCases/appointmentUseCases";
import { CheckInAppointmentUseCase } from "@/modules/appointments/useCases/checkIn/CheckInAppointmentUseCase";
import { CompleteAppointmentUseCase } from "@/modules/appointments/useCases/complete/CompleteAppointmentUseCase";
import { ListServicesUseCase } from "@/modules/services/useCases/listServices/ListServicesUseCase";
import { UpdateServiceUseCase } from "@/modules/services/useCases/updateService/UpdateServiceUseCase";
import { CreateServiceUseCase } from "@/modules/services/useCases/createService/CreateServiceUseCase";
import { ListQueueUseCase } from "@/modules/queue/useCases/listQueue/ListQueueUseCase";
import { JoinQueueUseCase } from "@/modules/queue/useCases/joinQueue/JoinQueueUseCase";
import { GetQueueMetricsUseCase } from "@/modules/queue/useCases/getQueueMetrics/GetQueueMetricsUseCase";
import { WaitlistUseCases } from "@/modules/waitlist/waitlistUseCases";
import { ListSalonClientsUseCase } from "@/modules/clients/useCases/clientUseCases";
import { GetSalonClientUseCase } from "@/modules/clients/useCases/clientUseCases";
import { CreateSalonClientUseCase } from "@/modules/clients/useCases/clientUseCases";
import { UpdateSalonClientUseCase } from "@/modules/clients/useCases/clientUseCases";
import { DeleteSalonClientUseCase } from "@/modules/clients/useCases/clientUseCases";import { ListCrmClientsUseCase } from "@/modules/crm/useCases/crmUseCases";
import { GetCrmClientUseCase } from "@/modules/crm/useCases/crmUseCases";
import { CreateExpenseUseCase } from "@/modules/expenses/useCases/expenseUseCases";
import { DeleteExpenseUseCase } from "@/modules/expenses/useCases/expenseUseCases";
import { ListExpensesUseCase } from "@/modules/expenses/useCases/expenseUseCases";
import { GetExpenseSummaryUseCase } from "@/modules/expenses/useCases/expenseUseCases";
import { ListFiadosUseCase } from "@/modules/fiado/useCases/fiadoUseCases";
import { GetFiadoSummaryUseCase } from "@/modules/fiado/useCases/fiadoUseCases";
import { AddFiadoPaymentUseCase } from "@/modules/fiado/useCases/fiadoUseCases";
import { ChargeFiadoUseCase } from "@/modules/fiado/useCases/fiadoUseCases";
import { CashMovementUseCases } from "@/modules/cash/cashMovementUseCases";
import { DailyCloseoutUseCases, computeDay } from "@/modules/financial/dailyCloseoutUseCases";
import { ProfitUseCases } from "@/modules/profit/profitUseCases";
import { GetBarbershopInsightsUseCase } from "@/modules/barbershops/useCases/getBarbershopInsights/GetBarbershopInsightsUseCase";
import { GoalUseCases } from "@/modules/goals/goalUseCases";
import { StaffUseCases } from "@/modules/staff/staffUseCases";
import { ListPublicStaffUseCase } from "@/modules/barbershops/useCases/getBarbershop/ListPublicStaffUseCase";
import { ReputationUseCases } from "@/modules/reputation/reputationUseCases";
import { ReputationRepository } from "@/modules/reputation/reputationRepository";
import { GetSubscriptionStatusUseCase } from "@/modules/subscriptions/useCases/getSubscription/GetSubscriptionStatusUseCase";
import { OwnerBotRepository } from "./ownerBotRepository";
import { ProductCatalogUseCase } from "@/modules/products/useCases/productUseCases";
import { ListServicePackagesUseCase } from "@/modules/packages/useCases/packageUseCases";
import { ListClientPackagesUseCase } from "@/modules/packages/useCases/packageUseCases";
import { VoucherUseCases } from "@/modules/vouchers/voucherUseCases";
import { SetShopStatusUseCase } from "@/modules/barbershops/useCases/shopStatus/SetShopStatusUseCase";
import { UpdateScheduleUseCase } from "@/modules/barbershops/useCases/updateSchedule/UpdateScheduleUseCase";
import { GetScheduleUseCase } from "@/modules/barbershops/useCases/getSchedule/GetScheduleUseCase";
import { scheduleNotification } from "@/modules/notifications/services/notificationDeliveryService";
import { sendWhatsAppMessageDetailed } from "@/shared/services/evolutionApiService";
import { enqueueWhatsApp } from "@/shared/infra/queue/whatsappQueue";
import { getShopTimezone } from "@/modules/financial/ledger/shopTime";
import { updateOwnerBotPreferences } from "./ownerBotPreferences";
import type { ICommissionRepository } from "@/modules/commissions/repositories/ICommissionRepository";
import type { IAppointmentResponseDTO } from "@/modules/appointments/dtos/IAppointmentDTO";
import type { IQueueItemResponseDTO } from "@/modules/queue/dtos/IQueueItemResponseDTO";
import type { IExpenseResponseDTO, IExpenseSummary } from "@/modules/expenses/dtos/IExpenseDTO";
import type { IFiadoResponseDTO, IFiadoSummary } from "@/modules/fiado/dtos/IFiadoDTO";
import type { IServiceResponseDTO } from "@/modules/services/dtos/IServiceResponseDTO";
import type { ISalonClientResponseDTO } from "@/modules/clients/dtos/ISalonClientDTO";

/**
 * Ações que o assistente pode executar.
 *
 * Todas passam pelos use cases que o app usa — o bot não duplica regra de
 * negócio nem escreve direto no banco. A interface existe para que os testes
 * usem um duble no lugar do container.
 */

export type OwnerBotActor = {
  userId: string;
  role: string;
  barbershopId: string;
};

export type OwnerBotServiceItem = {
  id: string;
  name: string;
  price: number;
  avgTimeMinutes: number;
  active?: boolean;
};

export type OwnerBotStaffItem = {
  id: string;
  name: string;
};

export type OwnerBotExpenseInput = {
  title: string;
  amount: number;
  type?: "FIXED" | "VARIABLE" | "INVESTMENT";
  referenceDate?: Date;
  paidAt?: Date | null;
  paymentMethod?: string | null;
  notes?: string | null;
  categoryId?: string | null;
};

export interface OwnerBotActions {
  // ─── Agenda ────────────────────────────────────────────────────────────────
  listServices(barbershopId: string): Promise<OwnerBotServiceItem[]>;
  listAppointments(barbershopId: string, date: string): Promise<IAppointmentResponseDTO[]>;
  listAppointmentsRange(
    barbershopId: string,
    from: string,
    to: string
  ): Promise<IAppointmentResponseDTO[]>;
  listWaitingQueue(barbershopId: string): Promise<IQueueItemResponseDTO[]>;
  queueMetrics(barbershopId: string): Promise<{
    waiting?: number;
    inService?: number;
    averageWaitMinutes?: number | null;
    [key: string]: unknown;
  }>;
  availability(barbershopId: string, date: string): Promise<
    Array<{ time: string; available: boolean; staffId?: string | null }>
  >;
  createAppointment(
    input: {
      barbershopId: string;
      serviceId: string;
      customerName: string;
      whatsapp: string;
      date: string;
      time: string;
      petId?: string | null;
      petName?: string | null;
    },
    actor: OwnerBotActor
  ): Promise<IAppointmentResponseDTO>;
  cancelAppointment(appointmentId: string, actor: OwnerBotActor): Promise<void>;
  rescheduleAppointment(
    appointmentId: string,
    input: { date: string; time: string },
    actor: OwnerBotActor
  ): Promise<IAppointmentResponseDTO>;
  checkIn(appointmentId: string, actor: OwnerBotActor): Promise<{ queueItemId: string }>;
  completeAppointment(appointmentId: string, actor: OwnerBotActor): Promise<unknown>;
  markNoShow(appointmentId: string, actor: OwnerBotActor): Promise<unknown>;
  joinQueue(
    input: {
      barbershopId: string;
      serviceId: string;
      customerName: string;
      whatsapp: string;
    },
    actor: OwnerBotActor
  ): Promise<IQueueItemResponseDTO>;

  // ─── Lista de espera ───────────────────────────────────────────────────────
  listWaitlist(
    barbershopId: string,
    filters?: { status?: string; serviceId?: string }
  ): Promise<
    Array<{
      id: string;
      customerName: string;
      whatsapp: string;
      serviceName?: string | null;
      dateFrom?: Date | null;
      dateTo?: Date | null;
      status: string;
      createdAt: Date;
    }>
  >;
  offerWaitlistSlot(
    barbershopId: string,
    entryId: string,
    data: { date: string; time: string; staffId: string }
  ): Promise<unknown>;
  removeWaitlistEntry(barbershopId: string, entryId: string): Promise<void>;

  // ─── Clientes ──────────────────────────────────────────────────────────────
  listClients(
    barbershopId: string,
    query: { search?: string; page?: number; limit?: number }
  ): Promise<ISalonClientResponseDTO[]>;
  getClient(clientId: string, actor: OwnerBotActor): Promise<ISalonClientResponseDTO>;
  createClient(
    input: { name: string; whatsapp?: string; notes?: string | null },
    actor: OwnerBotActor
  ): Promise<ISalonClientResponseDTO>;
  updateClient(
    clientId: string,
    input: { name?: string; whatsapp?: string; notes?: string | null },
    actor: OwnerBotActor
  ): Promise<ISalonClientResponseDTO>;
  listCrmClients(
    barbershopId: string,
    params: { search?: string; sort?: "ltv" | "lastVisit" | "outstanding"; limit?: number },
    actor: OwnerBotActor
  ): Promise<
    Array<{
      id: string;
      name: string;
      totalVisits?: number;
      totalSpend?: number;
      lastVisitAt?: string | null;
      outstanding?: number;
      [key: string]: unknown;
    }>
  >;
  getCrmClient(
    barbershopId: string,
    clientId: string,
    actor: OwnerBotActor
  ): Promise<Record<string, unknown>>;

  // ─── Financeiro ────────────────────────────────────────────────────────────
  insights(
    barbershopId: string,
    period: "7d" | "30d" | "90d" | "1y"
  ): Promise<OwnerBotInsights>;
  periodProfit(
    barbershopId: string,
    monthKey: string
  ): Promise<{
    totals: {
      revenue: number;
      directCosts: number;
      overheadCosts: number;
      operationalCosts: number;
      taxAmount: number;
      commissionAmt: number;
      netProfit: number;
      marginPercent: number;
    };
    byService: Array<{ serviceId: string; revenue: number; netProfit: number }>;
    byStaff: Array<{ staffId: string; revenue: number; commissionAmt: number }>;
  }>;
  profitTrend(
    barbershopId: string,
    months: number
  ): Promise<Array<{ period: string; revenue: number; netProfit: number; marginPercent: number }>>;
  cashSummary(
    barbershopId: string,
    date: Date
  ): Promise<{
    summary: Record<string, { total: number; count: number }>;
    totalMovements: number;
  }>;
  /** Números do dia Straight from the ledger (mesma fonte do painel de caixa). */
  dayFigures(
    barbershopId: string,
    calendarDate: string
  ): Promise<{
    cashReceived: number;
    pixReceived: number;
    cardReceived: number;
    fiadoCreated: number;
    fiadoPaid: number;
    expenses: number;
    commissions: number;
    productSales: number;
  }>;
  /** Lucro do mês pelo mesmo use case do painel de lucro do app. */
  computePeriodProfit(
    barbershopId: string,
    monthKey: string
  ): Promise<{
    totals: Record<string, number>;
    summary: {
      totalAppointments: number;
      totalExpenses: number;
      totalRevenue: number;
      serviceRevenue: number;
      productRevenue: number;
      totalCommission: number;
      totalTax: number;
      directCosts: number;
      overheadCosts: number;
      operationalCosts: number;
      netProfit: number;
      marginPercent: number;
    };
    byService: Array<{ serviceId: string | null; revenue: number; netProfit: number }>;
    byStaff: Array<{ staffId: string | null; revenue: number; commissionAmt: number }>;
  }>;
  closeout(barbershopId: string, date: Date): Promise<Record<string, unknown>>;
  listExpenses(
    barbershopId: string,
    query: { from?: Date; to?: Date; search?: string; paid?: boolean; limit?: number }
  ): Promise<IExpenseResponseDTO[]>;
  expenseSummary(
    barbershopId: string,
    from?: Date,
    to?: Date
  ): Promise<IExpenseSummary>;
  createExpense(input: OwnerBotExpenseInput, actor: OwnerBotActor): Promise<IExpenseResponseDTO>;
  deleteExpense(expenseId: string, actor: OwnerBotActor): Promise<void>;
  listFiados(
    barbershopId: string,
    query: { status?: string; search?: string; overdue?: boolean; limit?: number }
  ): Promise<IFiadoResponseDTO[]>;
  fiadoSummary(barbershopId: string): Promise<IFiadoSummary>;
  addFiadoPayment(
    input: { fiadoId: string; amount: number; paymentMethod?: string | null; notes?: string | null },
    actor: OwnerBotActor
  ): Promise<unknown>;
  chargeFiado(
    fiadoId: string,
    payment: { pixKey?: string; cardPaymentLink?: string },
    actor: OwnerBotActor
  ): Promise<unknown>;
  commissions(
    barbershopId: string,
    query: { from?: string; to?: string; professionalId?: string; limit?: number }
  ): Promise<{
    data: Array<{
      id: string;
      professionalName: string;
      serviceName: string;
      amount: number;
      percentage: number;
      createdAt: Date;
    }>;
    total: number;
  }>;
  commissionSummary(
    barbershopId: string,
    query: { from?: string; to?: string; professionalId?: string }
  ): Promise<{
    grossTotal: number;
    commissionTotal: number;
    byProfessional: Array<{
      professionalId: string;
      professionalName: string;
      commissionTotal: number;
      entryCount: number;
    }>;
  }>;
  goals(barbershopId: string): Promise<
    Array<{
      id: string;
      metric: string;
      target: number;
      period: string;
      professionalId?: string | null;
      currentValue?: number;
      progressPercent?: number;
    }>
  >;
  goalProgress(goalId: string, barbershopId: string): Promise<Record<string, unknown>>;
  registerCashMovement(
    barbershopId: string,
    userId: string,
    data: {
      type: string;
      amount: number;
      paymentMethod?: string | null;
      description?: string | null;
      occurredAt?: Date;
    }
  ): Promise<unknown>;
  closeCashDay(
    barbershopId: string,
    date: Date,
    userId: string,
    declared: { cashReceived: number; pixReceived: number; cardReceived: number; balanceOpen: number }
  ): Promise<Record<string, unknown>>;

  // ─── Equipe ────────────────────────────────────────────────────────────────
  listStaff(barbershopId: string): Promise<OwnerBotStaffItem[]>;
  listTimeOff(
    barbershopId: string,
    query: { staffId?: string; status?: string }
  ): Promise<
    Array<{
      id: string;
      staffId: string;
      staffName?: string;
      startAt: Date;
      endAt: Date;
      reason?: string | null;
      status?: string;
    }>
  >;

  // ─── Serviços e pacotes ────────────────────────────────────────────────────
  updateService(
    serviceId: string,
    data: { price?: number; avgTimeMinutes?: number; active?: boolean; name?: string },
    actor: OwnerBotActor
  ): Promise<IServiceResponseDTO>;
  createService(
    input: { name: string; price: number; avgTimeMinutes?: number; categoryId?: string | null },
    actor: OwnerBotActor
  ): Promise<IServiceResponseDTO>;
  listServicePackages(barbershopId: string): Promise<
    Array<{
      id: string;
      name: string;
      serviceName?: string | null;
      sessionCount: number;
      price: number;
      active: boolean;
    }>
  >;
  listClientPackages(
    barbershopId: string,
    clientId?: string
  ): Promise<
    Array<{
      id: string;
      clientId: string;
      clientName?: string | null;
      packageName?: string | null;
      totalSessions: number;
      remainingSessions: number;
      status: string;
      expiresAt: Date | null;
    }>
  >;
  listVouchers(barbershopId: string): Promise<
    Array<{
      id: string;
      code: string;
      discountType?: string;
      discountValue?: number;
      active: boolean;
      uses?: number;
    }>
  >;

  // ─── Reputação ─────────────────────────────────────────────────────────────
  reputation(
    barbershopId: string,
    actor: OwnerBotActor
  ): Promise<{
    averageRating?: number;
    totalReviews?: number;
    reviews?: Array<{
      id: string;
      authorName?: string | null;
      rating?: number | null;
      comment?: string | null;
      createdAt?: Date | string;
    }>;
    [key: string]: unknown;
  }>;

  // ─── Estoque ───────────────────────────────────────────────────────────────
  listProducts(barbershopId: string): Promise<
    Array<{
      id: string;
      name: string;
      salePrice: number;
      stockQuantity?: number;
      minimumStock?: number | null;
      active?: boolean;
    }>
  >;
  productReports(
    barbershopId: string,
    from?: Date,
    to?: Date
  ): Promise<Record<string, unknown>>;
  stockAlerts(barbershopId: string): Promise<
    Array<{ id: string; name: string; stockQuantity?: number; minimumStock?: number | null }>
  >;

  // ─── auditing, preferências e campanhas ───────────────────────────────────
  actionLogs(
    barbershopId: string,
    limit?: number
  ): Promise<
    Array<{
      id: string;
      action: string;
      commandId: string | null;
      riskClass: string | null;
      status: string;
      createdAt: Date;
    }>
  >;
  updatePreferences(
    barbershopId: string,
    patch: Record<string, unknown>
  ): Promise<void>;
  subscriptionStatus(barbershopId: string): Promise<{
    planName: string | null;
    status: string | null;
    active: boolean;
    inTrial: boolean;
    trialEndsAt: Date | null;
    endDate: Date | null;
    cancelDate: Date | null;
    price: number | null;
  }>;
  recentReviews(
    barbershopId: string,
    limit?: number
  ): Promise<
    Array<{
      id: string;
      authorName?: string | null;
      rating?: number | null;
      comment?: string | null;
      createdAt?: Date | string;
    }>
  >;
  sendCampaignToClients(
    barbershopId: string,
    recipients: Array<{ phone: string; name?: string; clientId?: string | null; optedIn?: boolean }>,
    message: string,
    options?: { respectOptOut?: boolean; type?: string }
  ): Promise<{ sent: number; failed: number; skipped: number }>;
  requestTimeOff(
    barbershopId: string,
    data: { staffId: string; startAt: string; endAt: string; reason?: string | null }
  ): Promise<unknown>;
  deleteClient(clientId: string, actor: OwnerBotActor): Promise<void>;

  // ─── Operação ───────────────────────────────────────────────────────────────
  shopStatus(barbershopId: string): Promise<{
    manualStatus?: string | null;
    openingMode?: string | null;
    queueClosed?: boolean;
    openState?: { open: boolean; reason?: string; queueClosed?: boolean };
  }>;
  setShopStatus(
    barbershopId: string,
    data: { status?: "AUTO" | "OPEN" | "CLOSED"; queueClosed?: boolean },
    actor: OwnerBotActor
  ): Promise<void>;
  schedule(
    barbershopId: string
  ): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>>;
  updateSchedule(
    barbershopId: string,
    data: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>,
    actor: OwnerBotActor
  ): Promise<void>;

  // ─── Mensagens ao cliente (instância do salão) ─────────────────────────────
  sendToShopClient(
    barbershopId: string,
    phone: string,
    message: string,
    options?: { clientId?: string | null; idempotencyKey?: string; type?: string }
  ): Promise<{ ok: boolean; error?: string }>;
  scheduleClientNotification(input: {
    barbershopId: string;
    clientId?: string | null;
    destination: string;
    message: string;
    type: string;
    idempotencyKey: string;
  }): Promise<{ skipped?: boolean; id?: string }>;

  /** Instância da Evolution do próprio salão (nunca a da plataforma). */
  shopInstanceName(barbershopId: string): Promise<string | null>;
  shopTimezone(barbershopId: string): Promise<string>;
}

/** Números do app (insights) usados pelas respostas financeiras. */
export type OwnerBotInsights = {
  period: string;
  kpis: {
    revenue: number;
    completedServices: number;
    avgTicket: number;
    expenses: number;
    netProfit: number;
    openFiado: number;
    overdueFiado: number;
    uniqueCustomers: number;
    returningCustomerRate: number;
    avgWaitMinutes?: number | null;
  };
  byWeekday: Array<{ label: string; volume: number; revenue: number }>;
  byHour: Array<{ label: string; volume: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  byStaff: Array<{ name: string; count: number; revenue: number }>;
  inactiveCustomers: Array<{
    whatsapp: string;
    customerName: string;
    lastVisitAt: string;
    daysSince: number;
    visits: number;
  }>;
  highlights: string[];
};

/** Implementação real — resolve os use cases pelo container do projeto. */
export function createOwnerBotActions(): OwnerBotActions {
  const profit = new ProfitUseCases();
  const cash = new CashMovementUseCases();
  const closeout = new DailyCloseoutUseCases();
  const waitlist = new WaitlistUseCases();
  const goals = new GoalUseCases();
  const staffUseCases = new StaffUseCases();
  const reputation = new ReputationUseCases();
  const vouchers = new VoucherUseCases();
  const insightsUseCase = new GetBarbershopInsightsUseCase();

  const requester = (actor: OwnerBotActor) => ({
    id: actor.userId,
    role: actor.role,
    barbershopId: actor.barbershopId,
  });

  return {
    // ─── Agenda ──────────────────────────────────────────────────────────────
    async listServices(barbershopId) {
      const services = await container.resolve(ListServicesUseCase).execute(barbershopId);
      return services.map((service) => ({
        id: service.id,
        name: service.name,
        price: service.price,
        avgTimeMinutes: service.avgTimeMinutes ?? 30,
        active: service.active,
      }));
    },

    async listAppointments(barbershopId, date) {
      const result = await container.resolve(ListAppointmentsUseCase).execute(
        barbershopId,
        { page: 1, limit: 50, date },
        { role: "OWNER", barbershopId }
      );
      return result.data;
    },

    async listAppointmentsRange(barbershopId, from, to) {
      const result = await container.resolve(ListAppointmentsUseCase).execute(
        barbershopId,
        { page: 1, limit: 100, from, to },
        { role: "OWNER", barbershopId }
      );
      return result.data;
    },

    async listWaitingQueue(barbershopId) {
      return container.resolve(ListQueueUseCase).execute(barbershopId, {
        statuses: ["WAITING"],
      });
    },

    async queueMetrics(barbershopId) {
      const metrics = (await container
        .resolve(GetQueueMetricsUseCase)
        .execute(barbershopId)) as Record<string, unknown>;
      return metrics;
    },

    async availability(barbershopId, date) {
      const slots = await container.resolve(GetAvailabilityUseCase).execute(barbershopId, date);
      return slots.map((slot) => ({
        time: slot.time,
        available: true,
        staffId: slot.staffId ?? null,
      }));
    },

    async createAppointment(input, actor) {
      return container.resolve(CreateAppointmentUseCase).execute(
        {
          ...input,
          source: "WHATSAPP_OWNER_BOT",
        },
        { role: actor.role, barbershopId: actor.barbershopId }
      );
    },

    async cancelAppointment(appointmentId, actor) {
      await container.resolve(CancelAppointmentUseCase).execute(appointmentId, {
        role: actor.role,
        barbershopId: actor.barbershopId,
      });
    },

    async rescheduleAppointment(appointmentId, input, actor) {
      return container.resolve(UpdateAppointmentUseCase).execute(
        appointmentId,
        { date: input.date, time: input.time },
        { role: actor.role, barbershopId: actor.barbershopId }
      );
    },

    async checkIn(appointmentId, actor) {
      return container.resolve(CheckInAppointmentUseCase).execute({
        appointmentId,
        barbershopId: actor.barbershopId,
        userId: actor.userId,
        userRole: actor.role,
      });
    },

    async completeAppointment(appointmentId, actor) {
      return container.resolve(CompleteAppointmentUseCase).execute({
        appointmentId,
        barbershopId: actor.barbershopId,
        userId: actor.userId,
        userRole: actor.role,
      });
    },

    async markNoShow(appointmentId, actor) {
      return container.resolve(UpdateAppointmentUseCase).execute(
        appointmentId,
        { status: "NO_SHOW" },
        { role: actor.role, barbershopId: actor.barbershopId }
      );
    },

    async joinQueue(input, actor) {
      return container.resolve(JoinQueueUseCase).execute({
        barbershopId: input.barbershopId,
        serviceId: input.serviceId,
        customerId: randomUUID(),
        customerName: input.customerName,
        whatsapp: input.whatsapp,
        addedByStaff: true,
      });
    },

    // ─── Lista de espera ─────────────────────────────────────────────────────
    async listWaitlist(barbershopId, filters) {
      const result = await waitlist.listWaitlistEntries(barbershopId, {
        status: filters?.status as never,
        serviceId: filters?.serviceId,
      });
      return result.items.map((entry) => ({
        id: entry.id,
        customerName: entry.customerName,
        whatsapp: entry.whatsapp,
        serviceName: entry.service?.name ?? null,
        dateFrom: entry.dateFrom,
        dateTo: entry.dateTo,
        status: entry.status,
        createdAt: entry.createdAt,
      }));
    },

    async offerWaitlistSlot(barbershopId, entryId, data) {
      return waitlist.offerSlot(barbershopId, entryId, {
        offeredDate: new Date(`${data.date}T00:00:00`),
        offeredTime: data.time,
        staffId: data.staffId,
      });
    },

    async removeWaitlistEntry(barbershopId, entryId) {
      await waitlist.deleteWaitlistEntry(entryId, barbershopId);
    },

    // ─── Clientes ────────────────────────────────────────────────────────────
    async listClients(barbershopId, query) {
      const result = await container.resolve(ListSalonClientsUseCase).execute(
        { barbershopId, page: query.page ?? 1, limit: query.limit ?? 20, search: query.search },
        { role: "OWNER", barbershopId }
      );
      return result.data;
    },

    async getClient(clientId, actor) {
      return container.resolve(GetSalonClientUseCase).execute(clientId, requester(actor));
    },

    async createClient(input, actor) {
      return container.resolve(CreateSalonClientUseCase).execute(
        {
          barbershopId: actor.barbershopId,
          name: input.name,
          whatsapp: input.whatsapp,
          notes: input.notes ?? null,
        },
        requester(actor)
      );
    },

    async updateClient(clientId, input, actor) {
      return container.resolve(UpdateSalonClientUseCase).execute(clientId, input, requester(actor));
    },

    async listCrmClients(barbershopId, params, actor) {
      const result = await container.resolve(ListCrmClientsUseCase).execute(
        barbershopId,
        {
          page: 1,
          limit: params.limit ?? 20,
          search: params.search,
          sort: params.sort,
        },
        requester(actor)
      );
      return result.data as never;
    },

    async getCrmClient(barbershopId, clientId, actor) {
      return (await container
        .resolve(GetCrmClientUseCase)
        .execute(barbershopId, clientId, requester(actor))) as Record<string, unknown>;
    },

    // ─── Financeiro ──────────────────────────────────────────────────────────
    async insights(barbershopId, period) {
      return (await insightsUseCase.execute(barbershopId, period)) as unknown as OwnerBotInsights;
    },

    async periodProfit(barbershopId, monthKey) {
      const result = await profit.getPeriodProfit(barbershopId, monthKey);
      const byService = await profit.getByService(barbershopId, monthKey);
      const byStaff = await profit.getByStaff(barbershopId, monthKey);
      return {
        totals: result.totals as never,
        byService: byService as never,
        byStaff: byStaff as never,
      };
    },

    async profitTrend(barbershopId, months) {
      return profit.getTrend(barbershopId, months);
    },

    async cashSummary(barbershopId, date) {
      return cash.getDailySummary(barbershopId, date);
    },

    async dayFigures(barbershopId, calendarDate) {
      return computeDay(barbershopId, calendarDate);
    },

    async computePeriodProfit(barbershopId, monthKey) {
      const result = await profit.computePeriod(barbershopId, monthKey);
      return {
        totals: result.totals as unknown as Record<string, number>,
        summary: result.summary,
        byService: result.byService as never,
        byStaff: result.byStaff as never,
      };
    },

    async closeout(barbershopId, date) {
      return (await closeout.getCloseout(barbershopId, date)) as unknown as Record<string, unknown>;
    },

    async listExpenses(barbershopId, query) {
      const result = await container.resolve(ListExpensesUseCase).execute(
        {
          barbershopId,
          page: 1,
          limit: query.limit ?? 20,
          from: query.from,
          to: query.to,
          search: query.search,
          paid: query.paid,
        },
        { role: "OWNER", barbershopId }
      );
      return result.data;
    },

    async expenseSummary(barbershopId, from, to) {
      return container.resolve(GetExpenseSummaryUseCase).execute(
        barbershopId,
        { role: "OWNER", barbershopId },
        from,
        to
      );
    },

    async createExpense(input, actor) {
      return container.resolve(CreateExpenseUseCase).execute(
        {
          barbershopId: actor.barbershopId,
          title: input.title,
          amount: input.amount,
          type: input.type ?? "VARIABLE",
          referenceDate: input.referenceDate ?? new Date(),
          paidAt: input.paidAt ?? new Date(),
          paymentMethod: input.paymentMethod ?? null,
          notes: input.notes ?? null,
          categoryId: input.categoryId ?? null,
          createdById: actor.userId,
        },
        { role: actor.role, barbershopId: actor.barbershopId }
      );
    },

    async deleteExpense(expenseId, actor) {
      await container.resolve(DeleteExpenseUseCase).execute(expenseId, {
        role: actor.role,
        barbershopId: actor.barbershopId,
      });
    },

    async listFiados(barbershopId, query) {
      const result = await container.resolve(ListFiadosUseCase).execute(
        {
          barbershopId,
          page: 1,
          limit: query.limit ?? 20,
          status: query.status as never,
          search: query.search,
          overdue: query.overdue,
        },
        { role: "OWNER", barbershopId }
      );
      return result.data;
    },

    async fiadoSummary(barbershopId) {
      return container.resolve(GetFiadoSummaryUseCase).execute(barbershopId, {
        role: "OWNER",
        barbershopId,
      });
    },

    async addFiadoPayment(input, actor) {
      return container.resolve(AddFiadoPaymentUseCase).execute(
        {
          fiadoId: input.fiadoId,
          barbershopId: actor.barbershopId,
          amount: input.amount,
          paymentMethod: input.paymentMethod ?? null,
          notes: input.notes ?? null,
          registeredById: actor.userId,
        },
        { role: actor.role, barbershopId: actor.barbershopId }
      );
    },

    async chargeFiado(fiadoId, payment, actor) {
      return container.resolve(ChargeFiadoUseCase).execute(
        fiadoId,
        payment,
        {
          role: actor.role,
          barbershopId: actor.barbershopId,
        }
      );
    },

    async commissions(barbershopId, query) {
      const repository = container.resolve<ICommissionRepository>("CommissionRepository");
      return repository.list(barbershopId, {
        page: 1,
        limit: query.limit ?? 20,
        from: query.from,
        to: query.to,
        professionalId: query.professionalId,
      });
    },

    async commissionSummary(barbershopId, query) {
      const repository = container.resolve<ICommissionRepository>("CommissionRepository");
      return repository.summary(barbershopId, {
        from: query.from,
        to: query.to,
        professionalId: query.professionalId,
      });
    },

    async goals(barbershopId) {
      const list = (await goals.list(barbershopId, {})) as Array<Record<string, unknown>>;
      const withProgress = await Promise.all(
        list.slice(0, 10).map(async (goal) => {
          try {
            const progress = (await goals.getProgress(String(goal.id), barbershopId)) as Record<
              string,
              unknown
            >;
            return { ...goal, ...progress } as never;
          } catch {
            return goal as never;
          }
        })
      );
      return withProgress;
    },

    async goalProgress(goalId, barbershopId) {
      return (await goals.getProgress(goalId, barbershopId)) as Record<string, unknown>;
    },

    async registerCashMovement(barbershopId, userId, data) {
      return cash.registerMovement(barbershopId, userId, data as never);
    },

    async closeCashDay(barbershopId, date, userId, declared) {
      return (await cash.closeDay(barbershopId, date, userId, declared)) as unknown as Record<
        string,
        unknown
      >;
    },

    // ─── Equipe ──────────────────────────────────────────────────────────────
    async listStaff(barbershopId) {
      return container.resolve(ListPublicStaffUseCase).execute(barbershopId);
    },

    async listTimeOff(barbershopId, query) {
      return (await staffUseCases.listTimeOff(barbershopId, {
        staffId: query.staffId,
        status: query.status as "PENDING" | "APPROVED" | "REJECTED" | undefined,
      })) as never;
    },

    // ─── Serviços e pacotes ──────────────────────────────────────────────────
    async updateService(serviceId, data, actor) {
      return container.resolve(UpdateServiceUseCase).execute(serviceId, data, requester(actor));
    },

    async createService(input, actor) {
      return container.resolve(CreateServiceUseCase).execute(
        {
          barbershopId: actor.barbershopId,
          name: input.name,
          price: input.price,
          avgTimeMinutes: input.avgTimeMinutes ?? 30,
          categoryId: input.categoryId ?? null,
          icon: "scissors",
        },
        requester(actor)
      );
    },

    async listServicePackages(barbershopId) {
      return (await container
        .resolve(ListServicePackagesUseCase)
        .execute(barbershopId, { role: "OWNER", barbershopId })) as never;
    },

    async listClientPackages(barbershopId, clientId) {
      return (await container
        .resolve(ListClientPackagesUseCase)
        .execute({ barbershopId, clientId }, { role: "OWNER", barbershopId })) as never;
    },

    async listVouchers(barbershopId) {
      const list = (await vouchers.listVouchers(barbershopId, false)) as Array<
        Record<string, unknown>
      >;
      return list as never;
    },

    // ─── Reputação ───────────────────────────────────────────────────────────
    async reputation(barbershopId, actor) {
      const result = (await reputation.getReputation(barbershopId, requester(actor))) as Record<
        string,
        unknown
      >;
      return result as never;
    },

    // ─── Estoque ─────────────────────────────────────────────────────────────
    async listProducts(barbershopId) {
      const useCase = container.resolve(ProductCatalogUseCase);
      const products = (await useCase.listPublicSaleProducts(barbershopId)) as Array<
        Record<string, unknown>
      >;
      return products as never;
    },

    async productReports(barbershopId, from, to) {
      const useCase = container.resolve(ProductCatalogUseCase);
      const reports = (await useCase.reports(
        barbershopId,
        { id: "owner-bot", role: "OWNER", barbershopId },
        from,
        to
      )) as Record<string, unknown>;
      return reports;
    },

    async stockAlerts(barbershopId) {
      const useCase = container.resolve(ProductCatalogUseCase);
      const alerts = (await useCase.stockAlerts(
        barbershopId,
        { id: "owner-bot", role: "OWNER", barbershopId }
      )) as unknown as Record<string, unknown>;
      return (alerts?.items ?? []) as never;
    },

    // ─── Operação ──────────────────────────────────────────────────────────────
    async shopStatus(barbershopId) {
      const useCase = container.resolve(SetShopStatusUseCase);
      return (await useCase.getStatus(barbershopId)) as never;
    },

    async setShopStatus(barbershopId, data, actor) {
      const useCase = container.resolve(SetShopStatusUseCase);
      await useCase.execute(
        barbershopId,
        { status: data.status, closed: data.queueClosed },
        requester(actor)
      );
    },

    async schedule(barbershopId) {
      return container.resolve(GetScheduleUseCase).execute(barbershopId);
    },

    async updateSchedule(barbershopId, data, actor) {
      await container.resolve(UpdateScheduleUseCase).execute(barbershopId, data, requester(actor));
    },

    // ─── Mensagens ao cliente ────────────────────────────────────────────────
    async sendToShopClient(barbershopId, phone, message, options) {
      const instanceName = await this.shopInstanceName(barbershopId);
      if (!instanceName) {
        return { ok: false, error: "O WhatsApp deste estabelecimento não está conectado." };
      }
      const result = await sendWhatsAppMessageDetailed(phone, message, { instanceName });
      return { ok: result.ok, error: result.error };
    },

    async scheduleClientNotification(input) {
      const created = await scheduleNotification({
        barbershopId: input.barbershopId,
        clientId: input.clientId ?? null,
        channel: "WHATSAPP",
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        destination: input.destination,
        payload: {
          whatsapp: {
            message: input.message,
            instanceName: undefined,
            platform: false,
          },
        },
        contentForHash: input.message,
      } as never);
      return { id: (created as { id?: string })?.id };
    },

    async shopInstanceName(barbershopId) {
      const { prisma } = await import("@/libs/prismaClient");
      const shop = await prisma.barbershop.findUnique({
        where: { id: barbershopId },
        select: { evolutionInstanceName: true },
      });
      return shop?.evolutionInstanceName ?? null;
    },

    async shopTimezone(barbershopId) {
      return getShopTimezone(barbershopId);
    },

    // ─── Auditoria, preferências, plano e campanhas ──────────────────────────
    async actionLogs(barbershopId, limit) {
      const logs = await new OwnerBotRepository().listActionLogs(barbershopId, { limit });
      return logs.map((log) => ({
        id: log.id,
        action: log.action,
        commandId: log.commandId,
        riskClass: log.riskClass,
        status: log.status,
        createdAt: log.createdAt,
      }));
    },

    async updatePreferences(barbershopId, patch) {
      await updateOwnerBotPreferences(new OwnerBotRepository(), barbershopId, patch as never);
    },

    async subscriptionStatus(barbershopId) {
      return container.resolve(GetSubscriptionStatusUseCase).execute(barbershopId);
    },

    async recentReviews(barbershopId, limit) {
      const reviews = await new ReputationRepository().listRecentReviews(barbershopId, limit);
      return reviews.map((review) => ({
        id: review.id,
        authorName: review.client?.name ?? null,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      }));
    },

    async sendCampaignToClients(barbershopId, recipients, message, options) {
      const repo = new OwnerBotRepository();
      const instanceName = await this.shopInstanceName(barbershopId);
      if (!instanceName) {
        return { sent: 0, failed: 0, skipped: recipients.length };
      }

      // Opt-out: pula quem recusou marketing (coluna marketingOptIn do cliente).
      let skipPhones = new Set<string>();
      if (options?.respectOptOut) {
        const phones = recipients
          .map((recipient) => recipient.phone.replace(/\D/g, ""))
          .filter(Boolean);
        if (phones.length) {
          const { prisma } = await import("@/libs/prismaClient");
          const clients = await prisma.salonClient.findMany({
            where: { barbershopId, whatsapp: { in: phones } },
            select: { whatsapp: true, marketingOptIn: true },
          });
          skipPhones = new Set(
            clients
              .filter((client) => client.marketingOptIn === false)
              .map((client) => client.whatsapp.replace(/\D/g, ""))
          );
        }
      }

      const eligible = recipients.filter(
        (recipient) => !skipPhones.has(recipient.phone.replace(/\D/g, ""))
      );
      const skipped = recipients.length - eligible.length;
      const campaign = await repo
        .createCampaign({
          barbershopId,
          userId: "owner-bot",
          kind: options?.type ?? "CAMPAIGN",
          audienceCount: eligible.length,
          messagePreview: message.slice(0, 500),
          recipientIds: eligible.map((recipient) => recipient.clientId ?? recipient.phone),
        })
        .catch(() => null);

      let sent = 0;
      let failed = 0;
      for (const recipient of eligible) {
        try {
          await enqueueWhatsApp({
            phone: recipient.phone,
            message,
            instanceName,
            barbershopId,
            clientId: recipient.clientId ?? undefined,
            notificationType: "GENERAL" as never,
            deduplicationKey: `ownerbot-campaign:${campaign?.id ?? barbershopId}:${recipient.phone}`,
            sourceType: "OWNER_BOT_CAMPAIGN",
            sourceId: campaign?.id ?? undefined,
          });
          sent += 1;
        } catch {
          failed += 1;
        }
      }

      if (campaign) {
        await repo
          .updateCampaign(campaign.id, { status: "SENT", sentCount: sent, sentAt: new Date() })
          .catch(() => undefined);
      }
      return { sent, failed, skipped };
    },

    async requestTimeOff(barbershopId, data) {
      return staffUseCases.requestTimeOff(barbershopId, data);
    },

    async deleteClient(clientId, actor) {
      await container.resolve(DeleteSalonClientUseCase).execute(clientId, requester(actor));
    },
  };
}
