import { describe, it, expect, beforeEach } from "vitest";
import { MockBarbershopRepository } from "@/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository";
import { MockStorageProvider } from "@/shared/container/providers/StorageProvider/mocks/MockStorageProvider";
import { GetLogoUploadUrlUseCase } from "./GetLogoUploadUrlUseCase";
import { ConfirmLogoUseCase } from "./ConfirmLogoUseCase";
import { DeleteLogoUseCase } from "./DeleteLogoUseCase";
import { AppError } from "@/shared/errors/AppError";

const ADMIN = { role: "MASTER_ADMIN" } as const;
const owner = (barbershopId: string) => ({
  role: "OWNER",
  barbershopId,
});
const otherOwner = { role: "OWNER", barbershopId: "other-shop" } as const;

let barbershopRepo: MockBarbershopRepository;
let storageProvider: MockStorageProvider;

beforeEach(() => {
  barbershopRepo = new MockBarbershopRepository();
  storageProvider = new MockStorageProvider();
});

// ─── GetLogoUploadUrlUseCase ──────────────────────────────────────────────────
describe("GetLogoUploadUrlUseCase", () => {
  it("gera signed URL para JPEG", async () => {
    const shop = await barbershopRepo.create({
      name: "Barber X",
      whatsapp: "5599999999999",
    });

    const useCase = new GetLogoUploadUrlUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const result = await useCase.execute(
      { barbershopId: shop.id, mimeType: "image/jpeg" },
      owner(shop.id)
    );

    expect(result.uploadUrl).toContain("mock");
    expect(result.publicUrl).toContain("logos/");
    expect(result.publicUrl).toContain(shop.id);
    expect(result.objectName).toMatch(/^logos\/barbershop-.+\.jpg$/);
    expect(result.expiresInSeconds).toBe(900);
    expect(storageProvider.generatedUrls).toHaveLength(1);
  });

  it("gera signed URL para PNG", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new GetLogoUploadUrlUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const result = await useCase.execute(
      { barbershopId: shop.id, mimeType: "image/png" },
      ADMIN
    );

    expect(result.objectName).toMatch(/\.png$/);
  });

  it("lança 400 para mimeType não permitido", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new GetLogoUploadUrlUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute(
        { barbershopId: shop.id, mimeType: "image/gif" },
        owner(shop.id)
      )
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lança 404 para barbearia inexistente", async () => {
    const useCase = new GetLogoUploadUrlUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute(
        { barbershopId: "non-existent", mimeType: "image/jpeg" },
        ADMIN
      )
    ).rejects.toBeInstanceOf(AppError);
  });

  it("lança 403 quando OWNER tenta alterar outra barbearia", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new GetLogoUploadUrlUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute(
        { barbershopId: shop.id, mimeType: "image/jpeg" },
        otherOwner
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("MASTER_ADMIN pode gerar URL para qualquer barbearia", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new GetLogoUploadUrlUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const result = await useCase.execute(
      { barbershopId: shop.id, mimeType: "image/png" },
      ADMIN
    );

    expect(result.objectName).toContain(shop.id);
  });
});

// ─── ConfirmLogoUseCase ───────────────────────────────────────────────────────
describe("ConfirmLogoUseCase", () => {
  it("salva logoUrl válida no banco", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new ConfirmLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const logoUrl = `https://storage.googleapis.com/mock-bucket/logos/barbershop-${shop.id}-logo.jpg`;

    const updated = await useCase.execute(
      { barbershopId: shop.id, logoUrl },
      owner(shop.id)
    );

    expect(updated.logoUrl).toBe(logoUrl);
  });

  it("deleta logo antiga quando há substituição", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const oldUrl = `https://storage.googleapis.com/mock-bucket/logos/old-logo.jpg`;

    // Simula logo já existente
    await barbershopRepo.update(shop.id, { logoUrl: oldUrl });

    const useCase = new ConfirmLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const newUrl = `https://storage.googleapis.com/mock-bucket/logos/barbershop-${shop.id}-new.png`;
    await useCase.execute({ barbershopId: shop.id, logoUrl: newUrl }, ADMIN);

    // A logo antiga deve ter sido marcada para deleção
    expect(storageProvider.deletedObjects).toContain("logos/old-logo.jpg");
  });

  it("lança 400 para URL fora do bucket", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new ConfirmLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute(
        { barbershopId: shop.id, logoUrl: "https://malicious.com/fake.jpg" },
        owner(shop.id)
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lança 400 para URL fora da pasta logos/", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new ConfirmLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const badUrl = `https://storage.googleapis.com/mock-bucket/other-folder/file.jpg`;

    await expect(
      useCase.execute({ barbershopId: shop.id, logoUrl: badUrl }, owner(shop.id))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("lança 403 quando OWNER tenta alterar outra barbearia", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new ConfirmLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    const logoUrl = `https://storage.googleapis.com/mock-bucket/logos/logo.jpg`;

    await expect(
      useCase.execute({ barbershopId: shop.id, logoUrl }, otherOwner)
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ─── DeleteLogoUseCase ────────────────────────────────────────────────────────
describe("DeleteLogoUseCase", () => {
  it("deleta a logo do GCS e limpa o banco", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const logoUrl = `https://storage.googleapis.com/mock-bucket/logos/logo.jpg`;
    await barbershopRepo.update(shop.id, { logoUrl });

    const useCase = new DeleteLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await useCase.execute(shop.id, owner(shop.id));

    expect(storageProvider.deletedObjects).toContain("logos/logo.jpg");
    const updated = await barbershopRepo.findById(shop.id);
    expect(updated?.logoUrl).toBeNull();
  });

  it("lança 404 quando barbearia não tem logo", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const useCase = new DeleteLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute(shop.id, owner(shop.id))
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lança 403 quando OWNER tenta deletar logo de outra barbearia", async () => {
    const shop = await barbershopRepo.create({ name: "B", whatsapp: "55" });
    const logoUrl = `https://storage.googleapis.com/mock-bucket/logos/logo.jpg`;
    await barbershopRepo.update(shop.id, { logoUrl });

    const useCase = new DeleteLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute(shop.id, otherOwner)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("lança 404 para barbearia inexistente", async () => {
    const useCase = new DeleteLogoUseCase(
      barbershopRepo as any,
      storageProvider as any
    );

    await expect(
      useCase.execute("non-existent", ADMIN)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});