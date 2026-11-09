import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/shared/errors/AppError";
import { ListTeamUseCase } from "./ListTeamUseCase";
import type { IUserRepository } from "../../repositories/IUserRepository";

function makeRepo(): IUserRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByCpf: vi.fn(),
    listActiveByBarbershop: vi.fn(),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  };
}

describe("ListTeamUseCase", () => {
  it("lista a equipe do salão do contexto", async () => {
    const repo = makeRepo();
    const useCase = new ListTeamUseCase(repo);

    await useCase.execute("shop-1", { page: 1, limit: 20 }, {
      role: "OWNER",
      barbershopId: "shop-1",
    });

    expect(repo.list).toHaveBeenCalledWith("shop-1", { page: 1, limit: 20 });
  });

  it("nega OWNER de outro salão (403)", async () => {
    const repo = makeRepo();
    const useCase = new ListTeamUseCase(repo);

    await expect(
      useCase.execute("shop-2", { page: 1, limit: 20 }, {
        role: "OWNER",
        barbershopId: "shop-1",
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(repo.list).not.toHaveBeenCalled();
  });

  it("MASTER_ADMIN pode listar qualquer salão", async () => {
    const repo = makeRepo();
    const useCase = new ListTeamUseCase(repo);

    await useCase.execute("shop-2", { page: 1, limit: 20 }, {
      role: "MASTER_ADMIN",
      barbershopId: null,
    });

    expect(repo.list).toHaveBeenCalledWith("shop-2", { page: 1, limit: 20 });
  });
});
