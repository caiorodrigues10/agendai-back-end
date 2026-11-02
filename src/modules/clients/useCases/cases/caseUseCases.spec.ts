import { describe, expect, it, vi } from "vitest";
import { CreateClientCaseUseCase, UpdateClientCaseUseCase } from "./caseUseCases";
import type { IClientCaseRepository } from "../../repositories/ClientCaseRepository";
import type { CaseBacklogRepository } from "@/modules/cases/repositories/CaseBacklogRepository";

const SHOP = "shop-1";
const CASE_ID = "case-1";

const owner = { id: "user-1", role: "OWNER", barbershopId: SHOP };
const outsider = { id: "user-2", role: "OWNER", barbershopId: "shop-2" };

type FakeRepo = {
  findById: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
};

function makeRepo(overrides: Record<string, unknown> = {}): FakeRepo {
  return {
    findById: vi.fn(async () => ({
      id: CASE_ID,
      barbershopId: SHOP,
      clientId: "client-1",
      nickname: "Ação de cobrança",
    })),
    update: vi.fn(async () => ({
      id: CASE_ID,
      barbershopId: SHOP,
      clientId: "client-1",
      nickname: "Ação de cobrança",
      awardedAmount: 50000,
    })),
    ...overrides,
  };
}

type FakeBacklogRepo = {
  recalculateSuccessFeesForCase: ReturnType<typeof vi.fn>;
  [key: string]: unknown;
};

function makeBacklogRepo(overrides: Record<string, unknown> = {}): FakeBacklogRepo {
  return {
    recalculateSuccessFeesForCase: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("UpdateClientCaseUseCase", () => {
  it("recalcula os honorários de êxito quando o valor obtido do caso muda", async () => {
    const repo = makeRepo();
    const backlog = makeBacklogRepo();
    const useCase = new UpdateClientCaseUseCase(repo as unknown as IClientCaseRepository, backlog as unknown as CaseBacklogRepository);

    await useCase.execute(CASE_ID, SHOP, { awardedAmount: 50000 }, owner);

    expect(backlog.recalculateSuccessFeesForCase).toHaveBeenCalledWith(SHOP, CASE_ID);
  });

  it("não recalcula quando o valor obtido não muda", async () => {
    const repo = makeRepo();
    const backlog = makeBacklogRepo();
    const useCase = new UpdateClientCaseUseCase(repo as unknown as IClientCaseRepository, backlog as unknown as CaseBacklogRepository);

    await useCase.execute(CASE_ID, SHOP, { nickname: "Novo apelido" }, owner);

    expect(backlog.recalculateSuccessFeesForCase).not.toHaveBeenCalled();
  });

  it("não falha a atualização do caso quando a recalculação falha", async () => {
    const repo = makeRepo();
    const backlog = makeBacklogRepo({
      recalculateSuccessFeesForCase: vi.fn(async () => {
        throw new Error("falha no banco");
      }),
    });
    const useCase = new UpdateClientCaseUseCase(repo as unknown as IClientCaseRepository, backlog as unknown as CaseBacklogRepository);

    const result = await useCase.execute(CASE_ID, SHOP, { awardedAmount: 50000 }, owner);

    expect(result.awardedAmount).toBe(50000);
    expect(repo.update).toHaveBeenCalled();
  });

  it("recusa usuário de outra loja", async () => {
    const useCase = new UpdateClientCaseUseCase(makeRepo() as unknown as IClientCaseRepository, makeBacklogRepo() as unknown as CaseBacklogRepository);

    await expect(
      useCase.execute(CASE_ID, SHOP, { awardedAmount: 100 }, outsider)
    ).rejects.toThrow(/Acesso negado/);
  });
});

describe("CreateClientCaseUseCase", () => {
  const createdCase = {
    id: CASE_ID,
    barbershopId: SHOP,
    clientId: "client-1",
    nickname: "Ação de cobrança",
    caseNumber: "0000001-78.2020.8.26.0100",
    active: true,
    status: "LEAD" as const,
    priority: "NORMAL" as const,
    shareWithClient: false,
    openedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function makeCreateRepo(overrides: Record<string, unknown> = {}) {
    return {
      create: vi.fn(async (data: Record<string, unknown>) => ({ ...createdCase, ...data })),
      findByCaseNumber: vi.fn(async () => []),
      ...overrides,
    };
  }

  it("avisa quando já existe processo com o mesmo número no escritório", async () => {
    const repo = makeCreateRepo({
      findByCaseNumber: vi.fn(async () => [
        { id: "case-existing", nickname: "Outro processo" },
      ]),
    });
    const useCase = new CreateClientCaseUseCase(repo as unknown as IClientCaseRepository);

    const result = await useCase.execute(
      {
        barbershopId: SHOP,
        clientId: "client-1",
        nickname: "Ação de cobrança",
        caseNumber: createdCase.caseNumber,
      },
      owner
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_CASE_NUMBER" }),
      ])
    );
  });

  it("cria o caso mesmo quando a checagem de duplicata falha", async () => {
    const repo = makeCreateRepo({
      findByCaseNumber: vi.fn(async () => {
        throw new Error("banco indisponível");
      }),
    });
    const useCase = new CreateClientCaseUseCase(repo as unknown as IClientCaseRepository);

    const result = await useCase.execute(
      {
        barbershopId: SHOP,
        clientId: "client-1",
        nickname: "Ação de cobrança",
        caseNumber: createdCase.caseNumber,
      },
      owner
    );

    expect(result.id).toBe(CASE_ID);
    expect(result.warnings ?? []).toEqual([]);
  });

  it("avisa quando o dígito verificador do CNJ está errado, sem bloquear", async () => {
    const repo = makeCreateRepo();
    const useCase = new CreateClientCaseUseCase(repo as unknown as IClientCaseRepository);

    const result = await useCase.execute(
      {
        barbershopId: SHOP,
        clientId: "client-1",
        nickname: "Ação de cobrança",
        caseNumber: "0000001-02.2020.8.26.0100",
      },
      owner
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CNJ_CHECK_DIGIT" }),
      ])
    );
  });

  it("não avisa quando o número é único e o dígito confere", async () => {
    const repo = makeCreateRepo();
    const useCase = new CreateClientCaseUseCase(repo as unknown as IClientCaseRepository);

    const result = await useCase.execute(
      {
        barbershopId: SHOP,
        clientId: "client-1",
        nickname: "Ação de cobrança",
        caseNumber: createdCase.caseNumber,
      },
      owner
    );

    expect(result.warnings ?? []).toEqual([]);
  });
});
