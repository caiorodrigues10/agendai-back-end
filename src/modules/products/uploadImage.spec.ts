import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProductCatalogUseCase } from "@/modules/products/useCases/productUseCases";
import { AppError } from "@/shared/errors/AppError";

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    product: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    productCategory: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
  Prisma: { ProductUncheckedUpdateInput: {} },
}));

vi.mock("../permissions", () => ({
  assertProductPermission: vi.fn().mockResolvedValue(undefined),
  canOverrideProductPrice: vi.fn().mockReturnValue(false),
  canGiveDiscount: vi.fn().mockReturnValue(false),
  canSeeProductCosts: vi.fn().mockReturnValue(false),
}));

vi.mock("../utils/productCodeUtils", () => ({
  normalizeCode: vi.fn((v: unknown) => v ?? null),
  assertUniqueProductCode: vi.fn().mockResolvedValue(undefined),
  isProductUniqueViolation: vi.fn().mockReturnValue(false),
  throwProductUniqueViolation: vi.fn(),
}));

vi.mock("../inventoryMath", () => ({
  namesToSkip: [],
}));

vi.mock("../productListFilters", () => ({
  productTypeWhere: vi.fn().mockReturnValue(null),
}));

vi.mock("../utils/productAttention", () => ({
  buildProductAttention: vi.fn().mockReturnValue([]),
}));

vi.mock("../utils/retailSummary", () => ({
  summarizeRetailLines: vi.fn().mockReturnValue([]),
}));

vi.mock("@/shared/constants/productsInventory", () => ({
  assertProductsInventoryCapability: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockUploadBuffer = vi.fn();
const mockDeleteObject = vi.fn();
const mockExtractObjectName = vi.fn().mockReturnValue(null);

function makeUseCase() {
  const storageMock = {
    uploadBuffer: mockUploadBuffer,
    deleteObject: mockDeleteObject,
    extractObjectName: mockExtractObjectName,
    generateSignedUploadUrl: vi.fn(),
  } as any;
  const engineMock = {} as any;
  return { useCase: new ProductCatalogUseCase(engineMock, storageMock), storageMock };
}

import { prisma } from "@/libs/prismaClient";
const mockedPrisma = vi.mocked(prisma);

describe("ProductCatalogUseCase.uploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const barbershopId = "shop-1";
  const productId = "prod-1";
  const user = { id: "user-1", role: "OWNER", barbershopId };

  it("faz upload e salva imageUrl no produto", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: productId, barbershopId } as any);
    mockUploadBuffer.mockResolvedValue({
      publicUrl: "https://storage.googleapis.com/agendai-assets/products/prod-1-123.jpg",
      objectName: "products/prod-1-123.jpg",
      size: 1024,
    });
    mockedPrisma.product.update.mockResolvedValue({} as any);

    const { useCase } = makeUseCase();
    const buffer = Buffer.from("fake-image-data");
    const result = await useCase.uploadImage(productId, barbershopId, user, {
      buffer,
      mimeType: "image/jpeg",
      originalName: "foto.jpg",
    });

    expect(result.imageUrl).toBe("https://storage.googleapis.com/agendai-assets/products/prod-1-123.jpg");
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      "products",
      expect.stringContaining("product-prod-1-"),
      buffer,
      "image/jpeg",
    );
    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: productId },
      data: { imageUrl: "https://storage.googleapis.com/agendai-assets/products/prod-1-123.jpg" },
    });
  });

  it("lança 404 se produto não existe", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);
    const { useCase } = makeUseCase();

    await expect(
      useCase.uploadImage(productId, barbershopId, user, {
        buffer: Buffer.from("test"),
        mimeType: "image/png",
      })
    ).rejects.toThrow(AppError);
  });

  it("lança erro se uploadBuffer falha", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: productId, barbershopId } as any);
    mockUploadBuffer.mockRejectedValue(new Error("GCS connection refused"));

    const { useCase } = makeUseCase();
    await expect(
      useCase.uploadImage(productId, barbershopId, user, {
        buffer: Buffer.from("test"),
        mimeType: "image/webp",
      })
    ).rejects.toThrow("GCS connection refused");

    expect(mockedPrisma.product.update).not.toHaveBeenCalled();
  });

  it("normaliza mimeType image/jpg para extensão jpg", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: productId, barbershopId } as any);
    mockUploadBuffer.mockResolvedValue({
      publicUrl: "https://storage.googleapis.com/agendai-assets/products/prod-1.jpg",
      objectName: "products/prod-1.jpg",
      size: 512,
    });
    mockedPrisma.product.update.mockResolvedValue({} as any);

    const { useCase } = makeUseCase();
    await useCase.uploadImage(productId, barbershopId, user, {
      buffer: Buffer.from("data"),
      mimeType: "image/jpg",
    });

    expect(mockUploadBuffer).toHaveBeenCalledWith(
      "products",
      expect.stringMatching(/product-prod-1-.*\.jpg$/),
      expect.any(Buffer),
      "image/jpg",
    );
  });
});
