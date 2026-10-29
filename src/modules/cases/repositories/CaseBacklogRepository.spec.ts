import { beforeEach, describe, expect, it, vi } from "vitest";

const { caseTransferUpdate, caseTransferFindFirst, clientSalonLinkFindMany, clientCaseFindMany } =
  vi.hoisted(() => ({
    caseTransferUpdate: vi.fn(),
    caseTransferFindFirst: vi.fn(),
    clientSalonLinkFindMany: vi.fn(),
    clientCaseFindMany: vi.fn(),
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
