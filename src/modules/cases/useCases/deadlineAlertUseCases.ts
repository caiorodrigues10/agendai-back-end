import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { getModuleLogger } from "@/shared/utils/logger";
import { businessDaysUntil, toDateKey } from "@/shared/utils/businessDays";
import { prisma } from "@/libs/prismaClient";
import { CaseBacklogRepository } from "../repositories/CaseBacklogRepository";
import type { IDeadlineAlertDTO } from "../dto/ICaseExtendedDTOs";
import type { RequestingUser } from "./caseManagementUseCases";

const STAFF_ROLES = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];

/**
 * Janela de antecedência dos alertas de vencimento (dias úteis).
 * O prazo que vence em até 3 dias úteis gera alerta; o vencido gera aviso
 * de atraso (uma vez por dia).
 */
export const DEADLINE_ALERT_WINDOW_BUSINESS_DAYS = 3;

/**
 * Alertas automáticos de vencimento de prazo.
 *
 * O cron diário percorre os prazos pendentes e cria um alerta por
 * (prazo, destinatário, tipo, canal, dia). O envio sai por WhatsApp para o
 * dono do escritório — o alerta é operacional interno, então não passa pelo
 * gate de publicidade do segmento.
 */
@injectable()
export class RunDeadlineAlertsUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(): Promise<{
    scanned: number;
    created: number;
    sent: number;
    failed: number;
  }> {
    const logger = getModuleLogger("deadline-alerts");
    const today = new Date();
    const todayKey = toDateKey(today);

    const deadlines = await this.repository.findDeadlinesNeedingAlert(
      DEADLINE_ALERT_WINDOW_BUSINESS_DAYS,
      true
    );

    let created = 0;
    let sent = 0;
    let failed = 0;

    for (const deadline of deadlines) {
      const holidays = await this.officeHolidays(deadline.barbershopId);
      const daysRemaining = businessDaysUntil(today, deadline.dueDate, holidays);
      const isOverdue = daysRemaining < 0;
      const kind: "UPCOMING" | "OVERDUE" = isOverdue ? "OVERDUE" : "UPCOMING";

      if (!isOverdue && daysRemaining > DEADLINE_ALERT_WINDOW_BUSINESS_DAYS) {
        continue;
      }

      for (const userId of deadline.ownerUserIds) {
        const existing = await this.repository.findDeadlineAlert(
          deadline.id,
          userId,
          kind,
          "WHATSAPP",
          new Date(todayKey)
        );
        if (existing) continue;

        let alert: IDeadlineAlertDTO;
        try {
          alert = await this.repository.createDeadlineAlert({
            barbershopId: deadline.barbershopId,
            deadlineId: deadline.id,
            userId,
            channel: "WHATSAPP",
            kind,
            daysRemaining,
            sentOn: new Date(todayKey),
          });
        } catch {
          // Corrida: outro processo criou no mesmo dia — segue para o próximo.
          continue;
        }
        created += 1;

        const message = isOverdue
          ? `⚠️ Prazo vencido: "${deadline.title}"${
              deadline.caseName ? ` (${deadline.caseName})` : ""
            }. Atraso de ${Math.abs(daysRemaining)} dia(s) úteis.`
          : `⏰ Prazo próximo: "${deadline.title}"${
              deadline.caseName ? ` (${deadline.caseName})` : ""
            } vence em ${daysRemaining} dia(s) úteis.`;

        try {
          await enqueueWhatsApp({
            phone: deadline.barbershopWhatsapp,
            message,
            notificationType: "CASE_DEADLINE_ALERT",
            barbershopId: deadline.barbershopId,
            sourceType: "CASE_DEADLINE",
            sourceId: deadline.id,
          });
          await this.repository.updateDeadlineAlert(alert.id, {
            status: "SENT",
            sentAt: new Date(),
            errorMessage: null,
          });
          sent += 1;
        } catch (error) {
          await this.repository.updateDeadlineAlert(alert.id, {
            status: "FAILED",
            errorMessage:
              error instanceof Error ? error.message : "Falha no envio do alerta",
          });
          failed += 1;
          logger.warn(
            { err: error, deadlineId: deadline.id },
            "Falha ao enviar alerta de prazo"
          );
        }
      }
    }

    return { scanned: deadlines.length, created, sent, failed };
  }

  /** Feriados do escritório (suspensões forenses) para a contagem. */
  private async officeHolidays(
    barbershopId: string
  ): Promise<Array<{ date: Date }>> {
    const rows = await prisma.officeHoliday.findMany({
      where: { barbershopId },
      select: { date: true },
    });
    return rows;
  }
}

/** Lista de alertas de prazo (painel do escritório). */
@injectable()
export class ListDeadlineAlertsUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    user: RequestingUser,
    filters: { status?: "PENDING" | "SENT" | "FAILED" | "CANCELED"; limit?: number }
  ): Promise<IDeadlineAlertDTO[]> {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new AppError(
        "Apenas profissionais do escritório podem ver alertas de prazo",
        403
      );
    }
    if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
      throw new AppError(
        "Acesso negado: você não pertence a este escritório",
        403
      );
    }
    return this.repository.listDeadlineAlerts(barbershopId, filters);
  }
}

/**
 * Portal do cliente — casos visíveis.
 *
 * Só entram os casos com `shareWithClient` ligado. O retorno não inclui
 * número do processo, apelido interno, parte adversária, tribunal nem
 * observações: apenas rótulo seguro, andamentos marcados como visíveis,
 * próximo compromisso e contratos aguardando assinatura do cliente.
 */
@injectable()
export class ListClientPortalCasesUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    identityId: string,
    limit: number
  ): Promise<
    Array<{
      id: string;
      barbershopId: string;
      barbershopName: string;
      label: string;
      status: string;
      practiceArea: string | null;
      nextAppointment: { id: string; scheduledAt: Date; time: string | null; serviceName: string | null } | null;
      sharedEvents: Array<{
        id: string;
        type: string;
        title: string;
        description: string | null;
        occurredAt: Date;
      }>;
      pendingSignatures: Array<{ id: string; contractTitle: string; token: string }>;
    }>
  > {
    return this.repository.listClientPortalCasesByIdentity(identityId, limit);
  }
}
