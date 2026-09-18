/// <reference types="vitest/globals" />
import { AppError } from "@/shared/errors/AppError";

const mockRepo = {
  listPublished: vi.fn(),
  findPublishedById: vi.fn(),
  findById: vi.fn(),
  recordEvent: vi.fn(),
};

vi.mock("./showcaseRepository", () => ({
  ShowcaseRepository: class {
    listPublished = mockRepo.listPublished;
    findPublishedById = mockRepo.findPublishedById;
    findById = mockRepo.findById;
    recordEvent = mockRepo.recordEvent;
  },
}));

import { ShowcaseUseCases } from "./showcaseUseCases";

const SHOP_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_SHOP = "00000000-0000-0000-0000-000000000099";
const ENTRY_ID = "00000000-0000-0000-0000-000000000002";

describe("ShowcaseUseCases public detail", () => {
  let useCases: ShowcaseUseCases;

  beforeEach(() => {
    vi.clearAllMocks();
    useCases = new ShowcaseUseCases();
  });

  it("returns published entry for the matching salon", async () => {
    const published = { id: ENTRY_ID, barbershopId: SHOP_ID, status: "PUBLISHED", title: "Corte" };
    mockRepo.findPublishedById.mockResolvedValue(published);

    await expect(useCases.getPublishedById(SHOP_ID, ENTRY_ID)).resolves.toEqual(published);
    expect(mockRepo.findPublishedById).toHaveBeenCalledWith(SHOP_ID, ENTRY_ID);
  });

  it("returns 404 when the entry is missing, draft, hidden, or belongs to another salon", async () => {
    mockRepo.findPublishedById.mockResolvedValue(null);

    await expect(useCases.getPublishedById(OTHER_SHOP, ENTRY_ID)).rejects.toMatchObject({
      message: "Showcase entry não encontrado",
      statusCode: 404,
    } satisfies Partial<AppError>);
  });

  it("records events only for published entries in the matching salon", async () => {
    const published = { id: ENTRY_ID, barbershopId: SHOP_ID, status: "PUBLISHED" };
    mockRepo.findPublishedById.mockResolvedValue(published);
    mockRepo.recordEvent.mockResolvedValue({ id: "evt" });

    await useCases.recordEvent(ENTRY_ID, SHOP_ID, "VIEW");

    expect(mockRepo.findPublishedById).toHaveBeenCalledWith(SHOP_ID, ENTRY_ID);
    expect(mockRepo.findById).not.toHaveBeenCalled();
    expect(mockRepo.recordEvent).toHaveBeenCalledWith(ENTRY_ID, SHOP_ID, "VIEW", undefined);
  });

  it("does not record events for draft, hidden, or foreign-salon entries", async () => {
    mockRepo.findPublishedById.mockResolvedValue(null);

    await expect(useCases.recordEvent(ENTRY_ID, OTHER_SHOP, "VIEW")).rejects.toMatchObject({
      message: "Showcase entry não encontrado",
      statusCode: 404,
    } satisfies Partial<AppError>);
    expect(mockRepo.recordEvent).not.toHaveBeenCalled();
  });
});
