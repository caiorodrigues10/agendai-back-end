/// <reference types="vitest/globals" />
import type { FastifyRequest, FastifyReply } from "fastify";

// --- Mock prisma ---
const mockBarbershopFindUnique = vi.fn();
const mockServiceFindMany = vi.fn();
const mockScheduleFindFirst = vi.fn();
const mockFeedPostCreate = vi.fn();
const mockFeedPostFindUnique = vi.fn();
const mockFeedPostUpdate = vi.fn();
const mockFeedPostUpdateMany = vi.fn();
const mockFeedPostCount = vi.fn();
const mockFeedPostFindMany = vi.fn();
const mockSalonClientCount = vi.fn();
const mockPostMediaFindFirst = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: {
      findUnique: (...a: unknown[]) => mockBarbershopFindUnique(...a),
    },
    service: { findMany: (...a: unknown[]) => mockServiceFindMany(...a) },
    schedule: { findFirst: (...a: unknown[]) => mockScheduleFindFirst(...a) },
    feedPost: {
      create: (...a: unknown[]) => mockFeedPostCreate(...a),
      findUnique: (...a: unknown[]) => mockFeedPostFindUnique(...a),
      update: (...a: unknown[]) => mockFeedPostUpdate(...a),
      updateMany: (...a: unknown[]) => mockFeedPostUpdateMany(...a),
      count: (...a: unknown[]) => mockFeedPostCount(...a),
      findMany: (...a: unknown[]) => mockFeedPostFindMany(...a),
    },
    salonClient: { count: (...a: unknown[]) => mockSalonClientCount(...a) },
    postMedia: { findFirst: (...a: unknown[]) => mockPostMediaFindFirst(...a) },
  },
}));

// --- Mock broadcastPostToClients ---
const mockBroadcast = vi.fn().mockResolvedValue(5);
vi.mock("../services/postBroadcastService", () => ({
  broadcastPostToClients: (...a: unknown[]) => mockBroadcast(...a),
}));

// --- Mock Redis ---
const mockRedisSet = vi.fn().mockResolvedValue("OK");
vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: () => ({ set: mockRedisSet, del: vi.fn() }),
}));

// --- Mock postImageService ---
vi.mock("../services/postImageService", () => ({
  buildPostSvg: vi.fn().mockReturnValue("<svg></svg>"),
  renderPostSvgToPng: vi.fn().mockReturnValue(Buffer.from("png")),
  pngToDataUrl: vi.fn().mockReturnValue("data:image/png;base64,aWNv"),
}));

// --- Mock logger ---
vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// --- Mock fetch para loadMediaDataUrl ---
globalThis.fetch = vi.fn();

import { PostsController } from "./PostsController";

const BARBERSHOP_ID = "00000000-0000-0000-0000-000000000001";
const POST_ID = "00000000-0000-0000-0000-000000000002";
const USER_ID = "00000000-0000-0000-0000-000000000003";

function fakeReply() {
  const reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
  return reply as unknown as FastifyReply;
}

function fakeUser(overrides: Record<string, unknown> = {}) {
  return { id: USER_ID, role: "OWNER", barbershopId: BARBERSHOP_ID, ...overrides };
}

function makeDraftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_ID,
    barbershopId: BARBERSHOP_ID,
    type: "ANNOUNCEMENT",
    title: "Post teste",
    content: "",
    imageUrl: "data:image/png;base64,aWNv",
    likes: 0,
    createdAt: new Date("2026-01-01"),
    status: "DRAFT",
    scheduledFor: null,
    publishedAt: null,
    postMode: "BOTH",
    ctaText: "Agende agora",
    templateKey: "agenda-aberta",
    format: "SQUARE",
    paletteKey: "brand",
    designOptions: null,
    primaryMediaId: null,
    secondaryMediaId: null,
    author: { name: "Admin" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockBarbershopFindUnique.mockResolvedValue({
    id: BARBERSHOP_ID,
    name: "Barber Test",
    logoUrl: null,
    evolutionInstanceName: "shop-connected",
  });
  mockServiceFindMany.mockResolvedValue([]);
  mockScheduleFindFirst.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
});

// ---------------------------------------------------------------------------
// create — sempre nasce como rascunho
// ---------------------------------------------------------------------------
describe("PostsController.create — explicit draft by default", () => {
  it("creates a DRAFT post without broadcasting WhatsApp", async () => {
    mockFeedPostCreate.mockResolvedValue(makeDraftRow());

    const controller = new PostsController();
    const request = {
      body: {
        barbershopId: BARBERSHOP_ID,
        type: "announcement",
        postMode: "both",
        title: "Post teste",
      },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await controller.create(request, fakeReply());

    expect(mockFeedPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DRAFT" }),
      })
    );
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("creates SCHEDULED post when scheduledFor is in the future", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    mockFeedPostCreate.mockResolvedValue(makeDraftRow({ status: "SCHEDULED", scheduledFor: new Date(future) }));

    const controller = new PostsController();
    const request = {
      body: {
        barbershopId: BARBERSHOP_ID,
        type: "announcement",
        postMode: "both",
        scheduledFor: future,
      },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await controller.create(request, fakeReply());

    expect(mockFeedPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SCHEDULED" }),
      })
    );
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("rejects past scheduledFor before creating", async () => {
    const controller = new PostsController();
    const request = {
      body: {
        barbershopId: BARBERSHOP_ID,
        type: "announcement",
        postMode: "both",
        scheduledFor: new Date(Date.now() - 1000).toISOString(),
      },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.create(request, fakeReply())).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("futuro"),
    });
    expect(mockFeedPostCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// publish — ação explícita, atômica, sem WhatsApp
// ---------------------------------------------------------------------------
describe("PostsController.publish — explicit action, atomic, no WhatsApp", () => {
  it("publishes a DRAFT post without calling WhatsApp", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow());
    mockFeedPostUpdateMany.mockResolvedValue({ count: 1 });
    mockFeedPostFindUnique.mockResolvedValueOnce(makeDraftRow()).mockResolvedValueOnce(
      makeDraftRow({ status: "PUBLISHED", publishedAt: new Date() })
    );

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await controller.publish(request, fakeReply());

    expect(mockFeedPostUpdateMany).toHaveBeenCalledWith({
      where: { id: POST_ID, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: expect.objectContaining({ status: "PUBLISHED" }),
    });
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("returns 409 when post is already published", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "PUBLISHED" }));
    mockFeedPostUpdateMany.mockResolvedValue({ count: 0 });

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.publish(request, fakeReply())).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("já está publicado"),
    });
  });

  it("does not require WhatsApp to publish", async () => {
    mockBarbershopFindUnique.mockResolvedValue({
      id: BARBERSHOP_ID,
      name: "Barber Test",
      logoUrl: null,
      evolutionInstanceName: null,
    });
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow());
    mockFeedPostUpdateMany.mockResolvedValue({ count: 1 });
    mockFeedPostFindUnique.mockResolvedValueOnce(makeDraftRow());

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.publish(request, fakeReply())).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cancelSchedule — volta para rascunho
// ---------------------------------------------------------------------------
describe("PostsController.cancelSchedule", () => {
  it("moves a SCHEDULED post back to DRAFT", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "SCHEDULED" }));
    mockFeedPostUpdate.mockResolvedValue(makeDraftRow({ status: "DRAFT" }));

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await controller.cancelSchedule(request, fakeReply());

    expect(mockFeedPostUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: expect.objectContaining({ status: "DRAFT", scheduledFor: null }),
      select: expect.anything(),
    });
  });

  it("rejects cancel on post that is not scheduled", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "DRAFT" }));

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.cancelSchedule(request, fakeReply())).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("não está agendado"),
    });
  });
});

// ---------------------------------------------------------------------------
// sendWhatsapp — ação separada com lock
// ---------------------------------------------------------------------------
describe("PostsController.sendWhatsapp — explicit, idempotent", () => {
  it("enqueues WhatsApp broadcast when post is published and shop is connected", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "PUBLISHED" }));
    mockBroadcast.mockResolvedValue(12);

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await controller.sendWhatsapp(request, fakeReply());

    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID,
      "Post teste",
      "Agende agora"
    );
  });

  it("rejects envio for non-published post", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "DRAFT" }));

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.sendWhatsapp(request, fakeReply())).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Publique o post"),
    });
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("rejects envio when shop is not WhatsApp-connected", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "PUBLISHED" }));
    mockBarbershopFindUnique.mockResolvedValue({
      id: BARBERSHOP_ID,
      name: "Barber Test",
      logoUrl: null,
      evolutionInstanceName: null,
    });

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.sendWhatsapp(request, fakeReply())).rejects.toMatchObject({
      statusCode: expect.any(Number),
    });
    expect(mockBroadcast).not.toHaveBeenCalled();
  });

  it("blocks double-send within lock window", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "PUBLISHED" }));
    mockRedisSet.mockResolvedValue(null); // lock not acquired — já existe

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(controller.sendWhatsapp(request, fakeReply())).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("recentemente"),
    });
    expect(mockBroadcast).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// whatsappAudience — prévia de público
// ---------------------------------------------------------------------------
describe("PostsController.whatsappAudience", () => {
  it("returns eligible client count and connection status", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ status: "PUBLISHED" }));
    mockSalonClientCount.mockResolvedValue(7);
    mockBarbershopFindUnique.mockResolvedValue({
      evolutionInstanceName: "shop-connected",
    });

    const controller = new PostsController();
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.whatsappAudience(request, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eligible: 7,
          whatsappConnected: true,
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// list — paginação por status
// ---------------------------------------------------------------------------
describe("PostsController.list — paginated by status", () => {
  it("returns posts with meta pagination", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      makeDraftRow(), makeDraftRow({ id: "post-2", title: "Post 2" }),
    ]);
    mockFeedPostCount.mockResolvedValue(2);

    const controller = new PostsController();
    const request = {
      query: { barbershopId: BARBERSHOP_ID, status: "published", page: 1, limit: 12 },
      user: fakeUser(),
    } as unknown as FastifyRequest;
    const reply = fakeReply();

    await controller.list(request, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.arrayContaining([expect.objectContaining({ id: POST_ID })]),
        meta: expect.objectContaining({ total: 2, page: 1, limit: 12 }),
      })
    );
  });
});
