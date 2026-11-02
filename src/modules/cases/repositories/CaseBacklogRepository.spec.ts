import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  caseTransferUpdate,
  caseTransferFindFirst,
  clientSalonLinkFindMany,
  clientCaseFindMany,
  caseSuccessFeeFindMany,
} = vi.hoisted(() => ({
  caseTransferUpdate: vi.fn(),
  caseTransferFindFirst: vi.fn(),
  clientSalonLinkFindMany: vi.fn(),
  clientCaseFindMany: vi.fn(),
  caseSuccessFeeFindMany: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    caseTransfer: {
      update: caseTransferUpdate,
      findFirst: caseTransferFindFirst,
    },
    clientSalonLink: {
      findMany: clientSalonLinkFindMany,
    },
    clientCase: {
      findMany: clientCaseFindMany,
    },
    caseSuccessFee: {
      findMany: caseSuccessFeeFindMany,
    },
  },
}));

import { CaseBacklogRepository } from "./CaseBacklogRepository";

const ORIGIN = "shop-origem";
const TARGET = "shop-destino";
const TRANSFER = "transfer-1";

function transferRow() {
  return {
    id: TRANSFER,
    barbershopId: ORIGIN,
    caseId: "case-1",
    targetBarbershopId: TARGET,
    status: "PENDING",
    acceptedByUserId: null,
    acceptedAt: null,
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    case: { id: "case-1", nickname: "Ação", title: "Ação" },
    originShop: { id: ORIGIN, name: "Unidade 1" },
    targetShop: { id: TARGET, name: "Unidade 2" },
  };
}

describe("CaseBacklogRepository.updateTransfer", () => {
  const repository = new CaseBacklogRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    caseTransferUpdate.mockResolvedValue(transferRow());
  });

  it("encontra a transferência quando a unidade que responde é a de destino", async () => {
    await repository.updateTransfer(TARGET, TRANSFER, { status: "ACCEPTED" });

    const args = caseTransferUpdate.mock.calls[0][0];
    expect(args.where.id).toBe(TRANSFER);
    expect(args.where.OR).toEqual([
      { barbershopId: TARGET },
      { targetBarbershopId: TARGET },
    ]);
  });

  it("encontra a transferência quando a unidade que responde é a de origem", async () => {
    await repository.updateTransfer(ORIGIN, TRANSFER, { status: "REJECTED" });

    const args = caseTransferUpdate.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { barbershopId: ORIGIN },
      { targetBarbershopId: ORIGIN },
    ]);
  });
});

describe("CaseBacklogRepository.listClientPortalCasesByIdentity", () => {
  const repository = new CaseBacklogRepository();

  beforeEach(() => {
    vi.clearAllMocks();
    clientSalonLinkFindMany.mockResolvedValue([
      { barbershopId: "shop-1", salonClientId: "client-1" },
    ]);
    clientCaseFindMany.mockResolvedValue([]);
  });

  it("filtra appointments por DateTime, não por string de data", async () => {
    await repository.listClientPortalCasesByIdentity("identity-1", 20);

    const args = clientCaseFindMany.mock.calls[0][0];
    const where = args.select.appointments.where;
    // `Appointment.date` é @db.Date: o filtro precisa de um Date completo.
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(Number.isNaN(where.date.gte.getTime())).toBe(false);
  });

  it("só devolve casos marcados para o cliente", async () => {
    await repository.listClientPortalCasesByIdentity("identity-1", 20);

    const args = clientCaseFindMany.mock.calls[0][0];
    expect(args.where.shareWithClient).toBe(true);
  });
});

describe("CaseBacklogRepository.successFeesReport", () => {
  const repository = new CaseBacklogRepository();

  it("filtra pelo salão e consolida o relatório de honorários", async () => {
    caseSuccessFeeFindMany.mockResolvedValue([
      {
        id: "fee-1",
        barbershopId: "shop-a",
        caseId: "case-1",
        case: {
          id: "case-1",
          nickname: "Ação de cobrança",
          caseNumber: "0000001-78.2020.8.26.0100",
          client: { name: "Maria" },
        },
        percent: 20,
        baseAmount: 10000,
        amount: 2000,
        installments: 1,
        status: "PENDING",
        dueDate: null,
        paidAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "fee-2",
        barbershopId: "shop-a",
        caseId: "case-2",
        case: {
          id: "case-2",
          nickname: "Inventário",
          caseNumber: null,
          client: { name: "João" },
        },
        percent: 10,
        baseAmount: 5000,
        amount: 500,
        installments: 1,
        status: "PAID",
        dueDate: null,
        paidAt: new Date(),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const report = await repository.successFeesReport("shop-a");

    expect(caseSuccessFeeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barbershopId: "shop-a" } })
    );
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toEqual(
      expect.objectContaining({ clientName: "Maria", caseNumber: "0000001-78.2020.8.26.0100" })
    );
    expect(report.summary.totalAmount).toBe(2500);
    expect(report.summary.receivableAmount).toBe(2000);
    expect(report.summary.paidAmount).toBe(500);
  });
});
