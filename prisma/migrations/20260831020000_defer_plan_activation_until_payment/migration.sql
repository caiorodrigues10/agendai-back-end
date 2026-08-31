-- O plano de uma cobrança pendente não deve substituir o plano em vigor.
-- A referência fica na fatura e é aplicada somente no webhook de pagamento aprovado.
ALTER TABLE "invoices"
ADD COLUMN IF NOT EXISTS "planId" UUID;

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "plans"("id")
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "invoices_planId_idx" ON "invoices"("planId");
