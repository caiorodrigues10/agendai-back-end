import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock prisma ---
const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockTxBarbershopCreate = vi.fn();
const mockTxServiceCreateMany = vi.fn();
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

import { RegisterUseCase, IRegisterDTO } from "./RegisterUseCase";

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
      barbershop: { create: mockTxBarbershopCreate },
      service: { createMany: mockTxServiceCreateMany },
      schedule: { createMany: mockTxScheduleCreateMany },
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
    useCase = new RegisterUseCase({ hash: vi.fn().mockResolvedValue("hashed") } as any);
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
