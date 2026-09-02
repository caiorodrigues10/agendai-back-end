import { prisma } from "@/libs/prismaClient";

export async function refreshCrmCampaignStatus(campaignId: string): Promise<void> {
  const [campaign, sentCount, failedCount, skippedCount, pendingCount] = await Promise.all([
    prisma.crmCampaign.findUnique({ where: { id: campaignId }, select: { recipientCount: true } }),
    prisma.crmCampaignRecipient.count({ where: { campaignId, status: "SENT" } }),
    prisma.crmCampaignRecipient.count({ where: { campaignId, status: "FAILED" } }),
    prisma.crmCampaignRecipient.count({ where: { campaignId, status: "SKIPPED" } }),
    prisma.crmCampaignRecipient.count({ where: { campaignId, status: "PENDING" } }),
  ]);
  if (!campaign) return;

  const processed = sentCount + failedCount + skippedCount;
  const status = pendingCount > 0 || processed < campaign.recipientCount
    ? "QUEUED"
    : failedCount === 0 && skippedCount === 0
      ? "SENT"
      : sentCount === 0
        ? "FAILED"
        : "PARTIAL";

  await prisma.crmCampaign.update({
    where: { id: campaignId },
    data: { sentCount, failedCount, skippedCount, status },
  });
}

