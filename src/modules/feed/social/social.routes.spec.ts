import Fastify, { type FastifyInstance } from "fastify";
import { sign } from "jsonwebtoken";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import auth from "@/config/auth";

const mock = vi.hoisted(() => ({ getPost: vi.fn(), comments: vi.fn(), stories: vi.fn(), tagged: vi.fn(), actor: vi.fn(), createComment: vi.fn(), moderate: vi.fn() }));
vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));
vi.mock("./socialRepository", () => ({
  SocialRepository: class {
    getPost = mock.getPost; comments = mock.comments; stories = mock.stories; tagged = mock.tagged;
    validateActor = mock.actor; createComment = mock.createComment; moderateTag = mock.moderate;
  },
}));
vi.mock("@/shared/infra/http/middlewares/authenticateClient", () => ({
  authenticateClient: async (req: { headers: { authorization?: string }; user?: unknown }) => {
    if (req.headers.authorization === "Bearer otp-client") { req.user = { id: "client", role: "CLIENT" }; return; }
    throw Object.assign(new Error("Token ausente ou inválido"), { statusCode: 401 });
  },
}));
import { socialRoutes } from "./social.routes";

const salonId = "11111111-1111-4111-8111-111111111111";
const postId = "22222222-2222-4222-8222-222222222222";
const source = {
  id: postId, barbershopId: salonId, type: "ANNOUNCEMENT", title: "Post", content: "Legenda", imageUrl: null, videoUrl: null,
  likes: 0, createdAt: new Date(), publishedAt: new Date(), format: "STORY", postMode: "BOTH", ctaText: "Agendar",
  author: null, barbershop: { name: "Salão", logoUrl: null }, _count: { comments: 0 },
};
let app: FastifyInstance;
beforeAll(async () => {
  mock.getPost.mockResolvedValue(source);
  mock.comments.mockResolvedValue({ data: [], total: 0 });
  mock.stories.mockResolvedValue([source]);
  mock.tagged.mockResolvedValue([]);
  mock.actor.mockImplementation(async user => user);
  mock.createComment.mockResolvedValue({ id: "comment", content: "Olá", createdAt: new Date(), authorId: null, clientIdentityId: "client", author: null, clientIdentity: { name: "Cliente" } });
  app = Fastify();
  app.setErrorHandler((error, _req, reply) => reply.status(error.statusCode || (error.name === "ZodError" ? 400 : 500)).send({ message: error.message }));
  await app.register(socialRoutes, { prefix: "/api" });
  await app.ready();
});
afterAll(async () => { await app.close(); });

describe("public salon social HTTP contracts", () => {
  it("serves a public permalink without authentication", async () => {
    const response = await app.inject({ method: "GET", url: `/api/salons/${salonId}/posts/${postId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: postId, shopName: "Salão", format: "story" });
  });
  it("returns paginated comments in the frontend contract", async () => {
    const response = await app.inject({ method: "GET", url: `/api/salons/${salonId}/posts/${postId}/comments` });
    expect(response.json()).toMatchObject({ success: true, data: [], meta: { page: 1, limit: 20, total: 0 } });
  });
  it("serves active stories", async () => {
    const response = await app.inject({ method: "GET", url: `/api/salons/${salonId}/stories` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
  });
  it("rejects invalid permalink IDs before querying", async () => {
    const response = await app.inject({ method: "GET", url: `/api/salons/${salonId}/posts/invalid` });
    expect(response.statusCode).toBe(400);
  });
  it("requires authentication to create a comment", async () => {
    const response = await app.inject({ method: "POST", url: `/api/salons/${salonId}/posts/${postId}/comments`, payload: { content: "Olá" } });
    expect(response.statusCode).toBe(401);
  });
  it("accepts verified opaque OTP sessions alongside staff JWTs", async () => {
    const response = await app.inject({ method: "POST", url: `/api/salons/${salonId}/posts/${postId}/comments`, headers: { authorization: "Bearer otp-client" }, payload: { content: "Olá" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ content: "Olá", authorName: "Cliente" });
  });
  it("prevents public access to pending tags", async () => {
    const response = await app.inject({ method: "GET", url: `/api/salons/${salonId}/tagged?pending=true` });
    expect(response.statusCode).toBe(401);
  });
  it("accepts signed owner JWTs to review pending tags", async () => {
    const token = sign({ role: "OWNER", barbershopId: salonId }, auth.secret, { subject: "owner" });
    const response = await app.inject({ method: "GET", url: `/api/salons/${salonId}/tagged?pending=true`, headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
  });
});
