/// <reference types="vitest/globals" />

const findMany = vi.fn();
const findFirst = vi.fn();
const findUnique = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    showcaseEntry: {
      findMany: (...args: unknown[]) => findMany(...args),
      findFirst: (...args: unknown[]) => findFirst(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

import { ShowcaseRepository } from "./showcaseRepository";

const AUTH_AND_HIDDEN_KEYS = [
  "imageAuthorization",
  "authorizedById",
  "authorizedAt",
  "authorizationNote",
  "authorizedBy",
  "hiddenAt",
];

const SHOP_ID = "00000000-0000-0000-0000-000000000001";
const ENTRY_ID = "00000000-0000-0000-0000-000000000002";

describe("ShowcaseRepository public select", () => {
  let repo: ShowcaseRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
    findUnique.mockResolvedValue(null);
    repo = new ShowcaseRepository();
  });

  it("listPublished filters PUBLISHED and omits authorization/hidden fields", async () => {
    await repo.listPublished(SHOP_ID);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { barbershopId: SHOP_ID, status: "PUBLISHED" },
      }),
    );
    const select = findMany.mock.calls[0][0].select;
    for (const key of AUTH_AND_HIDDEN_KEYS) {
      expect(select).not.toHaveProperty(key);
    }
  });

  it("findPublishedById requires matching salon, PUBLISHED, and public select", async () => {
    await repo.findPublishedById(SHOP_ID, ENTRY_ID);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ENTRY_ID, barbershopId: SHOP_ID, status: "PUBLISHED" },
      }),
    );
    const select = findFirst.mock.calls[0][0].select;
    for (const key of AUTH_AND_HIDDEN_KEYS) {
      expect(select).not.toHaveProperty(key);
    }
  });

  it("staff listByBarbershop keeps authorization fields", async () => {
    await repo.listByBarbershop(SHOP_ID);
    const select = findMany.mock.calls[0][0].select;
    expect(select).toHaveProperty("imageAuthorization");
    expect(select).toHaveProperty("authorizedById");
    expect(select).toHaveProperty("authorizedAt");
    expect(select).toHaveProperty("authorizationNote");
    expect(select).toHaveProperty("authorizedBy");
    expect(select).toHaveProperty("hiddenAt");
  });
});
