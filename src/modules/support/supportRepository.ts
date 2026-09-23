import { randomBytes } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import type { AdminNotificationType } from "@prisma/client";
import type { CreateReportInput, ListMyReportsQuery } from "./supportSchema";

export function generateProtocol(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `AG-${ts}-${rand}`;
}

export interface CreateReportData extends CreateReportInput {
  userId: string;
  barbershopId: string | null;
}

export interface CreateHistoryData {
  ticketId: string;
  actorId: string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
}

export interface CreateAdminNotificationData {
  type: AdminNotificationType;
  title: string;
  message: string;
  metadata?: string;
}

export class SupportRepository {
  async create(data: CreateReportData) {
    const protocol = generateProtocol();

    return prisma.ticket.create({
      data: {
        protocol,
        title: data.title,
        description: data.description,
        barbershopId: data.barbershopId,
        channel: "IN_APP",
        category: data.category,
        priority: data.priority,
        status: "OPEN",
        createdById: data.userId,
      },
      select: {
        id: true,
        protocol: true,
        title: true,
        description: true,
        channel: true,
        category: true,
        priority: true,
        status: true,
        barbershopId: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async listMine(userId: string, query: ListMyReportsQuery) {
    const { page, limit, status } = query;
    const where = {
      createdById: userId,
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          protocol: true,
          title: true,
          category: true,
          priority: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          resolvedAt: true,
          _count: { select: { comments: true } },
          createdBy: { select: { id: true, name: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    return prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        protocol: true,
        title: true,
        description: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        createdById: true,
        createdBy: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            text: true,
            createdAt: true,
            author: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async addComment(ticketId: string, authorId: string, text: string) {
    return prisma.ticketComment.create({
      data: { ticketId, authorId, text },
      select: {
        id: true,
        text: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
  }

  async reactivateOnReply(ticketId: string, currentStatus: string, actorId: string) {
    if (currentStatus !== "WAITING_SHOP" && currentStatus !== "RESOLVED" && currentStatus !== "CANCELLED") {
      return null;
    }
    const nextStatus = currentStatus === "WAITING_SHOP" ? "IN_PROGRESS" : "OPEN";
    const [updated] = await prisma.$transaction([
      prisma.ticket.update({
        where: { id: ticketId },
        data: { status: nextStatus },
        select: { id: true, status: true },
      }),
      prisma.ticketHistory.create({
        data: {
          ticketId,
          actorId,
          field: "status",
          oldValue: currentStatus,
          newValue: nextStatus,
          reason: "Resposta do usuário",
        },
      }),
    ]);
    return updated;
  }

  async addHistory(data: CreateHistoryData) {
    return prisma.ticketHistory.create({ data });
  }

  async createAdminNotification(data: CreateAdminNotificationData) {
    return prisma.adminNotification.create({ data });
  }
}
