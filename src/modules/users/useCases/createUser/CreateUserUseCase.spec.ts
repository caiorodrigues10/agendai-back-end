import { describe, it, expect, beforeEach, vi } from "vitest";
import { CreateUserUseCase } from "./CreateUserUseCase";
import { MockUserRepository } from "@/modules/users/infra/repositories/mocks/MockUserRepository";
import { MockHashProvider } from "@/shared/container/providers/HashProvider/mocks/MockHashProvider";
import { AppError } from "@/shared/errors/AppError";

vi.mock("@/shared/services/blockedEntityService", () => ({
  assertCpfNotBlocked: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue(null)
    }
  }
}));

let useCase: CreateUserUseCase;
let users: MockUserRepository;
let hash: MockHashProvider;

beforeEach(() => {
  users = new MockUserRepository();
  hash = new MockHashProvider();
  useCase = new CreateUserUseCase(users as any, hash as any);
  vi.clearAllMocks();
});

describe("CreateUserUseCase", () => {
  it("cria usuário sem CPF sendo MASTER_ADMIN", async () => {
    const user = await useCase.execute({
      name: "Administrador",
      email: "admin@example.com",
      password: "123456",
      role: "MASTER_ADMIN"
    });
    expect(user.id).toBeDefined();
    expect(user.password).toBe("hashed:123456");
    expect(user.role).toBe("MASTER_ADMIN");
    expect(user.cpf).toBeNull();
  });

  it("cria usuário OWNER com CPF válido e normaliza", async () => {
    const user = await useCase.execute({
      name: "Maria Silva",
      email: "maria@example.com",
      password: "123456",
      role: "OWNER",
      barbershopId: "shop-1",
      cpf: "529.982.247-25"
    });
    expect(user.cpf).toBe("52998224725");
  });

  it("lança erro quando OWNER não informa CPF", async () => {
    await expect(
      useCase.execute({
        name: "João",
        email: "joao@example.com",
        password: "123456",
        role: "OWNER",
        barbershopId: "shop-1"
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("não permite e-mail duplicado", async () => {
    await useCase.execute({
      name: "João",
      email: "joao@example.com",
      password: "123456",
      role: "OWNER",
      barbershopId: "shop-1",
      cpf: "52998224725"
    });
    await expect(
      useCase.execute({
        name: "João 2",
        email: "joao@example.com",
        password: "123456",
        role: "OWNER",
        barbershopId: "shop-2",
        cpf: "04500130088"
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejeita CPF bloqueado por inadimplência", async () => {
    const { assertCpfNotBlocked } = await import("@/shared/services/blockedEntityService");
    vi.mocked(assertCpfNotBlocked).mockRejectedValueOnce(
      new AppError(JSON.stringify({ code: "CPF_BLOCKED", message: "CPF bloqueado" }), 403)
    );

    await expect(
      useCase.execute({
        name: "Bloqueado",
        email: "blocked@example.com",
        password: "123456",
        role: "OWNER",
        barbershopId: "shop-1",
        cpf: "52998224725"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});