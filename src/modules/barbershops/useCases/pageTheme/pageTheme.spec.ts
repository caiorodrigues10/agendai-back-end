import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { AppError } from "@/shared/errors/AppError";
import { MockStorageProvider } from "@/shared/container/providers/StorageProvider/mocks/MockStorageProvider";
import { MockBarbershopRepository } from "../../infra/repositories/mocks/MockBarbershopRepository";
import { updatePageThemeBodySchema } from "../../schemas/pageThemeSchemas";
import { PAGE_THEME_DEFAULTS } from "../../utils/pageThemeDefaults";
import { UpdatePageThemeUseCase } from "./UpdatePageThemeUseCase";
import { GetPageThemeOgImageUseCase } from "./GetPageThemeOgImageUseCase";
import { UploadPageThemeCoverUseCase } from "./UploadPageThemeCoverUseCase";
import { DeletePageThemeCoverUseCase } from "./DeletePageThemeCoverUseCase";

const FOREIGN_OWNER = { role: "OWNER", barbershopId: "shop-other" };
const MASTER = { role: "MASTER_ADMIN", barbershopId: undefined };

const validBody = {
  presetKey: "esmeralda",
  accentColor: "#2CB58A",
  backgroundColor: "#0F1110",
  surfaceColor: "#1B1F1D",
  textColor: "#F2F5F3",
  textMutedColor: "#8B9990",
  radiusStyle: "rounded",
  buttonStyle: "filled",
  coverOverlay: 40,
} as const;

async function createRepoWithShop(): Promise<{ repo: MockBarbershopRepository; shopId: string; owner: { role: string; barbershopId: string } }> {
  const repo = new MockBarbershopRepository();
  const shop = await repo.create({ name: "Barbearia OK", whatsapp: "11999999999" });
  return { repo, shopId: shop.id, owner: { role: "OWNER", barbershopId: shop.id } };
}

async function coverBuffer(width = 1920, height = 1080): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .png()
    .toBuffer();
}

describe("updatePageThemeBodySchema", () => {
  it("aceita o payload padrão válido", () => {
    expect(() => updatePageThemeBodySchema.parse(validBody)).not.toThrow();
  });

  it("rejeita hex inválido (sem #)", () => {
    expect(updatePageThemeBodySchema.safeParse({ ...validBody, accentColor: "2CB58A" }).success).toBe(false);
  });

  it("rejeita coverOverlay fora de 0–80", () => {
    expect(updatePageThemeBodySchema.safeParse({ ...validBody, coverOverlay: 90 }).success).toBe(false);
  });
});

describe("UpdatePageThemeUseCase", () => {
  it("persiste o tema normalizado para o dono do salão", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const useCase = new UpdatePageThemeUseCase(repo);

    const theme = await useCase.execute(shopId, { ...validBody }, owner);

    expect(theme.accentColor).toBe("#2CB58A");
    expect(theme.coverOverlay).toBe(40);
    expect(await repo.findPageTheme(shopId)).not.toBeNull();
  });

  it("rejeita contraste reprovado com 400 e não grava", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const useCase = new UpdatePageThemeUseCase(repo);

    const bad = { ...validBody, backgroundColor: "#FFFFFF", surfaceColor: "#FFFFFF" };
    await expect(useCase.execute(shopId, bad, owner)).rejects.toMatchObject({ statusCode: 400 });
    expect(await repo.findPageTheme(shopId)).toBeNull();
  });

  it("rejeita dono de outro salão com 403", async () => {
    const { repo, shopId } = await createRepoWithShop();
    const useCase = new UpdatePageThemeUseCase(repo);

    await expect(useCase.execute(shopId, { ...validBody }, FOREIGN_OWNER)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejeita coverPublicId que não pertence à pasta do tenant", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const useCase = new UpdatePageThemeUseCase(repo);

    await expect(
      useCase.execute(
        shopId,
        {
          ...validBody,
          coverUrl: "https://res.cloudinary.com/x/image/upload/agendaja/other-shop/cover/cover",
          coverPublicId: "agendaja/other-shop/cover/cover",
        },
        owner
      )
    ).rejects.toThrowError(/pasta Cloudinary deste salão/);
  });

  it("rejeita coverUrl que não corresponde ao coverPublicId", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const useCase = new UpdatePageThemeUseCase(repo);

    await expect(
      useCase.execute(
        shopId,
        {
          ...validBody,
          coverUrl: "https://res.cloudinary.com/x/image/upload/agendaja/wrong/cover/cover",
          coverPublicId: `agendaja/${shopId}/cover/cover`,
        },
        owner
      )
    ).rejects.toThrowError(/coverUrl não corresponde/);
  });

  it("MASTER_ADMIN pode editar o tema de qualquer salão", async () => {
    const { repo, shopId } = await createRepoWithShop();
    const useCase = new UpdatePageThemeUseCase(repo);

    const theme = await useCase.execute(shopId, { ...validBody }, MASTER);
    expect(theme.barbershopId).toBe(shopId);
  });
});

describe("UploadPageThemeCoverUseCase", () => {
  it("sobe a capa na pasta do tenant e grava coverUrl/coverPublicId", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    const useCase = new UploadPageThemeCoverUseCase(repo, storage);

    const theme = await useCase.execute(
      { barbershopId: shopId, buffer: await coverBuffer(), mimeType: "image/png" },
      owner
    );

    expect(storage.uploadedBuffers).toHaveLength(1);
    const upload = storage.uploadedBuffers[0];
    expect(upload.objectName).toBe(`agendaja/${shopId}/cover/cover`);
    expect(upload.options?.overwrite).toBe(true);
    expect(upload.options?.invalidate).toBe(true);
    expect(theme.coverUrl).toBe(upload.publicUrl);
    expect(theme.coverPublicId).toBe(upload.objectName);
  });

  it("rejeita imagem fora das dimensões antes de tocar o storage", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    const useCase = new UploadPageThemeCoverUseCase(repo, storage);

    await expect(
      useCase.execute(
        { barbershopId: shopId, buffer: await coverBuffer(800, 450), mimeType: "image/png" },
        owner
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(storage.uploadedBuffers).toHaveLength(0);
  });

  it("falha do storage propaga 502 sem gravar no banco", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    storage.uploadBuffer = async () => {
      throw new AppError("Falha ao enviar imagem ao Cloudinary", 502);
    };
    const useCase = new UploadPageThemeCoverUseCase(repo, storage);

    await expect(
      useCase.execute(
        { barbershopId: shopId, buffer: await coverBuffer(), mimeType: "image/png" },
        owner
      )
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(await repo.findPageTheme(shopId)).toBeNull();
  });

  it("se o banco falhar após o upload, apaga o asset recém-enviado", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    repo.upsertPageTheme = async () => {
      throw new Error("db down");
    };
    const useCase = new UploadPageThemeCoverUseCase(repo, storage);

    await expect(
      useCase.execute(
        { barbershopId: shopId, buffer: await coverBuffer(), mimeType: "image/png" },
        owner
      )
    ).rejects.toThrowError("db down");

    expect(storage.deletedObjects).toContain(`agendaja/${shopId}/cover/cover`);
  });

  it("rejeita usuário de outro tenant com 403", async () => {
    const { repo, shopId } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    const useCase = new UploadPageThemeCoverUseCase(repo, storage);

    await expect(
      useCase.execute(
        { barbershopId: shopId, buffer: await coverBuffer(), mimeType: "image/png" },
        FOREIGN_OWNER
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(storage.uploadedBuffers).toHaveLength(0);
  });
});

describe("DeletePageThemeCoverUseCase", () => {
  it("apaga o asset do Cloudinary e zera coverUrl/coverPublicId", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    const upload = new UploadPageThemeCoverUseCase(repo, storage);
    await upload.execute(
      { barbershopId: shopId, buffer: await coverBuffer(), mimeType: "image/png" },
      owner
    );

    const deleteUseCase = new DeletePageThemeCoverUseCase(repo, storage);
    const theme = await deleteUseCase.execute(shopId, owner);

    expect(storage.deletedObjects).toContain(`agendaja/${shopId}/cover/cover`);
    expect(theme?.coverUrl).toBeNull();
    expect(theme?.coverPublicId).toBeNull();
  });

  it("é seguro quando não há tema salvo", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    const storage = new MockStorageProvider();
    const useCase = new DeletePageThemeCoverUseCase(repo, storage);

    await expect(useCase.execute(shopId, owner)).resolves.toBeNull();
  });
});

describe("PAGE_THEME_DEFAULTS", () => {
  it("espelha o visual atual do app (regressão zero)", () => {
    expect(PAGE_THEME_DEFAULTS).toMatchObject({
      accentColor: "#2CB58A",
      backgroundColor: "#0F1110",
      surfaceColor: "#1B1F1D",
      textColor: "#F2F5F3",
      textMutedColor: "#8B9990",
    });
  });
});

describe("GetPageThemeOgImageUseCase", () => {
  it("gera PNG 1200×630 com as cores do tema", async () => {
    const { repo, shopId, owner } = await createRepoWithShop();
    await new UpdatePageThemeUseCase(repo).execute(shopId, { ...validBody }, owner);
    const useCase = new GetPageThemeOgImageUseCase(repo);

    const png = await useCase.execute(shopId);
    const metadata = await sharp(png).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  it("usa os defaults quando o salão não tem tema", async () => {
    const { repo, shopId } = await createRepoWithShop();
    const useCase = new GetPageThemeOgImageUseCase(repo);

    const png = await useCase.execute(shopId);
    const metadata = await sharp(png).metadata();

    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1200);
  });

  it("lança 404 para salão inexistente", async () => {
    const { repo } = await createRepoWithShop();
    const useCase = new GetPageThemeOgImageUseCase(repo);

    await expect(useCase.execute("non-existent")).rejects.toMatchObject({ statusCode: 404 });
  });
});
