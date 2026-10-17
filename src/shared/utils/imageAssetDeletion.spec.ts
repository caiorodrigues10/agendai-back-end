/// <reference types="vitest/globals" />
import { MockStorageProvider } from "@/shared/container/providers/StorageProvider/mocks/MockStorageProvider";
import { deleteImageAsset } from "./imageAssetDeletion";

describe("deleteImageAsset", () => {
  it("deleta por publicId no imageProvider (Cloudinary) e ignora a URL", async () => {
    const image = new MockStorageProvider();
    const legacy = new MockStorageProvider();

    await deleteImageAsset({
      imageProvider: image,
      legacyProvider: legacy,
      publicId: "agendaja/shop-1/logo/logo",
      publicUrl: "https://storage.googleapis.com/mock-bucket/logos/old.jpg",
    });

    expect(image.deletedObjects).toEqual(["agendaja/shop-1/logo/logo"]);
    expect(legacy.deletedObjects).toEqual([]);
  });

  it("sem publicId, extrai o objectName da URL via imageProvider", async () => {
    const image = new MockStorageProvider();
    const legacy = new MockStorageProvider();

    await deleteImageAsset({
      imageProvider: image,
      legacyProvider: legacy,
      publicUrl: "https://storage.googleapis.com/mock-bucket/avatars/u1.jpg",
    });

    expect(image.deletedObjects).toEqual(["avatars/u1.jpg"]);
    expect(legacy.deletedObjects).toEqual([]);
  });

  it("sem nada reconhecível, é no-op (best-effort)", async () => {
    const image = new MockStorageProvider();
    const legacy = new MockStorageProvider();

    await deleteImageAsset({
      imageProvider: image,
      legacyProvider: legacy,
      publicUrl: "https://example.com/foreign.jpg",
    });

    expect(image.deletedObjects).toEqual([]);
    expect(legacy.deletedObjects).toEqual([]);
  });

  it("sem URL nem publicId é no-op", async () => {
    const image = new MockStorageProvider();
    const legacy = new MockStorageProvider();

    await deleteImageAsset({ imageProvider: image, legacyProvider: legacy });

    expect(image.deletedObjects).toEqual([]);
    expect(legacy.deletedObjects).toEqual([]);
  });

  it("falha do provider vira warning, não propaga", async () => {
    const image = new MockStorageProvider();
    image.deleteObject = async () => {
      throw new Error("boom");
    };
    const legacy = new MockStorageProvider();

    await expect(
      deleteImageAsset({
        imageProvider: image,
        legacyProvider: legacy,
        publicId: "agendaja/shop-1/logo/logo",
        context: "DeleteLogo",
      }),
    ).resolves.toBeUndefined();
  });
});
