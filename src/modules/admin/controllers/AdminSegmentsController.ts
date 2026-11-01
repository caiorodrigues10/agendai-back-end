import { FastifyRequest, FastifyReply } from "fastify";
import type { BusinessSegment } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { ALL_SEGMENTS, SEGMENT_CONFIGS } from "@/shared/segments";
import {
  diffSegmentImpact,
  segmentSummary,
  type SegmentImpact,
} from "@/shared/segments/segmentImpact";
import {
  adminBarbershopSegmentBodySchema,
  adminBarbershopSegmentParamsSchema,
} from "../schemas/adminSegmentsSchemas";

type SegmentConflict = {
  code: string;
  message: string;
  count: number;
};

/**
 * Gestão de segmentos pelo master.
 *
 * O catálogo é código versionado (`src/shared/segments`) — esta API só lê o
 * catálogo e troca o segmento do salão, sempre com motivo e auditoria.
 */
export class AdminSegmentsController {
  /** Catálogo de segmentos + quantos salões usam cada um (somente leitura). */
  async list(_request: FastifyRequest, reply: FastifyReply) {
    const counts = await prisma.barbershop.groupBy({
      by: ["businessSegment"],
      _count: { _all: true },
    });

    const countBySegment = new Map<string, number>(
      counts.map((row) => [row.businessSegment, row._count._all]),
    );

    const data = ALL_SEGMENTS.map((segment) => ({
      ...segmentSummary(segment),
      shops: countBySegment.get(segment) ?? 0,
    }));

    return reply.status(200).send({
      success: true,
      data,
      meta: {
        total: data.length,
        shops: data.reduce((sum, item) => sum + item.shops, 0),
      },
    });
  }

  /**
   * Dados do salão que ficam sem uso no segmento novo. Não bloqueiam a troca:
   * exigem confirmação explícita do master.
   */
  private async conflicts(
    barbershopId: string,
    impact: SegmentImpact,
  ): Promise<SegmentConflict[]> {
    const conflicts: SegmentConflict[] = [];

    if (impact.hiddenModules.includes("products")) {
      const count = await prisma.product.count({
        where: { barbershopId, active: true },
      });
      if (count > 0) {
        conflicts.push({
          code: "PRODUCTS",
          message: "Produtos ativos deixam de existir no novo segmento",
          count,
        });
      }
    }

    if (impact.hiddenModules.includes("equipment")) {
      const count = await prisma.equipment.count({
        where: { barbershopId, isActive: true },
      });
      if (count > 0) {
        conflicts.push({
          code: "EQUIPMENT",
          message: "Estoque de equipamento deixa de existir no novo segmento",
          count,
        });
      }
    }

    if (impact.hiddenModules.includes("commissions")) {
      const count = await prisma.commissionEntry.count({ where: { barbershopId } });
      if (count > 0) {
        conflicts.push({
          code: "COMMISSIONS",
          message: "Lançamentos de comissão deixam de existir no novo segmento",
          count,
        });
      }
    }

    if (impact.hiddenModules.includes("tip")) {
      const count = await prisma.cashMovement.count({
        where: { barbershopId, type: "TIP" },
      });
      if (count > 0) {
        conflicts.push({
          code: "TIP",
          message: "Lançamentos de gorjeta deixam de existir no novo segmento",
          count,
        });
      }
    }

    const currentProfile = SEGMENT_CONFIGS[impact.from].auxiliaryProfile ?? null;
    const targetProfile = SEGMENT_CONFIGS[impact.to].auxiliaryProfile ?? null;
    if (currentProfile !== targetProfile) {
      const count = await prisma.salonClient.count({ where: { barbershopId } });
      if (count > 0) {
        conflicts.push({
          code: "AUXILIARY_PROFILE",
          message:
            currentProfile === null
              ? "Clientes cadastrados passam a exigir ficha auxiliar no novo segmento"
              : "Clientes cadastrados deixam de ter ficha auxiliar no novo segmento",
          count,
        });
      }
    }

    return conflicts;
  }

  /** Troca o segmento do salão (motivo obrigatório + auditoria antes/depois). */
  async updateSegment(request: FastifyRequest, reply: FastifyReply) {
    const { id } = adminBarbershopSegmentParamsSchema.parse(request.params);
    const { segment, reason, confirm } =
      adminBarbershopSegmentBodySchema.parse(request.body);

    const shop = await prisma.barbershop.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        businessSegment: true,
        businessSegmentOther: true,
        targetAudience: true,
      },
    });
    if (!shop) throw new AppError("Conta não encontrada", 404);
    if (shop.businessSegment === segment) {
      throw new AppError("O salão já está neste segmento", 409);
    }

    const impact = diffSegmentImpact(shop.businessSegment, segment);
    const conflicts = await this.conflicts(id, impact);

    if (conflicts.length > 0 && !confirm) {
      throw new AppError(
        "A troca de segmento tem dados incompatíveis — confirme para continuar",
        409,
        { requiresConfirmation: true, conflicts, impact },
        "SEGMENT_CHANGE_REQUIRES_CONFIRMATION",
      );
    }

    const audienceApplies = SEGMENT_CONFIGS[segment].targetAudience.applies;

    await prisma.barbershop.update({
      where: { id },
      data: {
        businessSegment: segment,
        businessSegmentOther: segment === "OTHER" ? shop.businessSegmentOther : null,
        targetAudience: audienceApplies ? shop.targetAudience : null,
      },
    });

    if (request.user) {
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: "ACCOUNT_CHANGE_SEGMENT",
          resource: "Barbershop",
          resourceId: id,
          details: JSON.stringify({
            reason,
            before: { segment: shop.businessSegment },
            after: { segment },
            impact,
            conflicts,
          }),
          ipAddress: request.ip,
          barbershopId: id,
        },
      });
    }

    return reply.status(200).send({
      success: true,
      data: {
        id,
        segment: segment as BusinessSegment,
        previousSegment: shop.businessSegment,
        impact,
        conflicts,
      },
    });
  }
}
