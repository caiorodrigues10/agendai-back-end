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
import { buildCommissionListWhere } from "@/modules/commissions/repositories/commissionListWhere";
import { buildUserListWhere } from "@/modules/users/repositories/userListWhere";
import {
  buildServiceListOrderBy,
  buildServiceListWhere,
} from "@/modules/services/repositories/serviceListWhere";
import {
  buildAdminTeamListOrderBy,
  buildAdminTeamListWhere,
} from "@/modules/admin/repositories/adminTeamListWhere";
import {
  lowStockConditionsSql,
  lowStockSql,
  lowStockWhere,
} from "@/modules/products/repositories/lowStockWhere";
import { isLowStock } from "@/modules/products/utils/lowStockRule";
import { buildProductAttention } from "@/modules/products/utils/productAttention";
import { inventoryCommands } from "@/modules/whatsappOwnerBot/commands/inventoryCommands";
import {
  buildSalonClientListWhere,
  buildSalonClientOrderBy,
} from "@/modules/clients/repositories/salonClientListWhere";
import type { ISalonClientListQuery } from "@/modules/clients/dtos/ISalonClientDTO";
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

describe("isolamento por salão — comissões (Postgres real, rollback)", () => {
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

      const profissionalA = await tx.user.create({
        data: {
          name: "Profissional Isolamento A",
          email: `pro-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          barbershopId: shopA.id,
        },
      });
      const profissionalB = await tx.user.create({
        data: {
          name: "Profissional Isolamento B",
          email: `pro-b-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          barbershopId: shopB.id,
        },
      });

      const comissaoA = await tx.commissionEntry.create({
        data: {
          barbershopId: shopA.id,
          serviceId: serviceA.id,
          professionalId: profissionalA.id,
          percentage: 40,
          amount: 20,
        },
      });
      const comissaoB = await tx.commissionEntry.create({
        data: {
          barbershopId: shopB.id,
          serviceId: serviceB.id,
          professionalId: profissionalB.id,
          percentage: 40,
          amount: 30,
        },
      });

      const consulta = (where: unknown) =>
        tx.commissionEntry.findMany({
          where: where as never,
          select: {
            id: true,
            barbershopId: true,
            professionalId: true,
            serviceId: true,
            amount: true,
          },
        });

      // O dia civil do filtro é o do salão (America/Sao_Paulo).
      const diaDeHoje = shopToday("America/Sao_Paulo");

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Sem filtro: só as comissões do salão A.
        const base = await consulta(
          buildCommissionListWhere(shopA.id, {})
        );
        expect(base.map((r) => r.id)).toEqual([comissaoA.id]);
        expect(base.every((r) => r.barbershopId === shopA.id)).toBe(true);

        // 2. professionalId de OUTRO salão: lista vazia, nunca vaza a do B.
        const porProfissionalAlheio = await consulta(
          buildCommissionListWhere(shopA.id, {
            professionalId: profissionalB.id,
          })
        );
        expect(porProfissionalAlheio).toEqual([]);

        // 3. serviceId de OUTRO salão: lista vazia, nunca vaza a do B.
        const porServicoAlheio = await consulta(
          buildCommissionListWhere(shopA.id, {
            serviceId: serviceB.id,
          })
        );
        expect(porServicoAlheio).toEqual([]);

        // 4. professionalId do salão A: só a comissão A.
        const porProfissional = await consulta(
          buildCommissionListWhere(shopA.id, {
            professionalId: profissionalA.id,
          })
        );
        expect(porProfissional.map((r) => r.id)).toEqual([comissaoA.id]);

        // 5. serviceId do salão A: só a comissão A.
        const porServico = await consulta(
          buildCommissionListWhere(shopA.id, {
            serviceId: serviceA.id,
          })
        );
        expect(porServico.map((r) => r.id)).toEqual([comissaoA.id]);

        // 6. Período em `createdAt` (timestamp): o dia de hoje entra inteiro.
        const periodo = await consulta(
          buildCommissionListWhere(shopA.id, {
            from: diaDeHoje,
            to: diaDeHoje,
            timeZone: "America/Sao_Paulo",
          })
        );
        expect(periodo.map((r) => r.id)).toEqual([comissaoA.id]);

        // 7. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({ professionalId: profissionalB.id });
        expect(semBarbershop.map((r) => r.id)).toEqual([comissaoB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const baseB = await consulta(
          buildCommissionListWhere(shopB.id, {})
        );
        expect(baseB.map((r) => r.id)).toEqual([comissaoB.id]);
        expect(baseB.every((r) => r.barbershopId === shopB.id)).toBe(true);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("isolamento por salão — equipe do dono (Postgres real, rollback)", () => {
  it("os filtros só devolvem dados do salão do contexto", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Equipe A ${randomUUID()}`, whatsapp: "11991110001" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Equipe B ${randomUUID()}`, whatsapp: "11991110002" },
      });

      const donoA = await tx.user.create({
        data: {
          name: "Dona Isolamento A",
          email: `dona-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "OWNER",
          barbershopId: shopA.id,
        },
      });
      const funcionarioA = await tx.user.create({
        data: {
          name: "Funcionario Isolamento A",
          email: `func-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          barbershopId: shopA.id,
        },
      });
      const inativoA = await tx.user.create({
        data: {
          name: "Inativo Isolamento A",
          email: `inativo-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          active: false,
          barbershopId: shopA.id,
        },
      });
      // Membro removido (soft-delete): nunca aparece na listagem da equipe.
      const removidoA = await tx.user.create({
        data: {
          name: "Removido Isolamento A",
          email: `removido-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          active: false,
          deletedAt: new Date(),
          barbershopId: shopA.id,
        },
      });
      const funcionarioB = await tx.user.create({
        data: {
          name: "Funcionario Isolamento B",
          email: `func-b-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          barbershopId: shopB.id,
        },
      });

      const consulta = (where: unknown) =>
        tx.user.findMany({
          where: where as never,
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, barbershopId: true, active: true },
        });

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Sem filtro: só a equipe do salão A, sem o membro removido.
        const base = await consulta(buildUserListWhere(shopA.id, {}));
        expect(base.map((u) => u.id)).toEqual([
          donoA.id,
          funcionarioA.id,
          inativoA.id,
        ]);
        expect(base.every((u) => u.barbershopId === shopA.id)).toBe(true);
        expect(base.map((u) => u.id)).not.toContain(removidoA.id);

        // 2. Filtro por papel: só os funcionários.
        const porPapel = await consulta(
          buildUserListWhere(shopA.id, { role: "EMPLOYEE" }),
        );
        expect(porPapel.map((u) => u.id)).toEqual([
          funcionarioA.id,
          inativoA.id,
        ]);

        // 3. Filtro de situação: ativos e inativos.
        const ativos = await consulta(
          buildUserListWhere(shopA.id, { active: true }),
        );
        const inativos = await consulta(
          buildUserListWhere(shopA.id, { active: false }),
        );
        expect(ativos.map((u) => u.id)).toEqual([donoA.id, funcionarioA.id]);
        expect(inativos.map((u) => u.id)).toEqual([inativoA.id]);

        // 4. Busca por nome de OUTRO salão: lista vazia, nunca vaza a do B.
        const buscaAlheia = await consulta(
          buildUserListWhere(shopA.id, { search: "Funcionario Isolamento B" }),
        );
        expect(buscaAlheia).toEqual([]);

        // 5. Busca por nome do próprio salão: acha o membro.
        const buscaPropria = await consulta(
          buildUserListWhere(shopA.id, { search: "Dona Isolamento A" }),
        );
        expect(buscaPropria.map((u) => u.id)).toEqual([donoA.id]);

        // 6. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({ id: funcionarioB.id });
        expect(semBarbershop.map((u) => u.id)).toEqual([funcionarioB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const baseB = await consulta(buildUserListWhere(shopB.id, {}));
        expect(baseB.map((u) => u.id)).toEqual([funcionarioB.id]);
        expect(baseB.every((u) => u.barbershopId === shopB.id)).toBe(true);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("isolamento por salão — serviços (Postgres real, rollback)", () => {
  it("os filtros só devolvem dados do salão do contexto", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Serviços A ${randomUUID()}`, whatsapp: "11991110003" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Serviços B ${randomUUID()}`, whatsapp: "11991110004" },
      });

      const categoriaA = await tx.serviceCategory.create({
        data: { barbershopId: shopA.id, name: "Cortes" },
      });
      const categoriaB = await tx.serviceCategory.create({
        data: { barbershopId: shopB.id, name: "Cortes" },
      });

      const corteA = await tx.service.create({
        data: {
          barbershopId: shopA.id,
          categoryId: categoriaA.id,
          name: "Corte Isolamento A",
          price: 40,
          avgTimeMinutes: 30,
          icon: "scissors",
        },
      });
      const barbaA = await tx.service.create({
        data: {
          barbershopId: shopA.id,
          categoryId: categoriaA.id,
          name: "Barba Isolamento A",
          price: 25,
          avgTimeMinutes: 20,
          icon: "razor",
        },
      });
      // Serviço interno: só a visão staff do próprio salão enxerga.
      const audienciaA = await tx.service.create({
        data: {
          barbershopId: shopA.id,
          name: "Audiencia Isolamento A",
          price: 60,
          avgTimeMinutes: 45,
          icon: "gavel",
          publicBookable: false,
        },
      });
      // Serviço desativado: não aparece na visão pública; a staff continua
      // listando (é lá que o dono acompanha o catálogo).
      const inativoA = await tx.service.create({
        data: {
          barbershopId: shopA.id,
          categoryId: categoriaA.id,
          name: "Inativo Isolamento A",
          price: 35,
          avgTimeMinutes: 25,
          icon: "scissors",
          active: false,
        },
      });
      const corteB = await tx.service.create({
        data: {
          barbershopId: shopB.id,
          categoryId: categoriaB.id,
          name: "Corte Isolamento B",
          price: 70,
          avgTimeMinutes: 50,
          icon: "scissors",
        },
      });

      const consulta = (where: unknown, orderBy?: unknown) =>
        tx.service.findMany({
          where: where as never,
          orderBy: (orderBy ?? { createdAt: "asc" }) as never,
          select: {
            id: true,
            name: true,
            barbershopId: true,
            active: true,
            publicBookable: true,
          },
        });

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Visão pública: só o que o cliente pode agendar — ativo e
        //    agendável, do salão A. O serviço desativado fica de fora.
        const publico = await consulta(buildServiceListWhere(shopA.id, {}));
        expect(publico.map((s) => s.id)).toEqual([corteA.id, barbaA.id]);
        expect(publico.every((s) => s.barbershopId === shopA.id)).toBe(true);
        expect(publico.map((s) => s.id)).not.toContain(audienciaA.id);
        expect(publico.map((s) => s.id)).not.toContain(inativoA.id);
        expect(publico.map((s) => s.id)).not.toContain(corteB.id);

        // 2. Visão staff: inclui o serviço interno **e** o desativado do
        //    próprio salão — a visão staff continua listando inativos.
        const staff = await consulta(
          buildServiceListWhere(shopA.id, {}, { includeInternal: true }),
        );
        expect(staff.map((s) => s.id)).toEqual([
          corteA.id,
          barbaA.id,
          audienciaA.id,
          inativoA.id,
        ]);
        expect(staff.map((s) => s.id)).not.toContain(corteB.id);

        // 3. Filtro por categoria (visão pública).
        const porCategoria = await consulta(
          buildServiceListWhere(shopA.id, { categoryId: categoriaA.id }),
        );
        expect(porCategoria.map((s) => s.id)).toEqual([corteA.id, barbaA.id]);

        // 4. Busca por nome de OUTRO salão: lista vazia, nunca vaza a do B.
        const buscaAlheia = await consulta(
          buildServiceListWhere(shopA.id, { search: "Corte Isolamento B" }),
        );
        expect(buscaAlheia).toEqual([]);

        // 5. Busca por nome do próprio salão: acha o serviço.
        const buscaPropria = await consulta(
          buildServiceListWhere(shopA.id, { search: "Barba Isolamento A" }),
        );
        expect(buscaPropria.map((s) => s.id)).toEqual([barbaA.id]);

        // 6. Situação (visão staff, onde o inativo aparece): `active` filtra.
        const ativos = await consulta(
          buildServiceListWhere(shopA.id, { active: true }, { includeInternal: true }),
        );
        const inativos = await consulta(
          buildServiceListWhere(shopA.id, { active: false }, { includeInternal: true }),
        );
        expect(ativos.map((s) => s.id)).toEqual([
          corteA.id,
          barbaA.id,
          audienciaA.id,
        ]);
        expect(inativos.map((s) => s.id)).toEqual([inativoA.id]);

        // 7. Ordenação: a whitelist produz a coluna pedida (visão staff).
        const porPreco = await consulta(
          buildServiceListWhere(shopA.id, {}, { includeInternal: true }),
          buildServiceListOrderBy({ field: "preco", dir: "asc" }),
        );
        expect(porPreco.map((s) => s.name)).toEqual([
          "Barba Isolamento A",
          "Inativo Isolamento A",
          "Corte Isolamento A",
          "Audiencia Isolamento A",
        ]);

        // 8. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({ id: corteB.id });
        expect(semBarbershop.map((s) => s.id)).toEqual([corteB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const baseB = await consulta(buildServiceListWhere(shopB.id, {}));
        expect(baseB.map((s) => s.id)).toEqual([corteB.id]);
        expect(baseB.every((s) => s.barbershopId === shopB.id)).toBe(true);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("isolamento por salão — equipe interna do admin (Postgres real, rollback)", () => {
  it("o admin da plataforma enxerga a equipe de salões diferentes; o dono só a do seu", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Admin A ${randomUUID()}`, whatsapp: "11991110005" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Admin B ${randomUUID()}`, whatsapp: "11991110006" },
      });

      // Equipe interna da plataforma (não pertence a salão).
      const internoAtivo = await tx.user.create({
        data: {
          name: "Interno Isolamento Ativo",
          email: `interno-ativo-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "MASTER_ADMIN",
        },
      });
      const internoInativo = await tx.user.create({
        data: {
          name: "Interno Isolamento Inativo",
          email: `interno-inativo-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "MASTER_ADMIN",
          active: false,
        },
      });
      const internoRemovido = await tx.user.create({
        data: {
          name: "Interno Isolamento Removido",
          email: `interno-removido-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "MASTER_ADMIN",
          active: false,
          deletedAt: new Date(),
        },
      });

      // Equipe dos salões.
      const donoA = await tx.user.create({
        data: {
          name: "Dono Isolamento A",
          email: `dono-admin-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "OWNER",
          barbershopId: shopA.id,
        },
      });
      const funcionarioA = await tx.user.create({
        data: {
          name: "Funcionario Isolamento A",
          email: `func-admin-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          barbershopId: shopA.id,
        },
      });
      const funcionarioB = await tx.user.create({
        data: {
          name: "Funcionario Isolamento B",
          email: `func-admin-b-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "EMPLOYEE",
          barbershopId: shopB.id,
        },
      });

      const consulta = (where: unknown, orderBy?: unknown) =>
        tx.user.findMany({
          where: where as never,
          orderBy: (orderBy ?? { createdAt: "asc" }) as never,
          select: { id: true, name: true, role: true, barbershopId: true },
        });

      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Escopo padrão do admin: só a equipe interna da plataforma, sem o
        //    membro removido (a base pode ter outros Admins da plataforma).
        const internos = await consulta(buildAdminTeamListWhere({}));
        expect(internos.map((u) => u.id)).toContain(internoAtivo.id);
        expect(internos.map((u) => u.id)).toContain(internoInativo.id);
        expect(internos.map((u) => u.id)).not.toContain(internoRemovido.id);
        expect(internos.map((u) => u.id)).not.toContain(funcionarioA.id);
        expect(internos.map((u) => u.id)).not.toContain(funcionarioB.id);
        expect(internos.every((u) => u.role === "MASTER_ADMIN")).toBe(true);

        // 2. status=inactive: desativado OU removido.
        const inativos = await consulta(
          buildAdminTeamListWhere({ status: "inactive" }),
        );
        expect(inativos.map((u) => u.id)).toContain(internoInativo.id);
        expect(inativos.map((u) => u.id)).toContain(internoRemovido.id);
        expect(inativos.map((u) => u.id)).not.toContain(internoAtivo.id);

        // 3. Com `role`, o admin enxerga salões diferentes: o funcionário do
        //    salão A e o do salão B na mesma listagem (escopo da plataforma).
        const funcionarios = await consulta(
          buildAdminTeamListWhere({ role: "EMPLOYEE" }),
        );
        expect(funcionarios.map((u) => u.id)).toContain(funcionarioA.id);
        expect(funcionarios.map((u) => u.id)).toContain(funcionarioB.id);
        expect(
          funcionarios
            .filter((u) => [funcionarioA.id, funcionarioB.id].includes(u.id))
            .map((u) => u.barbershopId)
            .sort(),
        ).toEqual([shopA.id, shopB.id].sort());

        // 4. Busca do admin em outro salão: encontra (o admin não é preso ao
        //    salão do contexto).
        const busca = await consulta(
          buildAdminTeamListWhere({
            role: "EMPLOYEE",
            search: "Funcionario Isolamento B",
          }),
        );
        expect(busca.map((u) => u.id)).toEqual([funcionarioB.id]);

        // 5. A listagem do DONO continua presa ao salão: só a equipe do A.
        const equipeDonoA = await consulta(buildUserListWhere(shopA.id, {}));
        expect(equipeDonoA.map((u) => u.id)).toEqual([donoA.id, funcionarioA.id]);
        expect(equipeDonoA.map((u) => u.id)).not.toContain(funcionarioB.id);

        // 6. Ordenação: a whitelist produz a coluna pedida.
        const porNome = await consulta(
          buildAdminTeamListWhere({ role: "EMPLOYEE" }),
          buildAdminTeamListOrderBy({ field: "nome", dir: "asc" }),
        );
        const nomes = porNome.map((u) => u.name);
        expect(nomes.indexOf("Funcionario Isolamento A")).toBeLessThan(
          nomes.indexOf("Funcionario Isolamento B"),
        );

        // 7. PROVA de que a RLS não filtra nada neste ambiente: a mesma consulta
        //    SEM o `barbershopId` no `where` enxerga o salão B.
        const semBarbershop = await consulta({ id: funcionarioB.id });
        expect(semBarbershop.map((u) => u.id)).toEqual([funcionarioB.id]);
        expect(semBarbershop[0].barbershopId).toBe(shopB.id);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("isolamento por salão — estoque baixo (Produtos, Postgres real, rollback)", () => {
  it("o resultado de estoque baixo só traz produtos do salão do contexto", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Estoque A ${randomUUID()}`, whatsapp: "11991110007" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Estoque B ${randomUUID()}`, whatsapp: "11991110008" },
      });

      // Salão A: um produto em estoque baixo (ativo), um em estoque baixo
      // (inativo — a definição não filtra `active`) e um com estoque saudável.
      const baixoA = await tx.product.create({
        data: {
          barbershopId: shopA.id,
          name: "Shampoo Isolamento A",
          stockQty: 2,
          minStock: 5,
          trackStock: true,
          active: true,
          salePrice: 20,
        },
      });
      const inativoBaixoA = await tx.product.create({
        data: {
          barbershopId: shopA.id,
          name: "Condicioner Isolamento A Inativo",
          stockQty: 1,
          minStock: 5,
          trackStock: true,
          active: false,
          salePrice: 20,
        },
      });
      const saudavelA = await tx.product.create({
        data: {
          barbershopId: shopA.id,
          name: "Perfume Isolamento A",
          stockQty: 20,
          minStock: 5,
          trackStock: true,
          active: true,
          salePrice: 80,
        },
      });
      // Salão B: também em estoque baixo — nunca pode aparecer para o salão A.
      const baixoB = await tx.product.create({
        data: {
          barbershopId: shopB.id,
          name: "Shampoo Isolamento B",
          stockQty: 1,
          minStock: 5,
          trackStock: true,
          active: true,
          salePrice: 20,
        },
      });

      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Definição em Prisma (field reference): `lowStockWhere`.
        const porWhere = await tx.product.findMany({
          where: lowStockWhere(shopA.id),
          select: { id: true },
          orderBy: { name: "asc" },
        });
        expect(porWhere.map((p) => p.id)).toEqual([inativoBaixoA.id, baixoA.id]);
        expect(porWhere.map((p) => p.id)).not.toContain(baixoB.id);
        expect(porWhere.map((p) => p.id)).not.toContain(saudavelA.id);

        // 2. Mesma definição em SQL: `lowStockSql` — devolve exatamente o
        //    mesmo conjunto (as duas versões têm a mesma regra).
        const porSql = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"::text AS "id" FROM "products"
          WHERE ${lowStockSql(shopA.id)}
          ORDER BY "name" ASC
        `;
        expect(porSql.map((p) => p.id)).toEqual(porWhere.map((p) => p.id));

        // 3. PROVA de que a RLS não filtra nada neste ambiente: a MESMA
        //    comparação sem o salão no filtro enxerga o salão B. O isolamento
        //    vem do filtro da aplicação, não do banco.
        const semSalao = await tx.$queryRaw<Array<{ id: string; barbershopId: string }>>`
          SELECT "id"::text AS "id", "barbershopId"::text AS "barbershopId"
          FROM "products"
          WHERE "trackStock" = true
            AND "minStock" > 0
            AND "stockQty" <= "minStock"
        `;
        expect(semSalao.map((p) => p.id)).toContain(baixoA.id);
        expect(semSalao.map((p) => p.id)).toContain(baixoB.id);
        expect(
          semSalao.find((p) => p.id === baixoB.id)?.barbershopId,
        ).toBe(shopB.id);
      });

      // ── contexto do salão B ────────────────────────────────
      await requestContext.run({ barbershopId: shopB.id } as never, async () => {
        const porWhereB = await tx.product.findMany({
          where: lowStockWhere(shopB.id),
          select: { id: true },
        });
        expect(porWhereB.map((p) => p.id)).toEqual([baixoB.id]);
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("isolamento por salão — clientes (Postgres real, rollback)", () => {
  it("filtros, ordenação e pacote ativo só devolvem dados do salão do contexto", async () => {
    // "Agora" fixo: as regras de data (inatividade, validade de pacote) são
    // determinísticas com esta referência.
    const AGORA = new Date("2026-11-04T12:00:00.000Z");
    const DIA_FUSO = "2026-10-05";

    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Clientes A ${randomUUID()}`, whatsapp: "11993330001" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Clientes B ${randomUUID()}`, whatsapp: "11993330002" },
      });

      const userA = await tx.user.create({
        data: {
          name: "Dono Clientes A",
          email: `clientes-a-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "OWNER",
          barbershopId: shopA.id,
        },
      });
      const userB = await tx.user.create({
        data: {
          name: "Dono Clientes B",
          email: `clientes-b-${randomUUID()}@qa.local`,
          password: "qa-sem-login",
          role: "OWNER",
          barbershopId: shopB.id,
        },
      });

      const serviceA = await tx.service.create({
        data: {
          barbershopId: shopA.id,
          name: `Corte Clientes A ${randomUUID()}`,
          price: 50,
          avgTimeMinutes: 30,
          icon: "scissors",
        },
      });
      const serviceB = await tx.service.create({
        data: {
          barbershopId: shopB.id,
          name: `Corte Clientes B ${randomUUID()}`,
          price: 50,
          avgTimeMinutes: 30,
          icon: "scissors",
        },
      });
      const pacoteServicoA = await tx.servicePackage.create({
        data: {
          barbershopId: shopA.id,
          serviceId: serviceA.id,
          name: "Pacote QA A",
          sessionCount: 5,
          price: 200,
        },
      });
      const pacoteServicoB = await tx.servicePackage.create({
        data: {
          barbershopId: shopB.id,
          serviceId: serviceB.id,
          name: "Pacote QA B",
          sessionCount: 5,
          price: 200,
        },
      });

      // ── clientes do salão A ────────────────────────────────
      const anaA = await tx.salonClient.create({
        data: {
          barbershopId: shopA.id,
          name: "Ana QA",
          whatsapp: "11991110010",
          normalizedWhatsapp: "11991110010",
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
          lastVisitAt: new Date("2026-11-02T12:00:00.000Z"),
        },
      });
      const diegoA = await tx.salonClient.create({
        data: {
          barbershopId: shopA.id,
          name: "Diego QA",
          whatsapp: "11991110012",
          normalizedWhatsapp: "11991110012",
          createdAt: new Date("2026-09-20T12:00:00.000Z"),
          lastVisitAt: new Date("2026-09-20T12:00:00.000Z"),
        },
      });
      const brunoA = await tx.salonClient.create({
        data: {
          barbershopId: shopA.id,
          name: "Bruno QA",
          whatsapp: "11991110011",
          normalizedWhatsapp: "11991110011",
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          lastVisitAt: null,
        },
      });
      // Criado às 03:30Z do dia 05/10: em São Paulo é 00:30 de 05/10; em Nova
      // York é 23:30 de 04/10 — o fuso do salão muda o dia civil.
      const carlaA = await tx.salonClient.create({
        data: {
          barbershopId: shopA.id,
          name: "Carla QA",
          whatsapp: "11991110013",
          normalizedWhatsapp: "11991110013",
          createdAt: new Date(`${DIA_FUSO}T03:30:00.000Z`),
          lastVisitAt: null,
        },
      });

      // ── clientes do salão B ────────────────────────────────
      const anaB = await tx.salonClient.create({
        data: {
          barbershopId: shopB.id,
          name: "Ana QA B",
          whatsapp: "11992220010",
          normalizedWhatsapp: "11992220010",
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
          lastVisitAt: new Date("2026-11-03T12:00:00.000Z"),
        },
      });
      await tx.salonClient.create({
        data: {
          barbershopId: shopB.id,
          name: "Bruno QA B",
          whatsapp: "11992220011",
          normalizedWhatsapp: "11992220011",
          createdAt: new Date("2026-09-01T12:00:00.000Z"),
          lastVisitAt: null,
        },
      });

      // ── fiados ─────────────────────────────────────────────
      // A: fiado em aberto ligado à Ana (entra no filtro).
      await tx.fiado.create({
        data: {
          barbershopId: shopA.id,
          clientId: anaA.id,
          customerName: "Ana QA",
          whatsapp: "11991110010",
          description: "Fiado QA A",
          originalAmount: 100,
          status: "PENDING",
          createdById: userA.id,
        },
      });
      // A: fiado de OUTRO salão ligado à Ana — não pode marcar a Ana como
      // "com fiado em aberto" no salão A.
      await tx.fiado.create({
        data: {
          barbershopId: shopB.id,
          clientId: anaA.id,
          customerName: "Ana QA",
          whatsapp: "11991110010",
          description: "Fiado QA B na Ana A",
          originalAmount: 50,
          status: "PENDING",
          createdById: userB.id,
        },
      });
      // B: fiado em aberto da cliente B — nunca aparece para o salão A.
      await tx.fiado.create({
        data: {
          barbershopId: shopB.id,
          clientId: anaB.id,
          customerName: "Ana QA B",
          whatsapp: "11992220010",
          description: "Fiado QA B",
          originalAmount: 100,
          status: "PENDING",
          createdById: userB.id,
        },
      });

      // ── pacotes ────────────────────────────────────────────
      const basePacote = {
        clientId: anaA.id,
        packageId: pacoteServicoA.id,
        serviceId: serviceA.id,
        totalSessions: 5,
        pricePaid: 200,
        paymentMethod: "pix" as const,
        status: "ACTIVE" as const,
      };
      // Ana: pacote ativo e válido (entra no filtro).
      await tx.clientPackage.create({
        data: {
          ...basePacote,
          barbershopId: shopA.id,
          remainingSessions: 3,
          expiresAt: null,
        },
      });
      // Ana: pacote DEPLETED — não conta.
      await tx.clientPackage.create({
        data: {
          ...basePacote,
          barbershopId: shopA.id,
          remainingSessions: 5,
          status: "DEPLETED",
        },
      });
      // Ana: pacote ativo válido, mas de OUTRO salão — não conta no salão A.
      await tx.clientPackage.create({
        data: {
          ...basePacote,
          barbershopId: shopB.id,
          packageId: pacoteServicoB.id,
          serviceId: serviceB.id,
          remainingSessions: 5,
        },
      });
      // Bruno: pacote ativo vencido — não conta.
      await tx.clientPackage.create({
        data: {
          ...basePacote,
          barbershopId: shopA.id,
          clientId: brunoA.id,
          remainingSessions: 5,
          expiresAt: new Date("2026-11-01T12:00:00.000Z"),
        },
      });
      // Carla: pacote ativo sem sessões restantes — não conta.
      await tx.clientPackage.create({
        data: {
          ...basePacote,
          barbershopId: shopA.id,
          clientId: carlaA.id,
          remainingSessions: 0,
        },
      });
      // B: pacote ativo e válido da cliente B — nunca aparece para o salão A.
      await tx.clientPackage.create({
        data: {
          ...basePacote,
          barbershopId: shopB.id,
          clientId: anaB.id,
          packageId: pacoteServicoB.id,
          serviceId: serviceB.id,
          remainingSessions: 2,
        },
      });

      const consulta = (query: Partial<ISalonClientListQuery> & { page: number; limit: number }) =>
        tx.salonClient.findMany({
          where: buildSalonClientListWhere(query, shopA.id, AGORA),
          orderBy: buildSalonClientOrderBy(query.sort),
          select: { id: true, name: true, lastVisitAt: true, createdAt: true },
        });

      const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();
      const nomes = (rows: Array<{ name: string }>) => rows.map((r) => r.name).sort();

      // ── contexto do salão A ────────────────────────────────
      await requestContext.run({ barbershopId: shopA.id } as never, async () => {
        // 1. Sem filtro: só os clientes do salão A (o `where` carrega o salão).
        const base = await consulta({ page: 1, limit: 50 });
        expect(ids(base)).toEqual(
          ids([anaA, diegoA, brunoA, carlaA]),
        );
        expect(base.every((r) => r.id !== anaB.id)).toBe(true);

        // 2. Busca por nome: não pega o homônimo do salão B.
        const porNome = await consulta({ page: 1, limit: 50, search: "Ana" });
        expect(porNome.map((r) => r.id)).toEqual([anaA.id]);

        // 3. Busca por WhatsApp: o número do salão B não encontra nada em A.
        const porWhatsappB = await consulta({ page: 1, limit: 50, search: "11992220010" });
        expect(porWhatsappB).toEqual([]);

        // 4. Fiado em aberto: só a Ana (fiado de outro salão não marca).
        const comFiado = await consulta({ page: 1, limit: 50, hasOpenFiado: true });
        expect(comFiado.map((r) => r.id)).toEqual([anaA.id]);

        const semFiado = await consulta({ page: 1, limit: 50, hasOpenFiado: false });
        expect(ids(semFiado)).toEqual(ids([diegoA, brunoA, carlaA]));

        // 5. Pacote ativo: só a Ana (ACTIVE + sessões + não vencido + do salão).
        const comPacote = await consulta({ page: 1, limit: 50, hasActivePackage: true });
        expect(comPacote.map((r) => r.id)).toEqual([anaA.id]);

        const semPacote = await consulta({ page: 1, limit: 50, hasActivePackage: false });
        expect(ids(semPacote)).toEqual(ids([diegoA, brunoA, carlaA]));

        // 6. Sem visita há 30 dias: Diego (visita antiga) e Bruno (nunca
        //    visitou, criado há mais de 30 dias); Ana e Carla não entram.
        const inativos = await consulta({ page: 1, limit: 50, inactiveDays: 30 });
        expect(ids(inativos)).toEqual(ids([diegoA, brunoA, carlaA]));

        // 7. Fuso do salão no `createdAt`: 05/10 em São Paulo inclui a Carla;
        //    o mesmo intervalo em Nova York (23:30 de 04/10) não inclui.
        const diaSaoPaulo = await consulta({
          page: 1,
          limit: 50,
          createdFrom: DIA_FUSO,
          createdTo: DIA_FUSO,
          timeZone: "America/Sao_Paulo",
        });
        expect(diaSaoPaulo.map((r) => r.id)).toEqual([carlaA.id]);

        const diaNovaYork = await consulta({
          page: 1,
          limit: 50,
          createdFrom: DIA_FUSO,
          createdTo: DIA_FUSO,
          timeZone: "America/New_York",
        });
        expect(diaNovaYork).toEqual([]);

        // 8. Ordenação por `name` (whitelist) com desempate por `id`.
        const porNomeOrdenado = await consulta({
          page: 1,
          limit: 50,
          sort: { field: "name", dir: "asc" },
        });
        expect(nomes(porNomeOrdenado)).toEqual(["Ana QA", "Bruno QA", "Carla QA", "Diego QA"]);

        // 9. Ordenação por `lastVisitAt`: nulos sempre no fim (nos dois
        //    sentidos), nunca no topo.
        const asc = await consulta({
          page: 1,
          limit: 50,
          sort: { field: "lastVisitAt", dir: "asc" },
        });
        expect(asc[0]?.id).toBe(diegoA.id);
        expect(asc[1]?.id).toBe(anaA.id);
        expect(asc.slice(2).every((r) => r.lastVisitAt === null)).toBe(true);

        const desc = await consulta({
          page: 1,
          limit: 50,
          sort: { field: "lastVisitAt", dir: "desc" },
        });
        expect(desc[0]?.id).toBe(anaA.id);
        expect(desc[1]?.id).toBe(diegoA.id);
        expect(desc.slice(2).every((r) => r.lastVisitAt === null)).toBe(true);

        // 10. PROVA de que a RLS não filtra nada neste ambiente: a MESMA
        //     consulta sem o salão no `where` enxerga o salão B.
        const semSalao = await tx.salonClient.findMany({
          where: { name: { contains: "Ana", mode: "insensitive" } },
          select: { id: true, barbershopId: true },
        });
        expect(semSalao.map((r) => r.id)).toEqual(
          expect.arrayContaining([anaA.id, anaB.id]),
        );
      });

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});

describe("estoque baixo — consistência da definição em todos os pontos", () => {
  it("listagem, dashboard, atenção, recomendações, financeiro, admin e bot usam a mesma definição", async () => {
    await prisma.$transaction(async (tx) => {
      const shopA = await tx.barbershop.create({
        data: { name: `QA Estoque Consistencia A ${randomUUID()}`, whatsapp: "11994440001" },
      });
      const shopB = await tx.barbershop.create({
        data: { name: `QA Estoque Consistencia B ${randomUUID()}`, whatsapp: "11994440002" },
      });

      const criar = (barbershopId: string, nome: string, dados: {
        stockQty: number;
        minStock: number;
        trackStock?: boolean;
        active?: boolean;
      }) =>
        tx.product.create({
          data: {
            barbershopId,
            name: nome,
            salePrice: 10,
            stockQty: dados.stockQty,
            minStock: dados.minStock,
            trackStock: dados.trackStock ?? true,
            active: dados.active ?? true,
            type: "RETAIL",
          },
        });

      // ── fixture do salão A ────────────────────────────────
      const baixoAtivo = await criar(shopA.id, "QA Baixo Ativo", { stockQty: 2, minStock: 5 });
      const baixoInativo = await criar(shopA.id, "QA Baixo Inativo", { stockQty: 2, minStock: 5, active: false });
      const semControle = await criar(shopA.id, "QA Sem Controle de Estoque", { stockQty: 2, minStock: 5, trackStock: false });
      const minimoZero = await criar(shopA.id, "QA Minimo Zero", { stockQty: 0, minStock: 0 });
      const zeradoComMinimo = await criar(shopA.id, "QA Zerado Com Minimo", { stockQty: 0, minStock: 5 });
      const saudavel = await criar(shopA.id, "QA Saudavel", { stockQty: 20, minStock: 5 });
      // ── fixture do salão B (nunca pode aparecer para o salão A) ──
      const baixoB = await criar(shopB.id, "QA Baixo Ativo B", { stockQty: 2, minStock: 5 });

      const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();
      const idsAtencao = (itens: Array<{ productId: string }>) =>
        itens.map((i) => i.productId).sort();
      const BAIXO_DEFINICAO = ids([baixoAtivo, zeradoComMinimo]);

      // ── 1. LISTAGEM (produtos?lowStock=true) ─────────────
      // A listagem não aplica `active` por padrão: entra o que a definição
      // diz, ou seja, também o produto inativo.
      const listagem = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"::text AS "id" FROM products
        WHERE ${lowStockSql(shopA.id)}
        ORDER BY "name" ASC
      `;
      expect(ids(listagem)).toEqual(ids([baixoAtivo, baixoInativo, zeradoComMinimo]));
      expect(ids(listagem)).not.toContain(baixoB.id);

      // Listagem com `active=true` pedido: sai o inativo.
      const listagemAtivos = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"::text AS "id" FROM products
        WHERE ${lowStockSql(shopA.id)} AND "active" = true
        ORDER BY "name" ASC
      `;
      expect(ids(listagemAtivos)).toEqual(BAIXO_DEFINICAO);

      // ── 2. DASHBOARD / RELATÓRIOS (active = true) ─────────
      const produtosDoDashboard = await tx.product.findMany({
        where: { barbershopId: shopA.id, trackStock: true, active: true },
        select: { id: true, name: true, stockQty: true, minStock: true, trackStock: true, type: true },
      });
      const lowStockDashboard = produtosDoDashboard.filter((p) => isLowStock(p));
      expect(ids(lowStockDashboard)).toEqual(BAIXO_DEFINICAO);
      expect(ids(lowStockDashboard)).not.toContain(baixoB.id);

      // ── 3. ATENÇÃO (faltando / repor) ─────────────────────
      const attention = buildProductAttention({ products: produtosDoDashboard, byProduct: [] });
      expect(idsAtencao(attention.missing)).toEqual(BAIXO_DEFINICAO);
      expect(idsAtencao(attention.missing)).not.toContain(baixoB.id);

      // ── 4. RECOMENDAÇÕES (active = true + minStock > 0) ──
      const recomendacoes = await tx.product.findMany({
        where: { ...lowStockWhere(shopA.id), active: true },
        select: { id: true },
      });
      expect(ids(recomendacoes)).toEqual(BAIXO_DEFINICAO);
      expect(ids(recomendacoes)).not.toContain(minimoZero.id);
      expect(ids(recomendacoes)).not.toContain(baixoB.id);

      // ── 5. FINANCEIRO (lowStockCount do painel financeiro) ─
      const financeiro = await tx.$queryRaw<Array<{ lowStockCount: number }>>`
        SELECT (COUNT(*) FILTER (WHERE ${lowStockSql(shopA.id)}))::int AS "lowStockCount"
        FROM products
        WHERE "barbershopId" = ${shopA.id}::uuid
          AND "trackStock" = true
          AND "active" = true
      `;
      expect(financeiro[0]?.lowStockCount).toBe(2);

      // ── 6. ADMIN (contagem por salão, sem carregar produtos) ─
      const adminPorSalao = await tx.$queryRaw<Array<{ barbershopId: string; count: number }>>`
        SELECT "barbershopId"::text AS "barbershopId", COUNT(*)::int AS count
        FROM products
        WHERE ${lowStockConditionsSql()}
          AND "active" = true
          AND "stockQty" > 0
        GROUP BY "barbershopId"
      `;
      const adminA = adminPorSalao.find((row) => row.barbershopId === shopA.id);
      const adminB = adminPorSalao.find((row) => row.barbershopId === shopB.id);
      // No admin, "Estoque baixo" exclui o zerado (que fica no cartão
      // "Estoque zerado"): por isso só o baixo com saldo > 0 conta.
      expect(adminA?.count).toBe(1);
      expect(adminB?.count).toBe(1);
      expect(adminPorSalao.reduce((sum, row) => sum + row.count, 0)).toBe(2);

      // ── 7. BOT DO DONO (comando "estoque") ────────────────
      const listaDoBot = await tx.product.findMany({
        where: {
          barbershopId: shopA.id,
          active: true,
          salePrice: { gt: 0 },
          type: { in: ["RETAIL", "BOTH"] },
          OR: [{ trackStock: false }, { stockQty: { gt: 0 } }],
        },
        select: { id: true, name: true, salePrice: true, stockQty: true, minStock: true, trackStock: true },
        orderBy: { name: "asc" },
        take: 20,
      });
      const comandoEstoque = inventoryCommands.find((command) => command.id === "stock.list");
      expect(comandoEstoque).toBeDefined();
      const ctx = {
        actor: { barbershopId: shopA.id },
        actions: { listProducts: async () => listaDoBot },
      } as never;

      const textoBaixo = await comandoEstoque!.run(ctx, { raw: "estoque", subject: baixoAtivo.name } as never);
      expect(textoBaixo.text).toContain("2 em estoque");
      expect(textoBaixo.text).toContain("— estoque baixo!");

      // Produto que não controla estoque: não é "estoque baixo" (definição).
      const textoSemControle = await comandoEstoque!.run(ctx, { raw: "estoque", subject: semControle.name } as never);
      expect(textoSemControle.text).not.toContain("— estoque baixo!");

      // Produto saudável: idem.
      const textoSaudavel = await comandoEstoque!.run(ctx, { raw: "estoque", subject: saudavel.name } as never);
      expect(textoSaudavel.text).not.toContain("— estoque baixo!");

      // ── 8. PROVA DE ISOLAMENTO ────────────────────────────
      // O salão B tem o mesmo produto em estoque baixo e nunca pode vazar
      // para nenhum ponto do salão A.
      expect(ids(listagem)).not.toContain(baixoB.id);
      expect(ids(lowStockDashboard)).not.toContain(baixoB.id);
      expect(idsAtencao(attention.missing)).not.toContain(baixoB.id);
      expect(ids(recomendacoes)).not.toContain(baixoB.id);
      expect(listaDoBot.map((p) => p.id)).not.toContain(baixoB.id);

      // A RLS NÃO é efetiva no dev (papel SUPERUSER/BYPASSRLS): sem o filtro
      // de salão, a MESMA consulta enxerga o produto do salão B.
      const semFiltroDeSalao = await tx.product.findMany({
        where: { ...lowStockWhere(shopA.id), barbershopId: undefined },
        select: { id: true, barbershopId: true },
      });
      expect(semFiltroDeSalao.map((r) => r.id)).toEqual(
        expect.arrayContaining([baixoAtivo.id, baixoB.id]),
      );

      throw new Error("ROLLBACK_ISOLATION");
    }).catch((error: unknown) => {
      expect(String((error as Error)?.message)).toContain("ROLLBACK_ISOLATION");
    });
  });
});
