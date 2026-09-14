import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

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
  status?: string;
  priority?: number;
}

export interface ListEntriesFilters {
  status?: string;
  serviceId?: string;
  page?: number;
  limit?: number;
}

export interface CreateOfferData {
  entryId: string;
  offeredDate: Date;
  offeredTime: string;
  staffId: string;
}

export class WaitlistRepository {
  async createEntry(data: CreateEntryData) {
    return prisma.waitlistEntry.create({
      data: {
        barbershopId: data.barbershopId,
        customerName: data.customerName,
        whatsapp: data.whatsapp ?? null,
        serviceId: data.serviceId,
        preferredStaffId: data.preferredStaffId ?? null,
        dateFrom: data.dateFrom,
        dateTo: data.dateTo,
        preferredPeriods: data.preferredPeriods ?? [],
        flexibilityMinutes: data.flexibilityMinutes ?? 0,
        priority: data.priority ?? 5,
        status: "ACTIVE",
      },
    });
  }

  async updateEntry(id: string, data: UpdateEntryData) {
    return prisma.waitlistEntry.update({
      where: { id },
      data,
    });
  }

  async deleteEntry(id: string) {
    return prisma.waitlistEntry.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  async getEntry(id: string) {
    return prisma.waitlistEntry.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, price: true, avgTimeMinutes: true } },
        offers: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" } },
      },
    });
  }

  async listEntries(barbershopId: string, filters: ListEntriesFilters) {
    if (!(prisma as any).waitlistEntry?.findMany) {
      return { items: [], total: 0, page: filters.page ?? 1, limit: filters.limit ?? 20 };
    }

    const where: Prisma.AppointmentWaitlistEntryWhereInput = { barbershopId };

    if (filters.status) {
      where.status = filters.status as any;
    }
    if (filters.serviceId) {
      where.serviceId = filters.serviceId;
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.waitlistEntry.findMany({
        where,
        include: {
          service: { select: { id: true, name: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        skip,
        take: limit,
      }),
      prisma.waitlistEntry.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findCandidates(barbershopId: string, serviceId: string, date: Date, time: string) {
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return prisma.waitlistEntry.findMany({
      where: {
        barbershopId,
        serviceId,
        status: "ACTIVE",
        dateFrom: { lte: endOfDay },
        dateTo: { gte: targetDate },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });
  }

  async createOffer(data: CreateOfferData) {
    const token = randomUUID();

    await prisma.waitlistEntry.update({
      where: { id: data.entryId },
      data: { status: "OFFERED" },
    });

    return prisma.waitlistOffer.create({
      data: {
        entryId: data.entryId,
        offeredDate: data.offeredDate,
        offeredTime: data.offeredTime,
        staffId: data.staffId,
        token,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  }

  async getOfferByToken(token: string) {
    return prisma.waitlistOffer.findUnique({
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
    return prisma.waitlistOffer.update({
      where: { id: offerId },
      data: {
        status: response,
        respondedAt: new Date(),
      },
    });
  }

  async expireOffers() {
    const now = new Date();
    const expired = await prisma.waitlistOffer.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
      data: {
        status: "EXPIRED",
      },
    });

    const expiredOffers = await prisma.waitlistOffer.findMany({
      where: {
        status: "EXPIRED",
        expiresAt: { lt: now },
      },
      select: { entryId: true },
    });

    for (const offer of expiredOffers) {
      const activeOffers = await prisma.waitlistOffer.count({
        where: { entryId: offer.entryId, status: "PENDING" },
      });

      if (activeOffers === 0) {
        await prisma.waitlistEntry.update({
          where: { id: offer.entryId },
          data: { status: "ACTIVE" },
        });
      }
    }

    return expired.count;
  }
}
