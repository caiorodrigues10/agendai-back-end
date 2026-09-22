-- Remove o módulo de Gift Cards
DROP TABLE IF EXISTS "gift_card_usages";
DROP TABLE IF EXISTS "gift_cards";
DROP TYPE IF EXISTS "GiftCardStatus";

-- Remove o valor GIFT_CARD do enum WalletEntryType (PostgreSQL não tem DROP VALUE;
-- recria o tipo e converte linhas antigas GIFT_CARD em CREDIT)
ALTER TYPE "WalletEntryType" RENAME TO "WalletEntryType_old";
CREATE TYPE "WalletEntryType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'TRANSFER', 'CASHBACK');
ALTER TABLE "wallet_entries"
  ALTER COLUMN "type" TYPE "WalletEntryType"
  USING (
    CASE WHEN "type"::text = 'GIFT_CARD' THEN 'CREDIT' ELSE "type"::text END
  )::"WalletEntryType";
DROP TYPE "WalletEntryType_old";
