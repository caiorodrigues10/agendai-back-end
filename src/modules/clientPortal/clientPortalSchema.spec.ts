/// <reference types="vitest/globals" />
import {
  CLIENT_PORTAL_OWNER_ROLES,
  CLIENT_PORTAL_STAFF_ROLES,
  requestOtpSchema,
} from "./clientPortalSchema";

describe("client portal staff roles", () => {
  it("uses Prisma Role enum values (EMPLOYEE, not MANAGER/PROFESSIONAL)", () => {
    expect([...CLIENT_PORTAL_STAFF_ROLES]).toEqual(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]);
    expect(CLIENT_PORTAL_STAFF_ROLES).not.toContain("MANAGER");
    expect(CLIENT_PORTAL_STAFF_ROLES).not.toContain("PROFESSIONAL");
    expect([...CLIENT_PORTAL_OWNER_ROLES]).toEqual(["MASTER_ADMIN", "OWNER"]);
  });

  it("accepts request-otp without name", () => {
    expect(requestOtpSchema.parse({ phone: "11999999999" })).toMatchObject({
      phone: "11999999999",
    });
  });

  it("exports query and params schemas used by ClientPortalController", async () => {
    const schema = await import("./clientPortalSchema");
    expect(schema.barbershopIdQuerySchema.parse({ barbershopId: "10000000-0000-4000-8000-000000000001" })).toBeTruthy();
    expect(schema.staffDashboardQuerySchema.parse({ identityId: "10000000-0000-4000-8000-000000000002" })).toBeTruthy();
    expect(schema.linkIdParamsSchema.parse({ linkId: "10000000-0000-4000-8000-000000000003" })).toBeTruthy();
  });
});
