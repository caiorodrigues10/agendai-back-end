/// <reference types="vitest/globals" />
import type { FastifyReply, FastifyRequest } from "fastify";

// --- Mock prisma ---
const mockPostMediaFindMany = vi.fn();
const mockPostMediaCount = vi.fn();
const mockPostMediaCreate = vi.fn();
const mockPostMediaFindUnique = vi.fn();
const mockPostMediaUpdate = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    postMedia: {
      findMany: (...a: unknown[]) => mockPostMediaFindMany(...a),
      count: (...a: unknown[]) => mockPostMediaCount(...a),
      create: (...a: unknown[]) => mockPostMediaCreate(...a),
      findUnique: (...a: unknown[]) => mockPostMediaFindUnique(...a),
      update: (...a: unknown[]) => mockPostMediaUpdate(...a),
    },
  },
}));

// --- Mock storage ---
const mockUploadBuffer = vi.fn().mockResolvedValue({ publicUrl: "https://cdn.example.com/m.png", objectName: "posts-media/m.png" });
vi.mock("tsyringe", async importOriginal => ({
  ...(await importOriginal<typeof import("tsyringe")>()),
  container: { resolve: () => ({ uploadBuffer: mockUploadBuffer }) },
}));

import { AppError } from "@/shared/errors/AppError";
import { GALLERY_MAX_PHOTOS, PostMediaController } from "./PostMediaController";

const BARBERSHOP_ID = "00000000-0000-0000-0000-000000000001";
const MEDIA_ID = "00000000-0000-0000-0000-000000000002";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function fakeReply() {
  const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  return reply as unknown as FastifyReply;
}

function fakeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "user-1", role: "OWNER", barbershopId: BARBERSHOP_ID },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

async function* fakeParts(items: Array<Record<string, unknown>>) {
  for (const item of items) yield item;
}

function mediaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEDIA_ID,
    barbershopId: BARBERSHOP_ID,
    url: "https://cdn.example.com/m.png",
    objectName: "posts-media/m.png",
    mimeType: "image/png",
    size: PNG.byteLength,
    inGallery: false,
    createdAt: new Date("2026-10-01"),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("PostMediaController — galeria (inGallery)", () => {
  it("list filtra pela galeria quando inGallery=true", async () => {
    mockPostMediaFindMany.mockResolvedValueOnce([]);
    const controller = new PostMediaController();
    const reply = fakeReply();
    await controller.list(
      fakeRequest({ query: { barbershopId: BARBERSHOP_ID, inGallery: "true" } }),
      reply
    );
    expect(mockPostMediaFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { barbershopId: BARBERSHOP_ID, inGallery: true },
    }));
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [] }));
  });

  it("upload cria a foto na galeria mesmo sem o campo inGallery", async () => {
    mockPostMediaCount.mockResolvedValueOnce(0);
    mockPostMediaCreate.mockResolvedValueOnce(mediaRow({ inGallery: true }));
    const controller = new PostMediaController();
    const reply = fakeReply();
    await controller.upload(
      fakeRequest({
        params: { barbershopId: BARBERSHOP_ID },
        parts: () => fakeParts([
          { type: "file", mimetype: "image/png", toBuffer: async () => PNG },
        ]),
      }),
      reply
    );
    expect(mockPostMediaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inGallery: true }),
    }));
    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it("upload recusa com 400 quando a galeria já atingiu o limite (antes de enviar ao storage)", async () => {
    mockPostMediaCount.mockResolvedValueOnce(GALLERY_MAX_PHOTOS);
    const controller = new PostMediaController();
    const promise = controller.upload(
      fakeRequest({
        params: { barbershopId: BARBERSHOP_ID },
        parts: () => fakeParts([
          { type: "file", mimetype: "image/png", toBuffer: async () => PNG },
        ]),
      }),
      fakeReply()
    );
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 400, message: `Sua galeria já tem ${GALLERY_MAX_PHOTOS} fotos. Remova uma foto para enviar outra.` });
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(mockPostMediaCreate).not.toHaveBeenCalled();
  });

  it("update alterna para fora da galeria sem contar capacidade", async () => {
    mockPostMediaFindUnique.mockResolvedValueOnce(mediaRow({ inGallery: true }));
    mockPostMediaUpdate.mockResolvedValueOnce(mediaRow({ inGallery: false }));
    const controller = new PostMediaController();
    await controller.update(
      fakeRequest({ params: { id: MEDIA_ID }, body: { inGallery: false } }),
      fakeReply()
    );
    expect(mockPostMediaCount).not.toHaveBeenCalled();
    expect(mockPostMediaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { inGallery: false },
    }));
  });

  it("update para dentro da galeria respeita o limite de fotos (400 com mensagem clara)", async () => {
    mockPostMediaFindUnique.mockResolvedValueOnce(mediaRow({ inGallery: false }));
    mockPostMediaCount.mockResolvedValueOnce(GALLERY_MAX_PHOTOS);
    const controller = new PostMediaController();
    const promise = controller.update(
      fakeRequest({ params: { id: MEDIA_ID }, body: { inGallery: true } }),
      fakeReply()
    );
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 400, message: expect.stringContaining(`Sua galeria já tem ${GALLERY_MAX_PHOTOS} fotos`) });
    expect(mockPostMediaUpdate).not.toHaveBeenCalled();
  });
});

describe("PostMediaController — erros amigáveis do upload", () => {
  it("converte estouro de fileSize (multipart) em 413 com mensagem amigável", async () => {
    async function* tooLargeParts(): AsyncGenerator<never> {
      const err = Object.assign(new Error("request file too large"), { code: "FST_REQ_FILE_TOO_LARGE" });
      throw err;
    }
    const controller = new PostMediaController();
    const promise = controller.upload(
      fakeRequest({
        params: { barbershopId: BARBERSHOP_ID },
        parts: () => tooLargeParts(),
      }),
      fakeReply()
    );
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 413, message: expect.stringContaining("no máximo 5 MB") });
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("responde 415 para formato não suportado", async () => {
    const controller = new PostMediaController();
    const promise = controller.upload(
      fakeRequest({
        params: { barbershopId: BARBERSHOP_ID },
        parts: () => fakeParts([
          { type: "file", mimetype: "application/pdf", toBuffer: async () => Buffer.from("%PDF") },
        ]),
      }),
      fakeReply()
    );
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 415 });
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it("converte 'Invalid image file' do storage em 400 amigável (sem 500)", async () => {
    mockUploadBuffer.mockRejectedValueOnce(new Error("Invalid image file"));
    const controller = new PostMediaController();
    const promise = controller.upload(
      fakeRequest({
        params: { barbershopId: BARBERSHOP_ID },
        parts: () => fakeParts([
          { type: "file", mimetype: "image/png", toBuffer: async () => PNG },
        ]),
      }),
      fakeReply()
    );
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 400, message: "A imagem parece inválida ou corrompida." });
    expect(mockPostMediaCreate).not.toHaveBeenCalled();
  });

  it("converte 'Failed to ping image' (PNG corrompido real do Cloudinary) em 400", async () => {
    const sdkError = Object.assign(new Error("Failed to ping image"), { http_code: 400 });
    mockUploadBuffer.mockRejectedValueOnce(sdkError);
    const controller = new PostMediaController();
    const promise = controller.upload(
      fakeRequest({
        params: { barbershopId: BARBERSHOP_ID },
        parts: () => fakeParts([
          { type: "file", mimetype: "image/png", toBuffer: async () => PNG },
        ]),
      }),
      fakeReply()
    );
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 400, message: "A imagem parece inválida ou corrompida." });
    expect(mockPostMediaCreate).not.toHaveBeenCalled();
  });

  it("entrega URLs do Cloudinary com f_auto,q_auto sem alterar o banco", async () => {
    const cloudUrl = "https://res.cloudinary.com/demo/image/upload/v1/posts-media/m.png";
    mockPostMediaFindMany.mockResolvedValueOnce([mediaRow({ url: cloudUrl })]);
    const controller = new PostMediaController();
    const reply = fakeReply();
    await controller.list(fakeRequest({ query: { barbershopId: BARBERSHOP_ID } }), reply);
    const payload = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: Array<{ url: string }> };
    expect(payload.data[0].url).toBe("https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/posts-media/m.png");
  });
});
