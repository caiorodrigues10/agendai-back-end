-- Manual shop floor controls: open/close override, opening mode, queue gate.
-- Reuses existing schedule_exceptions (per-day closures).

CREATE TYPE "ManualShopStatus" AS ENUM ('AUTO', 'OPEN', 'CLOSED');
CREATE TYPE "OpeningMode" AS ENUM ('SCHEDULE', 'MANUAL');

ALTER TABLE "barbershops"
  ADD COLUMN "manualStatus" "ManualShopStatus" NOT NULL DEFAULT 'AUTO',
  ADD COLUMN "manualStatusSetAt" TIMESTAMP(3),
  ADD COLUMN "queueClosedAt" TIMESTAMP(3),
  ADD COLUMN "openingMode" "OpeningMode" NOT NULL DEFAULT 'SCHEDULE';

-- RLS for schedule_exceptions (created without policies in agenda_publica_reviews).
ALTER TABLE "schedule_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schedule_exceptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "schedule_exceptions"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

ALTER TABLE "calendar_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_blocks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "calendar_blocks"
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
