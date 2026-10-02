/**
 * Backfill idempotente do livro financeiro (CashMovement) para dados criados
 * ANTES da migração do ledger único.
 *
 * Reprocessa:
 *   1. Agendamentos COMPLETED  → SERVICE_SALE (+ comissão padrão, opcional)
 *   2. Itens de fila COMPLETED → SERVICE_SALE
 *   3. Pagamentos de fiado     → FIADO_PAYMENT
 *
 * Seguro para rodar várias vezes: o ledger é idempotente por
 * (barbershopId, sourceType, sourceId, kind) e as comissões por
 * (appointmentId, professionalId).
 *
 * Uso:
 *   npx tsx scripts/backfillFinancialLedger.ts                      # dry-run
 *   npx tsx scripts/backfillFinancialLedger.ts --apply              # aplica
 *   npx tsx scripts/backfillFinancialLedger.ts --apply --barbershop=<id>
 *   npx tsx scripts/backfillFinancialLedger.ts --from=2026-01-01 --to=2026-09-30
 *   npx tsx scripts/backfillFinancialLedger.ts --apply --no-commissions
 */
import "dotenv/config";
import { prisma } from "../src/libs/prismaClient";
import {
  recordLedgerEntry,
  type LedgerKind,
} from "../src/modules/financial/ledger/financialLedger";
import { commissionAmount } from "../src/modules/financial/ledger/commissionMath";

const CHUNK = 400;

type AppointmentRow = {
  id: string;
  serviceId: string;
  staffId: string | null;
  clientId: string | null;
  finalPrice: number | null;
  paymentMethod: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  date: Date;
  service: { name: string; commissionPercent: number } | null;
};

type QueueRow = {
  id: string;
  serviceId: string;
  clientId: string | null;
  finalPrice: number | null;
  paymentMethod: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  customerName: string;
  service: { name: string } | null;
};

type FiadoPaymentRow = {
  id: string;
  amount: number;
  paymentMethod: string | null;
  createdAt: Date;
  registeredById: string;
  fiadoId: string;
};

type Args = {
  apply: boolean;
  commissions: boolean;
  barbershopId?: string;
  from?: Date;
  to?: Date;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: argv.includes("--apply"),
    commissions: !argv.includes("--no-commissions"),
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, value] = raw.slice(2).split("=");
    if (key === "barbershop" && value) args.barbershopId = value;
    if (key === "from" && value) args.from = new Date(`${value}T00:00:00.000Z`);
    if (key === "to" && value) args.to = new Date(`${value}T23:59:59.999Z`);
  }
  return args;
}

function inRange(instant: Date | null | undefined, fallback: Date | null | undefined, args: Args): boolean {
  const value = instant ?? fallback;
  if (!value) return false;
  if (args.from && value < args.from) return false;
  if (args.to && value > args.to) return false;
  return true;
}

function chunk<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function existingSources(
  barbershopId: string,
  sourceType: string,
  kind: LedgerKind,
  sourceIds: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  for (const batch of chunk(sourceIds)) {
    const rows = await prisma.cashMovement.findMany({
      where: { barbershopId, sourceType, type: kind, sourceId: { in: batch } },
      select: { sourceId: true },
    });
    for (const row of rows) if (row.sourceId) found.add(row.sourceId);
  }
  return found;
}

async function fallbackActor(barbershopId: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { barbershopId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!user) throw new Error(`Nenhum usuário encontrado para o salão ${barbershopId}`);
  return user.id;
}

/** Em dry-run apenas conta; com --apply grava via recordLedgerEntry (idempotente). */
function makeLedgerWriter(args: Args) {
  if (!args.apply) return () => Promise.resolve({ created: false });
  return async (input: Parameters<typeof recordLedgerEntry>[1]) => {
    const result = await recordLedgerEntry(prisma, input);
    return { created: Boolean(result?.created) };
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report: Record<string, unknown> = {
    mode: args.apply ? "apply" : "dry-run",
    barbershopId: args.barbershopId ?? "todas",
    from: args.from?.toISOString() ?? null,
    to: args.to?.toISOString() ?? null,
    commissions: args.commissions,
  };

  const shops = await prisma.barbershop.findMany({
    where: args.barbershopId ? { id: args.barbershopId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const write = makeLedgerWriter(args);
  const totals = {
    appointments: 0,
    appointmentsLedgerAmount: 0,
    commissions: 0,
    queueItems: 0,
    queueLedgerAmount: 0,
    fiadoPayments: 0,
    fiadoLedgerAmount: 0,
  };

  for (const shop of shops) {
    const actor = await fallbackActor(shop.id);

    // ── 1) Agendamentos concluídos ───────────────────────────────────────────
    const appointments: AppointmentRow[] = await prisma.appointment.findMany({
      where: {
        barbershopId: shop.id,
        status: "COMPLETED",
        finalPrice: { not: null },
        clientPackageId: null,
      },
      select: {
        id: true,
        serviceId: true,
        staffId: true,
        clientId: true,
        finalPrice: true,
        paymentMethod: true,
        completedAt: true,
        completedBy: true,
        date: true,
        service: { select: { name: true, commissionPercent: true } },
      },
      orderBy: { date: "asc" },
    });
    const appointmentsInRange = appointments.filter((a) => inRange(a.completedAt, a.date, args));
    const withLedger = await existingSources(
      shop.id,
      "APPOINTMENT",
      "SERVICE_SALE",
      appointmentsInRange.map((a) => a.id),
    );
    for (const appt of appointmentsInRange) {
      if (withLedger.has(appt.id)) continue;
      const occurredAt = appt.completedAt ?? appt.date;
      await write({
        barbershopId: shop.id,
        kind: "SERVICE_SALE",
        amount: Number(appt.finalPrice ?? 0),
        paymentMethod: appt.paymentMethod,
        sourceType: "APPOINTMENT",
        sourceId: appt.id,
        occurredAt,
        professionalId: appt.completedBy ?? appt.staffId ?? null,
        clientId: appt.clientId ?? null,
        description: appt.service?.name ? `Atendimento: ${appt.service.name}` : "Atendimento",
        createdBy: appt.completedBy ?? appt.staffId ?? actor,
      });
      totals.appointments += 1;
      totals.appointmentsLedgerAmount += Number(appt.finalPrice ?? 0);
    }

    // ── 1b) Comissão padrão (service.commissionPercent) quando não existe ───
    if (args.commissions) {
      const already: { appointmentId: string | null }[] = await prisma.commissionEntry.findMany({
        where: { barbershopId: shop.id, appointmentId: { not: null } },
        select: { appointmentId: true },
      });
      const withCommission = new Set(
        already.map((c) => c.appointmentId).filter(Boolean),
      );
      const commissionable = appointmentsInRange.filter(
        (a) => !withCommission.has(a.id) &&
          Number(a.finalPrice ?? 0) > 0 &&
          Number(a.service?.commissionPercent ?? 0) > 0 &&
          (a.completedBy ?? a.staffId),
      );
      if (commissionable.length > 0 && args.apply) {
        await prisma.commissionEntry.createMany({
          data: commissionable.map((a) => ({
            barbershopId: shop.id,
            appointmentId: a.id,
            serviceId: a.serviceId,
            professionalId: a.completedBy ?? a.staffId,
            percentage: Number(a.service?.commissionPercent ?? 0),
            amount: commissionAmount(Number(a.finalPrice ?? 0), Number(a.service?.commissionPercent ?? 0)),
          })),
          skipDuplicates: true,
        });
      }
      totals.commissions += commissionable.length;
    }

    // ── 2) Itens de fila concluídos ─────────────────────────────────────────
    const queueItems: QueueRow[] = await prisma.queueItem.findMany({
      where: { barbershopId: shop.id, status: "COMPLETED", finalPrice: { not: null } },
      select: {
        id: true,
        serviceId: true,
        clientId: true,
        finalPrice: true,
        paymentMethod: true,
        completedAt: true,
        completedBy: true,
        customerName: true,
        service: { select: { name: true } },
      },
      orderBy: { completedAt: "asc" },
    });
    const queueInRange = queueItems.filter((q) => inRange(q.completedAt, null, args));
    const queueWithLedger = await existingSources(
      shop.id,
      "QUEUE_ITEM",
      "SERVICE_SALE",
      queueInRange.map((q) => q.id),
    );
    for (const item of queueInRange) {
      if (queueWithLedger.has(item.id)) continue;
      await write({
        barbershopId: shop.id,
        kind: "SERVICE_SALE",
        amount: Number(item.finalPrice ?? 0),
        paymentMethod: item.paymentMethod,
        sourceType: "QUEUE_ITEM",
        sourceId: item.id,
        occurredAt: item.completedAt ?? new Date(),
        professionalId: item.completedBy ?? null,
        clientId: item.clientId ?? null,
        description: `Atendimento: ${item.service?.name ?? item.customerName}`,
        createdBy: item.completedBy ?? actor,
      });
      totals.queueItems += 1;
      totals.queueLedgerAmount += Number(item.finalPrice ?? 0);
    }

    // ── 3) Pagamentos de fiado ──────────────────────────────────────────────
    const payments: FiadoPaymentRow[] = await prisma.fiadoPayment.findMany({
      where: { fiado: { barbershopId: shop.id } },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        createdAt: true,
        registeredById: true,
        fiadoId: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const paymentsInRange = payments.filter((p) => inRange(p.createdAt, null, args));
    const paymentsWithLedger = await existingSources(
      shop.id,
      "FIADO_PAYMENT",
      "FIADO_PAYMENT",
      paymentsInRange.map((p) => p.id),
    );
    for (const payment of paymentsInRange) {
      if (paymentsWithLedger.has(payment.id)) continue;
      await write({
        barbershopId: shop.id,
        kind: "FIADO_PAYMENT",
        amount: Number(payment.amount ?? 0),
        paymentMethod: payment.paymentMethod,
        sourceType: "FIADO_PAYMENT",
        sourceId: payment.id,
        relatedSourceId: payment.fiadoId,
        occurredAt: payment.createdAt,
        professionalId: payment.registeredById,
        description: "Recebimento de fiado",
        createdBy: payment.registeredById,
      });
      totals.fiadoPayments += 1;
      totals.fiadoLedgerAmount += Number(payment.amount ?? 0);
    }
  }

  report.totals = totals;
  console.log(JSON.stringify(report, null, 2));
  if (!args.apply) {
    console.log("\nDry-run: nada foi gravado. Repita com --apply para executar.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
