import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

export async function populateDailyWeatherLog(): Promise<void> {
  const barbershops: Array<{ id: string; name: string; latitude: number | null; longitude: number | null }> =
    await prisma.barbershop.findMany({
      where: {
        latitude: { not: null },
        longitude: { not: null },
        active: true,
      },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

  if (barbershops.length === 0) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  console.log(`[dailyWeatherLog] Populating weather logs for ${dateStr}, ${barbershops.length} barbershops`);

  const batchSize = 5;
  for (let i = 0; i < barbershops.length; i += batchSize) {
    const batch = barbershops.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (shop) => {
        try {
          const existing = await prisma.dailyWeatherLog.findUnique({
            where: { barbershopId_date: { barbershopId: shop.id, date: yesterday } },
          });
          if (existing) return;

          let weatherData: Record<string, any> | null = null;
          try {
            const response = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${shop.latitude}&longitude=${shop.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,precipitation_hours,wind_speed_10m_max,relative_humidity_2m_max&timezone=auto&start_date=${dateStr}&end_date=${dateStr}&past_days=1`
            );
            if (response.ok) {
              const data = (await response.json()) as Record<string, any>;
              weatherData = data.daily;
            }
          } catch {
            console.warn(`[dailyWeatherLog] Weather fetch failed for ${shop.name}`);
          }

          const startOfDay = new Date(yesterday);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(yesterday);
          endOfDay.setHours(23, 59, 59, 999);

          const [queueCount, appointmentCount, revenueAgg] = await Promise.all([
            prisma.queueItem.count({
              where: {
                barbershopId: shop.id,
                completedAt: { gte: startOfDay, lte: endOfDay },
                status: "COMPLETED",
              },
            }),
            prisma.appointment.count({
              where: {
                barbershopId: shop.id,
                date: yesterday,
                status: { in: ["CONFIRMED", "COMPLETED", "CHECKED_IN"] },
              },
            }),
            prisma.queueItem.aggregate({
              where: {
                barbershopId: shop.id,
                completedAt: { gte: startOfDay, lte: endOfDay },
                status: "COMPLETED",
              },
              _sum: { finalPrice: true },
            }),
          ]);

          const revenue = revenueAgg._sum.finalPrice ?? 0;

          await prisma.dailyWeatherLog.create({
            data: {
              barbershopId: shop.id,
              date: yesterday,
              temperatureMax: weatherData?.temperature_2m_max?.[0] ?? null,
              temperatureMin: weatherData?.temperature_2m_min?.[0] ?? null,
              precipitationMm: weatherData?.precipitation_sum?.[0] ?? null,
              precipitationPct: weatherData?.precipitation_probability_max?.[0] ?? null,
              weatherCode: weatherData?.weather_code?.[0] ?? null,
              windSpeedMax: weatherData?.wind_speed_10m_max?.[0] ?? null,
              humidity: weatherData?.relative_humidity_2m_max?.[0] ?? null,
              queueCount,
              appointmentCount,
              revenue,
              revenuePerCapita: queueCount > 0 ? revenue / queueCount : null,
            },
          });

          console.log(`[dailyWeatherLog] ✓ ${shop.name}: ${queueCount} queue, ${revenue} revenue`);
        } catch (err) {
          console.error(`[dailyWeatherLog] ✗ ${shop.name}:`, err);
        }
      })
    );
  }

  console.log("[dailyWeatherLog] Done");
}

export async function backfillDailyWeatherLog(days: number = 90): Promise<void> {
  const barbershops: Array<{ id: string; name: string; latitude: number | null; longitude: number | null }> =
    await prisma.barbershop.findMany({
      where: { latitude: { not: null }, longitude: { not: null }, active: true },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  console.log(`[backfill] Backfilling ${days} days for ${barbershops.length} barbershops`);

  for (const shop of barbershops) {
    try {
      const startStr = startDate.toISOString().slice(0, 10);
      const endStr = endDate.toISOString().slice(0, 10);

      const response = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${shop.latitude}&longitude=${shop.longitude}&start_date=${startStr}&end_date=${endStr}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_hours,wind_speed_10m_max,relative_humidity_2m_max&timezone=auto`
      );

      if (!response.ok) continue;
      const data = (await response.json()) as Record<string, any>;
      const daily = data.daily;
      if (!daily?.time) continue;

      for (let i = 0; i < daily.time.length; i++) {
        const date = new Date(daily.time[i] + "T00:00:00Z");

        const existing = await prisma.dailyWeatherLog.findUnique({
          where: { barbershopId_date: { barbershopId: shop.id, date } },
        });
        if (existing) continue;

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const [queueCount, appointmentCount, revenueAgg] = await Promise.all([
          prisma.queueItem.count({
            where: {
              barbershopId: shop.id,
              completedAt: { gte: startOfDay, lte: endOfDay },
              status: "COMPLETED",
            },
          }),
          prisma.appointment.count({
            where: {
              barbershopId: shop.id,
              date,
              status: { in: ["CONFIRMED", "COMPLETED", "CHECKED_IN"] },
            },
          }),
          prisma.queueItem.aggregate({
            where: {
              barbershopId: shop.id,
              completedAt: { gte: startOfDay, lte: endOfDay },
              status: "COMPLETED",
            },
            _sum: { finalPrice: true },
          }),
        ]);

        await prisma.dailyWeatherLog.create({
          data: {
            barbershopId: shop.id,
            date,
            temperatureMax: daily.temperature_2m_max?.[i] ?? null,
            temperatureMin: daily.temperature_2m_min?.[i] ?? null,
            precipitationMm: daily.precipitation_sum?.[i] ?? null,
            weatherCode: daily.weather_code?.[i] ?? null,
            windSpeedMax: daily.wind_speed_10m_max?.[i] ?? null,
            humidity: daily.relative_humidity_2m_max?.[i] ?? null,
            queueCount,
            appointmentCount,
            revenue: revenueAgg._sum.finalPrice ?? 0,
            revenuePerCapita:
              queueCount > 0 ? (revenueAgg._sum.finalPrice ?? 0) / queueCount : null,
          },
        });
      }

      console.log(`[backfill] ✓ ${shop.name}: ${daily.time.length} days processed`);
    } catch (err) {
      console.error(`[backfill] ✗ ${shop.name}:`, err);
    }
  }

  console.log("[backfill] Done");
}

/**
 * Cron job diário que popula DailyWeatherLog para o dia anterior.
 * Roda às 00:15 America/Sao_Paulo para capturar dados completos do dia.
 */
export function scheduleDailyWeatherLog(log: CronLogger): void {
  cron.schedule(
    "15 0 * * *",
    async () => {
      try {
        await populateDailyWeatherLog();
        log.info("[DailyWeatherLog] Weather logs populated successfully");
      } catch (err) {
        log.error({ err }, "[DailyWeatherLog] Failed to populate weather logs");
      }
    },
    { timezone: "America/Sao_Paulo" }
  );
  log.info(
    { schedule: "15 0 * * *", timezone: "America/Sao_Paulo" },
    "Cron de DailyWeatherLog agendado"
  );
}
