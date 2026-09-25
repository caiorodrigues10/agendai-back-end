import cron from "node-cron";
import { container } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import type { DailyForecast, IWeatherProvider } from "@/shared/container/providers/WeatherProvider/IWeatherProvider";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

// America/Sao_Paulo está em UTC-3 desde 2019 (sem DST). Offset fixo evita
// depender do TZ da máquina (Render roda em UTC) ao montar limites do dia.
const SP_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

function spDayBounds(ymd: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${ymd}T00:00:00.000Z`) - SP_UTC_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

async function fetchOpenMeteoLogDay(
  latitude: number,
  longitude: number,
  dateStr: string
): Promise<DailyForecast | null> {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "precipitation_probability_max",
        "precipitation_hours",
        "wind_speed_10m_max",
        "relative_humidity_2m_max",
      ].join(","),
      timezone: "auto",
      start_date: dateStr,
      end_date: dateStr,
      past_days: "1",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Record<string, any>;
    const daily = data.daily;
    if (!daily?.time?.[0]) return null;

    return {
      date: String(daily.time[0]),
      weatherCode: finite(daily.weather_code?.[0]) ?? 0,
      tempMax: finite(daily.temperature_2m_max?.[0]) ?? 0,
      tempMin: finite(daily.temperature_2m_min?.[0]) ?? 0,
      precipMm: finite(daily.precipitation_sum?.[0]) ?? 0,
      precipProbability: finite(daily.precipitation_probability_max?.[0]) ?? 0,
      precipHours: finite(daily.precipitation_hours?.[0]) ?? 0,
      windSpeedMax: finite(daily.wind_speed_10m_max?.[0]) ?? 0,
      humidity: finite(daily.relative_humidity_2m_max?.[0]) ?? 50,
      condition: "",
      conditionIcon: "",
    };
  } catch {
    return null;
  }
}

async function getForecastForDate(
  provider: IWeatherProvider,
  latitude: number,
  longitude: number,
  targetDate: string,
  days = 3
): Promise<DailyForecast | null> {
  try {
    const forecast = await provider.getForecast(latitude, longitude, days);
    return (
      forecast.find(day => day.date.slice(0, 10) === targetDate) ??
      await fetchOpenMeteoLogDay(latitude, longitude, targetDate)
    );
  } catch {
    return fetchOpenMeteoLogDay(latitude, longitude, targetDate);
  }
}

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

  // "Ontem" no calendário de São Paulo (o cron roda às 00:15 America/Sao_Paulo;
  // derivar de new Date().setDate(-1) usa o TZ do servidor e desloca o dia
  // quando a máquina está em UTC).
  const now = new Date();
  const spNow = new Date(now.getTime() + SP_UTC_OFFSET_MS);
  const yesterday = new Date(
    Date.UTC(spNow.getUTCFullYear(), spNow.getUTCMonth(), spNow.getUTCDate() - 1)
  );
  const dateStr = yesterday.toISOString().slice(0, 10);

  console.log(`[dailyWeatherLog] Populating weather logs for ${dateStr}, ${barbershops.length} barbershops`);

  const weatherProvider = container.resolve<IWeatherProvider>("WeatherProvider");
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

          const weatherData = await getForecastForDate(
            weatherProvider,
            shop.latitude!,
            shop.longitude!,
            dateStr
          );
          if (!weatherData) console.warn(`[dailyWeatherLog] Weather fetch failed for ${shop.name}`);

          const { start: startOfDay, end: endOfDay } = spDayBounds(dateStr);

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
              temperatureMax: weatherData?.tempMax ?? null,
              temperatureMin: weatherData?.tempMin ?? null,
              precipitationMm: weatherData?.precipMm ?? null,
              precipitationPct: weatherData?.precipProbability ?? null,
              weatherCode: weatherData?.weatherCode ?? null,
              windSpeedMax: weatherData?.windSpeedMax ?? null,
              humidity: weatherData?.humidity ?? null,
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
        `https://archive-api.open-meteo.com/v1/archive?latitude=${shop.latitude}&longitude=${shop.longitude}&start_date=${startStr}&end_date=${endStr}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,precipitation_hours,wind_speed_10m_max,relative_humidity_2m_max&timezone=auto`
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
        startOfDay.setUTCHours(0, 0, 0, 0);
        const dayKey = startOfDay.toISOString().slice(0, 10);
        const { start: dayStart, end: dayEnd } = spDayBounds(dayKey);

        const [queueCount, appointmentCount, revenueAgg] = await Promise.all([
          prisma.queueItem.count({
            where: {
              barbershopId: shop.id,
              completedAt: { gte: dayStart, lte: dayEnd },
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
              completedAt: { gte: dayStart, lte: dayEnd },
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
            precipitationPct: daily.precipitation_probability_max?.[i] ?? null,
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
