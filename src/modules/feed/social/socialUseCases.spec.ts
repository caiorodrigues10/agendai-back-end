import { describe, it, expect, vi, beforeEach } from "vitest";
import { SocialUseCases } from "./socialUseCases";
import { SocialRepository, activeStoryWhere, publishedPostWhere } from "./socialRepository";
import { commentSchema, commentQuerySchema } from "./socialSchemas";

vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

const post = {
  id: "post", barbershopId: "salon", authorId: "owner", type: "HAIRCUT", title: "Resultado",
  content: "Um novo corte", imageUrl: "https://cdn/image.png", videoUrl: "https://cdn/video.mp4",
  likes: 2, createdAt: new Date(), publishedAt: new Date(), format: "PORTRAIT", postMode: "BOTH", ctaText: "Agendar",
  author: { name: "Equipe" }, barbershop: { name: "Studio", logoUrl: null }, _count: { comments: 1 },
};
const owner = { id: "owner", role: "OWNER", barbershopId: "salon" };
const client = { id: "client", role: "CLIENT" };
const row = { id: "comment", postId: "post", authorId: null, clientIdentityId: "client", content: "Gostei!", createdAt: new Date(), author: null, clientIdentity: { name: "Ana" } };
const repo = {
  getPost: vi.fn(), stories: vi.fn(), comments: vi.fn(), createComment: vi.fn(), getComment: vi.fn(), deleteComment: vi.fn(),
  validateActor: vi.fn(), activeSalon: vi.fn(), tagged: vi.fn(), requestTag: vi.fn(), moderateTag: vi.fn(),
};
const useCases = new SocialUseCases(repo as unknown as SocialRepository);

beforeEach(() => {
  vi.resetAllMocks();
  repo.getPost.mockResolvedValue(post);
  repo.validateActor.mockImplementation(async actor => actor);
  repo.getComment.mockResolvedValue(row);
  repo.createComment.mockResolvedValue(row);
  repo.activeSalon.mockResolvedValue({ id: "other" });
  repo.tagged.mockResolvedValue([]);
});

describe("social published content and verified comments", () => {
  it("returns videos, original format and comment count without exposing personal data", async () => {
    const response = await useCases.getPost("salon", "post");
    expect(response).toMatchObject({ videoUrl: post.videoUrl, format: "portrait", commentsCount: 1, shopName: "Studio" });
    expect(response).not.toHaveProperty("authorId");
  });
  it("rejects drafts, expired stories and posts belonging to another salon using the scoped lookup", async () => {
    repo.getPost.mockResolvedValue(null);
    await expect(useCases.getPost("other", "post")).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.getPost).toHaveBeenCalledWith("other", "post");
  });
  it("requires a verified session to comment", async () => {
    await expect(useCases.comment("salon", "post", "Oi")).rejects.toMatchObject({ statusCode: 401 });
    expect(repo.createComment).not.toHaveBeenCalled();
  });
  it("rejects inactive staff even when their token is still valid", async () => {
    repo.validateActor.mockResolvedValue(null);
    await expect(useCases.comment("salon", "post", "Oi", owner)).rejects.toMatchObject({ statusCode: 401 });
  });
  it("supports OTP client identities and only returns the public display name", async () => {
    const response = await useCases.comment("salon", "post", "Gostei!", client);
    expect(response).toMatchObject({ content: "Gostei!", authorName: "Ana", authorId: "client" });
    expect(response).not.toHaveProperty("clientIdentity");
    expect(repo.createComment).toHaveBeenCalledWith("post", "Gostei!", client);
  });
  it("never lists comments from unpublished content", async () => {
    repo.getPost.mockResolvedValue(null);
    await expect(useCases.comments("salon", "post", 1)).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.comments).not.toHaveBeenCalled();
  });
  it("paginates comments independently of the post grid", async () => {
    repo.comments.mockResolvedValue({ data: [row], total: 25 });
    const result = await useCases.comments("salon", "post", 2);
    expect(repo.comments).toHaveBeenCalledWith("post", 2, 20);
    expect(result.meta).toEqual({ page: 2, limit: 20, total: 25 });
  });
  it("allows clients to delete their own comments", async () => {
    await useCases.deleteComment("salon", "post", "comment", client);
    expect(repo.deleteComment).toHaveBeenCalledWith("post", "comment");
  });
  it("does not confuse staff and client identities when matching authors", async () => {
    await expect(useCases.deleteComment("salon", "post", "comment", { id: "client", role: "EMPLOYEE", barbershopId: "salon" })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("allows the owner to remove inappropriate comments", async () => {
    await useCases.deleteComment("salon", "post", "comment", owner);
    expect(repo.deleteComment).toHaveBeenCalled();
  });
  it("denies moderators of another salon", async () => {
    await expect(useCases.deleteComment("salon", "post", "comment", { ...owner, barbershopId: "other" })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("approved tagged posts", () => {
  it("lets visitors read only approved tags", async () => {
    await useCases.tagged("salon", false);
    expect(repo.tagged).toHaveBeenCalledWith("salon", false);
  });
  it("hides pending tags from visitors and employees", async () => {
    await expect(useCases.tagged("salon", true)).rejects.toMatchObject({ statusCode: 401 });
    await expect(useCases.tagged("salon", true, { ...owner, role: "EMPLOYEE" })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("requires staff belonging to the source salon to request a tag", async () => {
    await expect(useCases.requestTag("salon", "post", "other", client)).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.requestTag).not.toHaveBeenCalled();
  });
  it("stores tags as requests rather than self-approving them", async () => {
    await useCases.requestTag("salon", "post", "other", owner);
    expect(repo.requestTag).toHaveBeenCalledWith("post", "other", "owner");
  });
  it("denies self-tags and missing targets", async () => {
    await expect(useCases.requestTag("salon", "post", "salon", owner)).rejects.toMatchObject({ statusCode: 400 });
    repo.activeSalon.mockResolvedValue(null);
    await expect(useCases.requestTag("salon", "post", "other", owner)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("only the target owner may accept or reject a request", async () => {
    await expect(useCases.moderateTag("other", "tag", true, owner)).rejects.toMatchObject({ statusCode: 403 });
    repo.moderateTag.mockResolvedValue({ count: 1 });
    await useCases.moderateTag("other", "tag", true, { ...owner, barbershopId: "other" });
    expect(repo.moderateTag).toHaveBeenCalledWith("other", "tag", true);
  });
});

describe("social input and expiry boundaries", () => {
  it("rejects blank comments, oversized input and impersonation fields", () => {
    expect(commentSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(commentSchema.safeParse({ content: "x".repeat(501) }).success).toBe(false);
    expect(commentSchema.safeParse({ content: "Oi", authorId: "someone" }).success).toBe(false);
    expect(commentSchema.parse({ content: "  Oi  " }).content).toBe("Oi");
    expect(commentQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });
  it("computes the story window from publication time (not draft creation)", () => {
    const where = activeStoryWhere(new Date("2026-10-02T12:00:00Z"));
    expect(where).toMatchObject({ format: "STORY", OR: [{ publishedAt: { gte: new Date("2026-10-01T12:00:00Z") } }, { publishedAt: null, createdAt: { gte: new Date("2026-10-01T12:00:00Z") } }] });
    expect(publishedPostWhere("salon")).toMatchObject({ barbershopId: "salon", status: "PUBLISHED", barbershop: { active: true } });
  });
});
