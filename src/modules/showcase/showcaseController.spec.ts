/// <reference types="vitest/globals" />
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "@/shared/errors/AppError";

const mockGetPublishedById = vi.fn();
const mockRecordEvent = vi.fn();
const mockListPublished = vi.fn();
const mockGetById = vi.fn();

vi.mock("./showcaseUseCases", () => ({
  ShowcaseUseCases: class {
    getPublishedById = mockGetPublishedById;
    recordEvent = mockRecordEvent;
    listPublished = mockListPublished;
    getById = mockGetById;
  },
}));

import { ShowcaseController } from "./showcaseController";

const SHOP_ID = "00000000-0000-0000-0000-000000000001";
const ENTRY_ID = "00000000-0000-0000-0000-000000000002";

function fakeReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply & { send: ReturnType<typeof vi.fn> };
}

describe("ShowcaseController public endpoints", () => {
  let controller: ShowcaseController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new ShowcaseController();
  });

  it("getDetail rejects non-UUID entryId such as analytics", async () => {
    const reply = fakeReply();
    await expect(
      controller.getDetail(
        { params: { id: SHOP_ID, entryId: "analytics" } } as unknown as FastifyRequest,
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockGetPublishedById).not.toHaveBeenCalled();
  });

  it("getDetail reads salon id and entryId and does not record VIEW", async () => {
    const entry = { id: ENTRY_ID, barbershopId: SHOP_ID, title: "Fade" };
    mockGetPublishedById.mockResolvedValue(entry);
    const reply = fakeReply();

    await controller.getDetail(
      { params: { id: SHOP_ID, entryId: ENTRY_ID } } as unknown as FastifyRequest,
      reply,
    );

    expect(mockGetPublishedById).toHaveBeenCalledWith(SHOP_ID, ENTRY_ID);
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({ success: true, data: entry });
  });

  it("getDetail surfaces 404 from getPublishedById without recording VIEW", async () => {
    mockGetPublishedById.mockRejectedValue(new AppError("Showcase entry não encontrado", 404));
    const reply = fakeReply();

    await expect(
      controller.getDetail(
        { params: { id: SHOP_ID, entryId: ENTRY_ID } } as unknown as FastifyRequest,
        reply,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });
});
