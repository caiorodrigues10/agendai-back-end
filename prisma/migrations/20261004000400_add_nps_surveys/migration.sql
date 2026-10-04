-- NPS real: pesquisas enviadas + respostas (máx1 resposta/respondente/90d).
-- Estrutural (tabelas novas); dados são gravados em runtime.

-- CreateEnum
CREATE TYPE "NpsSurveyStatus" AS ENUM ('PENDING', 'ANSWERED', 'EXPIRED');

-- CreateTable
CREATE TABLE "nps_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "barbershopId" UUID NOT NULL,
    "clientId" UUID,
    "respondentKey" VARCHAR(64) NOT NULL,
    "destinationMasked" VARCHAR(200) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NpsSurveyStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nps_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nps_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "surveyId" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nps_surveys_barbershopId_status_idx" ON "nps_surveys"("barbershopId", "status");

-- CreateIndex
CREATE INDEX "nps_surveys_barbershopId_respondentKey_idx" ON "nps_surveys"("barbershopId", "respondentKey");

-- CreateIndex
CREATE INDEX "nps_surveys_expiresAt_idx" ON "nps_surveys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "nps_responses_surveyId_key" ON "nps_responses"("surveyId");

-- CreateIndex
CREATE INDEX "nps_responses_barbershopId_createdAt_idx" ON "nps_responses"("barbershopId", "createdAt");

-- AddForeignKey
ALTER TABLE "nps_surveys" ADD CONSTRAINT "nps_surveys_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_surveys" ADD CONSTRAINT "nps_surveys_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "nps_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
