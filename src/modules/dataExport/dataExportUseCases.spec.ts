import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataExportUseCases } from "./dataExportUseCases";
import { exportJobRepository } from "./repositories/ExportJobRepository";
import { prisma } from "@/libs/prismaClient";

vi.mock("@/libs/prismaClient", () => ({
  prisma: { barbershop: { findUnique: vi.fn() } },
}));

vi.mock("./repositories/ExportJobRepository", () => ({
  exportJobRepository: {
    findActiveByIdempotencyKey: vi.fn(),
    countActive: vi.fn(),
    countRecent: vi.fn(),
    create: vi.fn(),
  },
}));

const SHOP = "shop-1";

function job(data: Record<string, unknown>) {
  return {
    id: "export-1",
    periodPreset: "THIS_MONTH",
    periodFrom: null,
    periodTo: null,
    timezone: "America/Sao_Paulo",
    modules: data.modules ?? [],
    options: data.options ?? {},
    format: "XLSX",
    status: "PENDING",
    progress: null,
    fileSizeBytes: null,
    fileName: null,
    errorMessage: null,
    createdAt: new Date(),
    finishedAt: null,
    expiresAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.barbershop.findUnique).mockResolvedValue({
    timezone: "America/Sao_Paulo",
    businessSegment: "LAW_FIRM",
    name: "Escritório",
  } as never);
  vi.mocked(exportJobRepository.findActiveByIdempotencyKey).mockResolvedValue(null);
  vi.mocked(exportJobRepository.countActive).mockResolvedValue(0);
  vi.mocked(exportJobRepository.countRecent).mockResolvedValue(0);
  vi.mocked(exportJobRepository.create).mockImplementation(async data => job(data as Record<string, unknown>) as never);
});

describe("DataExportUseCases — includeCase em LAW_FIRM", () => {
  it("respeita a opção explícita do dono", async () => {
    const useCases = new DataExportUseCases();
    const summary = await useCases.create({
      barbershopId: SHOP,
      userId: "user-1",
      periodPreset: "THIS_MONTH",
      preset: "GERENTIAL",
      format: "XLSX",
      options: { includeCase: true },
    });

    expect(summary.options.includeCase).toBe(true);
    expect(exportJobRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ includeCase: true }),
      })
    );
  });

  it("sem a opção, nada de caso sai", async () => {
    const useCases = new DataExportUseCases();
    const summary = await useCases.create({
      barbershopId: SHOP,
      userId: "user-1",
      periodPreset: "THIS_MONTH",
      preset: "GERENTIAL",
      format: "XLSX",
    });

    expect(summary.options.includeCase).toBe(false);
    expect(exportJobRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ includeCase: false }),
      })
    );
  });
});
