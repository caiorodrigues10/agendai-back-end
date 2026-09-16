import { describe, expect, it, vi, beforeEach } from "vitest";
import { FallbackStorageProvider } from "./FallbackStorageProvider";
import type { IStorageProvider, ISignedUploadUrlResult, IUploadBufferResult } from "../IStorageProvider";

function makeMockProvider(overrides: Partial<IStorageProvider> = {}): IStorageProvider {
  return {
    generateSignedUploadUrl: vi.fn(),
    uploadBuffer: vi.fn(),
    deleteObject: vi.fn(),
    extractObjectName: vi.fn().mockReturnValue(null),
    ...overrides,
  } as IStorageProvider;
}

function makeSuccessUploadResult(): IUploadBufferResult {
  return {
    publicUrl: "https://example.com/image.jpg",
    objectName: "products/image.jpg",
    size: 1024,
  };
}

function makeSuccessSignedUrlResult(): ISignedUploadUrlResult {
  return {
    uploadUrl: "https://example.com/upload",
    publicUrl: "https://example.com/image.jpg",
    objectName: "products/image.jpg",
    expiresInSeconds: 900,
  };
}

describe("FallbackStorageProvider", () => {
  let primary: IStorageProvider;
  let fallback: IStorageProvider;
  let provider: FallbackStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    primary = makeMockProvider();
    fallback = makeMockProvider({ isAvailable: vi.fn().mockReturnValue(true) } as any);
    provider = new FallbackStorageProvider(primary, fallback);
  });

  describe("uploadBuffer", () => {
    it("usa GCS quando funciona — Cloudinary nunca é chamado", async () => {
      const expected = makeSuccessUploadResult();
      vi.mocked(primary.uploadBuffer).mockResolvedValue(expected);

      const result = await provider.uploadBuffer("products", "test.jpg", Buffer.from("data"), "image/jpeg");

      expect(result).toEqual(expected);
      expect(primary.uploadBuffer).toHaveBeenCalledOnce();
      expect(fallback.uploadBuffer).not.toHaveBeenCalled();
    });

    it("fallback para Cloudinary quando GCS falha", async () => {
      const expected = makeSuccessUploadResult();
      vi.mocked(primary.uploadBuffer).mockRejectedValue(new Error("GCS connection refused"));
      vi.mocked(fallback.uploadBuffer).mockResolvedValue(expected);

      const result = await provider.uploadBuffer("products", "test.jpg", Buffer.from("data"), "image/jpeg");

      expect(result).toEqual(expected);
      expect(primary.uploadBuffer).toHaveBeenCalledOnce();
      expect(fallback.uploadBuffer).toHaveBeenCalledOnce();
    });

    it("propaga erro do Cloudinary quando ambos falham", async () => {
      vi.mocked(primary.uploadBuffer).mockRejectedValue(new Error("GCS down"));
      vi.mocked(fallback.uploadBuffer).mockRejectedValue(new Error("Cloudinary rate limited"));

      await expect(
        provider.uploadBuffer("products", "test.jpg", Buffer.from("data"), "image/jpeg"),
      ).rejects.toThrow("Cloudinary rate limited");

      expect(primary.uploadBuffer).toHaveBeenCalledOnce();
      expect(fallback.uploadBuffer).toHaveBeenCalledOnce();
    });

    it("propaga erro do GCS quando Cloudinary não está configurado", async () => {
      const fallbackNotAvailable = makeMockProvider({
        isAvailable: vi.fn().mockReturnValue(false),
      } as any);
      const p = new FallbackStorageProvider(primary, fallbackNotAvailable);

      vi.mocked(primary.uploadBuffer).mockRejectedValue(new Error("GCS credentials missing"));

      await expect(
        p.uploadBuffer("products", "test.jpg", Buffer.from("data"), "image/jpeg"),
      ).rejects.toThrow("GCS credentials missing");

      expect(primary.uploadBuffer).toHaveBeenCalledOnce();
    });
  });

  describe("generateSignedUploadUrl", () => {
    it("usa GCS quando funciona", async () => {
      const expected = makeSuccessSignedUrlResult();
      vi.mocked(primary.generateSignedUploadUrl).mockResolvedValue(expected);

      const result = await provider.generateSignedUploadUrl("logos", "test.jpg", "image/jpeg");

      expect(result).toEqual(expected);
      expect(primary.generateSignedUploadUrl).toHaveBeenCalledOnce();
      expect(fallback.generateSignedUploadUrl).not.toHaveBeenCalled();
    });

    it("fallback para Cloudinary quando GCS falha", async () => {
      const expected = makeSuccessSignedUrlResult();
      vi.mocked(primary.generateSignedUploadUrl).mockRejectedValue(new Error("GCS error"));
      vi.mocked(fallback.generateSignedUploadUrl).mockResolvedValue(expected);

      const result = await provider.generateSignedUploadUrl("logos", "test.jpg", "image/jpeg");

      expect(result).toEqual(expected);
      expect(fallback.generateSignedUploadUrl).toHaveBeenCalledOnce();
    });
  });

  describe("deleteObject", () => {
    it("usa GCS quando funciona", async () => {
      vi.mocked(primary.deleteObject).mockResolvedValue(undefined);

      await provider.deleteObject("products/test.jpg");

      expect(primary.deleteObject).toHaveBeenCalledWith("products/test.jpg");
      expect(fallback.deleteObject).not.toHaveBeenCalled();
    });

    it("fallback para Cloudinary quando GCS falha", async () => {
      vi.mocked(primary.deleteObject).mockRejectedValue(new Error("GCS error"));
      vi.mocked(fallback.deleteObject).mockResolvedValue(undefined);

      await provider.deleteObject("products/test.jpg");

      expect(fallback.deleteObject).toHaveBeenCalledWith("products/test.jpg");
    });
  });

  describe("extractObjectName", () => {
    it("extrai do GCS se a URL pertence ao GCS", () => {
      vi.mocked(primary.extractObjectName).mockReturnValue("products/test.jpg");

      const result = provider.extractObjectName("https://storage.googleapis.com/bucket/products/test.jpg");

      expect(result).toBe("products/test.jpg");
      expect(fallback.extractObjectName).not.toHaveBeenCalled();
    });

    it("fallback para Cloudinary se GCS retorna null", () => {
      vi.mocked(primary.extractObjectName).mockReturnValue(null);
      vi.mocked(fallback.extractObjectName).mockReturnValue("products/test.jpg");

      const result = provider.extractObjectName("https://res.cloudinary.com/cloud/image/upload/products/test.jpg");

      expect(result).toBe("products/test.jpg");
      expect(fallback.extractObjectName).toHaveBeenCalled();
    });
  });
});
