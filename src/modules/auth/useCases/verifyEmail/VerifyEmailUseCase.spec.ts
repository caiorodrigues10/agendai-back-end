/// <reference types="vitest/globals" />
/**
 * Verificação de e-mail: `user.emailVerified` e `verificationToken.usedAt`
 * precisam mudar juntos. O `$transaction([...])` anterior não era atômico com
 * a extensão RLS (cada escrita roteada para o seu próprio `$transaction`).
 */
const holder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(holder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  verificationToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { update: vi.fn() },
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { VerifyEmailUseCase } from "./VerifyEmailUseCase";
import { AppError } from "@/shared/errors/AppError";

describe("VerifyEmailUseCase — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    holder.tx = prismaMock;
    rlsMock.mockClear();
  });

  it("marca o e-mail verificado e gasta o token na MESMA transação", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      id: "vt-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-1" });
    prismaMock.verificationToken.update.mockResolvedValue({});

    await new VerifyEmailUseCase().execute("token-valido");

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { emailVerified: true },
      })
    );
    expect(prismaMock.verificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "vt-1" } })
    );
  });

  it("token expirado não altera nada", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      id: "vt-1",
      userId: "user-1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(new VerifyEmailUseCase().execute("token-velho")).rejects.toThrow(AppError);
    expect(rlsMock).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("token já usado é rejeitado sem tocar no usuário", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      id: "vt-1",
      userId: "user-1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    await expect(new VerifyEmailUseCase().execute("token-reusado")).rejects.toThrow(
      "Token já utilizado"
    );
    expect(rlsMock).not.toHaveBeenCalled();
  });
});
