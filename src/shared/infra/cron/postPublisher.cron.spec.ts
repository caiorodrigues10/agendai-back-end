/// <reference types="vitest/globals" />

// --- Mock prisma ---
const mockFeedPostFindMany = vi.fn();
const mockFeedPostUpdateMany = vi.fn();
const mockFeedPostCreate = vi.fn();
const mockBarbershopFindMany = vi.fn();
const mockScheduleFindFirst = vi.fn();
const mockServiceFindMany = vi.fn();
const mockBarbershopUpdate = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    feedPost: {
      findMany: (...a: unknown[]) => mockFeedPostFindMany(...a),
      updateMany: (...a: unknown[]) => mockFeedPostUpdateMany(...a),
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

  it("scheduled posts are published atomically (updateMany with SCHEDULED guard)", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      {
        id: POST_ID_1,
        barbershopId: BARBERSHOP_ID,
        title: "Promo de sexta",
        ctaText: "Garanta seu lugar",
      },
    ]);
    mockFeedPostUpdateMany.mockResolvedValue({ count: 1 });

    await handler();

    expect(mockFeedPostUpdateMany).toHaveBeenCalledWith({
      where: { id: POST_ID_1, status: "SCHEDULED" },
      data: expect.objectContaining({ status: "PUBLISHED" }),
    });

    // WhatsApp NUNCA é disparado pelo cron — envio é ação explícita.
    expect(log.info).toHaveBeenCalledWith(
      { count: 1 },
      "Posts agendados publicados pelo cron"
    );
  });

  it("post whose status changed between find and update is skipped (updateMany count=0)", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      { id: POST_ID_1, barbershopId: BARBERSHOP_ID, title: "X", ctaText: null },
      { id: POST_ID_2, barbershopId: BARBERSHOP_ID, title: "Y", ctaText: null },
    ]);
    // First: race condition — someone published it already.
    mockFeedPostUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await handler();

    expect(mockFeedPostUpdateMany).toHaveBeenCalledTimes(2);
    expect(log.error).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(
      { count: 1 },
      "Posts agendados publicados pelo cron"
    );
  });

  it("auto-post is created as PUBLISHED without broadcast", async () => {
    mockFeedPostFindMany.mockResolvedValue([]);
    mockBarbershopFindMany.mockResolvedValue([
      {
        id: BARBERSHOP_ID,
        name: "Barber Shop",
        logoUrl: null,
        autoPostLastDate: null,
      },
    ]);

    // Schedule: open today at 09:00
    mockScheduleFindFirst.mockResolvedValue({
      isOpen: true,
      openTime: "09:00",
      closeTime: "19:00",
    });
    mockServiceFindMany.mockResolvedValue([{ name: "Corte", price: 45 }]);

    const fakeNow = new Date("2026-08-28T12:00:00Z"); // 09:00 BRT
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    mockFeedPostCreate.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000099" });
    mockBarbershopUpdate.mockResolvedValue({});

    await handler();

    expect(mockFeedPostCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        barbershopId: BARBERSHOP_ID,
        status: "PUBLISHED",
      }),
    });
    expect(mockBarbershopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { autoPostLastDate: expect.any(Date) },
      })
    );

    vi.useRealTimers();
  });

  it("a thrown error inside a post publish does not abort other posts", async () => {
    mockFeedPostFindMany.mockResolvedValue([
      { id: POST_ID_1, barbershopId: BARBERSHOP_ID, title: "P1", ctaText: null },
      { id: POST_ID_2, barbershopId: BARBERSHOP_ID, title: "P2", ctaText: null },
    ]);

    mockFeedPostUpdateMany
      .mockRejectedValueOnce(new Error("db timeout"))
      .mockResolvedValueOnce({ count: 1 });

    await handler();

    expect(mockFeedPostUpdateMany).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error), postId: POST_ID_1 },
      "Falha ao publicar post agendado"
    );
    // Second post published successfully, no broadcast fired.
    expect(log.info).toHaveBeenCalledWith(
      { count: 1 },
      "Posts agendados publicados pelo cron"
    );
  });
});
