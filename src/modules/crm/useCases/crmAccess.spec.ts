import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/libs/prismaClient", () => ({ prisma: { user: { findUnique } } }));

import { assertCrmAccess } from "./crmUseCases";

describe("assertCrmAccess", () => {
  beforeEach(() => findUnique.mockReset());

  it("libera employee com permissão configurável do CRM", async () => {
    findUnique.mockResolvedValue({ permissions: ["CRM_ANALYTICS_VIEW"] });
    await expect(assertCrmAccess({ id: "u1", role: "EMPLOYEE", barbershopId: "shop-1" }, "shop-1", "CRM_ANALYTICS_VIEW")).resolves.toBeUndefined();
  });

  it("não permite funcionário de outro salão", async () => {
    await expect(assertCrmAccess({ id: "u1", role: "EMPLOYEE", barbershopId: "shop-2" }, "shop-1", "CRM_ANALYTICS_VIEW")).rejects.toMatchObject({ statusCode: 403 });
  });
});
