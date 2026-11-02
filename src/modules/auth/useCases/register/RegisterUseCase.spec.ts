/// <reference types="vitest/globals" />

// --- Mock do logger (objeto compartilhado via vi.hoisted para acessar logger.warn nos testes) ---
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => mockLogger,
}));

// --- Mock prisma ---
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockTxBarbershopCreate = vi.fn();
const mockTxScheduleCreateMany = vi.fn();
const mockTxUserCreate = vi.fn();
const mockTxVerificationTokenCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
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
    userSession: {
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

vi.mock("@/shared/services/cpfNameVerification/cpfNameVerification", () => ({
  cpfNameVerificationMode: vi.fn(() => "off"),
}));

import { RegisterUseCase, IRegisterDTO } from "./RegisterUseCase";
import { ensureReferralCode } from "@/modules/referrals/services/referralService";
import { cpfNameVerificationMode } from "@/shared/services/cpfNameVerification/cpfNameVerification";
import { maskCpfForLogs, maskNameForLogs } from "@/shared/utils/logPrivacy";

const BASE_INPUT: IRegisterDTO = {
  ownerName: "João Silva",
  email: "joao@test.com",
  password: "senha123",
  cpf: "45317829709",
  barbershopName: "Barber Test",
  whatsapp: "11999998888",
  termsVersion: "1.0",
  termsAccepted: true,
  marketingOptIn: false,
  lgpdConsent: true,
};

function mockTransactionSuccess(schedule?: IRegisterDTO["schedule"]) {
  mockFindUnique.mockResolvedValue(null); // no existing email
  mockFindFirst.mockResolvedValue(null);  // no existing cpf/cnpj

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
      schedule: { createMany: mockTxScheduleCreateMany },
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
      verificationToken: { create: mockTxVerificationTokenCreate },
    };
    mockTxBarbershopCreate.mockResolvedValue({
      id: "barbershop-1",
      name: "Barber Test",
    });
    mockTxUserCreate.mockResolvedValue({
      id: "user-1",
      name: "João Silva",
      email: "joao@test.com",
      role: "OWNER",
      barbershopId: "barbershop-1",
    });
    return fn(tx);
  });
}

describe("RegisterUseCase — schedule", () => {
  let useCase: RegisterUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new RegisterUseCase(
      { hash: vi.fn().mockResolvedValue("hashed") } as any,
      { verify: vi.fn().mockResolvedValue({ status: "unavailable" }) } as any,
    );
  });

  it("creates 7 schedule rows with provided schedule", async () => {
    const schedule = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      isOpen: dayOfWeek !== 0,
      openTime: "09:00",
      closeTime: "19:00",
    }));

    mockTransactionSuccess(schedule);

    await useCase.execute({ ...BASE_INPUT, schedule });

    expect(mockTxScheduleCreateMany).toHaveBeenCalledTimes(1);
    const calledData = mockTxScheduleCreateMany.mock.calls[0][0].data;
    expect(calledData).toHaveLength(7);

    // Sunday closed
    const sunday = calledData.find((s: any) => s.dayOfWeek === 0);
    expect(sunday.isOpen).toBe(false);
    expect(sunday.barbershopId).toBe("barbershop-1");

    // Monday open
    const monday = calledData.find((s: any) => s.dayOfWeek === 1);
    expect(monday.isOpen).toBe(true);
    expect(monday.openTime).toBe("09:00");
    expect(monday.closeTime).toBe("19:00");
  });

  it("falls back to DEFAULT_SCHEDULE when schedule is missing", async () => {
    mockTransactionSuccess();

    await useCase.execute({ ...BASE_INPUT, schedule: undefined });

    expect(mockTxScheduleCreateMany).toHaveBeenCalledTimes(1);
    const calledData = mockTxScheduleCreateMany.mock.calls[0][0].data;
    expect(calledData).toHaveLength(7);

    // Default: Sunday closed, Mon–Sat open 09:00–19:00
    const sunday = calledData.find((s: any) => s.dayOfWeek === 0);
    expect(sunday.isOpen).toBe(false);
    expect(sunday.openTime).toBe("09:00");
    expect(sunday.closeTime).toBe("19:00");

    const monday = calledData.find((s: any) => s.dayOfWeek === 1);
    expect(monday.isOpen).toBe(true);
  });

  it("falls back to DEFAULT_SCHEDULE when schedule array is empty", async () => {
    mockTransactionSuccess();

    await useCase.execute({ ...BASE_INPUT, schedule: [] });

    expect(mockTxScheduleCreateMany).toHaveBeenCalledTimes(1);
    const calledData = mockTxScheduleCreateMany.mock.calls[0][0].data;
    expect(calledData).toHaveLength(7);
  });

  it("falls back to DEFAULT_SCHEDULE when schedule has wrong length", async () => {
    mockTransactionSuccess();

    await useCase.execute({
      ...BASE_INPUT,
      schedule: [{ dayOfWeek: 1, isOpen: true, openTime: "08:00", closeTime: "18:00" }],
    });

    expect(mockTxScheduleCreateMany).toHaveBeenCalledTimes(1);
    const calledData = mockTxScheduleCreateMany.mock.calls[0][0].data;
    expect(calledData).toHaveLength(7);
  });
});

describe("RegisterUseCase — indicação", () => {
  let useCase: RegisterUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new RegisterUseCase(
      { hash: vi.fn().mockResolvedValue("hashed") } as any,
      { verify: vi.fn().mockResolvedValue({ status: "unavailable" }) } as any,
    );
  });

  it("gera código de indicação nos segmentos normais", async () => {
    mockTransactionSuccess();

    await useCase.execute({ ...BASE_INPUT, businessSegment: "BARBERSHOP" });

    expect(ensureReferralCode).toHaveBeenCalledTimes(1);
  });

  it("LAW_FIRM não gera código de indicação (divulgação comercial)", async () => {
    mockTransactionSuccess();

    await useCase.execute({ ...BASE_INPUT, businessSegment: "LAW_FIRM" });

    expect(ensureReferralCode).not.toHaveBeenCalled();
  });
});

describe("RegisterUseCase — unicidade de CPF", () => {
  let useCase: RegisterUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new RegisterUseCase(
      { hash: vi.fn().mockResolvedValue("hashed") } as any,
      { verify: vi.fn().mockResolvedValue({ status: "unavailable" }) } as any,
    );
  });

  it("rejeita CPF já cadastrado mesmo vindo com máscara (409)", async () => {
    // email → null, cpf → existente (o findFirst compara o CPF já normalizado)
    mockFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "existing-cpf" });

    const err: any = await useCase
      .execute({ ...BASE_INPUT, cpf: "453.178.297-09", email: "outro@test.com" })
      .catch((e) => e);

    expect(err.message).toBe("CPF já cadastrado");
    expect(err.statusCode).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("corrida: P2002 (cpf) no create vira 409, não 500", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (fn: any) => {
      const tx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        barbershop: { create: vi.fn().mockResolvedValue({ id: "barbershop-1", name: "Barber Test" }) },
        serviceCategory: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "sc-1" }) },
        service: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        schedule: { createMany: vi.fn().mockResolvedValue({}) },
        expenseCategory: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
        productCategory: { createMany: vi.fn().mockResolvedValue({}) },
        appointmentPolicy: { upsert: vi.fn().mockResolvedValue({}) },
        barbershopEmailSettings: { upsert: vi.fn().mockResolvedValue({}) },
        notificationPreference: { createMany: vi.fn().mockResolvedValue({}) },
        profitSettings: { upsert: vi.fn().mockResolvedValue({}) },
        loyaltyProgram: { upsert: vi.fn().mockResolvedValue({}) },
        user: {
          create: vi.fn().mockRejectedValue({
            code: "P2002",
            meta: { target: ["cpf"] },
          }),
        },
        verificationToken: { create: vi.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    const err: any = await useCase.execute(BASE_INPUT).catch((e) => e);

    expect(err.message).toBe("CPF já cadastrado");
    expect(err.statusCode).toBe(409);
  });
});

describe("RegisterUseCase — verificação CPF × nome", () => {
  let useCase: RegisterUseCase;
  const verifier = { verify: vi.fn() } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cpfNameVerificationMode).mockReturnValue("off");
    verifier.verify.mockResolvedValue({ status: "unavailable" });
    useCase = new RegisterUseCase(
      { hash: vi.fn().mockResolvedValue("hashed") } as any,
      verifier,
    );
  });

  it("modo off: verificador não é chamado", async () => {
    vi.mocked(cpfNameVerificationMode).mockReturnValue("off");
    mockTransactionSuccess();

    await useCase.execute(BASE_INPUT);

    expect(verifier.verify).not.toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("modo warn + mismatch: cadastra, logger.warn recebe apenas CPF/nome mascarados", async () => {
    vi.mocked(cpfNameVerificationMode).mockReturnValue("warn");
    verifier.verify.mockResolvedValue({ status: "mismatch" });
    mockTransactionSuccess();

    const result = await useCase.execute({ ...BASE_INPUT });

    expect(result).toBeDefined(); // cadastra (fail-open em warn)
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);

    // JSON.stringify de TODOS os args de logger.warn não contém CPF nem nome completos.
    const warnJson = JSON.stringify(mockLogger.warn.mock.calls);
    expect(warnJson).not.toContain("45317829709");
    expect(warnJson).not.toContain("João Silva");
    // E contém as máscaras corretas.
    expect(warnJson).toContain(maskCpfForLogs("45317829709"));
    expect(warnJson).toContain(maskNameForLogs("João Silva"));
  });

  it("modo enforce + mismatch: rejeita com 400, mensagem sem CPF nem nome", async () => {
    vi.mocked(cpfNameVerificationMode).mockReturnValue("enforce");
    verifier.verify.mockResolvedValue({ status: "mismatch" });
    mockTransactionSuccess();

    const err: any = await useCase.execute({ ...BASE_INPUT }).catch((e) => e);

    expect(err.statusCode).toBe(400);
    expect(err.message).not.toContain("45317829709");
    expect(err.message).not.toContain("João Silva");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("modo enforce + unavailable: cadastra (fail-open, decisão de produto)", async () => {
    vi.mocked(cpfNameVerificationMode).mockReturnValue("enforce");
    verifier.verify.mockResolvedValue({ status: "unavailable" });
    mockTransactionSuccess();

    const result = await useCase.execute(BASE_INPUT);

    expect(result).toBeDefined();
    expect(verifier.verify).toHaveBeenCalledTimes(1);
  });
});
