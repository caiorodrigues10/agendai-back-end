-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "catalogKey" VARCHAR(80) NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "iconKey" VARCHAR(80) NOT NULL,
    "suggestedDurationMinutes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_catalog_items_catalogKey_key" ON "service_catalog_items"("catalogKey");

-- CreateIndex
CREATE INDEX "service_catalog_items_categoryId_idx" ON "service_catalog_items"("categoryId");

-- CreateIndex
CREATE INDEX "service_catalog_items_active_idx" ON "service_catalog_items"("active");

-- CreateIndex
CREATE INDEX "service_catalog_items_sortOrder_idx" ON "service_catalog_items"("sortOrder");

-- AddForeignKey
ALTER TABLE "service_catalog_items" ADD CONSTRAINT "service_catalog_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "service_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
