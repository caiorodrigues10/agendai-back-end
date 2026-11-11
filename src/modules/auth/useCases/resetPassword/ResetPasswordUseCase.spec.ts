/// <reference types="vitest/globals" />
/**
 * Redefinição de senha: o token é consumido ATOMICAMENTE (updateMany com
 * `usedAt: null`), o usuário é vinculado só se ATIVO e não removido, e a troca
 * derruba sessões/refresh tokens antigos, libera o lockout e audita o evento.
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

const revokeSessionsMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../../services/userSessionService", () => ({
  revokeAllSessionsForUser: revokeSessionsMock,
}));

const resetByEmailMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/shared/services/bruteForceProtection", () => ({
  resetByEmail: resetByEmailMock,
}));

const logAccessMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/services/accessLogService", () => ({
  logAccess: logAccessMock,
}));

import { ResetPasswordUseCase } from "./ResetPasswordUseCase";

const hashProvider = { hash: vi.fn(async () => "hash-novo") } as any;

const validTokenRow = {
  id: "prt-1",
  email: "dono@exemplo.com",
  usedAt: null,
  expiresAt: new Date(Date.now() + 3_600_000),
};

describe("ResetPasswordUseCase — consumo atômico, usuário ativo e revogação", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.tx = prismaMock;
    rlsMock.mockClear();
    hashProvider.hash.mockResolvedValue("hash-novo");
    enqueueEmailMock.enqueueEmail.mockResolvedValue(undefined);
    revokeSessionsMock.mockResolvedValue(undefined);
    resetByEmailMock.mockResolvedValue(undefined);
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(validTokenRow);
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

  it("reivindica o token (usedAt null → now), troca a senha, revoga sessões e audita", async () => {
    const uc = new ResetPasswordUseCase(hashProvider);

    await uc.execute("token-valido", "NovaSenha123!");

    expect(rlsMock).toHaveBeenCalledTimes(1);
    // Consumo atômico: só casa com tokens ainda não usados.
    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prt-1", usedAt: null },
        data: { usedAt: expect.any(Date) },
      })
    );
    // Usuário vinculado apenas se ativo e não removido.
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "dono@exemplo.com", active: true, deletedAt: null },
      })
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { password: "hash-novo" },
      })
    );
    // Revogação de sessões/refresh tokens antigos + liberação de lockout.
    expect(revokeSessionsMock).toHaveBeenCalledWith("user-1", {
      reason: "password-reset",
    });
    expect(resetByEmailMock).toHaveBeenCalledWith("dono@exemplo.com");
    // Auditoria.
    expect(logAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "PASSWORD_RESET",
        success: true,
      })
    );
    // E-mail usa o usuário devolvido pela transação.
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

  it("token já consumido por outra requisição (claimed.count = 0) → 400 sem tocar no usuário", async () => {
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    const uc = new ResetPasswordUseCase(hashProvider);

    await expect(uc.execute("token-valido", "NovaSenha123!")).rejects.toThrow(
      "Token já utilizado"
    );
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(revokeSessionsMock).not.toHaveBeenCalled();
    expect(logAccessMock).not.toHaveBeenCalled();
  });

  it("usuário inativo/removido (ou e-mail trocado) → 400 e senha NÃO é alterada", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const uc = new ResetPasswordUseCase(hashProvider);

    await expect(uc.execute("token-valido", "NovaSenha123!")).rejects.toThrow(
      "Token inválido ou expirado"
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(revokeSessionsMock).not.toHaveBeenCalled();
    expect(logAccessMock).not.toHaveBeenCalled();
    expect(enqueueEmailMock.enqueueEmail).not.toHaveBeenCalled();
  });
});
