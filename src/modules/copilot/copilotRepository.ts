import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { copilotSuggestionTypeMap } from "./copilotSchema";

const suggestionSelect = {
  id: true,
  barbershopId: true,
  type: true,
  title: true,
  description: true,
  priority: true,
  isRead: true,
  isDismissed: true,
  isAccepted: true,
  metadata: true,
  expiresAt: true,
  createdAt: true,
} as const;

export class CopilotRepository {
  async listByBarbershop(
    barbershopId: string,
    filters?: { type?: string; unreadOnly?: boolean }
  ) {
    return prisma.copilotSuggestion.findMany({
      where: {
        barbershopId,
        isDismissed: false,
        ...(filters?.type
          ? { type: copilotSuggestionTypeMap[filters.type as keyof typeof copilotSuggestionTypeMap] }
          : {}),
        ...(filters?.unreadOnly ? { isRead: false } : {}),
      },
      select: suggestionSelect,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  }

  async findById(id: string) {
    return prisma.copilotSuggestion.findUnique({
      where: { id },
      select: suggestionSelect,
    });
  }

  async create(data: {
    barbershopId: string;
    type: keyof typeof copilotSuggestionTypeMap;
    title: string;
    description: string;
    priority?: number;
    metadata?: Record<string, unknown>;
    expiresAt?: Date;
  }) {
    return prisma.copilotSuggestion.create({
      data: {
        barbershopId: data.barbershopId,
        type: copilotSuggestionTypeMap[data.type],
        title: data.title,
        description: data.description,
        priority: data.priority ?? 0,
        metadata: data.metadata ?? {},
        expiresAt: data.expiresAt ?? null,
      },
      select: suggestionSelect,
    });
  }

  async markRead(id: string) {
    const existing = await prisma.copilotSuggestion.findUnique({ where: { id } });
    if (!existing) throw new AppError("Sugestão não encontrada", 404);

    return prisma.copilotSuggestion.update({
      where: { id },
      data: { isRead: true },
      select: suggestionSelect,
    });
  }

  async dismiss(id: string) {
    const existing = await prisma.copilotSuggestion.findUnique({ where: { id } });
    if (!existing) throw new AppError("Sugestão não encontrada", 404);

    return prisma.copilotSuggestion.update({
      where: { id },
      data: { isDismissed: true },
      select: suggestionSelect,
    });
  }

  async accept(id: string) {
    const existing = await prisma.copilotSuggestion.findUnique({ where: { id } });
    if (!existing) throw new AppError("Sugestão não encontrada", 404);

    return prisma.copilotSuggestion.update({
      where: { id },
      data: { isAccepted: true, isRead: true },
      select: suggestionSelect,
    });
  }

  async countByBarbershop(barbershopId: string) {
    return prisma.copilotSuggestion.count({
      where: { barbershopId, isDismissed: false },
    });
  }

  async findRecentByType(barbershopId: string, type: string, daysSinceLast = 7) {
    const since = new Date();
    since.setDate(since.getDate() - daysSinceLast);

    return prisma.copilotSuggestion.findFirst({
      where: {
        barbershopId,
        type: copilotSuggestionTypeMap[type as keyof typeof copilotSuggestionTypeMap],
        createdAt: { gte: since },
      },
      select: suggestionSelect,
    });
  }

  async deleteExpired() {
    return prisma.copilotSuggestion.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        isDismissed: true,
      },
    });
  }
}
