import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";
import { spSlotKey, withCronLock } from "@/shared/infra/redis/cronLock";
import { withCronCorrelation } from "@/shared/utils/correlationContext";

type CronLog = {
  info: (obj: unknown, message?: string) => void;
  error: (obj: unknown, message?: string) => void;
};

export function scheduleCleanupExpiredPix(log: CronLog): void {
  cron.schedule("*/15 * * * *", withCronCorrelation("cleanup-expired-pix", async () => {
    try {
      const scheduledKey = spSlotKey(15);
      await withCronLock(
        getRedisConnection(),
        { jobName: "cleanup-expired-pix", scheduledKey },
        async () => {
          const result = await prisma.payment.updateMany({
            where: {
              pixQrCode: { not: null },
              OR: [
                { pixExpirationDate: { lte: new Date() } },
                { status: { in: ["approved", "rejected", "cancelled", "refunded", "charged_back"] } },
              ],
            },
            data: { pixQrCode: null, pixQrCodeBase64: null, pixExpirationDate: null },
          });
          if (result.count > 0) log.info({ count: result.count }, "QR Codes PIX expirados removidos");
        }
      );
    } catch (error) {
      log.error({ err: error }, "Falha ao remover QR Codes PIX expirados");
    }
  }), { timezone: "America/Sao_Paulo" });
}
