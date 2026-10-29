-- Backlog de gestão de processos do escritório (segmento LAW_FIRM).
--
-- Tudo aditivo:
--  * case_contracts + contract_signatures — contratos/procurações com
--    digitalização (arquivo) e trilha de assinatura (link por signatário);
--  * case_time_entries — timesheet (horas do caso, cobráveis ou não);
--  * case_success_fees — honorários por êxito (% sobre o valor obtido);
--  * court_intimations — digestão de intimações (PJe/tribunal/email/WhatsApp);
--  * case_fee_invoices — NFS-e do escritório (manual ou via provedor);
--  * deadline_alerts — alertas automáticos de vencimento de prazo;
--  * case_transfers — transferência de caso entre unidades (multiunidade);
--  * client_cases.shareWithClient / case_events.visibleToClient — portal do
--    cliente (por padrão desligado; sigilo preservado).
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
    'ContractType', 'ContractStatus', 'SignatureRole', 'SignatureStatus',
    'SignatureType', 'IntimationSource', 'IntimationStatus', 'SuccessFeeStatus',
    'FeeInvoiceStatus', 'FeeInvoiceProvider', 'DeadlineAlertChannel',
    'DeadlineAlertKind', 'DeadlineAlertStatus', 'CaseTransferStatus'
  ] LOOP
    CASE v_type
      WHEN 'ContractType'         THEN v_labels := ARRAY['ENGAGEMENT','PROCURACAO','SETTLEMENT','FEE_AGREEMENT','OTHER'];
      WHEN 'ContractStatus'       THEN v_labels := ARRAY['DRAFT','SENT','PARTIALLY_SIGNED','SIGNED','VOID'];
      WHEN 'SignatureRole'        THEN v_labels := ARRAY['CLIENT','LAWYER','WITNESS'];
      WHEN 'SignatureStatus'      THEN v_labels := ARRAY['PENDING','SIGNED','DECLINED'];
      WHEN 'SignatureType'        THEN v_labels := ARRAY['DRAWN','TYPED','DIGITAL_CERT'];
      WHEN 'IntimationSource'     THEN v_labels := ARRAY['EMAIL','WHATSAPP','MANUAL','IMPORT'];
      WHEN 'IntimationStatus'     THEN v_labels := ARRAY['NEW','TRIAGED','LINKED','IGNORED'];
      WHEN 'SuccessFeeStatus'     THEN v_labels := ARRAY['PENDING','INVOICED','PAID','CANCELED'];
      WHEN 'FeeInvoiceStatus'     THEN v_labels := ARRAY['DRAFT','ISSUED','CANCELED','FAILED'];
      WHEN 'FeeInvoiceProvider'   THEN v_labels := ARRAY['MANUAL','NFE_IO','FOCUS'];
      WHEN 'DeadlineAlertChannel' THEN v_labels := ARRAY['WHATSAPP','EMAIL'];
      WHEN 'DeadlineAlertKind'    THEN v_labels := ARRAY['UPCOMING','OVERDUE'];
      WHEN 'DeadlineAlertStatus'  THEN v_labels := ARRAY['PENDING','SENT','FAILED','CANCELED'];
      WHEN 'CaseTransferStatus'   THEN v_labels := ARRAY['PENDING','ACCEPTED','REJECTED','CANCELED'];
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

-- ─── Colunas novas em tabelas existentes ──────────────────────────────────────
ALTER TABLE "client_cases" ADD COLUMN IF NOT EXISTS "shareWithClient" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "case_events" ADD COLUMN IF NOT EXISTS "visibleToClient" BOOLEAN NOT NULL DEFAULT false;

-- ─── case_contracts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_contracts" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "type" "ContractType" NOT NULL DEFAULT 'ENGAGEMENT',
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT,
    "fileUrl" VARCHAR(500),
    "fileName" VARCHAR(200),
    "mimeType" VARCHAR(120),
    "sizeBytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "value" DECIMAL(12,2),
    "feePercent" DECIMAL(5,2),
    "notes" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_contracts_pkey" PRIMARY KEY ("id")
);

-- ─── contract_signatures ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "contract_signatures" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "signerName" VARCHAR(120) NOT NULL,
    "signerEmail" VARCHAR(200),
    "signerWhatsapp" VARCHAR(20),
    "role" "SignatureRole" NOT NULL DEFAULT 'CLIENT',
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "token" VARCHAR(80) NOT NULL,
    "signatureUrl" TEXT,
    "signatureType" "SignatureType" NOT NULL DEFAULT 'TYPED',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

-- ─── case_time_entries ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_time_entries" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "description" TEXT,
    "minutes" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "hourlyRate" DECIMAL(10,2),
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "entryDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_time_entries_pkey" PRIMARY KEY ("id")
);

-- ─── case_success_fees ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_success_fees" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "baseAmount" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "installments" INTEGER NOT NULL DEFAULT 1,
    "status" "SuccessFeeStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_success_fees_pkey" PRIMARY KEY ("id")
);

-- ─── court_intimations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "court_intimations" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID,
    "source" "IntimationSource" NOT NULL DEFAULT 'MANUAL',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "rawPayload" JSONB,
    "detectedNumber" VARCHAR(30),
    "suggestedType" "CaseEventType" NOT NULL DEFAULT 'INTIMATION',
    "status" "IntimationStatus" NOT NULL DEFAULT 'NEW',
    "triagedByUserId" UUID,
    "triagedAt" TIMESTAMP(3),
    "linkedEventId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "court_intimations_pkey" PRIMARY KEY ("id")
);

-- ─── case_fee_invoices ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_fee_invoices" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID,
    "clientId" UUID,
    "invoiceNumber" VARCHAR(40),
    "externalId" VARCHAR(120),
    "provider" "FeeInvoiceProvider" NOT NULL DEFAULT 'MANUAL',
    "status" "FeeInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "description" VARCHAR(300) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "issRetained" BOOLEAN NOT NULL DEFAULT false,
    "taxpayerId" VARCHAR(20),
    "issuedAt" TIMESTAMP(3),
    "xmlUrl" VARCHAR(500),
    "errorMessage" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_fee_invoices_pkey" PRIMARY KEY ("id")
);

-- ─── deadline_alerts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deadline_alerts" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "deadlineId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "DeadlineAlertChannel" NOT NULL DEFAULT 'WHATSAPP',
    "kind" "DeadlineAlertKind" NOT NULL DEFAULT 'UPCOMING',
    "daysRemaining" INTEGER,
    "sentOn" DATE NOT NULL,
    "status" "DeadlineAlertStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deadline_alerts_pkey" PRIMARY KEY ("id")
);

-- ─── case_transfers ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_transfers" (
    "id" UUID NOT NULL,
    "barbershopId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "targetBarbershopId" UUID NOT NULL,
    "reason" TEXT,
    "status" "CaseTransferStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" UUID NOT NULL,
    "acceptedByUserId" UUID,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "case_transfers_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign keys (guardadas) ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_contracts_barbershopId_fkey')) THEN
    ALTER TABLE "case_contracts" ADD CONSTRAINT "case_contracts_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_contracts_caseId_fkey')) THEN
    ALTER TABLE "case_contracts" ADD CONSTRAINT "case_contracts_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_contracts_clientId_fkey')) THEN
    ALTER TABLE "case_contracts" ADD CONSTRAINT "case_contracts_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_contracts_createdByUserId_fkey')) THEN
    ALTER TABLE "case_contracts" ADD CONSTRAINT "case_contracts_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_signatures_barbershopId_fkey')) THEN
    ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contract_signatures_contractId_fkey')) THEN
    ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "case_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_time_entries_barbershopId_fkey')) THEN
    ALTER TABLE "case_time_entries" ADD CONSTRAINT "case_time_entries_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_time_entries_caseId_fkey')) THEN
    ALTER TABLE "case_time_entries" ADD CONSTRAINT "case_time_entries_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_time_entries_clientId_fkey')) THEN
    ALTER TABLE "case_time_entries" ADD CONSTRAINT "case_time_entries_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_time_entries_staffUserId_fkey')) THEN
    ALTER TABLE "case_time_entries" ADD CONSTRAINT "case_time_entries_staffUserId_fkey"
      FOREIGN KEY ("staffUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_success_fees_barbershopId_fkey')) THEN
    ALTER TABLE "case_success_fees" ADD CONSTRAINT "case_success_fees_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_success_fees_caseId_fkey')) THEN
    ALTER TABLE "case_success_fees" ADD CONSTRAINT "case_success_fees_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'court_intimations_barbershopId_fkey')) THEN
    ALTER TABLE "court_intimations" ADD CONSTRAINT "court_intimations_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'court_intimations_caseId_fkey')) THEN
    ALTER TABLE "court_intimations" ADD CONSTRAINT "court_intimations_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_fee_invoices_barbershopId_fkey')) THEN
    ALTER TABLE "case_fee_invoices" ADD CONSTRAINT "case_fee_invoices_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_fee_invoices_caseId_fkey')) THEN
    ALTER TABLE "case_fee_invoices" ADD CONSTRAINT "case_fee_invoices_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_fee_invoices_clientId_fkey')) THEN
    ALTER TABLE "case_fee_invoices" ADD CONSTRAINT "case_fee_invoices_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "salon_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deadline_alerts_barbershopId_fkey')) THEN
    ALTER TABLE "deadline_alerts" ADD CONSTRAINT "deadline_alerts_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deadline_alerts_deadlineId_fkey')) THEN
    ALTER TABLE "deadline_alerts" ADD CONSTRAINT "deadline_alerts_deadlineId_fkey"
      FOREIGN KEY ("deadlineId") REFERENCES "case_deadlines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_transfers_barbershopId_fkey')) THEN
    ALTER TABLE "case_transfers" ADD CONSTRAINT "case_transfers_barbershopId_fkey"
      FOREIGN KEY ("barbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_transfers_targetBarbershopId_fkey')) THEN
    ALTER TABLE "case_transfers" ADD CONSTRAINT "case_transfers_targetBarbershopId_fkey"
      FOREIGN KEY ("targetBarbershopId") REFERENCES "barbershops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_transfers_caseId_fkey')) THEN
    ALTER TABLE "case_transfers" ADD CONSTRAINT "case_transfers_caseId_fkey"
      FOREIGN KEY ("caseId") REFERENCES "client_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "case_contracts_barbershopId_caseId_idx" ON "case_contracts"("barbershopId", "caseId");
CREATE INDEX IF NOT EXISTS "case_contracts_barbershopId_status_idx" ON "case_contracts"("barbershopId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_signatures_token_key" ON "contract_signatures"("token");
CREATE INDEX IF NOT EXISTS "contract_signatures_barbershopId_idx" ON "contract_signatures"("barbershopId");
CREATE INDEX IF NOT EXISTS "contract_signatures_contractId_idx" ON "contract_signatures"("contractId");
CREATE UNIQUE INDEX IF NOT EXISTS "contract_signatures_contractId_signerName_key" ON "contract_signatures"("contractId", "signerName");
CREATE INDEX IF NOT EXISTS "case_time_entries_barbershopId_caseId_idx" ON "case_time_entries"("barbershopId", "caseId");
CREATE INDEX IF NOT EXISTS "case_time_entries_barbershopId_staffUserId_idx" ON "case_time_entries"("barbershopId", "staffUserId");
CREATE INDEX IF NOT EXISTS "case_time_entries_barbershopId_entryDate_idx" ON "case_time_entries"("barbershopId", "entryDate");
CREATE INDEX IF NOT EXISTS "case_success_fees_barbershopId_caseId_idx" ON "case_success_fees"("barbershopId", "caseId");
CREATE INDEX IF NOT EXISTS "case_success_fees_barbershopId_status_idx" ON "case_success_fees"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "court_intimations_barbershopId_status_idx" ON "court_intimations"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "court_intimations_barbershopId_receivedAt_idx" ON "court_intimations"("barbershopId", "receivedAt");
CREATE INDEX IF NOT EXISTS "case_fee_invoices_barbershopId_status_idx" ON "case_fee_invoices"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "case_fee_invoices_barbershopId_issuedAt_idx" ON "case_fee_invoices"("barbershopId", "issuedAt");
CREATE INDEX IF NOT EXISTS "deadline_alerts_barbershopId_status_idx" ON "deadline_alerts"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "deadline_alerts_deadlineId_idx" ON "deadline_alerts"("deadlineId");
CREATE UNIQUE INDEX IF NOT EXISTS "deadline_alerts_deadlineId_userId_kind_channel_sentOn_key" ON "deadline_alerts"("deadlineId", "userId", "kind", "channel", "sentOn");
CREATE INDEX IF NOT EXISTS "case_transfers_barbershopId_status_idx" ON "case_transfers"("barbershopId", "status");
CREATE INDEX IF NOT EXISTS "case_transfers_targetBarbershopId_status_idx" ON "case_transfers"("targetBarbershopId", "status");
CREATE INDEX IF NOT EXISTS "case_transfers_caseId_idx" ON "case_transfers"("caseId");
CREATE INDEX IF NOT EXISTS "case_events_barbershopId_visibleToClient_idx" ON "case_events"("barbershopId", "visibleToClient");

-- ─── RLS (mesma variante de `client_cases`) ───────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'case_contracts','contract_signatures','case_time_entries','case_success_fees',
    'court_intimations','case_fee_invoices','deadline_alerts','case_transfers'
  ] LOOP
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
