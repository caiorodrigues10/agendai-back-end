/// <reference types="vitest/globals" />
import type { FastifyInstance } from "fastify";

// Mocks para o service de preferências — não precisamos de banco real.
const mockSalonEmailPreferenceFindUnique = vi.fn();
const mockSalonEmailPreferenceFindMany = vi.fn();
const mockSalonEmailPreferenceUpsert = vi.fn();
const mockBarbershopEmailSettingsFindUnique = vi.fn();
const mockBarbershopEmailSettingsUpsert = vi.fn();
const mockUserFindFirst = vi.fn();
const mockUserFindMany = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    salonEmailPreference: {
      findUnique: (...a: unknown[]) => mockSalonEmailPreferenceFindUnique(...a),
      findMany: (...a: unknown[]) => mockSalonEmailPreferenceFindMany(...a),
      upsert: (...a: unknown[]) => mockSalonEmailPreferenceUpsert(...a),
    },
    barbershopEmailSettings: {
      findUnique: (...a: unknown[]) => mockBarbershopEmailSettingsFindUnique(...a),
      upsert: (...a: unknown[]) => mockBarbershopEmailSettingsUpsert(...a),
    },
    user: {
      findFirst: (...a: unknown[]) => mockUserFindFirst(...a),
      findMany: (...a: unknown[]) => mockUserFindMany(...a),
    },
  },
}));

process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-secret-nao-usar-em-producao-0123456789abcdef0123456789abcdef";

// Importação real de crypto — mocking é desnecessário aqui (o serviço já usa node:crypto)
import {
  canReceiveEmail,
  setEmailPreference,
  getEmailRecipients,
  emailCategoryLabel,
  verifyUnsubscribeToken,
  signUnsubscribeToken,
} from "../services/emailPreferenceService";
import { AppError } from "@/shared/errors/AppError";

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// canReceiveEmail
// ---------------------------------------------------------------------------

describe("canReceiveEmail", () => {
  it("ESSENTIAL é sempre enviada, sem checar o banco", async () => {
    expect(await canReceiveEmail(USER_ID, SHOP_ID, "ESSENTIAL")).toBe(true);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(mockSalonEmailPreferenceFindUnique).not.toHaveBeenCalled();
  });

  it("OPERATION é permitido por padrão quando não há registro", async () => {
    mockUserFindFirst.mockResolvedValue({ id: USER_ID });
    mockSalonEmailPreferenceFindUnique.mockResolvedValue(null);
    expect(await canReceiveEmail(USER_ID, SHOP_ID, "OPERATION")).toBe(true);
  });

  it("OPERATION bloqueia quando o usuário desligou a categoria", async () => {
    mockUserFindFirst.mockResolvedValue({ id: USER_ID });
    mockSalonEmailPreferenceFindUnique.mockResolvedValue({ enabled: false });
    expect(await canReceiveEmail(USER_ID, SHOP_ID, "OPERATION")).toBe(false);
  });

  it("MARKETING é sempre false quando o usuário não optou explicitamente", async () => {
    mockUserFindFirst.mockResolvedValue({ id: USER_ID });
    mockSalonEmailPreferenceFindUnique.mockResolvedValue(null);
    expect(await canReceiveEmail(USER_ID, SHOP_ID, "MARKETING")).toBe(false);
  });

  it("MARKETING é true quando o usuário optou", async () => {
    mockUserFindFirst.mockResolvedValue({ id: USER_ID });
    mockSalonEmailPreferenceFindUnique.mockResolvedValue({ enabled: true });
    expect(await canReceiveEmail(USER_ID, SHOP_ID, "MARKETING")).toBe(true);
  });

  it("retorna false quando o usuário não pertence ao salão (isolamento)", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    expect(await canReceiveEmail(USER_ID, SHOP_ID, "OPERATION")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEmailRecipients
// ---------------------------------------------------------------------------

describe("getEmailRecipients", () => {
  it("exclui clientes finais e inclui apenas OWNER + EMPLOYEE", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "owner-1", email: "dono@salao.com", name: "Dono" },
      { id: "staff-1", email: "func@salao.com", name: "Funcionário" },
    ]);
    mockSalonEmailPreferenceFindMany.mockResolvedValue([]);

    const recipients = await getEmailRecipients(SHOP_ID, "OPERATION");
    expect(recipients).toHaveLength(2);
    expect(recipients.map((r) => r.email)).toContain("dono@salao.com");
    expect(recipients.map((r) => r.email)).toContain("func@salao.com");
  });

  it("exclui usuários com preferência desligada na categoria", async () => {
    mockUserFindMany.mockResolvedValue([
      { id: "owner-1", email: "dono@salao.com", name: "Dono" },
      { id: "staff-2", email: "func@salao.com", name: "Funcionário" },
    ]);
    mockSalonEmailPreferenceFindMany.mockResolvedValue([
      { userId: "staff-2", enabled: false },
    ]);

    const recipients = await getEmailRecipients(SHOP_ID, "OPERATION");
    expect(recipients).toHaveLength(1);
    expect(recipients[0].email).toBe("dono@salao.com");
  });
});

// ---------------------------------------------------------------------------
// setEmailPreference
// ---------------------------------------------------------------------------

describe("setEmailPreference", () => {
  it("não permite desligar ESSENTIAL", async () => {
    await expect(
      setEmailPreference(USER_ID, SHOP_ID, "ESSENTIAL", false)
    ).rejects.toMatchObject({ message: expect.stringContaining("obrigatórios") });
  });

  it("grava e confirma a atualização para categorias opcionais", async () => {
    mockUserFindFirst.mockResolvedValue({ id: USER_ID });
    mockSalonEmailPreferenceUpsert.mockResolvedValue({ enabled: false });

    await setEmailPreference(USER_ID, SHOP_ID, "OPERATION", false);
    expect(mockSalonEmailPreferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ enabled: false }),
        update: expect.objectContaining({ enabled: false }),
      })
    );
  });

  it("não persiste se o usuário não pertencer ao salão", async () => {
    mockUserFindFirst.mockResolvedValue(null);
    await expect(
      setEmailPreference(USER_ID, SHOP_ID, "OPERATION", false)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ---------------------------------------------------------------------------
// Token de descadastro
// ---------------------------------------------------------------------------

describe("verifyUnsubscribeToken", () => {
  const payload = {
    userId: USER_ID,
    barbershopId: SHOP_ID,
    category: "MARKETING" as const,
    purpose: "email-unsubscribe" as const,
    iat: 1700000000000,
    exp: Date.now() + 3600_000, // 1h no futuro
    jti: "abc123",
  };

  it("aceita token válido", () => {
    const token = signUnsubscribeToken({ ...payload });
    expect(() => verifyUnsubscribeToken(token)).not.toThrow();
  });

  it("rejeita token sem exp (expiração)", () => {
    const bad = { ...payload, exp: 0 };
    const token = "sig." + Buffer.from(JSON.stringify(bad)).toString("base64url");
    expect(() => verifyUnsubscribeToken(token)).toThrow(AppError);
  });

  it("rejeita token com purpose errado", () => {
    const bad = { ...payload, purpose: "admin-login" };
    const token = "sig." + Buffer.from(JSON.stringify(bad)).toString("base64url");
    expect(() => verifyUnsubscribeToken(token)).toThrow(AppError);
  });

  it("rejeita assinatura que não confere", () => {
    const token = "wrong_sig." + Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => verifyUnsubscribeToken(token)).toThrow(AppError);
  });

  it("rejeita token com JSON corrompido", () => {
    expect(() => verifyUnsubscribeToken("sig.!!!notbase64!!!")).toThrow(AppError);
  });
});

// ---------------------------------------------------------------------------
// emailCategoryLabel
// ---------------------------------------------------------------------------

describe("emailCategoryLabel", () => {
  it("traduz categorias para português", () => {
    expect(emailCategoryLabel("ESSENTIAL")).toBe("Segurança da conta");
    expect(emailCategoryLabel("OPERATION")).toBe("Resumos e alertas operacionais");
    expect(emailCategoryLabel("MARKETING")).toBe("Novidades e conteúdo");
  });
});
