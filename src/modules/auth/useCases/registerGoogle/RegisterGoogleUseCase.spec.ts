/// <reference types="vitest/globals" />

const mockVerifyIdToken = vi.fn();

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = mockVerifyIdToken;
  },
}));

const mockFindFirst = vi.fn();
const mockTxBarbershopCreate = vi.fn();
const mockTxUserCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
    barbershop: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
    refreshToken: {
      deleteMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/shared/services/blockedEntityService", () => ({
  assertCpfNotBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/subscriptions/utils/checkBarbershopAccess", () => ({
  checkCnpjAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/infra/queue", () => ({
  enqueueEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/modules/referrals/services/referralService", () => ({
  attachReferralOnRegister: vi.fn().mockResolvedValue(undefined),
  ensureReferralCode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/services/emailValidationService", () => ({
  validateEmail: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/shared/utils/cpfUtils", () => ({
  normalizeCpf: (v: string) => v.replace(/\D/g, ""),
  isValidCpf: () => true,
  isValidCnpj: () => true,
  normalizeCnpj: (v: string) => v.replace(/\D/g, ""),
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/shared/services/geocodeCity", () => ({
  geocodeCity: vi.fn(),
}));

import { RegisterGoogleUseCase, IRegisterGoogleDTO } from "./RegisterGoogleUseCase";
import { enqueueEmail } from "@/shared/infra/queue";

const BASE_INPUT: IRegisterGoogleDTO = {
  idToken: "valid-google-token",
  ownerName: "João Silva",
  cpf: "45317829709",
  barbershopName: "Barber Test",
  whatsapp: "11999998888",
  termsVersion: "1.0",
  termsAccepted: true,
  marketingOptIn: false,
  lgpdConsent: true,
};

function mockGooglePayload(overrides: Record<string, unknown> = {}) {
  mockVerifyIdToken.mockResolvedValue({
    getPayload: () => ({
      email: "joao@test.com",
      email_verified: true,
      sub: "google-sub-1",
      ...overrides,
    }),
  });
}

function mockTransactionSuccess() {
  mockFindFirst.mockResolvedValue(null);
  mockTransaction.mockImplementation(async (fn: any) => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      barbershop: { create: mockTxBarbershopCreate },
      serviceCategory: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "sc-1" }),
      },
      service: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      schedule: { createMany: vi.fn().mockResolvedValue({}) },
      expenseCategory: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      productCategory: { createMany: vi.fn().mockResolvedValue({}) },
      appointmentPolicy: { upsert: vi.fn().mockResolvedValue({}) },
      barbershopEmailSettings: { upsert: vi.fn().mockResolvedValue({}) },
      notificationPreference: { createMany: vi.fn().mockResolvedValue({}) },
      profitSettings: { upsert: vi.fn().mockResolvedValue({}) },
      loyaltyProgram: { upsert: vi.fn().mockResolvedValue({}) },
      user: { create: mockTxUserCreate },
    };
    mockTxBarbershopCreate.mockResolvedValue({ id: "barbershop-1", name: "Barber Test" });
    mockTxUserCreate.mockResolvedValue({
      id: "user-1",
      name: "João Silva",
      email: "joao@test.com",
      role: "OWNER",
      barbershopId: "barbershop-1",
      cpf: "45317829709",
    });
    return fn(tx);
  });
}

describe("RegisterGoogleUseCase", () => {
  let useCase: RegisterGoogleUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    useCase = new RegisterGoogleUseCase({ hash: vi.fn().mockResolvedValue("hashed") } as any);
    mockGooglePayload();
    mockTransactionSuccess();
  });

  it("rejeita token Google inválido", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    await expect(useCase.execute(BASE_INPUT)).rejects.toThrow("Token Google inválido ou expirado");
  });

  it("rejeita e-mail não verificado pelo Google", async () => {
    mockGooglePayload({ email_verified: false });

    await expect(useCase.execute(BASE_INPUT)).rejects.toThrow("E-mail não verificado pelo Google");
  });

  it("rejeita quando e-mail já está cadastrado", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing" });

    await expect(useCase.execute(BASE_INPUT)).rejects.toThrow("E-mail já cadastrado");
  });

  it("rejeita quando googleSub já está cadastrado", async () => {
    mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-google" });

    await expect(useCase.execute(BASE_INPUT)).rejects.toThrow("Esta conta Google já está cadastrada");
  });

  it("cria conta com googleSub, emailVerified true e senha aleatória", async () => {
    const result = await useCase.execute(BASE_INPUT);

    expect(mockTxUserCreate).toHaveBeenCalledTimes(1);
    const created = mockTxUserCreate.mock.calls[0][0].data;
    expect(created.email).toBe("joao@test.com");
    expect(created.emailVerified).toBe(true);
    expect(created.googleSub).toBe("google-sub-1");
    expect(created.password).toBe("hashed");
    expect(created.role).toBe("OWNER");

    expect(result).toHaveProperty("accessToken");
    expect(result.user.email).toBe("joao@test.com");
  });

  it("não enfileira e-mail de verificação, apenas welcome", async () => {
    await useCase.execute(BASE_INPUT);

    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    const kinds = (enqueueEmail as any).mock.calls.map((c: any) => c[0]?.kind);
    expect(kinds).toEqual(["welcome"]);
  });

  it("rejeita quando CPF já está cadastrado", async () => {
    mockFindFirst
      .mockResolvedValueOnce(null) // email
      .mockResolvedValueOnce(null) // googleSub
      .mockResolvedValueOnce({ id: "existing-cpf" });

    await expect(useCase.execute(BASE_INPUT)).rejects.toThrow("CPF já cadastrado");
  });
});
