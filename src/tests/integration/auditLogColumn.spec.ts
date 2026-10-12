/// <reference types="vitest/globals" />
/**
 * Regressão do drift de `audit_logs` (ver prisma/migrations/20261011000000_*).
 *
 * A migration `20261004000300_add_audit_log_barbershop_id` criou a coluna como
 * `barbershop_id`, mas o modelo Prisma declara `barbershopId` SEM `@map`. Em
 * qualquer banco criado por `prisma migrate deploy` (CI e produção), o Prisma
 * Client falha com P2022 ao gravar audit log — o hook de auditoria de
 * `app.ts` engolia o erro, então o bug ficava invisível em runtime.
 *
 * Este teste usa o caminho REAL da aplicação (`createAuditLog`) e roda no
 * `npx vitest run` do CI, que aponta para um Postgres só com `migrate deploy`.
 *
 * Requer Postgres com as migrations aplicadas (CI ou `docker compose` local).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { createAuditLog } from "@/shared/services/auditLogService";

describe("audit_logs: coluna de salão nomeada como o schema Prisma", () => {
  const userId = randomUUID();
  const shopId = randomUUID();

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId } });
  });

  it("gravar um audit log pelo caminho real da aplicação funciona", async () => {
    await createAuditLog({
      userId,
      action: "GET /api/health",
      resource: "health",
      ipAddress: "127.0.0.1",
      barbershopId: shopId,
    });

    const rows = await prisma.auditLog.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].barbershopId).toBe(shopId);
  });

  it("filtra por barbershopId sem erro de coluna inexistente", async () => {
    const byShop = await prisma.auditLog.findMany({ where: { barbershopId: shopId } });
    expect(byShop.some((r) => r.userId === userId)).toBe(true);
  });
});
