import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  crmCampaign: { findUnique: vi.fn(), update: vi.fn() },
  crmCampaignRecipient: { count: vi.fn() },
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { refreshCrmCampaignStatus } from "./campaignStatusService";

describe("refreshCrmCampaignStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    { counts: [3, 0, 0, 0], expected: "SENT" },
    { counts: [2, 1, 0, 0], expected: "PARTIAL" },
    { counts: [0, 3, 0, 0], expected: "FAILED" },
    { counts: [1, 0, 0, 2], expected: "QUEUED" },
  ])("finaliza campanha como $expected", async ({ counts, expected }) => {
    prismaMock.crmCampaign.findUnique.mockResolvedValue({ recipientCount: 3 });
    counts.forEach((count, index) => prismaMock.crmCampaignRecipient.count.mockResolvedValueOnce(count));
    await refreshCrmCampaignStatus("campaign-1");
    expect(prismaMock.crmCampaign.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: expected }),
    }));
  });
});
