-- RLS: current_setting(..., true) returns NULL when the GUC was never set.
-- The original policies compared it to '' — NULL = '' is unknown, so FORCE RLS
-- hid every tenant-scoped row (OWNER login → 401 "Credenciais inválidas").
-- Treat NULL like '' (bypass, same intent as the Prisma extension default).
-- NULLIF avoids `''::uuid` errors if both OR branches are evaluated.

-- ============================================================
-- NOT NULL barbershopId
-- ============================================================

DROP POLICY IF EXISTS tenant_isolation ON queue;
CREATE POLICY tenant_isolation ON queue
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON appointments;
CREATE POLICY tenant_isolation ON appointments
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON subscriptions;
CREATE POLICY tenant_isolation ON subscriptions
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON salon_clients;
CREATE POLICY tenant_isolation ON salon_clients
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON services;
CREATE POLICY tenant_isolation ON services
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON schedules;
CREATE POLICY tenant_isolation ON schedules
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON feed_posts;
CREATE POLICY tenant_isolation ON feed_posts
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON fiados;
CREATE POLICY tenant_isolation ON fiados
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON expenses;
CREATE POLICY tenant_isolation ON expenses
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON service_packages;
CREATE POLICY tenant_isolation ON service_packages
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON client_packages;
CREATE POLICY tenant_isolation ON client_packages
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON refunds;
CREATE POLICY tenant_isolation ON refunds
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON referral_codes;
CREATE POLICY tenant_isolation ON referral_codes
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

-- ============================================================
-- NULLABLE barbershopId (NULL = global / master)
-- ============================================================

DROP POLICY IF EXISTS tenant_isolation ON service_categories;
CREATE POLICY tenant_isolation ON service_categories
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" IS NULL
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON expense_categories;
CREATE POLICY tenant_isolation ON expense_categories
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" IS NULL
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" IS NULL
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation ON blocked_entities;
CREATE POLICY tenant_isolation ON blocked_entities
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "barbershopId" IS NULL
    OR "barbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );

-- ============================================================
-- referrals (two FKs)
-- ============================================================

DROP POLICY IF EXISTS tenant_isolation ON referrals;
CREATE POLICY tenant_isolation ON referrals
  USING (
    COALESCE(current_setting('app.current_barbershop_id', true), '') = ''
    OR "referrerBarbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
    OR "refereeBarbershopId" = NULLIF(current_setting('app.current_barbershop_id', true), '')::uuid
  );
