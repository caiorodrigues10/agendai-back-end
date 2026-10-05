import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
const mocks = vi.hoisted(() => ({ list: vi.fn(), find: vi.fn(), update: vi.fn() }));
vi.mock("@/libs/prismaClient", () => ({ prisma: { feedPost: { findMany: mocks.list, findUnique: mocks.find, update: mocks.update } } }));
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
