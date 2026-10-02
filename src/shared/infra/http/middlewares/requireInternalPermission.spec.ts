import { describe, expect, it } from "vitest";
import { INTERNAL_PERMISSIONS } from "@/modules/admin/internalPermissions";
import { requireInternalPermission } from "./requireInternalPermission";

describe("requireInternalPermission", () => {
  it("allows legacy master admins without explicit permissions", async () => {
    const middleware = requireInternalPermission(INTERNAL_PERMISSIONS.FINANCE_READ);
    const request = { user: { id: "user-1", role: "MASTER_ADMIN" } } as any;

    await expect(middleware(request, {} as any)).resolves.toBeUndefined();
  });

  it("allows users with internal:all", async () => {
    const middleware = requireInternalPermission(INTERNAL_PERMISSIONS.FINANCE_READ);
    const request = { user: { permissions: [INTERNAL_PERMISSIONS.ALL] } } as any;

    await expect(middleware(request, {} as any)).resolves.toBeUndefined();
  });

  it("blocks users without the required scoped permission", async () => {
    const middleware = requireInternalPermission(INTERNAL_PERMISSIONS.TEAM_MANAGE);
    const request = { user: { permissions: [INTERNAL_PERMISSIONS.FINANCE_READ] } } as any;

    await expect(middleware(request, {} as any)).rejects.toMatchObject({ statusCode: 403 });
  });
});
