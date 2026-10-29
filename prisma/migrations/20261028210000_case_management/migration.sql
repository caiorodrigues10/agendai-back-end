-- Gestão de processos do escritório (segmento LAW_FIRM).
--
-- Tudo aditivo:
--  * client_cases ganha pipeline (status, prioridade), tribunal, parte
--    adversária, valores (pretensão/obtido), responsável e datas;
--  * case_tasks — tarefas/pendências do caso;
--  * case_deadlines — prazos (com ou sem caso vinculado);
--  * case_events — histórico de andamentos;
--  * case_documents — documentos do caso (contrato, procuração, peça…);
--  * office_holidays — feriados/suspensões do escritório (contagem de dias úteis).
--
-- Idempotente: pode ser reaplicada sem falhar nem duplicar nada.

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_type TEXT;
  v_label TEXT;
  v_labels TEXT[];
BEGIN
  FOREACH v_type IN ARRAY ARRAY[
    'ClientCaseStatus', 'CasePriority', 'CaseTaskStatus',
    'DeadlineType', 'DeadlineStatus', 'CaseEventType', 'CaseDocumentType'
  ] LOOP
    CASE v_type
      WHEN 'ClientCaseStatus' THEN v_labels := ARRAY['LEAD','ACTIVE','AWAITING_CLIENT','IN_COURT','SUSPENDED','CLOSED','ARCHIVED'];
      WHEN 'CasePriority'     THEN v_labels := ARRAY['LOW','NORMAL','HIGH','URGENT'];
      WHEN 'CaseTaskStatus'   THEN v_labels := ARRAY['OPEN','DONE','CANCELED'];
      WHEN 'DeadlineType'     THEN v_labels := ARRAY['JUDICIAL_RESPONSE','HEARING','APPEAL','CONTRACTUAL','INTERNAL'];
      WHEN 'DeadlineStatus'   THEN v_labels := ARRAY['PENDING','FULFILLED','MISSED','CANCELED'];
      WHEN 'CaseEventType'    THEN v_labels := ARRAY['NOTE','MEETING','FILING','COURT_MOTION','DEADLINE','INTIMATION','PAYMENT','CLIENT_CONTACT'];
      WHEN 'CaseDocumentType' THEN v_labels := ARRAY['CONTRACT','PROCURACAO','PETITION','EVIDENCE','COURT_DOCUMENT','INTAKE','RECEIPT','OTHER'];
      ELSE v_labels := ARRAY[]::TEXT[];
    END CASE;

    IF NOT (EXISTS (SELECT 1 FROM pg_type WHERE typname = v_type)) THEN
      EXECUTE format(
        'CREATE TYPE %I AS ENUM (%s)',
        v_type,
        (SELECT string_agg(quote_literal(label), ', ') FROM unnest(v_labels) AS label)
      );
    ELSE
      FOREACH v_label IN ARRAY v_labels LOOP
        IF NOT (EXISTS (
          SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = v_type AND e.enumlabel = v_label
        )) THEN
          EXECUTE format('ALTER TYPE %I ADD VALUE %L', v_type, v_label);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ─── client_cases: pipeline e dados do processo ───────────────────────────────
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "status" "ClientCaseStatus" NOT NULL DEFAULT 'LEAD';
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "priority" "CasePriority" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "title" VARCHAR(160);
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "courtName" VARCHAR(120);
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "opponent" VARCHAR(120);
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "claimedAmount" DECIMAL(12,2);
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "awardedAmount" DECIMAL(12,2);
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "responsibleStaffId" UUID;
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT (EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_cases_responsibleStaffId_fkey'
  )) THEN
    ALTER TABLE "client_cases"
      ADD CONSTRAINT "client_cases_responsibleStaffId_fkey"
      FOREIGN KEY ("responsibleStaffId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "client_cases_barbershopId_status_idx"
  ON "client_cases"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "client_cases_barbershopId_practiceArea_idx"
  ON "client_cases"("barbershopId", "practiceArea");

-- ─── case_tasks ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_tasks" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "CaseTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CasePriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "assigneeStaffId" UUID,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_tasks_barbershopId_caseId_idx"
  ON "case_tasks"("barbershopId", "caseId");
CREATE INDEX IF NOT EXISTS "case_tasks_barbershopId_status_idx"
  ON "case_tasks"("barbershopId", "status");

-- ─── case_deadlines ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_deadlines" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID,
    "title" VARCHAR(160) NOT NULL,
    "type" "DeadlineType" NOT NULL DEFAULT 'JUDICIAL_RESPONSE',
    "status" "DeadlineStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" DATE NOT NULL,
    "businessDays" INTEGER,
    "courtName" VARCHAR(120),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_deadlines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_deadlines_barbershopId_dueDate_idx"
  ON "case_deadlines"("barbershopId", "dueDate");
CREATE INDEX IF NOT EXISTS "case_deadlines_barbershopId_status_idx"
  ON "case_deadlines"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "case_deadlines_caseId_idx"
  ON "case_deadlines"("caseId");

-- ─── case_events ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_events" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "type" "CaseEventType" NOT NULL DEFAULT 'NOTE',
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "case_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_events_barbershopId_caseId_occurredAt_idx"
  ON "case_events"("barbershopId", "caseId", "occurredAt");

-- ─── case_documents ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_documents" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "type" "CaseDocumentType" NOT NULL DEFAULT 'OTHER',
    "fileUrl" VARCHAR(500),
    "fileName" VARCHAR(200),
    "mimeType" VARCHAR(120),
    "sizeBytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "case_documents_barbershopId_caseId_idx"
  ON "case_documents"("barbershopId", "caseId");

-- ─── office_holidays ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "office_holidays" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "office_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "office_holidays_barbershopId_date_key"
  ON "office_holidays"("barbershopId", "date");
CREATE INDEX IF NOT EXISTS "office_holidays_barbershopId_date_idx"
  ON "office_holidays"("barbershopId", "date");

-- ─── Foreign keys (idempotentes) ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_tasks_barbershopId_fkey')) THEN
    ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_tasks_caseId_fkey')) THEN
    ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_tasks_assigneeStaffId_fkey')) THEN
    ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_assigneeStaffId_fkey"
      FOREIGN KEY ("assigneeStaffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_deadlines_barbershopId_fkey')) THEN
    ALTER TABLE "case_deadlines" ADD CONSTRAINT "case_deadlines_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_deadlines_caseId_fkey')) THEN
    ALTER TABLE "case_deadlines" ADD CONSTRAINT "case_deadlines_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_events_barbershopId_fkey')) THEN
    ALTER TABLE "case_events" ADD CONSTRAINT "case_events_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_events_caseId_fkey')) THEN
    ALTER TABLE "case_events" ADD CONSTRAINT "case_events_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_events_createdByUserId_fkey')) THEN
    ALTER TABLE "case_events" ADD CONSTRAINT "case_events_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_barbershopId_fkey')) THEN
    ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_caseId_fkey')) THEN
    ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_documents_createdByUserId_fkey')) THEN
    ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_caseId_fkey')) THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_holidays_barbershopId_fkey')) THEN
    ALTER TABLE "office_holidays" ADD CONSTRAINT "office_holidays_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── RLS (mesma variante de `client_cases`) ───────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['case_tasks','case_deadlines','case_events','case_documents','office_holidays'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT (EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation'
    )) THEN
      EXECUTE format(
        'CREATE POLICY "tenant_isolation" ON %I USING (current_setting(''app.current_barbershop_id'', true) = '''' OR "barbershopId" = current_setting(''app.current_barbershop_id'', true)::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
