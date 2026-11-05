/// <reference types="vitest/globals" />
/**
 * Isolamento por salão nas listagens da Fase 2 (Postgres real, porta 5442).
 *
 * Dois salões (A e B) com dados próprios, criados **dentro de uma transação que
 * é revertida no fim** — nada é persistido.
 *
 * Atenção: **A RLS não é efetiva no ambiente de desenvolvimento.** O papel `agendai`
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
import { buildFiadoListWhere } from "@/modules/fiado/repositories/fiadoListWhere";
import { buildExpenseListWhere } from "@/modules/expenses/repositories/expenseListWhere";
import { shopToday } from "@/modules/financial/ledger/shopTime";

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

describe("isolamento por salão — fiados (Postgres real, rollback)", () => {
  it("os filtros só devolvem dados do salão do contexto", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Isolamento A ${randomUUID()}`, whatsapp: "11990000001" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Isolamento B ${randomUUID()}`, whatsapp: "11990000002" },
      });

      const hoje = new Date();
      // O dia civil do filtro é o do salão (America/Sao_Paulo).
      const diaDeHoje = shopToday("America/Sao_Paulo");
      const vencido = new Date(hoje.getTime() - 5 * 24 * 60 * 60 * 1000);

      // A: PENDING e vencido (entra no filtro `overdue`)
      const fiadoA = await tx.fiado.create({
        data: {
          barbershopId: shopA.id,
          customerName: "Devedor Isolamento A",
          whatsapp: "11991110001",
          description: "Corte fiado QA A",
          originalAmount: 120,
          status: "PENDING",
          dueDate: vencido,
          createdById: randomUUID(),
        },
      });
      // A: PENDING sem vencimento (não entra no filtro `overdue`)
      const fiadoASemPrazo = await tx.fiado.create({
        data: {
          barbershopId: shopA.id,
          customerName: "Devedor Isolamento A",
          whatsapp: "11991110001",
          description: "Barba fiada QA A",
          originalAmount: 60,
          status: "PENDING",
          createdById: randomUUID(),
        },
      });
      // B: PAID e vencido (incompatível com `overdue`)
      const fiadoB = await tx.fiado.create({
        data: {
          barbershopId: shopB.id,
          customerName: "Devedor Isolamento B",
          whatsapp: "11992220002",
          description: "Corte fiado QA B",
          originalAmount: 200,
          status: "PAID",
          dueDate: vencido,
          createdById: randomUUID(),
        },
      });

      const consulta = (where: unknown) =>
        tx.fiado.findMany({
          where: where as never,
          select: { id: true, barbershopId: true, status: true, dueDate: true },
        });

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Sem filtro: só os fiados do salão A (barbershopId do contexto).
        const base = await consulta(
          buildFiadoListWhere(shopA.id, { page: 1, limit: 50 })
        );
        expect(base.map((r) => r.id).sort()).toEqual(
          [fiadoA.id, fiadoASemPrazo.id].sort()
        );
        expect(base.every((r) => r.barbershopId === shopA.id)).toBe(true);

        // 2. `overdue`: só o fiado em aberto e vencido.
        const overdue = await consulta(
          buildFiadoListWhere(shopA.id, { page: 1, limit: 50, overdue: true })
        );
        expect(overdue.map((r) => r.id)).toEqual([fiadoA.id]);

        // 3. `overdue` + status incompatível (PAID): as cláusulas se anulam.
        const overduePago = await consulta(
          buildFiadoListWhere(shopA.id, {
            page: 1,
            limit: 50,
            overdue: true,
            status: ["PAID"],
          })
        );
        expect(overduePago).toEqual([]);

        // 4. Filtro de status: PAID não existe no salão A.
        const pagos = await consulta(
          buildFiadoListWhere(shopA.id, { page: 1, limit: 50, status: ["PAID"] })
        );
        expect(pagos).toEqual([]);

        // 5. Busca: só o fiado do salão A.
        const busca = await consulta(
          buildFiadoListWhere(shopA.id, {
            page: 1,
            limit: 50,
            search: "Isolamento A",
          })
        );
        expect(busca.map((r) => r.id).sort()).toEqual(
          [fiadoA.id, fiadoASemPrazo.id].sort()
        );

        // 6. from/to em `createdAt`: o dia de hoje entra inteiro (limite `lt`
        //    no início do dia seguinte).
        const periodo = await consulta(
          buildFiadoListWhere(shopA.id, {
            page: 1,
            limit: 50,
            from: diaDeHoje,
            to: diaDeHoje,
          })
        );
        expect(periodo.map((r) => r.id).sort()).toEqual(
          [fiadoA.id, fiadoASemPrazo.id].sort()
        );

        // 7. dueFrom/dueTo em `dueDate`: o fiado sem prazo não entra.
        const prazo = await consulta(
          buildFiadoListWhere(shopA.id, {
            page: 1,
            limit: 50,
            dueFrom: "2020-01-01",
            dueTo: "2020-12-31",
          })
        );
        expect(prazo).toEqual([]);

        // 8. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({ status: { in: ["PAID"] } });
        expect(semBarbershop.map((r) => r.id)).toEqual([fiadoB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const baseB = await consulta(
          buildFiadoListWhere(shopB.id, { page: 1, limit: 50 })
        );
        expect(baseB.map((r) => r.id)).toEqual([fiadoB.id]);
        expect(baseB.every((r) => r.barbershopId === shopB.id)).toBe(true);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("isolamento por salão — despesas (Postgres real, rollback)", () => {
  it("os filtros só devolvem dados do salão do contexto", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Isolamento A ${randomUUID()}`, whatsapp: "11990000001" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Isolamento B ${randomUUID()}`, whatsapp: "11990000002" },
      });

      const hoje = new Date();
      // O dia civil do filtro é o do salão (America/Sao_Paulo).
      const diaDeHoje = shopToday("America/Sao_Paulo");
      const vencido = new Date(hoje.getTime() - 5 * 24 * 60 * 60 * 1000);

      // A: pendente e vencida (entra no filtro `overdue`)
      const despesaA = await tx.expense.create({
        data: {
          barbershopId: shopA.id,
          title: "Despesa Isolamento A",
          amount: 120,
          type: "VARIABLE",
          referenceDate: new Date(`${diaDeHoje}T12:00:00.000Z`),
          dueDate: vencido,
          createdById: randomUUID(),
        },
      });
      // A: paga
      const despesaAPaga = await tx.expense.create({
        data: {
          barbershopId: shopA.id,
          title: "Despesa Isolamento A paga",
          amount: 60,
          type: "FIXED",
          referenceDate: new Date(`${diaDeHoje}T12:00:00.000Z`),
          paidAt: new Date(`${diaDeHoje}T13:00:00.000Z`),
          createdById: randomUUID(),
        },
      });
      // B: pendente e vencida
      const despesaB = await tx.expense.create({
        data: {
          barbershopId: shopB.id,
          title: "Despesa Isolamento B",
          amount: 200,
          type: "INVESTMENT",
          referenceDate: new Date(`${diaDeHoje}T12:00:00.000Z`),
          dueDate: vencido,
          createdById: randomUUID(),
        },
      });

      const consulta = (where: unknown) =>
        tx.expense.findMany({
          where: where as never,
          select: {
            id: true,
            barbershopId: true,
            title: true,
            paidAt: true,
            dueDate: true,
            referenceDate: true,
          },
        });

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Sem filtro: só as despesas do salão A.
        const base = await consulta(
          buildExpenseListWhere(shopA.id, { page: 1, limit: 50 })
        );
        expect(base.map((r) => r.id).sort()).toEqual(
          [despesaA.id, despesaAPaga.id].sort()
        );
        expect(base.every((r) => r.barbershopId === shopA.id)).toBe(true);

        // 2. `payment=pending`: só a despesa não paga.
        const pendentes = await consulta(
          buildExpenseListWhere(shopA.id, {
            page: 1,
            limit: 50,
            payment: ["pending"],
          })
        );
        expect(pendentes.map((r) => r.id)).toEqual([despesaA.id]);

        // 3. `payment=paid`: só a despesa paga.
        const pagas = await consulta(
          buildExpenseListWhere(shopA.id, {
            page: 1,
            limit: 50,
            payment: ["paid"],
          })
        );
        expect(pagas.map((r) => r.id)).toEqual([despesaAPaga.id]);

        // 4. `payment=overdue`: não vaza a despesa paga; traz a não paga e vencida.
        const vencidas = await consulta(
          buildExpenseListWhere(shopA.id, {
            page: 1,
            limit: 50,
            payment: ["overdue"],
          })
        );
        expect(vencidas.map((r) => r.id)).toEqual([despesaA.id]);

        // 5. Busca: só as despesas do salão A.
        const busca = await consulta(
          buildExpenseListWhere(shopA.id, {
            page: 1,
            limit: 50,
            search: "Isolamento A",
          })
        );
        expect(busca.map((r) => r.id).sort()).toEqual(
          [despesaA.id, despesaAPaga.id].sort()
        );

        // 6. Período por `referenceDate`: o dia de hoje entra inteiro.
        const periodo = await consulta(
          buildExpenseListWhere(shopA.id, {
            page: 1,
            limit: 50,
            from: diaDeHoje,
            to: diaDeHoje,
          })
        );
        expect(periodo.map((r) => r.id).sort()).toEqual(
          [despesaA.id, despesaAPaga.id].sort()
        );

        // 7. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({ title: { contains: "Isolamento B" } });
        expect(semBarbershop.map((r) => r.id)).toEqual([despesaB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const baseB = await consulta(
          buildExpenseListWhere(shopB.id, { page: 1, limit: 50 })
        );
        expect(baseB.map((r) => r.id)).toEqual([despesaB.id]);
        expect(baseB.every((r) => r.barbershopId === shopB.id)).toBe(true);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});
