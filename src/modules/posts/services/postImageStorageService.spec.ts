/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";

const storageMock = vi.hoisted(() => ({
  uploadBuffer: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("tsyringe", async importOriginal => ({
  ...(await importOriginal<typeof import("tsyringe")>()),
  container: { resolve: () => storageMock },
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  persistPostImage,
  deletePostImage,
  POST_ART_FOLDER,
} from "./postImageStorageService";

const TENANT = "00000000-0000-0000-0000-000000000001";
const DATA_URL = "data:image/png;base64,aWNv";

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.uploadBuffer.mockResolvedValue({
    publicUrl: "https://res.cloudinary.com/test/image/upload/posts-art/x.png",
    objectName: "posts-art/x",
    size: 4,
  });
  storageMock.deleteObject.mockResolvedValue(undefined);
});

describe("persistPostImage — arte final em posts-art", () => {
  it("uploads a PNG data-URL to posts-art and returns URL + asset name", async () => {
    const result = await persistPostImage(TENANT, DATA_URL);

    expect(result).toEqual({
      imageUrl: "https://res.cloudinary.com/test/image/upload/posts-art/x.png",
      imageAssetName: "posts-art/x",
    });
    expect(storageMock.uploadBuffer).toHaveBeenCalledTimes(1);
    const [folder, fileName, buffer, mimeType] = storageMock.uploadBuffer.mock.calls[0];
    expect(folder).toBe(POST_ART_FOLDER);
    expect(fileName).toMatch(new RegExp(`^${TENANT}/[0-9a-f-]{36}\\.png$`));
    expect(buffer).toEqual(Buffer.from("aWNv", "base64"));
    expect(mimeType).toBe("image/png");
  });

  it("accepts JPEG and WebP data-URLs", async () => {
    await persistPostImage(TENANT, "data:image/jpeg;base64,aWNv");
    await persistPostImage(TENANT, "data:image/webp;base64,aWNv");

    expect(storageMock.uploadBuffer).toHaveBeenCalledTimes(2);
    expect(storageMock.uploadBuffer.mock.calls[0][3]).toBe("image/jpeg");
    expect(storageMock.uploadBuffer.mock.calls[1][3]).toBe("image/webp");
    expect(storageMock.uploadBuffer.mock.calls[1][1]).toMatch(/\.webp$/);
  });

  it("passes external URLs through without uploading (asset null)", async () => {
    const url = "https://legacy.example/cover.png";
    const result = await persistPostImage(TENANT, url);

    expect(result).toEqual({ imageUrl: url, imageAssetName: null });
    expect(storageMock.uploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects malformed data-URLs with 400", async () => {
    await expect(persistPostImage(TENANT, "data:image/png;base64,@@@")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(storageMock.uploadBuffer).not.toHaveBeenCalled();
  });

  it("rejects unsupported image types with 400 (never stores them as base64)", async () => {
    await expect(persistPostImage(TENANT, "data:image/gif;base64,R0lGODlh")).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("PNG, JPEG ou WebP"),
    });
    expect(storageMock.uploadBuffer).not.toHaveBeenCalled();
  });

  it("maps upload failures to a retryable 502 (no base64 fallback)", async () => {
    storageMock.uploadBuffer.mockRejectedValue(new Error("Invalid image file"));

    const failure = await persistPostImage(TENANT, DATA_URL).catch(err => err);
    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ statusCode: 502, message: expect.stringContaining("Tente novamente") });
  });

  it("does not re-wrap AppError thrown by the provider upload", async () => {
    const err = new AppError("Invalid image file", 400);
    storageMock.uploadBuffer.mockRejectedValue(err);
    await expect(persistPostImage(TENANT, DATA_URL)).rejects.toBe(err);
  });
});

describe("deletePostImage — limpeza best-effort", () => {
  it("is a no-op for null/undefined (legado base64/URL externa)", async () => {
    await deletePostImage(null);
    await deletePostImage(undefined);
    expect(storageMock.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes the asset by its object name", async () => {
    await deletePostImage("posts-art/abc");
    expect(storageMock.deleteObject).toHaveBeenCalledWith("posts-art/abc");
  });

  it("never propagates storage failures (salvar/deletar post não pode cair por limpeza)", async () => {
    storageMock.deleteObject.mockRejectedValue(new Error("network"));
    await expect(deletePostImage("posts-art/abc")).resolves.toBeUndefined();
  });
});
