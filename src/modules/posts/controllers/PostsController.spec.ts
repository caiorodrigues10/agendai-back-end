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
const mockFeedPostDelete = vi.fn();
const mockPersistPostImage = vi.fn();
const mockDeletePostImage = vi.fn();

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
      delete: (...a: unknown[]) => mockFeedPostDelete(...a),
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
  renderPostSvgToPng: vi.fn().mockResolvedValue(Buffer.from("png")),
  pngToDataUrl: vi.fn().mockReturnValue("data:image/png;base64,aWNv"),
}));

// --- Mock postImageStorageService (Fase 1.5: arte final em posts-art) ---
vi.mock("../services/postImageStorageService", () => ({
  persistPostImage: (...a: unknown[]) => mockPersistPostImage(...a),
  deletePostImage: (...a: unknown[]) => mockDeletePostImage(...a),
}));

vi.mock("tsyringe", async importOriginal => ({
  ...(await importOriginal<typeof import("tsyringe")>()),
  container: { resolve: () => ({ extractObjectName: (url: string) => url.startsWith("https://storage.example/") ? url.slice("https://storage.example/".length) : null }) },
}));

// --- Mock logger ---
vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// --- Mock do pool de render (motor de camadas v2 / price-split) ---
const mockRenderPostSpec = vi.fn();
vi.mock("@/shared/infra/worker/postRenderPool", () => ({
  renderPostSpec: (...a: unknown[]) => mockRenderPostSpec(...a),
  renderSvgToPng: vi.fn().mockResolvedValue(Buffer.from("png")),
  postRenderWarmStats: vi.fn(() => ({ workers: 0, ready: 0, warmMs: [] as number[] })),
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
  // Data-URL vira asset em posts-art; URL http legada passa adiante sem asset.
  mockPersistPostImage.mockImplementation(async (_barbershopId: string, imageUrl: string) =>
    imageUrl.startsWith("data:")
      ? {
          imageUrl: "https://res.cloudinary.com/test/image/upload/posts-art/art.png",
          imageAssetName: "posts-art/art",
        }
      : { imageUrl, imageAssetName: null },
  );
});

// ---------------------------------------------------------------------------
// create — sempre nasce como rascunho
// ---------------------------------------------------------------------------
describe("PostsController.create — explicit draft by default", () => {
  it("does not replace an unavailable uploaded photo with an illustrative stock image", async () => {
    const mediaId = "00000000-0000-0000-0000-000000000004";
    mockPostMediaFindFirst.mockResolvedValue({ url: "https://storage.example/posts/photo.png" });
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(new PostsController().create({ body: { barbershopId: BARBERSHOP_ID, type: "announcement", templateKey: "editorial-foto", primaryMediaId: mediaId }, user: fakeUser() } as unknown as FastifyRequest, fakeReply())).rejects.toMatchObject({ statusCode: 503 });
    expect(mockFeedPostCreate).not.toHaveBeenCalled();
  });
  it("persists an uploaded video and returns it to the editor", async () => {
    const videoUrl = `https://storage.example/posts/video-${BARBERSHOP_ID}-123.mp4`;
    mockFeedPostCreate.mockResolvedValue(makeDraftRow({ videoUrl }));
    const reply = fakeReply();
    await new PostsController().create({ body: { barbershopId: BARBERSHOP_ID, type: "announcement", content: "Nos bastidores", videoUrl }, user: fakeUser() } as unknown as FastifyRequest, reply);
    expect(mockFeedPostCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl, content: "Nos bastidores" }) }));
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ videoUrl }) }));
  });

  it("rejects videos uploaded for another salon", async () => {
    await expect(new PostsController().create({ body: { barbershopId: BARBERSHOP_ID, type: "announcement", videoUrl: "https://storage.example/posts/video-other-123.mp4" }, user: fakeUser() } as unknown as FastifyRequest, fakeReply())).rejects.toMatchObject({ statusCode: 400 });
    expect(mockFeedPostCreate).not.toHaveBeenCalled();
  });
  it("rejects a forged tenant filename on an external origin", async () => {
    const videoUrl = `https://untrusted.example/posts/video-${BARBERSHOP_ID}-123.mp4`;
    await expect(new PostsController().create({ body: { barbershopId: BARBERSHOP_ID, type: "announcement", videoUrl }, user: fakeUser() } as unknown as FastifyRequest, fakeReply())).rejects.toMatchObject({ statusCode: 400 });
    expect(mockFeedPostCreate).not.toHaveBeenCalled();
  });
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
  it("does not publish a before/after template without both real photos", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow({ templateKey: "antes-depois" }));
    await expect(new PostsController().publish({ params: { id: POST_ID }, user: fakeUser() } as unknown as FastifyRequest, fakeReply())).rejects.toMatchObject({ statusCode: 400 });
    expect(mockFeedPostUpdateMany).not.toHaveBeenCalled();
  });
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

// ---------------------------------------------------------------------------
// Fase 1.5 — arte final vira asset em posts-art (Cloudinary)
// ---------------------------------------------------------------------------
describe("PostsController image persistence — posts-art (Fase 1.5)", () => {
  function createRequest() {
    return {
      body: { barbershopId: BARBERSHOP_ID, type: "announcement", postMode: "both", title: "Post teste" },
      user: fakeUser(),
    } as unknown as FastifyRequest;
  }

  function updateExisting(overrides: Record<string, unknown> = {}) {
    return {
      id: POST_ID,
      barbershopId: BARBERSHOP_ID,
      status: "DRAFT",
      title: "Post teste",
      ctaText: "Agende agora",
      postMode: "BOTH",
      templateKey: "agenda-aberta",
      format: "SQUARE",
      paletteKey: "brand",
      designOptions: null,
      primaryMediaId: null,
      secondaryMediaId: null,
      imageAssetName: "posts-art/old",
      ...overrides,
    };
  }

  it("uploads generated art and persists imageUrl + imageAssetName", async () => {
    mockFeedPostCreate.mockResolvedValue(makeDraftRow());

    await new PostsController().create(createRequest(), fakeReply());

    expect(mockPersistPostImage).toHaveBeenCalledWith(BARBERSHOP_ID, "data:image/png;base64,aWNv");
    expect(mockFeedPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrl: "https://res.cloudinary.com/test/image/upload/posts-art/art.png",
          imageAssetName: "posts-art/art",
        }),
      }),
    );
    expect(mockDeletePostImage).not.toHaveBeenCalled();
  });

  it("removes the uploaded asset when the post cannot be saved (compensação)", async () => {
    mockFeedPostCreate.mockRejectedValue(new Error("db down"));

    await expect(new PostsController().create(createRequest(), fakeReply())).rejects.toThrow("db down");

    expect(mockDeletePostImage).toHaveBeenCalledWith("posts-art/art");
  });

  it("regenerating art on update destroys the previous asset", async () => {
    mockFeedPostFindUnique.mockResolvedValue(updateExisting());
    mockFeedPostUpdate.mockResolvedValue(makeDraftRow());
    const request = {
      params: { id: POST_ID },
      body: { title: "Novo título" },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await new PostsController().update(request, fakeReply());

    expect(mockPersistPostImage).toHaveBeenCalledWith(BARBERSHOP_ID, expect.stringMatching(/^data:image\/png/));
    expect(mockFeedPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrl: "https://res.cloudinary.com/test/image/upload/posts-art/art.png",
          imageAssetName: "posts-art/art",
        }),
      }),
    );
    expect(mockDeletePostImage).toHaveBeenCalledWith("posts-art/old");
  });

  it("legacy base64 post (imageAssetName null) never destroys assets on update", async () => {
    mockFeedPostFindUnique.mockResolvedValue(updateExisting({ imageAssetName: null }));
    mockFeedPostUpdate.mockResolvedValue(makeDraftRow());
    const request = {
      params: { id: POST_ID },
      body: { title: "Novo título" },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await new PostsController().update(request, fakeReply());

    expect(mockDeletePostImage).not.toHaveBeenCalled();
  });

  it("keeps the previous asset when regeneration fails after upload (compensação)", async () => {
    mockFeedPostFindUnique.mockResolvedValue(updateExisting());
    mockFeedPostUpdate.mockRejectedValue(new Error("db down"));
    const request = {
      params: { id: POST_ID },
      body: { title: "Novo título" },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await expect(new PostsController().update(request, fakeReply())).rejects.toThrow("db down");

    // O asset novo (recém-subido) é removido; o antigo não é tocado.
    expect(mockDeletePostImage).toHaveBeenCalledTimes(1);
    expect(mockDeletePostImage).toHaveBeenCalledWith("posts-art/art");
  });

  it("destroys the stored asset when deleting a draft", async () => {
    mockFeedPostFindUnique.mockResolvedValue({
      id: POST_ID,
      barbershopId: BARBERSHOP_ID,
      status: "DRAFT",
      imageAssetName: "posts-art/art",
    });
    mockFeedPostDelete.mockResolvedValue({});
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await new PostsController().delete(request, fakeReply());

    expect(mockFeedPostDelete).toHaveBeenCalledWith({ where: { id: POST_ID } });
    expect(mockDeletePostImage).toHaveBeenCalledWith("posts-art/art");
  });

  it("does not touch storage when deleting a legacy base64 post", async () => {
    mockFeedPostFindUnique.mockResolvedValue({
      id: POST_ID,
      barbershopId: BARBERSHOP_ID,
      status: "DRAFT",
      imageAssetName: null,
    });
    mockFeedPostDelete.mockResolvedValue({});
    const request = {
      params: { id: POST_ID },
      user: fakeUser(),
    } as unknown as FastifyRequest;

    await new PostsController().delete(request, fakeReply());

    expect(mockFeedPostDelete).toHaveBeenCalled();
    expect(mockDeletePostImage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// price-split — modelo v2 no catálogo (flag) + render pelo motor de camadas
// ---------------------------------------------------------------------------
describe("PostsController price-split — modelo por flag + motor v2", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function sentPayload(reply: FastifyReply) {
    const send = reply.send as unknown as { mock: { calls: unknown[][] } };
    return send.mock.calls.at(-1)?.[0];
  }

  function templateKeys(reply: ReturnType<typeof fakeReply>) {
    const payload = sentPayload(reply) as { data: { key: string }[] };
    return payload.data.map(item => item.key);
  }

  it("exibe o modelo no catálogo apenas com POST_PRICE_SPLIT=1", async () => {
    const controller = new PostsController();

    const off = fakeReply();
    await controller.templates({} as FastifyRequest, off);
    expect(templateKeys(off)).not.toContain("price-split");

    vi.stubEnv("POST_PRICE_SPLIT", "1");
    const on = fakeReply();
    await controller.templates({} as FastifyRequest, on);
    const keys = templateKeys(on);
    expect(keys).toContain("price-split");
    // flag não vaza os demais modelos
    expect(keys).toContain("agenda-aberta");
  });

  it("prévia price-split renderiza pelo pool v2 (preview 540) e não pelo SVG", async () => {
    vi.stubEnv("POST_PRICE_SPLIT", "1");
    mockRenderPostSpec.mockResolvedValue({
      buffer: Buffer.from("jpeg"),
      mimeType: "image/jpeg",
      bytes: 4,
      timings: { photoMs: 1, vectorMs: 1, composeMs: 1, totalMs: 3 },
    });
    const reply = fakeReply();
    await new PostsController().preview(
      {
        query: {
          barbershopId: BARBERSHOP_ID,
          templateKey: "price-split",
          format: "portrait",
          title: "TABELA DE VALORES",
          priceSplit: JSON.stringify({ items: [{ name: "Corte", price: 45 }], businessName: "Barber Test" }),
        },
        user: fakeUser(),
      } as unknown as FastifyRequest,
      reply
    );

    expect(mockRenderPostSpec).toHaveBeenCalledTimes(1);
    expect(mockRenderPostSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1080,
        height: 1350,
        preview: true,
        bg: expect.stringMatching(/^#/),
        layers: expect.arrayContaining([expect.objectContaining({ kind: "photo" })]),
      })
    );
    const sent = sentPayload(reply) as { data: { imageUrl: string } };
    expect(sent.data.imageUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("criar sem serviço na lista falha antes de gerar a arte", async () => {
    await expect(
      new PostsController().create(
        {
          body: { barbershopId: BARBERSHOP_ID, type: "announcement", templateKey: "price-split", priceSplit: { items: [] } },
          user: fakeUser(),
        } as unknown as FastifyRequest,
        fakeReply()
      )
    ).rejects.toMatchObject({ statusCode: 400, message: "Adicione ao menos um serviço à lista de preços" });
    expect(mockFeedPostCreate).not.toHaveBeenCalled();
    expect(mockRenderPostSpec).not.toHaveBeenCalled();
  });

  it("criar com itens renderiza pelo pool e grava priceSplit em designOptions", async () => {
    vi.stubEnv("POST_PRICE_SPLIT", "1");
    mockRenderPostSpec.mockResolvedValue({
      buffer: Buffer.from("jpeg"),
      mimeType: "image/jpeg",
      bytes: 4,
      timings: { photoMs: 1, vectorMs: 1, composeMs: 1, totalMs: 3 },
    });
    const priceSplit = {
      items: [
        { name: "Corte", price: 45 },
        { name: "Barba", price: "30,50" },
      ],
      businessName: "Barber Test",
    };
    mockFeedPostCreate.mockResolvedValue(makeDraftRow({ templateKey: "price-split" }));

    await new PostsController().create(
      {
        body: { barbershopId: BARBERSHOP_ID, type: "announcement", templateKey: "price-split", format: "portrait", priceSplit },
        user: fakeUser(),
      } as unknown as FastifyRequest,
      fakeReply()
    );

    expect(mockRenderPostSpec).toHaveBeenCalledWith(expect.objectContaining({ height: 1350 }));
    // salvar gera a arte final (sem flag de prévia)
    expect((mockRenderPostSpec.mock.calls[0]?.[0] as { preview?: boolean }).preview).toBeUndefined();
    expect(mockPersistPostImage).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      expect.stringMatching(/^data:image\/jpeg;base64,/)
    );
    expect(mockFeedPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateKey: "price-split",
          designOptions: expect.objectContaining({ priceSplit }),
        }),
      })
    );
  });

  it("editar só o focal preserva a lista de preços já gravada e re-renderiza", async () => {
    const storedPriceSplit = { items: [{ name: "Corte", price: 45 }], businessName: "Barber Test" };
    mockFeedPostFindUnique.mockResolvedValue(
      makeDraftRow({ templateKey: "price-split", designOptions: { priceSplit: storedPriceSplit } })
    );
    mockFeedPostUpdate.mockResolvedValue(makeDraftRow({ templateKey: "price-split" }));
    mockRenderPostSpec.mockResolvedValue({
      buffer: Buffer.from("png"),
      mimeType: "image/png",
      bytes: 4,
      timings: { photoMs: 1, vectorMs: 1, composeMs: 1, totalMs: 3 },
    });

    await new PostsController().update(
      { params: { id: POST_ID }, body: { designOptions: { focalX: 60, focalY: 40 } }, user: fakeUser() } as unknown as FastifyRequest,
      fakeReply()
    );

    expect(mockRenderPostSpec).toHaveBeenCalledTimes(1);
    expect(mockFeedPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          designOptions: expect.objectContaining({
            focalX: 60,
            priceSplit: storedPriceSplit,
          }),
        }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Auditoria Parte 2 — fluxo de rascunhos (itens 1, 2, 6 e 9)
// ---------------------------------------------------------------------------
describe("Posts — auditoria de rascunhos (Parte 2)", () => {
  it("item 1: list com status=draft filtra findMany por DRAFT", async () => {
    mockFeedPostFindMany.mockResolvedValue([makeDraftRow()]);
    mockFeedPostCount.mockResolvedValue(1);

    const reply = fakeReply();
    await new PostsController().list(
      { query: { barbershopId: BARBERSHOP_ID, status: "draft", page: 1, limit: 12 }, user: fakeUser() } as unknown as FastifyRequest,
      reply
    );

    expect(mockFeedPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barbershopId: BARBERSHOP_ID, status: "DRAFT" } })
    );
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ meta: expect.objectContaining({ total: 1, page: 1, limit: 12 }) })
    );
  });

  it("item 2: cria rascunho incompleto (sem título/conteúdo/foto) com 201, sem exigir mídia", async () => {
    mockFeedPostCreate.mockResolvedValue(makeDraftRow({ title: "Vem pra cá hoje!", content: "" }));

    const reply = fakeReply();
    await new PostsController().create(
      { body: { barbershopId: BARBERSHOP_ID, type: "announcement", postMode: "both" }, user: fakeUser() } as unknown as FastifyRequest,
      reply
    );

    expect(mockFeedPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DRAFT",
          title: "Vem pra cá hoje!",
          content: "",
          primaryMediaId: null,
          secondaryMediaId: null,
          scheduledFor: null,
        }),
      })
    );
    expect(mockPostMediaFindFirst).not.toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it("item 6: editar rascunho preserva status DRAFT (update não recebe status nem valida mídia)", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow());
    mockFeedPostUpdate.mockResolvedValue(makeDraftRow({ title: "Título editado" }));

    const reply = fakeReply();
    await new PostsController().update(
      { params: { id: POST_ID }, body: { title: "Título editado" }, user: fakeUser() } as unknown as FastifyRequest,
      reply
    );

    expect(mockFeedPostUpdate).toHaveBeenCalledTimes(1);
    const updateArgs = mockFeedPostUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateArgs.data).not.toHaveProperty("status");
    expect(mockPostMediaFindFirst).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ id: POST_ID }) })
    );
  });

  it("item 9: update de post de outro salão responde 403 sem gravar", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow());
    const request = {
      params: { id: POST_ID },
      body: { title: "Invadindo" },
      user: fakeUser({ barbershopId: "00000000-0000-0000-0000-000000000099" }),
    } as unknown as FastifyRequest;

    await expect(new PostsController().update(request, fakeReply())).rejects.toMatchObject({ statusCode: 403 });
    expect(mockFeedPostUpdate).not.toHaveBeenCalled();
  });

  it("item 9: publish de post de outro salão responde 403 sem publicar", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow());
    const request = {
      params: { id: POST_ID },
      user: fakeUser({ barbershopId: "00000000-0000-0000-0000-000000000099" }),
    } as unknown as FastifyRequest;

    await expect(new PostsController().publish(request, fakeReply())).rejects.toMatchObject({ statusCode: 403 });
    expect(mockFeedPostUpdateMany).not.toHaveBeenCalled();
  });

  it("item 9: delete de post de outro salão responde 403 sem apagar", async () => {
    mockFeedPostFindUnique.mockResolvedValue(makeDraftRow());
    const request = {
      params: { id: POST_ID },
      user: fakeUser({ barbershopId: "00000000-0000-0000-0000-000000000099" }),
    } as unknown as FastifyRequest;

    await expect(new PostsController().delete(request, fakeReply())).rejects.toMatchObject({ statusCode: 403 });
    expect(mockFeedPostDelete).not.toHaveBeenCalled();
  });
});
