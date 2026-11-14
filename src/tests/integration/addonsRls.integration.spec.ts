/// <reference types="vitest/globals" />
/**
 * Evidência RLS (FASE 2) com papel Postgres NÃO superusuário e SEM BYPASSRLS.
 *
 * O papel `agendai` de dev/CI é SUPERUSER e ignora RLS — aqui criamos um papel
 * temporário (`addons_rls_probe`) e provamos nas 3 tabelas novas:
 *   1. INSERT/SELECT com GUC `app.current_barbershop_id` = um salão;
 *   2. SELECT com GUC vazio ('') (conexão interna: enxerga tudo, por design);
 *   3. segundo salão NÃO enxerga linhas do primeiro;
 *   4. WITH CHECK recusa INSERT com barbershopId ≠ GUC;
 *   5. papel e grants são removidos ao final (afterAll).
 *
 * Os dados são criados por superusuário e as escritas do papel restrictions
 * ocorrem em transação que sempre dá ROLLBACK — nada persiste.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";

const ROLE = "addons_rls_probe";
const TABLES = ["salon_addons", "service_addon_links", "appointment_addons"] as const;

async function asSuperuser(sql: string): Promise<void> {
  await prisma.$executeRawUnsafe(sql);
}

async function currentDatabase(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ datname: string }[]>(
    "SELECT current_database()::text AS datname",
  );
  return rows[0]!.datname;
}

async function ensureRoleGone(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') AS exists`,
  );
  if (!rows[0]?.exists) return;
  await asSuperuser(`REVOKE ALL ON ${TABLES.join(", ")} FROM ${ROLE}`);
  await asSuperuser(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE}`);
  await asSuperuser(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${ROLE}`);
  await asSuperuser(`REVOKE USAGE ON SCHEMA public FROM ${ROLE}`);
  await asSuperuser(`REVOKE CONNECT ON DATABASE "${await currentDatabase()}" FROM ${ROLE}`);
  await asSuperuser(`DROP ROLE IF EXISTS ${ROLE}`);
}

describe("RLS addons com papel não-superusuário (sem BYPASSRLS)", () => {
  let harness: PostgresHarness | undefined;
  let shopA = "";
  let shopB = "";
  let serviceA = "";
  let serviceB = "";
  let appointmentA = "";
  let appointmentB = "";
  let addonA = "";
  let addonB = "";
  const dia = "2026-12-01";

  beforeAll(async () => {
    harness = await startPostgresHarness();

    await ensureRoleGone();
    await asSuperuser(
      `CREATE ROLE ${ROLE} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION LOGIN PASSWORD 'rls_probe_tmp'`,
    );
    const [probe] = await prisma.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '${ROLE}'`);
    expect(probe.rolsuper).toBe(false);
    expect(probe.rolbypassrls).toBe(false);

    await asSuperuser(`GRANT CONNECT ON DATABASE "${await currentDatabase()}" TO ${ROLE}`);
    await asSuperuser(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);
    await asSuperuser(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${TABLES.join(", ")} TO ${ROLE}`);

    // RLS + FORCE nas 3 tabelas (reafirma o que a migration garante).
    for (const t of TABLES) {
      const [row] = await prisma.$queryRawUnsafe<
        { relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = '${t}'::regclass`,
      );
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }

    const shopArow = await prisma.barbershop.create({
      data: { name: `RLS Probe A ${randomUUID()}`, whatsapp: "11990000031" },
    });
    const shopBrow = await prisma.barbershop.create({
      data: { name: `RLS Probe B ${randomUUID()}`, whatsapp: "11990000032" },
    });
    shopA = shopArow.id;
    shopB = shopBrow.id;

    const svcA = await prisma.service.create({
      data: { barbershopId: shopA, name: "Corte RLS A", price: 50, avgTimeMinutes: 30, icon: "scissors" },
    });
    const svcB = await prisma.service.create({
      data: { barbershopId: shopB, name: "Corte RLS B", price: 50, avgTimeMinutes: 30, icon: "scissors" },
    });
    serviceA = svcA.id;
    serviceB = svcB.id;

    const aptA = await prisma.appointment.create({
      data: {
        barbershopId: shopA,
        serviceId: serviceA,
        customerName: "Cliente RLS A",
        whatsapp: "11990000041",
        date: new Date(`${dia}T00:00:00.000Z`),
        time: "10:00",
        status: "CONFIRMED",
      },
    });
    const aptB = await prisma.appointment.create({
      data: {
        barbershopId: shopB,
        serviceId: serviceB,
        customerName: "Cliente RLS B",
        whatsapp: "11990000042",
        date: new Date(`${dia}T00:00:00.000Z`),
        time: "11:00",
        status: "CONFIRMED",
      },
    });
    appointmentA = aptA.id;
    appointmentB = aptB.id;

    // Linhas-fonte por salão (criadas como superusuário; o papel só lê/escreve via RLS).
    addonA = randomUUID();
    addonB = randomUUID();
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `INSERT INTO salon_addons (id, "barbershopId", name, price, "updatedAt") VALUES ('${addonA}', '${shopA}', 'Adicional A', 10.50, '${now.toISOString()}')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO salon_addons (id, "barbershopId", name, price, "updatedAt") VALUES ('${addonB}', '${shopB}', 'Adicional B', 20.00, '${now.toISOString()}')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO service_addon_links (id, "barbershopId", "serviceId", "addonId", "updatedAt") VALUES ('${randomUUID()}', '${shopA}', '${serviceA}', '${addonA}', '${now.toISOString()}')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO service_addon_links (id, "barbershopId", "serviceId", "addonId", "updatedAt") VALUES ('${randomUUID()}', '${shopB}', '${serviceB}', '${addonB}', '${now.toISOString()}')`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO appointment_addons (id, "barbershopId", "appointmentId", "addonId", "nameSnapshot", "unitPrice") VALUES ('${randomUUID()}', '${shopA}', '${appointmentA}', '${addonA}', 'Adicional A', 10.50)`,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO appointment_addons (id, "barbershopId", "appointmentId", "addonId", "nameSnapshot", "unitPrice") VALUES ('${randomUUID()}', '${shopB}', '${appointmentB}', '${addonB}', 'Adicional B', 20.00)`,
    );
  }, 180_000);

  afterAll(async () => {
    try {
      await ensureRoleGone();
      const [left] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = '${ROLE}'`,
      );
      expect(left.n).toBe(0);
    } catch (e) {
      console.error("[rls] falha ao remover papel probe", e);
    }
    try {
      await prisma.$transaction([
        prisma.appointmentAddon.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } }),
        prisma.serviceAddonLink.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } }),
        prisma.salonAddon.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } }),
        prisma.appointment.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } }),
        prisma.service.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } }),
        prisma.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } }),
      ]);
    } catch {
      /* best-effort */
    }
  });

  async function withProbe(fn: (run: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<void>) {
    // Transação sempre revertida: SET ROLE é transacional — no ROLLBACK o papel
    // volta sozinho. Se `fn` abortar o tx (erro esperado de WITH CHECK), o
    // RESET ROLE pode falhar com 25P02; ignoramos e deixamos o rollback desfazer.
    await prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET ROLE ${ROLE}`);
          let fnError: unknown;
          try {
            const run = (sql: string, params: unknown[] = []) =>
              tx.$queryRawUnsafe(sql, ...(params as never[]));
            await fn(run);
          } catch (e) {
            fnError = e;
          }
          try {
            await tx.$executeRawUnsafe(`RESET ROLE`);
          } catch {
            /* tx abortado — rollback desfaz SET ROLE */
          }
          if (fnError) throw fnError;
          throw new Error("RLS_ROLLBACK");
        },
        { timeout: 60_000 },
      )
      .catch((e: unknown) => {
        if (!String((e as Error).message).includes("RLS_ROLLBACK")) throw e;
      });
  }

  function guc(run: (sql: string, params?: unknown[]) => Promise<unknown>, shop: string) {
    return run(`SELECT set_config('app.current_barbershop_id', $1, true)`, [shop]);
  }

  it("papel probe é NOSUPERUSER / NOBYPASSRLS e tem grants nas 3 tabelas", async () => {
    const [probe] = await prisma.$queryRawUnsafe<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = '${ROLE}'`);
    expect(probe).toEqual({ rolsuper: false, rolbypassrls: false });
    const grants = await prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE grantee = '${ROLE}'`,
    );
    expect(Number(grants[0]?.count)).toBeGreaterThan(0);
  });

  it("INSERT + SELECT das 3 tabelas com GUC = salão A", async () => {
    await withProbe(async (run) => {
      await guc(run, shopA);
      const now = new Date().toISOString();

      const [insAddon] = await run(
        `INSERT INTO salon_addons (id, "barbershopId", name, price, "updatedAt") VALUES ($1, $2, $3, 5.00, $4) RETURNING id, "barbershopId"`,
        [randomUUID(), shopA, "Inserido via probe A", now],
      ) as [{ id: string; barbershopId: string }];
      expect(insAddon.barbershopId).toBe(shopA);

      const addons = (await run(
        `SELECT id, "barbershopId" FROM salon_addons WHERE name IN ('Adicional A', 'Adicional B', 'Inserido via probe A')`,
      )) as { id: string; barbershopId: string }[];
      expect(addons.every((r) => r.barbershopId === shopA)).toBe(true);
      expect(addons.map((r) => r.id)).toContain(addonA);
      expect(addons.map((r) => r.id)).not.toContain(addonB);

      // service_addon_links já tem o vínculo (serviceA, addonA) no seed —
      // o índice único impede duplicar; validamos SELECT e INSERT de appointment_addons.
      const links = (await run(
        `SELECT "barbershopId", "addonId" FROM service_addon_links`,
      )) as { barbershopId: string; addonId: string }[];
      expect(links.every((r) => r.barbershopId === shopA)).toBe(true);
      expect(links.every((r) => r.addonId === addonA)).toBe(true);

      const [insLine] = await run(
        `INSERT INTO appointment_addons (id, "barbershopId", "appointmentId", "addonId", "nameSnapshot", "unitPrice") VALUES ($1, $2, $3, $4, $5, 1.00) RETURNING id`,
        [randomUUID(), shopA, appointmentA, addonA, "Linha probe A"],
      ) as [{ id: string }];
      expect(insLine.id).toBeTruthy();

      const lines = (await run(
        `SELECT "barbershopId" FROM appointment_addons`,
      )) as { barbershopId: string }[];
      expect(lines.every((r) => r.barbershopId === shopA)).toBe(true);
    });
  });

  it("GUC vazio ('') enxerga linhas dos dois salões (conexão interna, por design)", async () => {
    await withProbe(async (run) => {
      await guc(run, "");
      const addons = (await run(
        `SELECT id, "barbershopId" FROM salon_addons WHERE id IN ($1, $2)`,
        [addonA, addonB],
      )) as { id: string; barbershopId: string }[];
      expect(addons.map((r) => r.id).sort()).toEqual([addonA, addonB].sort());
    });
  });

  it("segundo salão (GUC = B) não enxerga linhas do primeiro; INSERT só no próprio B", async () => {
    await withProbe(async (run) => {
      await guc(run, shopB);

      const addons = (await run(
        `SELECT id, "barbershopId" FROM salon_addons WHERE name IN ('Adicional A', 'Adicional B')`,
      )) as { id: string; barbershopId: string }[];
      expect(addons.map((r) => r.id)).toEqual([addonB]);
      expect(addons.map((r) => r.id)).not.toContain(addonA);

      const links = (await run(
        `SELECT "barbershopId", "addonId" FROM service_addon_links`,
      )) as { barbershopId: string; addonId: string }[];
      expect(links.every((r) => r.barbershopId === shopB)).toBe(true);
      expect(links.every((r) => r.addonId !== addonA)).toBe(true);

      const lines = (await run(
        `SELECT "barbershopId", "addonId" FROM appointment_addons`,
      )) as { barbershopId: string; addonId: string }[];
      expect(lines.every((r) => r.barbershopId === shopB)).toBe(true);
      expect(lines.every((r) => r.addonId !== addonA)).toBe(true);

      const now = new Date().toISOString();
      const [ins] = await run(
        `INSERT INTO salon_addons (id, "barbershopId", name, price, "updatedAt") VALUES ($1, $2, $3, 7.25, $4) RETURNING "barbershopId"`,
        [randomUUID(), shopB, "Inserido via probe B", now],
      ) as [{ barbershopId: string }];
      expect(ins.barbershopId).toBe(shopB);
    });
  });

  it("WITH CHECK recusa INSERT com barbershopId ≠ GUC do salão", async () => {
    await withProbe(async (run) => {
      await guc(run, shopB);
      const now = new Date().toISOString();
      await expect(
        run(
          `INSERT INTO salon_addons (id, "barbershopId", name, price, "updatedAt") VALUES ($1, $2, $3, 1.00, $4)`,
          [randomUUID(), shopA, "Cross-tenant", now],
        ),
      ).rejects.toThrow();
    });
  });
});
