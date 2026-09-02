import { injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("complete-service");

interface CompleteServiceRequest {
  queueItemId: string;
  barbershopId: string;
  requestingUserId: string;
  requestingUserRole: string;
  finalPrice?: number;
  paymentMethod?: "cash" | "pix" | "credit_card" | "debit_card" | "fiado";
  splitWithProfessionalId?: string;
  splitPercentage?: number;
}

function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const national =
    (digits.length === 12 || digits.length === 13) && digits.startsWith("55")
      ? digits.slice(2)
      : digits;
  return national.length >= 10 && national.length <= 11 ? national : null;
}

@injectable()
export class CompleteServiceUseCase {
  async execute(request: CompleteServiceRequest) {
    const {
      queueItemId,
      barbershopId,
      requestingUserId,
      requestingUserRole,
      finalPrice,
      paymentMethod = "cash",
      splitWithProfessionalId,
      splitPercentage,
    } = request;

    // ── 1. Fetch queue item with service ──────────────────────────────────
    const queueItem = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      include: { service: true },
    });

    if (!queueItem) throw new AppError("Item da fila não encontrado", 404);
    if (queueItem.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    if (queueItem.status !== "IN_CHAIR") {
      throw new AppError("Cliente não está em atendimento", 400);
    }

    if (requestingUserRole !== "MASTER_ADMIN" && queueItem.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado: item de fila de outro estabelecimento", 403);
    }

    const price = finalPrice ?? queueItem.service?.price ?? 0;
    if (price < 0) throw new AppError("Preço inválido", 400);

    const commissionPercent = queueItem.service?.commissionPercent ?? 0;
    if (paymentMethod === "fiado" && (!price || price <= 0)) {
      throw new AppError("Informe um valor maior que zero para registrar o fiado", 400);
    }

    // ── 2. Atomic transaction ─────────────────────────────────────────────
    const result = await prisma.$transaction(async (tx: any) => {
      const now = new Date();

      // 2a. Mark queue item as COMPLETED
      await tx.queueItem.update({
        where: { id: queueItemId },
        data: {
          status: "COMPLETED",
          completedAt: now,
          finalPrice: price,
          completedBy: requestingUserId,
          paymentMethod,
        },
      });

      // 2b. Find or create SalonClient (CRM)
      let salonClientId: string | null = queueItem.clientId ?? null;

      if (!salonClientId && queueItem.customerName && queueItem.whatsapp) {
        const normalized = normalizeWhatsapp(queueItem.whatsapp);

        if (normalized) {
          const existing = await tx.salonClient.findUnique({
            where: {
              barbershopId_normalizedWhatsapp: {
                barbershopId,
                normalizedWhatsapp: normalized,
              },
            },
          });
          if (existing) salonClientId = existing.id;
        }

        if (!salonClientId) {
          const created = await tx.salonClient.create({
            data: {
              barbershopId,
              name: queueItem.customerName,
              whatsapp: queueItem.whatsapp,
              normalizedWhatsapp: normalized,
            },
          });
          salonClientId = created.id;
        }

        await tx.queueItem.update({
          where: { id: queueItemId },
          data: { clientId: salonClientId },
        });
      }

      // 2c. CRM financial event (SERVICE_COMPLETED)
      if (salonClientId) {
        const isFiado = paymentMethod === "fiado";
        await tx.crmFinancialEvent.upsert({
          where: {
            barbershopId_sourceType_sourceId_kind: {
              barbershopId,
              sourceType: "queue",
              sourceId: queueItem.id,
              kind: "SERVICE_COMPLETED",
            },
          },
          create: {
            barbershopId,
            clientId: salonClientId,
            kind: "SERVICE_COMPLETED",
            sourceType: "queue",
            sourceId: queueItem.id,
            grossAmount: price,
            receivedAmount: isFiado ? 0 : price,
            outstandingDelta: isFiado ? price : 0,
            occurredAt: now,
            metadata: JSON.stringify({ paymentMethod, serviceId: queueItem.serviceId }),
          },
          update: {},
        });
      }

      // 2d. Commission entry for the requesting professional
      if (commissionPercent > 0 && price > 0) {
        const alreadyHasCommission = await tx.commissionEntry.findUnique({
          where: {
            queueItemId_professionalId: {
              queueItemId: queueItem.id,
              professionalId: requestingUserId,
            },
          },
        });

        if (!alreadyHasCommission) {
          await tx.commissionEntry.create({
            data: {
              barbershopId,
              queueItemId: queueItem.id,
              serviceId: queueItem.serviceId,
              professionalId: requestingUserId,
              percentage: commissionPercent,
              amount: Math.round(price * commissionPercent * 100) / 10000,
            },
          });
        }
      }

      // 2e. Split commission with another professional
      if (
        splitWithProfessionalId &&
        splitPercentage &&
        splitPercentage > 0 &&
        splitPercentage < 100
      ) {
        const splitAlreadyExists = await tx.commissionEntry.findUnique({
          where: {
            queueItemId_professionalId: {
              queueItemId: queueItem.id,
              professionalId: splitWithProfessionalId,
            },
          },
        });

        if (!splitAlreadyExists) {
          await tx.commissionEntry.create({
            data: {
              barbershopId,
              queueItemId: queueItem.id,
              serviceId: queueItem.serviceId,
              professionalId: splitWithProfessionalId,
              percentage: splitPercentage / 100,
              amount: Math.round(price * (splitPercentage / 100) * 100) / 10000,
            },
          });
        }
      }

      // 2f. Fiado (store credit) when payment method is fiado
      if (paymentMethod === "fiado" && salonClientId) {
        await tx.fiado.create({
          data: {
            barbershopId,
            customerName: queueItem.customerName,
            whatsapp: queueItem.whatsapp,
            clientId: salonClientId,
            description: `Serviço: ${queueItem.service?.name || "Serviço"}`,
            originalAmount: price,
            status: "PENDING",
            createdById: requestingUserId,
            notes: `Gerado automaticamente ao finalizar o atendimento da fila (${queueItem.id}).`,
          },
        });
      }

      logger.info(
        {
          queueItemId,
          salonClientId,
          price,
          commissionPercent,
          paymentMethod,
        },
        "Service completed atomically",
      );

      return {
        queueItemId,
        salonClientId,
        price,
        commissionPercent,
        paymentMethod,
      };
    });

    return result;
  }
}
