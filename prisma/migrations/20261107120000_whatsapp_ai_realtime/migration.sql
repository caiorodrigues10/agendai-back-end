-- Atendente de IA por salão: kill switch por tenant.
ALTER TABLE "barbershops" ADD COLUMN IF NOT EXISTS "whatsappAiEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Telefones das conversas de IA passam a usar o formato canônico (55 + número),
-- o mesmo de normalizeWhatsAppPhone() e das instâncias Evolution.
UPDATE "ai_conversations"
SET "normalizedPhone" = '55' || "normalizedPhone"
WHERE length("normalizedPhone") >= 10
  AND length("normalizedPhone") <= 11;

-- Índice de leitura por telefone canônico (mesma chave do índice existente).
CREATE INDEX IF NOT EXISTS "ai_conversations_barbershopId_normalizedPhone_idx"
  ON "ai_conversations"("barbershopId", "normalizedPhone");
