-- migrations/20261003000002_align_prisma_defaults
--
-- Alinha produção ao datamodel do Prisma, removendo os 3 `DEFAULT` que o
-- Prisma 6.4.0 não emite para `@default(uuid())` e `@updatedAt`.
--
-- Origem dos defaults (ambos pertencem a migrations de outra sessão, já
-- aplicadas em produção e não editáveis):
--   - 20261002000001_add_verified_reviews
--       review_invitations.id          DEFAULT gen_random_uuid()
--       review_invitations.updatedAt   DEFAULT CURRENT_TIMESTAMP
--   - 20261002000003_add_referral_credit_ledger
--       referral_credit_ledger.id      DEFAULT gen_random_uuid()
--
-- Por que é seguro:
--   * 67 das 68 colunas `updatedAt` de produção já não têm default
--     (inclusive `appointments`, `barbershops`, `users`) e funcionam em
--     produção: o Prisma fornece `@updatedAt` no INSERT, então o default
--     nunca foi necessário.
--   * Nenhum SQL raw toca essas duas tabelas — todo acesso é via
--     `prisma.referralCreditLedger.create()` e `prisma.reviewInvitation.*`,
--     que geram o UUID no cliente.
--   * As duas tabelas têm 0 linhas em produção no momento da aplicação.
--
-- Sem isto, `prisma migrate diff --from-schema-datasource
-- --to-schema-datamodel` acusa drift permanente e qualquer `migrate dev`
-- geraria exatamente este migration de novo.

-- AlterTable
ALTER TABLE "referral_credit_ledger" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "review_invitations" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
