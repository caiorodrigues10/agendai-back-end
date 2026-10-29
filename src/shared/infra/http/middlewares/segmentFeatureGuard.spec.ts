import { beforeEach, describe, expect, it, vi } from "vitest";
import { segmentFeatureGuard } from "./segmentFeatureGuard";
import { getBusinessSegment } from "@/shared/segments/segmentCache";

vi.mock("@/shared/segments/segmentCache", () => ({
  getBusinessSegment: vi.fn(),
}));

function request(user?: { role?: string; barbershopId?: string }) {
  return { user } as never;
}

describe("segmentFeatureGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nega usuário não autenticado", async () => {
    await expect(segmentFeatureGuard("caseManagement")(request())).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("nega usuário sem salão", async () => {
    await expect(
      segmentFeatureGuard("caseManagement")(request({ role: "OWNER" }))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("MASTER_ADMIN passa sempre", async () => {
    await expect(
      segmentFeatureGuard("caseManagement")(request({ role: "MASTER_ADMIN" }))
    ).resolves.toBeUndefined();
    expect(getBusinessSegment).not.toHaveBeenCalled();
  });

  it("libera quando o segmento tem a feature", async () => {
    vi.mocked(getBusinessSegment).mockResolvedValue("LAW_FIRM");
    await expect(
      segmentFeatureGuard("caseManagement")(request({ role: "OWNER", barbershopId: "shop-1" }))
    ).resolves.toBeUndefined();
  });

  it("nega segmento sem a feature", async () => {
    vi.mocked(getBusinessSegment).mockResolvedValue("BARBERSHOP");
    await expect(
      segmentFeatureGuard("caseManagement")(request({ role: "OWNER", barbershopId: "shop-1" }))
    ).rejects.toMatchObject({ statusCode: 403, code: "SEGMENT_FEATURE_UNAVAILABLE" });
  });
});
