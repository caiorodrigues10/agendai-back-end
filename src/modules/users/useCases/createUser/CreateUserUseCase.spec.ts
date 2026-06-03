import { describe, it, expect, beforeEach } from "vitest";
import { CreateUserUseCase } from "./CreateUserUseCase";
import { MockUserRepository } from "@/modules/users/infra/repositories/mocks/MockUserRepository";
import { MockHashProvider } from "@/shared/container/providers/HashProvider/mocks/MockHashProvider";
import { AppError } from "@/shared/errors/AppError";

let useCase: CreateUserUseCase;
let users: MockUserRepository;
let hash: MockHashProvider;

beforeEach(() => {
  users = new MockUserRepository();
  hash = new MockHashProvider();
  useCase = new CreateUserUseCase(users as any, hash as any);
});

describe("CreateUserUseCase", () => {
  it("cria usuário e hash da senha", async () => {
    const user = await useCase.execute({
      name: "John Doe",
      email: "john@example.com",
      password: "123456",
      barbershopId: "shop-1"
    });
    expect(user.id).toBeDefined();
    expect(user.password).toBe("hashed:123456");
    expect(user.role).toBe("EMPLOYEE");
    expect(user.active).toBe(true);
  });

  it("não permite e-mail duplicado", async () => {
    await useCase.execute({
      name: "John",
      email: "john@example.com",
      password: "123456",
      barbershopId: "shop-1"
    });
    await expect(
      useCase.execute({
        name: "Jane",
        email: "john@example.com",
        password: "abcdef",
        barbershopId: "shop-2"
      })
    ).rejects.toBeInstanceOf(AppError);
  });
});
