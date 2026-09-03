-- Post studio metadata is additive; existing rendered posts remain untouched.
CREATE TYPE "PostFormat" AS ENUM ('SQUARE', 'PORTRAIT', 'STORY');

CREATE TABLE "post_media" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "uploadedById" UUID,
    "url" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "mimeType" VARCHAR(80) NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "feed_posts" ADD COLUMN "templateKey" VARCHAR(64) NOT NULL DEFAULT 'agenda-aberta';
ALTER TABLE "feed_posts" ADD COLUMN "format" "PostFormat" NOT NULL DEFAULT 'SQUARE';
ALTER TABLE "feed_posts" ADD COLUMN "primaryMediaId" UUID;
ALTER TABLE "feed_posts" ADD COLUMN "secondaryMediaId" UUID;
ALTER TABLE "feed_posts" ADD COLUMN "paletteKey" VARCHAR(32) NOT NULL DEFAULT 'brand';
ALTER TABLE "feed_posts" ADD COLUMN "designOptions" JSONB;

CREATE INDEX "post_media_barbershopId_createdAt_idx" ON "post_media"("barbershopId", "createdAt");
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_primaryMediaId_fkey" FOREIGN KEY ("primaryMediaId") REFERENCES "post_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feed_posts" ADD CONSTRAINT "feed_posts_secondaryMediaId_fkey" FOREIGN KEY ("secondaryMediaId") REFERENCES "post_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
