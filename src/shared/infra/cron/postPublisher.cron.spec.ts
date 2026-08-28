import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock prisma ---
const mockFeedPostFindMany = vi.fn();
const mockFeedPostUpdate = vi.fn();
const mockFeedPostCreate = vi.fn();
const mockBarbershopFindMany = vi.fn();
const mockScheduleFindFirst = vi.fn();
const mockServiceFindMany = vi.fn();
const mockBarbershopUpdate = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    feedPost: {
      findMany: (...a: unknown[]) => mockFeedPostFindMany(...a),
      update: (...a: unknown[]) => mockFeedPostUpdate(...a),
      create: (...a: unknown[]) => mockFeedPostCreate(...a),
    },
    barbershop: {
      findMany: (...a: unknown[]) => mockBarbershopFindMany(...a),
      update: (...a: unknown[]) => mockBarbershopUpdate(...a),
    },
    schedule: {
      findFirst: (...a: unknown[]) => mockScheduleFindFirst(...a),
    },
    service: {
      findMany: (...a: unknown[]) => mockServiceFindMany(...a),
    },
  },
}));

// --- Mock broadcastPostToClients ---
const mockBroadcast = vi.fn().mockResolvedValue(undefined);
vi.mock("@/modules/posts/services/postBroadcastService", () => ({
  broadcastPostToClients: (...a: unknown[]) => mockBroadcast(...a),
}));

// --- Mock postImageService ---
vi.mock("@/modules/posts/services/postImageService", () => ({
  buildPostSvg: vi.fn().mockReturnValue("<svg></svg>"),
  renderPostSvgToPng: vi.fn().mockReturnValue(Buffer.from("png")),
  pngToDataUrl: vi.fn().mockReturnValue("data:image/png;base64,aWNv"),
}));

const BARBERSHOP_ID = "00000000-0000-0000-0000-000000000001";
const POST_ID_1 = "00000000-0000-0000-0000-000000000002";
const POST_ID_2 = "00000000-0000-0000-0000-000000000003";

describe("runPostPublisherTick (via schedulePostPublisher)", () => {
  const log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  let handler: () => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock node-cron to capture the handler
    vi.doMock("node-cron", () => ({
      default: {
        schedule: vi.fn((_expr: string, cb: () => Promise<void>, _opts: unknown) => {
          handler = cb;
        }),
      },
    }));

    // Default: no scheduled posts, no shops with autoPost
    mockFeedPostFindMany.mockResolvedValue([]);
    mockBarbershopFindMany.mockResolvedValue([]);

    // Import after mocks are set up — triggers schedulePostPublisher
    const mod = await import("./postPublisher.cron");
    mod.schedulePostPublisher(log);
  });

  it("scheduled posts are published AND broadcastPostToClients is called with correct args", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      {
        id: POST_ID_1,
        barbershopId: BARBERSHOP_ID,
        title: "Promo de sexta",
        ctaText: "Garanta seu lugar",
      },
    ]);
    mockFeedPostUpdate.mockResolvedValue({});
    mockBroadcast.mockResolvedValue(undefined);

    await handler();

    expect(mockFeedPostUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID_1 },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });

    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID_1,
      "Promo de sexta",
      "Garanta seu lugar"
    );

    expect(log.info).toHaveBeenCalledWith(
      { count: 1 },
      "Posts agendados publicados pelo cron"
    );
  });

  it("auto-post triggers broadcastPostToClients with created post id", async () => {
    // No scheduled posts
    mockFeedPostFindMany.mockResolvedValue([]);

    // One shop eligible for auto-post
    mockBarbershopFindMany.mockResolvedValue([
      {
        id: BARBERSHOP_ID,
        name: "Barber Shop",
        logoUrl: null,
        autoPostLastDate: null,
      },
    ]);

    // Schedule: open today at 09:00
    const now = new Date();
    mockScheduleFindFirst.mockResolvedValue({
      isOpen: true,
      openTime: "09:00",
      closeTime: "19:00",
    });

    // Force nowInSaoPaulo to return 09:00 on a matching day
    // by mocking Date globally for the cron's internal nowInSaoPaulo()
    const fakeNow = new Date("2026-08-28T12:00:00Z"); // 09:00 BRT
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    mockServiceFindMany.mockResolvedValue([
      { name: "Corte", price: 45 },
    ]);

    const createdPostId = "00000000-0000-0000-0000-000000000099";
    mockFeedPostCreate.mockResolvedValue({ id: createdPostId });
    mockBarbershopUpdate.mockResolvedValue({});

    await handler();

    // Verify create was called with PUBLISHED status
    expect(mockFeedPostCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        barbershopId: BARBERSHOP_ID,
        status: "PUBLISHED",
      }),
    });

    // Verify broadcast was called with the created post's id
    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      createdPostId,
      expect.stringContaining("Abrimos"),
      "Entrar na fila"
    );

    vi.useRealTimers();
  });

  it("broadcast failure on one scheduled post does not block others", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      {
        id: POST_ID_1,
        barbershopId: BARBERSHOP_ID,
        title: "Post 1",
        ctaText: null,
      },
      {
        id: POST_ID_2,
        barbershopId: BARBERSHOP_ID,
        title: "Post 2",
        ctaText: "CTA 2",
      },
    ]);

    mockFeedPostUpdate.mockResolvedValue({});

    // First broadcast throws, second succeeds
    mockBroadcast
      .mockRejectedValueOnce(new Error("broadcast boom"))
      .mockResolvedValueOnce(undefined);

    await handler();

    // Both posts should have been updated
    expect(mockFeedPostUpdate).toHaveBeenCalledTimes(2);

    // Both broadcasts should have been attempted
    expect(mockBroadcast).toHaveBeenCalledTimes(2);

    // First broadcast should have had error logged
    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error), postId: POST_ID_1 },
      "Broadcast post failed"
    );

    // Second broadcast should have succeeded (no error for POST_ID_2)
    expect(mockBroadcast).toHaveBeenLastCalledWith(
      BARBERSHOP_ID,
      POST_ID_2,
      "Post 2",
      "CTA 2"
    );
  });

  it("salon without WhatsApp: post is still PUBLISHED and broadcast fails silently without breaking cron", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      {
        id: POST_ID_1,
        barbershopId: BARBERSHOP_ID,
        title: "Post sem WhatsApp",
        ctaText: null,
      },
    ]);
    mockFeedPostUpdate.mockResolvedValue({});

    // Simulates broadcastPostToClients returning silently (no WhatsApp configured)
    mockBroadcast.mockResolvedValue(undefined);

    await handler();

    // Post must be marked as PUBLISHED regardless
    expect(mockFeedPostUpdate).toHaveBeenCalledWith({
      where: { id: POST_ID_1 },
      data: { status: "PUBLISHED", publishedAt: expect.any(Date) },
    });

    // Broadcast was called (fire-and-forget)
    expect(mockBroadcast).toHaveBeenCalledWith(
      BARBERSHOP_ID,
      POST_ID_1,
      "Post sem WhatsApp",
      null
    );

    // No error should have been logged — broadcast succeeded silently
    expect(log.error).not.toHaveBeenCalled();

    // Info log for the published count should still fire
    expect(log.info).toHaveBeenCalledWith(
      { count: 1 },
      "Posts agendados publicados pelo cron"
    );
  });
});
