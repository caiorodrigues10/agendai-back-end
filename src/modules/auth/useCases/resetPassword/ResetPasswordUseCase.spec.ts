/// <reference types="vitest/globals" />
/**
 * Redefinição de senha: `user.password` e `passwordResetToken.usedAt` precisam
 * mudar juntos — senão o token continua válido com a senha já trocada (ou a
 * senha nova é descartada com o token consumido). O `$transaction([…])`
 * anterior não era atômico com a extensão RLS.
 */
const holder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(holder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  passwordResetToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { update: vi.fn() },
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

const enqueueEmailMock = vi.hoisted(() => ({ enqueueEmail: vi.fn() }));
vi.mock("@/shared/infra/queue/emailQueue", () => enqueueEmailMock);

import { ResetPasswordUseCase } from "./ResetPasswordUseCase";

const hashProvider = { hash: vi.fn(async () => "hash-novo") } as any;

describe("ResetPasswordUseCase — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.tx = prismaMock;
    rlsMock.mockClear();
    hashProvider.hash.mockResolvedValue("hash-novo");
    enqueueEmailMock.enqueueEmail.mockResolvedValue(undefined);
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt-1",
      email: "dono@exemplo.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Dono",
      email: "dono@exemplo.com",
    });
    prismaMock.passwordResetToken.update.mockResolvedValue({});
  });

  it("troca a senha e gasta o token na MESMA transação", async () => {
    const uc = new ResetPasswordUseCase(hashProvider);

    await uc.execute("token-valido", "NovaSenha123!");

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "dono@exemplo.com" },
        data: { password: "hash-novo" },
      })
    );
    expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prt-1" } })
    );
    // O e-mail usa o usuário devolvido pela transação.
    expect(enqueueEmailMock.enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "password_changed",
        email: "dono@exemplo.com",
      })
    );
  });

  it("token inválido não altera nada", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    const uc = new ResetPasswordUseCase(hashProvider);

    await expect(uc.execute("token-ruim", "NovaSenha123!")).rejects.toThrow(
      "Token inválido ou expirado"
    );
    expect(rlsMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
