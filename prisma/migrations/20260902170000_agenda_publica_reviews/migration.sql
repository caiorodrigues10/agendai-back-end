-- Agenda pública, políticas de disponibilidade, bloqueios e avaliações.
-- Migração aditiva: não remove nem reescreve dados existentes.

CREATE TYPE "AppointmentCancellationSource" AS ENUM ('STAFF', 'CUSTOMER', 'SYSTEM');
CREATE TYPE "CalendarBlockRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ClientReviewStatus" AS ENUM ('PUBLISHED', 'REPORTED', 'HIDDEN');

ALTER TABLE "barbershops"
  ADD COLUMN "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE TABLE "appointment_policies" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "bookingNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
  "cancelNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
  "rescheduleNoticeMinutes" INTEGER NOT NULL DEFAULT 120,
  "bookingHorizonDays" INTEGER NOT NULL DEFAULT 60,
  "allowPublicCancellation" BOOLEAN NOT NULL DEFAULT true,
  "allowPublicReschedule" BOOLEAN NOT NULL DEFAULT true,
  "requestReview" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointment_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "appointment_policies_barbershopId_key" ON "appointment_policies"("barbershopId");
ALTER TABLE "appointment_policies" ADD CONSTRAINT "appointment_policies_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "schedule_exceptions" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "isOpen" BOOLEAN NOT NULL DEFAULT false,
  "openTime" VARCHAR(5),
  "closeTime" VARCHAR(5),
  "reason" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "schedule_exceptions_barbershopId_date_key" ON "schedule_exceptions"("barbershopId", "date");
CREATE INDEX "schedule_exceptions_barbershopId_date_idx" ON "schedule_exceptions"("barbershopId", "date");
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "calendar_blocks" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "staffId" UUID,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" VARCHAR(200) NOT NULL,
  "recurrence" "CalendarBlockRecurrence" NOT NULL DEFAULT 'NONE',
  "recurrenceUntil" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "calendar_blocks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "calendar_blocks_barbershopId_startAt_endAt_idx" ON "calendar_blocks"("barbershopId", "startAt", "endAt");
CREATE INDEX "calendar_blocks_staffId_startAt_endAt_idx" ON "calendar_blocks"("staffId", "startAt", "endAt");
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_blocks" ADD CONSTRAINT "calendar_blocks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "appointment_series" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "intervalWeeks" INTEGER NOT NULL DEFAULT 1,
  "occurrenceCount" INTEGER NOT NULL,
  "startDate" DATE NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_series_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointment_series_barbershopId_startDate_idx" ON "appointment_series"("barbershopId", "startDate");
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD COLUMN "publicAccessVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rescheduledFromId" UUID,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationSource" "AppointmentCancellationSource",
  ADD COLUMN "cancellationReason" VARCHAR(300),
  ADD COLUMN "seriesId" UUID,
  ADD COLUMN "occurrenceIndex" INTEGER;
CREATE INDEX "appointments_seriesId_occurrenceIndex_idx" ON "appointments"("seriesId", "occurrenceIndex");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "appointment_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "client_reviews" (
  "id" UUID NOT NULL,
  "barbershopId" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "clientId" UUID,
  "staffId" UUID,
  "rating" INTEGER NOT NULL,
  "comment" VARCHAR(1000),
  "response" VARCHAR(1000),
  "status" "ClientReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  "reportedAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "moderatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_reviews_appointmentId_key" ON "client_reviews"("appointmentId");
CREATE INDEX "client_reviews_barbershopId_status_createdAt_idx" ON "client_reviews"("barbershopId", "status", "createdAt");
CREATE INDEX "client_reviews_staffId_status_idx" ON "client_reviews"("staffId", "status");
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
