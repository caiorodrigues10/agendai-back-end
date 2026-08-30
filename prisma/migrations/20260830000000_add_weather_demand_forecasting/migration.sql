-- AlterTable: Add latitude and longitude to barbershops
ALTER TABLE "barbershops" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "barbershops" ADD COLUMN "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "daily_weather_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "temperatureMax" DOUBLE PRECISION,
    "temperatureMin" DOUBLE PRECISION,
    "precipitationMm" DOUBLE PRECISION,
    "precipitationPct" DOUBLE PRECISION,
    "weatherCode" INTEGER,
    "conditionText" VARCHAR(100),
    "windSpeedMax" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "queueCount" INTEGER NOT NULL DEFAULT 0,
    "appointmentCount" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION,
    "revenuePerCapita" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_weather_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_weather_logs_barbershopId_date_key" ON "daily_weather_logs"("barbershopId", "date");
CREATE INDEX "daily_weather_logs_barbershopId_date_idx" ON "daily_weather_logs"("barbershopId", "date");

-- AddForeignKey
ALTER TABLE "daily_weather_logs" ADD CONSTRAINT "daily_weather_logs_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
