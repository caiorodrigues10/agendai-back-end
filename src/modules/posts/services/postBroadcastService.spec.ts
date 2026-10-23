/// <reference types="vitest/globals" />

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    salonClient: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    feedPost: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
  },
}));

const mockEnqueue = vi.fn();
vi.mock("@/shared/infra/queue/postBroadcastQueue", () => ({
  enqueuePostBroadcast: (...a: unknown[]) => mockEnqueue(...a),
}));

vi.mock("@/shared/utils/logger", () => ({
  getModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { broadcastPostToClients } from "./postBroadcastService";

const BARBERSHOP_ID = "00000000-0000-0000-0000-000000000001";
const POST_ID = "00000000-0000-0000-0000-000000000002";
const CLIENT_ID = "00000000-0000-0000-0000-000000000003";

const FAKE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

beforeEach(() => {
  vi.clearAllMocks();
});

function setupBarbershop(overrides: Record<string, unknown> = {}) {
  mockFindUnique.mockImplementation((args: any) => {
    if (args?.where?.id === BARBERSHOP_ID) {
      return {
        id: BARBERSHOP_ID,
        evolutionInstanceName: "my-instance",
        ...overrides,
      };
    }
    if (args?.where?.id === POST_ID) {
      return {
        imageUrl: FAKE_DATA_URL,
        title: "Promo de corte",
        ctaText: "Agende já",
      };
    }
    return null;
  });
}

function setupClients(clients: { id: string; whatsapp: string }[]) {
  mockFindMany.mockResolvedValue(clients);
}

describe("broadcastPostToClients", () => {
  it("does nothing when barbershop not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Test", null);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("skips when no clients have WhatsApp", async () => {
    setupBarbershop();
    setupClients([]);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Title", "CTA");

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("skips when post has no imageUrl", async () => {
    setupBarbershop();
    // Override post lookup to return null imageUrl
    mockFindUnique.mockImplementation((args: any) => {
      if (args?.where?.id === BARBERSHOP_ID) {
        return {
          id: BARBERSHOP_ID,
          evolutionInstanceName: "my-instance",
        };
      }
      if (args?.where?.id === POST_ID) {
        return { imageUrl: null, title: "T", ctaText: null };
      }
      return null;
    });
    setupClients([{ id: CLIENT_ID, whatsapp: "11999998888" }]);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Title", "CTA");

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("enqueues broadcast for each client with a phone", async () => {
    setupBarbershop();
    setupClients([
      { id: "c1", whatsapp: "11999998888" },
      { id: "c2", whatsapp: "21988887777" },
    ]);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Promo", "Agende");

    expect(mockEnqueue).toHaveBeenCalledTimes(2);

    const firstCall = mockEnqueue.mock.calls[0][0];
    expect(firstCall).toMatchObject({
      postId: POST_ID,
      barbershopId: BARBERSHOP_ID,
      caption: "Promo\n\nAgende",
      instanceName: "my-instance",
      deduplicationKey: `post-broadcast:${POST_ID}:c1`,
    });
    expect(firstCall.imageBase64).toBeTruthy();
    expect(firstCall.clientPhone).toBe("5511999998888");
  });

  it("strips data URL prefix from imageUrl", async () => {
    setupBarbershop();
    setupClients([{ id: "c1", whatsapp: "11999998888" }]);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Title", null);

    const call = mockEnqueue.mock.calls[0][0];
    expect(call.imageBase64).toBe("iVBORw0KGgoAAAANSUhEUg==");
  });

  it("skips clients with empty WhatsApp", async () => {
    setupBarbershop();
    setupClients([
      { id: "c1", whatsapp: "" },
      { id: "c2", whatsapp: "11999998888" },
    ]);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Title", null);

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0].clientPhone).toBe("5511999998888");
  });

  it("uses fallback title and CTA when none provided", async () => {
    setupBarbershop();
    setupClients([{ id: "c1", whatsapp: "11999998888" }]);

    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "", null);

    const call = mockEnqueue.mock.calls[0][0];
    expect(call.caption).toBe("Promo de corte\n\nAgende já");
  });

  it("catches errors and does not throw", async () => {
    mockFindUnique.mockRejectedValue(new Error("DB error"));

    // Should not throw
    await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Title", null);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fase 1.5 — arte hospedada em posts-art (URL) na fila de broadcast
// ---------------------------------------------------------------------------
describe("hosted art resolution (posts-art)", () => {
  const HOSTED_URL = "https://res.cloudinary.com/test/image/upload/posts-art/art.png";

  function setupPost(imageUrl: string) {
    mockFindUnique.mockImplementation((args: { where?: { id?: string } }) => {
      if (args?.where?.id === BARBERSHOP_ID) {
        return { id: BARBERSHOP_ID, evolutionInstanceName: "my-instance" };
      }
      if (args?.where?.id === POST_ID) {
        return { imageUrl, title: "Promo", ctaText: null };
      }
      return null;
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads hosted art and enqueues its raw base64", async () => {
    setupPost(HOSTED_URL);
    setupClients([{ id: "c1", whatsapp: "11999998888" }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? "image/png" : null) },
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      }),
    );

    const queued = await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Promo", null);

    expect(queued).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0].imageBase64).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  it("aborts when the hosted image cannot be downloaded", async () => {
    setupPost(HOSTED_URL);
    setupClients([{ id: "c1", whatsapp: "11999998888" }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net down")));

    const queued = await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Promo", null);

    expect(queued).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("aborts when the URL does not return an image", async () => {
    setupPost(HOSTED_URL);
    setupClients([{ id: "c1", whatsapp: "11999998888" }]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    expect(await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Promo", null)).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("aborts on URLs that are not http(s)", async () => {
    setupPost("javascript:alert(1)");
    setupClients([{ id: "c1", whatsapp: "11999998888" }]);

    expect(await broadcastPostToClients(BARBERSHOP_ID, POST_ID, "Promo", null)).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
