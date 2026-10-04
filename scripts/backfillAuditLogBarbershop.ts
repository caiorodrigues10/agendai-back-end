/**
 * Backfill idempotente de `audit_logs.barbershop_id` para linhas criadas
 * ANTES da coluna real de salão.
 *
 * Regras determinísticas (best-effort, nunca adivinha):
 *   1. `resourceId` é um uuid que existe em `barbershops`
 *   2. `details` JSON tem `barbershopId`/`shopId` existente em `barbershops`
 *   3. `action` contém um uuid (ex.: rotas /barbershops/<id>/...) que existe
 *      em `barbershops`
 *
 * Linhas sem evidência permanecem com `barbershop_id` NULL (ações globais,
 * ex.: planos, ou recurso não ligado a um salão).
 *
 * Uso:
 *   npx tsx scripts/backfillAuditLogBarbershop.ts           # dry-run
 *   npx tsx scripts/backfillAuditLogBarbershop.ts --apply   # grava
 */
import "dotenv/config";
import { prisma } from "../src/libs/prismaClient";

const CHUNK = 500;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type AuditRow = {
  id: string;
  resourceId: string | null;
  details: string | null;
  action: string;
};

type Args = { apply: boolean };

function parseArgs(argv: string[]): Args {
  return { apply: argv.includes("--apply") };
}

function extractUuids(value: string): string[] {
  return value.match(UUID_RE) ?? [];
}

function shopFromDetails(details: string | null, shops: Set<string>): string | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    for (const key of ["barbershopId", "shopId"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && shops.has(candidate.toLowerCase())) {
        return candidate.toLowerCase();
      }
    }
  } catch {
    // details não é JSON válido — ignora.
  }
  return null;
}

function inferShop(row: AuditRow, shops: Set<string>): string | null {
  if (row.resourceId) {
    const id = row.resourceId.toLowerCase();
    if (shops.has(id)) return id;
  }
  const fromDetails = shopFromDetails(row.details, shops);
  if (fromDetails) return fromDetails;
  for (const uuid of extractUuids(row.action)) {
    const id = uuid.toLowerCase();
    if (shops.has(id)) return id;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const shopRows = await prisma.barbershop.findMany({ select: { id: true } });
  const shops = new Set(shopRows.map((shop: { id: string }) => shop.id.toLowerCase()));

  let scanned = 0;
  let matched = 0;
  let applied = 0;
  let lastId = "";

  for (;;) {
    const batch: AuditRow[] = await prisma.auditLog.findMany({
      where: { barbershopId: null, ...(lastId ? { id: { gt: lastId } } : {}) },
      orderBy: { id: "asc" },
      take: CHUNK,
      select: { id: true, resourceId: true, details: true, action: true },
    });
    if (batch.length === 0) break;
    lastId = batch[batch.length - 1].id;
    scanned += batch.length;

    for (const row of batch) {
      const shopId = inferShop(row, shops);
      if (!shopId) continue;
      matched += 1;
      if (args.apply) {
        await prisma.auditLog.update({
          where: { id: row.id },
          data: { barbershopId: shopId },
        });
        applied += 1;
      }
    }
  }

  const remaining = await prisma.auditLog.count({ where: { barbershopId: null } });

  console.log(
    JSON.stringify(
      {
        shopsLoaded: shops.size,
        scanned,
        matched,
        applied: args.apply ? applied : 0,
        remainingNull: remaining,
        mode: args.apply ? "apply" : "dry-run",
      },
      null,
      2
    )
  );
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
