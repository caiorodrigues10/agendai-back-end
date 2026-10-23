import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
const mocks = vi.hoisted(() => ({ list: vi.fn(), find: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() }));
vi.mock("@/libs/prismaClient", () => ({ prisma: { feedPost: { findMany: mocks.list, findUnique: mocks.find, update: mocks.update, create: mocks.create, delete: mocks.delete } } }));
const storageMocks = vi.hoisted(() => ({ persist: vi.fn(), remove: vi.fn() }));
vi.mock("@/modules/posts/services/postImageStorageService", () => ({
  persistPostImage: (...a: unknown[]) => storageMocks.persist(...a),
  deletePostImage: (...a: unknown[]) => storageMocks.remove(...a),
}));
import { FeedController } from "./FeedController";

const salonId = "11111111-1111-4111-8111-111111111111";
const postId = "22222222-2222-4222-8222-222222222222";
const row = { id: postId, barbershopId: salonId, type: "HAIRCUT", title: "Bastidores", content: "Conheça nosso salão", imageUrl: "cover.png", videoUrl: "reel.mp4", format: "PORTRAIT", _count: { comments: 3 }, likes: 7, status: "PUBLISHED", postMode: "BOTH", createdAt: new Date(), scheduledFor: null, publishedAt: new Date(), ctaText: null, author: { name: "Equipe" } };
const reply = () => ({ status: vi.fn().mockReturnThis(), send: vi.fn() }) as unknown as FastifyReply;

describe("public feed regressions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([row]); mocks.find.mockResolvedValue(row); mocks.update.mockResolvedValue({ ...row, likes: 8 }); });
  it("preserves video, format and real comment count in public profiles", async () => {
    const res = reply();
    await new FeedController().list({ query: { barbershopId: salonId } } as unknown as FastifyRequest, res);
    expect(res.send).toHaveBeenCalledWith({ success: true, data: [expect.objectContaining({ videoUrl: "reel.mp4", format: "portrait", commentsCount: 3 })] });
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ barbershopId: salonId, status: "PUBLISHED", barbershop: { active: true }, AND: expect.any(Array) }) }));
  });
  it("does not expose drafts through public likes", async () => {
    mocks.find.mockResolvedValue({ ...row, status: "DRAFT" });
    await expect(new FeedController().update({ params: { id: postId }, body: { likes: 8 } } as unknown as FastifyRequest, reply())).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("increments likes atomically rather than overwriting a concurrent count", async () => {
    await new FeedController().update({ params: { id: postId }, body: { likes: 9999 } } as unknown as FastifyRequest, reply());
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { likes: { increment: 1 } } }));
  });
  it("does not treat a video edit as a public like", async () => {
    await expect(new FeedController().update({ params: { id: postId }, body: { likes: 8, videoUrl: "https://example.com/video.mp4" } } as unknown as FastifyRequest, reply())).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fase 1.5 — arte do post vira asset em posts-art (Cloudinary)
// ---------------------------------------------------------------------------
describe("feed image persistence — posts-art (Fase 1.5)", () => {
  const ART = {
    imageUrl: "https://res.cloudinary.com/test/image/upload/posts-art/art.png",
    imageAssetName: "posts-art/art",
  };
  const user = { id: "user-1", role: "OWNER", barbershopId: salonId };
  const currentRow = { ...row, imageUrl: "data:image/png;base64,OLD", imageAssetName: "posts-art/old" };

  function createBody(imageUrl: string | null) {
    return { body: { barbershopId: salonId, type: "haircut", content: "texto", imageUrl }, user } as unknown as FastifyRequest;
  }

  function updateBody(imageUrl: string | null) {
    return { params: { id: postId }, body: { imageUrl }, user } as unknown as FastifyRequest;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Data-URL vira asset; URL http legada passa adiante sem asset.
    storageMocks.persist.mockImplementation(async (_barbershopId: string, imageUrl: string) =>
      imageUrl.startsWith("data:") ? ART : { imageUrl, imageAssetName: null },
    );
    storageMocks.remove.mockResolvedValue(undefined);
    mocks.find.mockResolvedValue(currentRow);
    mocks.create.mockResolvedValue(row);
    mocks.update.mockResolvedValue(row);
    mocks.delete.mockResolvedValue({});
  });

  it("uploads a data-URL cover on create and stores the asset name", async () => {
    const res = reply();
    await new FeedController().create(createBody("data:image/png;base64,NEW"), res);

    expect(storageMocks.persist).toHaveBeenCalledWith(salonId, "data:image/png;base64,NEW");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: ART.imageUrl, imageAssetName: ART.imageAssetName }),
      }),
    );
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });

  it("passes an external URL through on create without an asset", async () => {
    const res = reply();
    await new FeedController().create(createBody("https://legacy.example/cover.png"), res);

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: "https://legacy.example/cover.png", imageAssetName: null }),
      }),
    );
  });

  it("compensates the uploaded asset when create fails", async () => {
    mocks.create.mockRejectedValue(new Error("db down"));

    await expect(new FeedController().create(createBody("data:image/png;base64,NEW"), reply())).rejects.toThrow("db down");

    expect(storageMocks.remove).toHaveBeenCalledWith(ART.imageAssetName);
  });

  it("replacing the cover with a new data-URL destroys the previous asset", async () => {
    const res = reply();
    await new FeedController().update(updateBody("data:image/png;base64,NEW"), res);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: ART.imageUrl, imageAssetName: ART.imageAssetName }),
      }),
    );
    expect(storageMocks.remove).toHaveBeenCalledWith("posts-art/old");
  });

  it("removing the cover (null) clears the reference and destroys the asset", async () => {
    const res = reply();
    await new FeedController().update(updateBody(null), res);

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: null, imageAssetName: null }),
      }),
    );
    expect(storageMocks.remove).toHaveBeenCalledWith("posts-art/old");
  });

  it("re-sending the current URL is idempotent and keeps the asset", async () => {
    mocks.find.mockResolvedValue({ ...row, imageUrl: "https://res.cloudinary.com/test/image/upload/posts-art/cur.png", imageAssetName: "posts-art/cur" });
    const res = reply();
    await new FeedController().update(updateBody("https://res.cloudinary.com/test/image/upload/posts-art/cur.png"), res);

    const data = mocks.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect("imageUrl" in data).toBe(false);
    expect("imageAssetName" in data).toBe(false);
    expect(storageMocks.remove).not.toHaveBeenCalled();
    expect(storageMocks.persist).not.toHaveBeenCalled();
  });

  it("compensates only the new asset when update fails after upload", async () => {
    mocks.update.mockRejectedValue(new Error("db down"));

    await expect(new FeedController().update(updateBody("data:image/png;base64,NEW"), reply())).rejects.toThrow("db down");

    expect(storageMocks.remove).toHaveBeenCalledTimes(1);
    expect(storageMocks.remove).toHaveBeenCalledWith(ART.imageAssetName);
  });

  it("destroys the asset when the post is deleted", async () => {
    mocks.find.mockResolvedValue({ id: postId, barbershopId: salonId, imageAssetName: "posts-art/art" });
    const res = reply();
    await new FeedController().delete({ params: { id: postId }, user } as unknown as FastifyRequest, res);

    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: postId } });
    expect(storageMocks.remove).toHaveBeenCalledWith("posts-art/art");
  });

  it("does not touch storage when deleting a legacy post (imageAssetName null)", async () => {
    mocks.find.mockResolvedValue({ id: postId, barbershopId: salonId, imageAssetName: null });
    const res = reply();
    await new FeedController().delete({ params: { id: postId }, user } as unknown as FastifyRequest, res);

    expect(mocks.delete).toHaveBeenCalled();
    expect(storageMocks.remove).not.toHaveBeenCalled();
  });
});
