-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_whatsapp_settings" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'global',
    "aiGloballyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ownerBotGloballyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "outboundPaused" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_whatsapp_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_whatsapp_settings" ("id", "updatedAt")
VALUES ('global', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
