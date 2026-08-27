import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FastifyRequest, FastifyReply } from "fastify";

// --- Mock prisma ---
const mockBarbershopFindUnique = vi.fn();
const mockServiceFindMany = vi.fn();
const mockScheduleFindFirst = vi.fn();
const mockFeedPostCreate = vi.fn();
const mockFeedPostFindUnique = vi.fn();
const mockFeedPostUpdate = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: { findUnique: (...a: unknown[]) => mockBarbershopFindUnique(...a) },
    service: { findMany: (...a: unknown[]) => mockServiceFindMany(...a) },
    schedule: { findFirst: (...a: unknown[]) => mockScheduleFindFirst(...a) },
    feedPost: {
      create: (...a: unknown[]) => mockFeedPostCreate(...a),
      findUnique: (...a: unknown[]) => mockFeedPostFindUnique(...a),
      update: (...a: unknown[]) => mockFeedPostUpdate(...a),
    },
  },
}));

// --- Mock broadcastPostToClients ---
const mockBroadcast = vi.fn().mockResolvedValue(undefined);
vi.mock("../services/postBroadcastService", () => ({
  broadcastPostToClients: (...a: unknown[]) => mockBroadcast(...a),
}));

// --- Mock postImageService (buildPostImage is local, but uses these) ---
vi.mock("../services/postImageService", () => ({
  buildPostSvg: vi.fn().mockReturnValue("<svg></svg>"),
  renderPostSvgToPng: vi.fn().mockReturnValue(Buffer.from("png")),
  pngToDataUrl: vi.fn().mockReturnValue("data:image/png;base64,aWNv"),
}));

// --- Mock logger ---
vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { PostsController } from "./PostsController";

const BARBERSHOP_ID = "00000000-0000-0000-0000-000000000001";
const POST_ID = "00000000-0000-0000-0000-000000000002";
const USER_ID = "00000000-0000-0000-0000-000000000003";

function fakeReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function fakeUser(overrides: Record<string, unknown> = {}) {
  return { id: USER_ID, role: "OWNER", barbershopId: BARBERSHOP_ID, ...overrides };
}

const CREATED_POST_ROW = {
  id: POST_ID,
  barbershopId: BARBERSHOP_ID,
  type: "ANNOUNCEMENT",
  title: "Promo teste",
  content: "Conteúdo",
  imageUrl: "data:image/png;base64,aWNv",
  likes: 0,
  createdAt: new Date("2026-01-01"),
  status: "PUBLISHED",
  scheduledFor: null,
  publishedAt: new Date(),
  postMode: "BOTH",
  ctaText: "Agende já",
  author: { name: "Admin" },
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: loadPostContext stubs
  mockBarbershopFindUnique.mockResolvedValue({
    id: BARBERSHOP_ID,
    name: "Barber Test",
    logoUrl: null,
    evolutionInstanceName: "shop-connected",
  });
  mockServiceFindMany.mockResolvedValue([]);
  mockScheduleFindFirst.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------
describe("PostsController.create — broadcast wiring", () => {
  function buildCreateBody(overrides: Record<string, unknown> = {}) {
    return {
      body: {
        barbershopId: BARBERSHOP_ID,
        type: "announcement",
        title: "Promo teste",
        content: "Conteúdo",
        ctaText: "Agende já",
        postMode: "both",
        ...overrides,
      },
      user: fakeUser(),
    };
  }

  it("calls broadcastPostToClients exactly once when publishing immediately", async () => {
    mockFeedPostCreate.mockResolvedValue(CREATED_POST_ROW);

    const controller = new PostsController();
    const request = buildCreateBody() as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.create(request, reply);

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID,
      "Promo teste",
      "Agende já"
    );
  });

  it("does NOT call broadcast when scheduled for the future", async () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    const scheduledPost = { ...CREATED_POST_ROW, status: "SCHEDULED", scheduledFor: new Date(futureDate) };
    mockFeedPostCreate.mockResolvedValue(scheduledPost);

    const controller = new PostsController();
    const request = buildCreateBody({ scheduledFor: futureDate }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.create(request, reply);

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("passes fallback title when title is null", async () => {
    const postWithoutTitle = { ...CREATED_POST_ROW, title: null };
    mockFeedPostCreate.mockResolvedValue(postWithoutTitle);

    const controller = new PostsController();
    const request = buildCreateBody({ title: undefined }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.create(request, reply);

    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID,
      "Vem pra cá hoje!",
      "Agende já"
    );
  });

  it("rejeita publicar sem instância WhatsApp (409)", async () => {
    mockBarbershopFindUnique.mockResolvedValue({
      id: BARBERSHOP_ID,
      name: "Barber Test",
      logoUrl: null,
      evolutionInstanceName: null,
    });

    const controller = new PostsController();
    const request = buildCreateBody() as unknown as FastifyRequest;
    const reply = fakeReply();

    await expect(controller.create(request, reply)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockFeedPostCreate).not.toHaveBeenCalled();
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("passes null ctaText when ctaText is undefined", async () => {
    const postWithoutCta = { ...CREATED_POST_ROW, ctaText: null };
    mockFeedPostCreate.mockResolvedValue(postWithoutCta);

    const controller = new PostsController();
    const request = buildCreateBody({ ctaText: undefined }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.create(request, reply);

    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID,
      "Promo teste",
      null
    );
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
describe("PostsController.update — broadcast wiring", () => {
  function buildUpdateArgs(id: string, body: Record<string, unknown>) {
    return {
      params: { id },
      body,
      user: fakeUser(),
    };
  }

  it("calls broadcast when transitioning DRAFT → PUBLISHED", async () => {
    mockFeedPostFindUnique.mockResolvedValue({
      id: POST_ID, barbershopId: BARBERSHOP_ID, status: "DRAFT",
    });
    mockFeedPostUpdate.mockResolvedValue({
      ...CREATED_POST_ROW,
      status: "PUBLISHED",
    });

    const controller = new PostsController();
    const request = buildUpdateArgs(POST_ID, { status: "published" }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.update(request, reply);

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID,
      "Promo teste",
      "Agende já"
    );
  });

  it("calls broadcast when transitioning SCHEDULED → PUBLISHED", async () => {
    mockFeedPostFindUnique.mockResolvedValue({
      id: POST_ID, barbershopId: BARBERSHOP_ID, status: "SCHEDULED",
    });
    mockFeedPostUpdate.mockResolvedValue({
      ...CREATED_POST_ROW,
      status: "PUBLISHED",
    });

    const controller = new PostsController();
    const request = buildUpdateArgs(POST_ID, { status: "published" }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.update(request, reply);

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });

  it("does NOT call broadcast when editing title of an already PUBLISHED post", async () => {
    mockFeedPostFindUnique
      .mockResolvedValueOnce({ id: POST_ID, barbershopId: BARBERSHOP_ID, status: "PUBLISHED" });
    mockFeedPostUpdate.mockResolvedValue({
      ...CREATED_POST_ROW,
      title: "Título atualizado",
    });

    const controller = new PostsController();
    const request = buildUpdateArgs(POST_ID, { title: "Título atualizado" }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.update(request, reply);

    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("does NOT call broadcast when changing scheduledFor without publishing", async () => {
    const futureDate = new Date(Date.now() + 86_400_000).toISOString();
    mockFeedPostFindUnique
      .mockResolvedValueOnce({ id: POST_ID, barbershopId: BARBERSHOP_ID, status: "DRAFT" });
    mockFeedPostUpdate.mockResolvedValue({
      ...CREATED_POST_ROW,
      status: "SCHEDULED",
      scheduledFor: new Date(futureDate),
    });

    const controller = new PostsController();
    const request = buildUpdateArgs(POST_ID, { scheduledFor: futureDate }) as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.update(request, reply);

    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});
