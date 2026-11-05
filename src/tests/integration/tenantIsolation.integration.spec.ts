/// <reference types="vitest/globals" />
/**
 * Isolamento por salão nas listagens da Fase 2 (Postgres real, porta 5442).
 *
 * Dois salões (A e B) com dados próprios, criados **dentro de uma transação que
 * é revertida no fim** — nada é persistido.
 *
 * ⚠️ **A RLS não é efetiva no ambiente de desenvolvimento.** O papel `agendai`
 * é SUPERUSER com BYPASSRLS, e superusuário/BYPASSRLS sempre ignoram RLS,
 * mesmo com `FORCE ROW LEVEL SECURITY`. Portanto este teste valida o
 * isolamento **pelo `where` construído pela aplicação** — que é o único
 * filtro real nesse ambiente. O próprio arquivo prova isso: a consulta sem
 * `barbershopId` no `where` DEVolve dados do outro salão, mesmo com o
 * `requestContext` apontando para o salão A.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { requestContext } from "@/shared/infra/http/requestContext";
import { buildAppointmentListWhere } from "@/modules/appointments/repositories/appointmentListWhere";

const DIA = "2026-10-05";

describe("isolamento por salão — agendamentos (Postgres real, rollback)", () => {
  it("os filtros só devolvem dados do salão do contexto", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Isolamento A ${randomUUID()}`, whatsapp: "11990000001" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Isolamento B ${randomUUID()}`, whatsapp: "11990000002" },
      });

      const serviceA = await tx.service.create({
        data: {
          barbershopId: shopA.id,
          name: `Corte QA A ${randomUUID()}`,
          price: 50,
          avgTimeMinutes: 30,
          icon: "scissors",
        },
      });
      const serviceB = await tx.service.create({
        data: {
          barbershopId: shopB.id,
          name: `Barba QA B ${randomUUID()}`,
          price: 40,
          avgTimeMinutes: 20,
          icon: "scissors",
        },
      });

      const agendamentoA = await tx.appointment.create({
        data: {
          barbershopId: shopA.id,
          serviceId: serviceA.id,
          customerName: "Cliente Isolamento A",
          whatsapp: "11991110001",
          date: new Date(`${DIA}T00:00:00.000Z`),
          time: "09:00",
          status: "CONFIRMED",
        },
      });
      const agendamentoB = await tx.appointment.create({
        data: {
          barbershopId: shopB.id,
          serviceId: serviceB.id,
          customerName: "Cliente Isolamento B",
          whatsapp: "11992220002",
          date: new Date(`${DIA}T00:00:00.000Z`),
          time: "10:00",
          status: "COMPLETED",
        },
      });

      const consulta = (where: unknown) =>
        tx.appointment.findMany({
          where: where as never,
          select: { id: true, barbershopId: true, serviceId: true, status: true },
        });

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Sem filtro nenhum: só o barbershopId do contexto (do `where`).
        const whereBase = buildAppointmentListWhere(shopA.id, { page: 1, limit: 50 });
        const base = await consulta(whereBase);
        expect(base.map((r) => r.id)).toEqual([agendamentoA.id]);
        expect(base.every((r) => r.barbershopId === shopA.id)).toBe(true);

        // 2. Filtro de status em lista: só o status pedido, ainda no salão A.
        const whereStatus = buildAppointmentListWhere(shopA.id, {
          page: 1,
          limit: 50,
          status: ["COMPLETED"],
        });
        const porStatus = await consulta(whereStatus);
        expect(porStatus).toEqual([]);

        // 3. Filtro de serviceId: o serviço do salão B não traz nada do salão A.
        const whereServiceB = buildAppointmentListWhere(shopA.id, {
          page: 1,
          limit: 50,
          serviceId: serviceB.id,
        });
        expect(await consulta(whereServiceB)).toEqual([]);

        // 4. Filtro de serviceId com o serviço do salão A: traz só o agendamento A.
        const whereServiceA = buildAppointmentListWhere(shopA.id, {
          page: 1,
          limit: 50,
          serviceId: serviceA.id,
        });
        const porService = await consulta(whereServiceA);
        expect(porService.map((r) => r.id)).toEqual([agendamentoA.id]);

        // 5. Filtro por data: só o dia pedido, ainda no salão A.
        const whereData = buildAppointmentListWhere(shopA.id, {
          page: 1,
          limit: 50,
          date: DIA,
        });
        expect((await consulta(whereData)).map((r) => r.id)).toEqual([agendamentoA.id]);

        // 6. `date` tem precedência sobre from/to.
        const wherePrecedencia = buildAppointmentListWhere(shopA.id, {
          page: 1,
          limit: 50,
          date: DIA,
          from: "2020-01-01",
          to: "2030-01-01",
        });
        expect((await consulta(wherePrecedencia)).map((r) => r.id)).toEqual([
          agendamentoA.id,
        ]);

        // 7. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({
          status: { in: ["COMPLETED"] },
        });
        expect(semBarbershop.map((r) => r.id)).toEqual([agendamentoB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const whereB = buildAppointmentListWhere(shopB.id, {
          page: 1,
          limit: 50,
          status: ["COMPLETED"],
        });
        const porB = await consulta(whereB);
        expect(porB.map((r) => r.id)).toEqual([agendamentoB.id]);
        expect(porB.every((r) => r.barbershopId === shopB.id)).toBe(true);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });

  it("nada foi persistido: a transação foi revertida", async () => {
    const sobrou = await prisma.barbershop.count({
      where: { name: { startsWith: "QA Isolamento" } },
    });
    expect(sobrou).toBe(0);
  });
});
