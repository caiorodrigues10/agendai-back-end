-- AlterTable
ALTER TABLE "barbershops" ADD COLUMN     "logoPublicId" VARCHAR(300);

-- CreateTable
CREATE TABLE "barbershop_page_themes" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "presetKey" VARCHAR(40),
    "accentColor" VARCHAR(9) NOT NULL DEFAULT '#2CB58A',
    "backgroundColor" VARCHAR(9) NOT NULL DEFAULT '#0F1110',
    "surfaceColor" VARCHAR(9) NOT NULL DEFAULT '#1B1F1D',
    "textColor" VARCHAR(9) NOT NULL DEFAULT '#F2F5F3',
    "textMutedColor" VARCHAR(9) NOT NULL DEFAULT '#8B9990',
    "radiusStyle" VARCHAR(20) NOT NULL DEFAULT 'rounded',
    "buttonStyle" VARCHAR(20) NOT NULL DEFAULT 'filled',
    "coverUrl" VARCHAR(500),
    "coverPublicId" VARCHAR(300),
    "coverOverlay" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barbershop_page_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barbershop_page_themes_barbershopId_key" ON "barbershop_page_themes"("barbershopId");

-- AddForeignKey
ALTER TABLE "barbershop_page_themes" ADD CONSTRAINT "barbershop_page_themes_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
