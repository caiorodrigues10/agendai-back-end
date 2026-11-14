/// <reference types="vitest/globals" />
/**
 * Redefinição de senha: `user.password` e `passwordResetToken.usedAt` precisam
 * mudar juntos — senão o token continua válido com a senha já trocada (ou a
 * senha nova é descartada com o token consumido). O `$transaction([…])`
 * anterior não era atômico com a extensão RLS.
 *
 * O banco guarda SHA-256 do token; o plaintext chega pelo link do e-mail.
 * Consumo é atômico (`updateMany` where `usedAt: null`) e o usuário é
 * localizado por e-mail ATIVO + não removido.
 */
const holder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(holder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  passwordResetToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

const enqueueEmailMock = vi.hoisted(() => ({ enqueueEmail: vi.fn() }));
vi.mock("@/shared/infra/queue/emailQueue", () => enqueueEmailMock);

const revokeSessionsMock = vi.hoisted(() => vi.fn());
vi.mock("../../services/userSessionService", () => ({
  revokeAllSessionsForUser: revokeSessionsMock,
}));

const resetByEmailMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/services/bruteForceProtection", () => ({
  resetByEmail: resetByEmailMock,
}));

const logAccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/services/accessLogService", () => ({
  logAccess: logAccessMock,
}));

import { createHash } from "node:crypto";
import { ResetPasswordUseCase } from "./ResetPasswordUseCase";

const hashProvider = { hash: vi.fn(async () => "hash-novo") } as any;

describe("ResetPasswordUseCase — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.tx = prismaMock;
    rlsMock.mockClear();
    hashProvider.hash.mockResolvedValue("hash-novo");
    enqueueEmailMock.enqueueEmail.mockResolvedValue(undefined);
    revokeSessionsMock.mockResolvedValue({ sessions: 1, tokens: 1 });
    resetByEmailMock.mockResolvedValue(undefined);
    logAccessMock.mockResolvedValue(undefined);
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt-1",
      email: "dono@exemplo.com",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Dono",
      email: "dono@exemplo.com",
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Dono",
      email: "dono@exemplo.com",
    });
  });

  it("troca a senha e gasta o token na MESMA transação", async () => {
    const uc = new ResetPasswordUseCase(hashProvider);

    await uc.execute("token-valido", "NovaSenha123!");

    // Lookup usa SHA-256 do token recebido (plaintext do link).
    const expectedHash = createHash("sha256").update("token-valido").digest("hex");
    expect(prismaMock.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { token: expectedHash },
    });
    expect(rlsMock).toHaveBeenCalledTimes(1);
    // Consumo atômico: só uma requisição consegue usedAt null → now.
    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prt-1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      }),
    );
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "dono@exemplo.com", active: true, deletedAt: null },
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { password: "hash-novo" },
      }),
    );
    // Pós-transação: sessões derrubadas, lockout liberado, auditoria gravada.
    expect(revokeSessionsMock).toHaveBeenCalledWith("user-1", {
      reason: "password-reset",
    });
    expect(resetByEmailMock).toHaveBeenCalledWith("dono@exemplo.com");
    expect(logAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        email: "dono@exemplo.com",
        action: "PASSWORD_RESET",
        success: true,
      }),
    );
    // O e-mail usa o usuário devolvido pela transação.
    expect(enqueueEmailMock.enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "password_changed",
        email: "dono@exemplo.com",
      }),
    );
  });

  it("token inválido não altera nada", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);
    const uc = new ResetPasswordUseCase(hashProvider);

    await expect(uc.execute("token-ruim", "NovaSenha123!")).rejects.toThrow(
      "Token inválido ou expirado",
    );
    expect(rlsMock).not.toHaveBeenCalled();
    expect(prismaMock.passwordResetToken.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(revokeSessionsMock).not.toHaveBeenCalled();
  });

  it("corrida: updateMany não reivindica o token (count 0) → 400, nada muda", async () => {
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    const uc = new ResetPasswordUseCase(hashProvider);

    await expect(uc.execute("token-valido", "NovaSenha123!")).rejects.toThrow(
      "Token já utilizado",
    );
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(revokeSessionsMock).not.toHaveBeenCalled();
    expect(enqueueEmailMock.enqueueEmail).not.toHaveBeenCalled();
  });

  it("usuário ausente/inativo/removido após consumir token → 400", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const uc = new ResetPasswordUseCase(hashProvider);

    await expect(uc.execute("token-valido", "NovaSenha123!")).rejects.toThrow(
      "Token inválido ou expirado",
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(revokeSessionsMock).not.toHaveBeenCalled();
  });
});
