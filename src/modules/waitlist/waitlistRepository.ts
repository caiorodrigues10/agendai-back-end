import { prisma } from "@/libs/prismaClient";
import { Prisma, type WaitlistStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";

/**
 * Delegates reais do cliente Prisma gerado.
 *
 * Os modelos são `AppointmentWaitlistEntry`/`AppointmentWaitlistOffer`
 * (tabelas `appointment_waitlist_entries`/`appointment_waitlist_offers`), e os
 * delegates se chamam `appointmentWaitlistEntry`/`appointmentWaitlistOffer`.
 * O módulo antes acessava `waitlistEntry`/`waitlistOffer` por meio de um cast
 * `as unknown as` — campos inexistentes viravam `TypeError` em runtime (500 nas
 * rotas públicas e falha do cron `waitlist-expiration`).
 *
 * Sem cast algum: qualquer campo/enum inexistente agora vira erro de
 * compilação em `npm run typecheck`.
 */
export const prismaWaitlistLegado = {
  waitlistEntry: prisma.appointmentWaitlistEntry,
  waitlistOffer: prisma.appointmentWaitlistOffer,
};

export interface CreateEntryData {
  barbershopId: string;
  customerName: string;
  whatsapp?: string | null;
  serviceId: string;
  preferredStaffId?: string | null;
  dateFrom: Date;
  dateTo: Date;
  preferredPeriods?: string[];
  flexibilityMinutes?: number;
  priority?: number;
}

export interface UpdateEntryData {
  status?: WaitlistStatus;
  priority?: number;
}

export interface ListEntriesFilters {
  status?: WaitlistStatus;
  serviceId?: string;
  page?: number;
  limit?: number;
}

export interface CreateOfferData {
  entryId: string;
  barbershopId: string;
  offeredDate: Date;
  offeredTime: string;
  staffId: string;
}

export class WaitlistRepository {
  async createEntry(data: CreateEntryData) {
    const validUntil = new Date(data.dateTo);
    validUntil.setHours(23, 59, 59, 999);

    return prismaWaitlistLegado.waitlistEntry.create({
      data: {
        barbershopId: data.barbershopId,
        customerName: data.customerName,
        whatsapp: data.whatsapp ?? "",
        serviceId: data.serviceId,
        preferredStaffId: data.preferredStaffId ?? null,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        preferredPeriods: data.preferredPeriods ?? [],
        flexibilityMinutes: data.flexibilityMinutes ?? 0,
        priority: data.priority ?? 5,
        status: "WAITING",
        validUntil,
      },
    });
  }

  async updateEntry(id: string, data: UpdateEntryData) {
    return prismaWaitlistLegado.waitlistEntry.update({
      where: { id },
      data,
    });
  }

  async deleteEntry(id: string) {
    return prismaWaitlistLegado.waitlistEntry.update({
      where: { id },
      data: { status: "CANCELED" },
    });
  }

  async getEntry(id: string) {
    return prismaWaitlistLegado.waitlistEntry.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, price: true, avgTimeMinutes: true } },
        offers: { where: { response: null }, orderBy: { createdAt: "desc" } },
      },
    });
  }

  async listEntries(barbershopId: string, filters: ListEntriesFilters) {
    const where: Prisma.AppointmentWaitlistEntryWhereInput = { barbershopId };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.serviceId) {
      where.serviceId = filters.serviceId;
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prismaWaitlistLegado.waitlistEntry.findMany({
        where,
        include: {
          service: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        skip,
        take: limit,
      }),
      prismaWaitlistLegado.waitlistEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findCandidates(barbershopId: string, serviceId: string, date: Date, time: string) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prismaWaitlistLegado.waitlistEntry.findMany({
      where: {
        barbershopId,
        serviceId,
        status: "WAITING",
        dateFrom: { lte: endOfDay },
        dateTo: { gte: targetDate },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async createOffer(data: CreateOfferData) {
    const token = randomUUID();

    await prismaWaitlistLegado.waitlistEntry.update({
      where: { id: data.entryId },
      data: { status: "OFFERED" },
    });

    // `AppointmentWaitlistOffer` não tem `status`: oferta pendente é
    // `response == null`.
    return prismaWaitlistLegado.waitlistOffer.create({
      data: {
        entryId: data.entryId,
        barbershopId: data.barbershopId,
        offeredDate: data.offeredDate,
        offeredTime: data.offeredTime,
        staffId: data.staffId,
        token,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  }

  async getOfferByToken(token: string) {
    return prismaWaitlistLegado.waitlistOffer.findUnique({
      where: { token },
      include: {
        entry: {
          include: {
            service: { select: { id: true, name: true, price: true, avgTimeMinutes: true } },
          },
        },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  async respondToOffer(offerId: string, response: "ACCEPTED" | "DECLINED") {
    return prismaWaitlistLegado.waitlistOffer.update({
      where: { id: offerId },
      data: {
        response,
        respondedAt: new Date(),
      },
    });
  }

  async expireOffers() {
    const now = new Date();

    const expired = await prismaWaitlistLegado.waitlistOffer.updateMany({
      where: {
        response: null,
        expiresAt: { lt: now },
      },
      data: {
        response: "EXPIRED",
      },
    });

    // Entrada ofertada sem nenhuma oferta pendente volta para a fila.
    const idleEntries = await prismaWaitlistLegado.waitlistEntry.findMany({
      where: {
        status: "OFFERED",
        offers: { none: { response: null } },
      },
      select: { id: true },
    });

    if (idleEntries.length > 0) {
      await prismaWaitlistLegado.waitlistEntry.updateMany({
        where: { id: { in: idleEntries.map(entry => entry.id) } },
        data: { status: "WAITING" },
      });
    }

    return expired.count;
  }
}
