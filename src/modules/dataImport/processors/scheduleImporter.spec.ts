import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";

const {
  userFindMany,
  staffScheduleFindUnique,
  staffScheduleCreate,
  staffScheduleUpdate,
  scheduleFindUnique,
  scheduleCreate,
  scheduleUpdate,
  staffTimeOffFindFirst,
  staffTimeOffCreate,
  appointmentCount,
  txMock,
} = vi.hoisted(() => {
  const userFindMany = vi.fn();
  const staffScheduleFindUnique = vi.fn();
  const staffScheduleCreate = vi.fn();
  const staffScheduleUpdate = vi.fn();
  const scheduleFindUnique = vi.fn();
  const scheduleCreate = vi.fn();
  const scheduleUpdate = vi.fn();
  const staffTimeOffFindFirst = vi.fn();
  const staffTimeOffCreate = vi.fn();
  const appointmentCount = vi.fn();

  return {
    userFindMany,
    staffScheduleFindUnique,
    staffScheduleCreate,
    staffScheduleUpdate,
    scheduleFindUnique,
    scheduleCreate,
    scheduleUpdate,
    staffTimeOffFindFirst,
    staffTimeOffCreate,
    appointmentCount,
    txMock: {
      user: { findMany: userFindMany },
      staffSchedule: {
        findUnique: staffScheduleFindUnique,
        create: staffScheduleCreate,
        update: staffScheduleUpdate,
      },
      schedule: { findUnique: scheduleFindUnique, create: scheduleCreate, update: scheduleUpdate },
      staffTimeOff: { findFirst: staffTimeOffFindFirst, create: staffTimeOffCreate },
      appointment: { count: appointmentCount },
    },
  };
});

import {
  importStaffScheduleRow,
  importShopScheduleRow,
  parseIsOpen,
} from "./scheduleImporter";
import { importTimeOffRow, resolveTimeOffStatus } from "./timeOffImporter";
import type { ImportRowContext } from "./importRowContext";
import type { ImportFieldKey } from "../dataImport.types";

const SHOP = "shop-1";
const tx = txMock as unknown as AppTx;

function contexto(
  headers: string[],
  columnMap: Array<[string, number]>,
  overrides: Partial<ImportRowContext> = {},
): ImportRowContext {
  return {
    headers,
    columnMap: new Map(columnMap as Array<[ImportFieldKey, number]>),
    options: {
      updateExisting: true,
      countFinancialValues: false,
      sendReviewInvitations: false,
      includeCase: false,
      replaceExistingSchedules: false,
      importTimeOffAsPending: false,
      updateExistingProducts: false,
      createProductCategories: false,
      sendFiadoReminders: false,
    },
    segment: null,
    actingUserId: "user-1",
    batchId: "batch-1",
    ...overrides,
  };
}

describe("horários da equipe", () => {
  beforeEach(() => {
    userFindMany.mockReset().mockResolvedValue([{ id: "staff-1", name: "João" }]);
    staffScheduleFindUnique.mockReset().mockResolvedValue(null);
    staffScheduleCreate.mockReset().mockResolvedValue({ id: "sched-1" });
    staffScheduleUpdate.mockReset().mockResolvedValue({ id: "sched-1" });
  });

  it("cria o horário do profissional a partir do nome e do dia", async () => {
    const result = await importStaffScheduleRow(
      tx,
      SHOP,
      { Profissional: "João", Dia: "Segunda", Inicio: "09:00", Fim: "18:00" },
      contexto(
        ["Profissional", "Dia", "Inicio", "Fim"],
        [
          ["staffName", 0],
          ["dayOfWeek", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("STAFF_SCHEDULE");
    expect(staffScheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          staffId: "staff-1",
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "18:00",
        }),
      }),
    );
  });

  it("preserva o dia já configurado e explica como trocar", async () => {
    staffScheduleFindUnique.mockResolvedValue({
      id: "sched-9",
      startTime: "10:00",
      endTime: "17:00",
      isActive: true,
    });

    const result = await importStaffScheduleRow(
      tx,
      SHOP,
      { Profissional: "João", Dia: "seg", Inicio: "09:00", Fim: "18:00" },
      contexto(
        ["Profissional", "Dia", "Inicio", "Fim"],
        [
          ["staffName", 0],
          ["dayOfWeek", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
      ),
    );

    expect(result.status).toBe("SKIPPED");
    expect(result.message).toMatch(/substituir os dias/i);
    expect(staffScheduleUpdate).not.toHaveBeenCalled();
  });

  it("substitui o dia quando a opção está ligada e guarda o valor anterior", async () => {
    staffScheduleFindUnique.mockResolvedValue({
      id: "sched-9",
      startTime: "10:00",
      endTime: "17:00",
      isActive: true,
    });

    const result = await importStaffScheduleRow(
      tx,
      SHOP,
      { Profissional: "João", Dia: "Segunda", Inicio: "09:00", Fim: "18:00" },
      contexto(
        ["Profissional", "Dia", "Inicio", "Fim"],
        [
          ["staffName", 0],
          ["dayOfWeek", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
        {
          options: {
            updateExisting: true,
            countFinancialValues: false,
            sendReviewInvitations: false,
            includeCase: false,
            replaceExistingSchedules: true,
            importTimeOffAsPending: false,
            updateExistingProducts: false,
            createProductCategories: false,
            sendFiadoReminders: false,
          },
        },
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.previousState).toEqual({
      before: { startTime: "10:00", endTime: "17:00", isActive: true },
      applied: { startTime: "09:00", endTime: "18:00", isActive: true },
    });
  });

  it("avisa que a pausa de almoço não cabe no sistema", async () => {
    const result = await importStaffScheduleRow(
      tx,
      SHOP,
      {
        Profissional: "João",
        Dia: "Terça",
        Inicio: "09:00",
        Pausa: "13:00",
        Fim: "18:00",
      },
      contexto(
        ["Profissional", "Dia", "Inicio", "Pausa", "Fim"],
        [
          ["staffName", 0],
          ["dayOfWeek", 1],
          ["startTime", 2],
          ["pauseStart", 3],
          ["endTime", 4],
        ],
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.warnings?.[0]).toMatch(/pausa/i);
  });

  it("rejeita profissional que não existe na equipe", async () => {
    userFindMany.mockResolvedValue([]);

    const result = await importStaffScheduleRow(
      tx,
      SHOP,
      { Profissional: "Fantasma", Dia: "Segunda", Inicio: "09:00", Fim: "18:00" },
      contexto(
        ["Profissional", "Dia", "Inicio", "Fim"],
        [
          ["staffName", 0],
          ["dayOfWeek", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
      ),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("staffName");
  });

  it("rejeita nome ambíguo em vez de escolher um profissional", async () => {
    userFindMany.mockResolvedValue([
      { id: "staff-1", name: "João Silva" },
      { id: "staff-2", name: "João Souza" },
    ]);

    const result = await importStaffScheduleRow(
      tx,
      SHOP,
      { Profissional: "João", Dia: "Segunda", Inicio: "09:00", Fim: "18:00" },
      contexto(
        ["Profissional", "Dia", "Inicio", "Fim"],
        [
          ["staffName", 0],
          ["dayOfWeek", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
      ),
    );

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/2 profissionais/);
  });
});

describe("horário do estabelecimento", () => {
  beforeEach(() => {
    scheduleFindUnique.mockReset().mockResolvedValue(null);
    scheduleCreate.mockReset().mockResolvedValue({ id: "shop-sched-1" });
    scheduleUpdate.mockReset().mockResolvedValue({ id: "shop-sched-1" });
  });

  it("cria o dia aberto", async () => {
    const result = await importShopScheduleRow(
      tx,
      SHOP,
      { Dia: "Segunda", Aberto: "Sim", Abre: "09:00", Fecha: "19:00" },
      contexto(
        ["Dia", "Aberto", "Abre", "Fecha"],
        [
          ["dayOfWeek", 0],
          ["isOpen", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ dayOfWeek: 1, isOpen: true, openTime: "09:00" }),
      }),
    );
  });

  it("cria o dia fechado", async () => {
    await importShopScheduleRow(
      tx,
      SHOP,
      { Dia: "Domingo", Aberto: "Não", Abre: "09:00", Fecha: "19:00" },
      contexto(
        ["Dia", "Aberto", "Abre", "Fecha"],
        [
          ["dayOfWeek", 0],
          ["isOpen", 1],
          ["startTime", 2],
          ["endTime", 3],
        ],
      ),
    );

    expect(scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dayOfWeek: 0, isOpen: false }) }),
    );
  });

  it("trata 'não', 'fechado' e 'false' como dia fechado", () => {
    expect(parseIsOpen("não")).toBe(false);
    expect(parseIsOpen("fechado")).toBe(false);
    expect(parseIsOpen("false")).toBe(false);
    expect(parseIsOpen("sim")).toBe(true);
    expect(parseIsOpen("")).toBe(true);
  });
});

describe("folgas", () => {
  beforeEach(() => {
    userFindMany.mockReset().mockResolvedValue([{ id: "staff-1", name: "João" }]);
    staffTimeOffFindFirst.mockReset().mockResolvedValue(null);
    staffTimeOffCreate.mockReset().mockResolvedValue({ id: "timeoff-1" });
    appointmentCount.mockReset().mockResolvedValue(0);
  });

  it("cria a folga aprovada com data pura em UTC", async () => {
    const result = await importTimeOffRow(
      tx,
      SHOP,
      { Profissional: "João", De: "10/11/2026", Até: "12/11/2026", Motivo: "Férias" },
      contexto(
        ["Profissional", "De", "Até", "Motivo"],
        [
          ["staffName", 0],
          ["startDate", 1],
          ["endDate", 2],
          ["timeOffReason", 3],
        ],
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("TIME_OFF");
    expect(staffTimeOffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffId: "staff-1",
          startAt: new Date("2026-11-10T00:00:00.000Z"),
          endAt: new Date("2026-11-12T00:00:00.000Z"),
          status: "APPROVED",
          approvedById: "user-1",
        }),
      }),
    );
  });

  it("cria a folga pendente quando a opção pede", async () => {
    const result = await importTimeOffRow(
      tx,
      SHOP,
      { Profissional: "João", De: "10/11/2026", Até: "10/11/2026" },
      contexto(
        ["Profissional", "De", "Até"],
        [
          ["staffName", 0],
          ["startDate", 1],
          ["endDate", 2],
        ],
        {
          options: {
            updateExisting: true,
            countFinancialValues: false,
            sendReviewInvitations: false,
            includeCase: false,
            replaceExistingSchedules: false,
            importTimeOffAsPending: true,
            updateExistingProducts: false,
            createProductCategories: false,
            sendFiadoReminders: false,
          },
        },
      ),
    );

    expect(result.status).toBe("IMPORTED");
    expect(staffTimeOffCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING", approvedById: null }),
      }),
    );
  });

  it("avisa quantos agendamentos ficam no período e não cancela nada", async () => {
    appointmentCount.mockResolvedValue(3);

    const result = await importTimeOffRow(
      tx,
      SHOP,
      { Profissional: "João", De: "10/11/2026", Até: "12/11/2026" },
      contexto(
        ["Profissional", "De", "Até"],
        [
          ["staffName", 0],
          ["startDate", 1],
          ["endDate", 2],
        ],
      ),
    );

    expect(result.warnings?.[0]).toMatch(/3 agendamento/);
    expect(result.warnings?.[0]).toMatch(/não cancela/i);
  });

  it("rejeita data final antes da inicial", async () => {
    const result = await importTimeOffRow(
      tx,
      SHOP,
      { Profissional: "João", De: "12/11/2026", Até: "10/11/2026" },
      contexto(
        ["Profissional", "De", "Até"],
        [
          ["staffName", 0],
          ["startDate", 1],
          ["endDate", 2],
        ],
      ),
    );

    expect(result.status).toBe("FAILED");
    expect(result.field).toBe("endDate");
  });

  it("resolve a situação pela coluna ou pela opção", () => {
    expect(resolveTimeOffStatus("pendente", false)).toBe("PENDING");
    expect(resolveTimeOffStatus("aprovada", true)).toBe("APPROVED");
    expect(resolveTimeOffStatus("", false)).toBe("APPROVED");
    expect(resolveTimeOffStatus("", true)).toBe("PENDING");
  });
});
