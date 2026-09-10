import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createProtocolSchema,
  updateProtocolSchema,
  runAuditSchema,
} from "./qualitySchema";
import type { z } from "zod";

type CreateProtocolInput = z.infer<typeof createProtocolSchema>;
type UpdateProtocolInput = z.infer<typeof updateProtocolSchema>;
type RunAuditInput = z.infer<typeof runAuditSchema>;

const protocolSelect = {
  id: true,
  barbershopId: true,
  name: true,
  description: true,
  category: true,
  checklistItems: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const auditSelect = {
  id: true,
  protocolId: true,
  barbershopId: true,
  auditedById: true,
  staffId: true,
  results: true,
  score: true,
  notes: true,
  auditedAt: true,
  protocol: { select: { id: true, name: true, category: true } },
  auditedBy: { select: { id: true, name: true } },
} as const;

export class QualityRepository {
  async listProtocols(barbershopId: string, isActive?: boolean) {
    return prisma.qualityProtocol.findMany({
      where: {
        barbershopId,
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: protocolSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findProtocolById(id: string) {
    return prisma.qualityProtocol.findUnique({
      where: { id },
      select: protocolSelect,
    });
  }

  async createProtocol(data: CreateProtocolInput) {
    return prisma.qualityProtocol.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        category: data.category ?? null,
        checklistItems: data.checklistItems as any,
      },
      select: protocolSelect,
    });
  }

  async updateProtocol(id: string, data: UpdateProtocolInput) {
    const existing = await prisma.qualityProtocol.findUnique({ where: { id } });
    if (!existing) throw new AppError("Protocolo não encontrado", 404);

    return prisma.qualityProtocol.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.checklistItems !== undefined && { checklistItems: data.checklistItems as any }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: protocolSelect,
    });
  }

  async deleteProtocol(id: string) {
    const existing = await prisma.qualityProtocol.findUnique({ where: { id } });
    if (!existing) throw new AppError("Protocolo não encontrado", 404);

    await prisma.qualityProtocol.delete({ where: { id } });
  }

  async createAudit(data: RunAuditInput) {
    const protocol = await prisma.qualityProtocol.findUnique({
      where: { id: data.protocolId },
    });
    if (!protocol) throw new AppError("Protocolo não encontrado", 404);
    if (protocol.barbershopId !== data.barbershopId) {
      throw new AppError("Protocolo não pertence a esta barbearia", 400);
    }

    const checklist = (protocol.checklistItems as any[]) ?? [];
    const passedCount = data.results.filter((r) => r.passed).length;
    const totalRequired = checklist.filter((c: any) => c.required !== false).length;
    const score = totalRequired > 0 ? (passedCount / totalRequired) * 100 : null;

    return prisma.qualityAudit.create({
      data: {
        protocolId: data.protocolId,
        barbershopId: data.barbershopId,
        auditedById: data.auditedById ?? null,
        staffId: data.staffId ?? null,
        results: data.results as any,
        score,
        notes: data.notes ?? null,
      },
      select: auditSelect,
    });
  }

  async listAudits(protocolId: string, barbershopId: string) {
    return prisma.qualityAudit.findMany({
      where: { protocolId, barbershopId },
      select: auditSelect,
      orderBy: { auditedAt: "desc" },
    });
  }

  async getOverview(barbershopId: string, from?: string, to?: string) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const [protocols, audits, activeCount] = await Promise.all([
      prisma.qualityProtocol.count({
        where: { barbershopId, isActive: true },
      }),
      prisma.qualityAudit.findMany({
        where: {
          barbershopId,
          ...(Object.keys(dateFilter).length ? { auditedAt: dateFilter } : {}),
        },
        select: { score: true, auditedAt: true, protocolId: true },
        orderBy: { auditedAt: "desc" },
      }),
      prisma.qualityProtocol.count({
        where: { barbershopId, isActive: true },
      }),
    ]);

    const scores = audits.filter((a: any) => a.score !== null).map((a: any) => a.score as number);
    const avgScore = scores.length > 0 ? scores.reduce((s: number, v: number) => s + v, 0) / scores.length : null;

    return {
      totalProtocols: protocols,
      activeProtocols: activeCount,
      totalAudits: audits.length,
      averageScore: avgScore ? Math.round(avgScore * 100) / 100 : null,
      recentAudits: audits.slice(0, 10),
    };
  }
}
