-- Row Level Security (RLS) policies for multi-tenant isolation.
-- Each barbershop can only access its own data.
-- The app.current_barbershop_id session variable is set by the Prisma extension.
--
-- MASTER_ADMIN bypass: the extension sets the session variable to '' (empty string)
-- when there is no barbershopId. The RLS policies check for this value first,
-- allowing full access when it is set to ''.

-- ============================================================
-- 1. Habilitar RLS nas tabelas tenant
-- ============================================================

ALTER TABLE queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiados ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_entities ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Policies para tabelas com barbershopId NOT NULL
--    Bypass: current_setting(..., true) = '' allows MASTER_ADMIN / crons
-- ============================================================

-- queue
CREATE POLICY tenant_isolation ON queue
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- appointments
CREATE POLICY tenant_isolation ON appointments
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- payments
CREATE POLICY tenant_isolation ON payments
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- subscriptions
CREATE POLICY tenant_isolation ON subscriptions
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- salon_clients
CREATE POLICY tenant_isolation ON salon_clients
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- services
CREATE POLICY tenant_isolation ON services
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- schedules
CREATE POLICY tenant_isolation ON schedules
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- feed_posts
CREATE POLICY tenant_isolation ON feed_posts
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- fiados
CREATE POLICY tenant_isolation ON fiados
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- expenses
CREATE POLICY tenant_isolation ON expenses
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- service_packages
CREATE POLICY tenant_isolation ON service_packages
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- client_packages
CREATE POLICY tenant_isolation ON client_packages
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- refunds
CREATE POLICY tenant_isolation ON refunds
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- referral_codes
CREATE POLICY tenant_isolation ON referral_codes
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- ============================================================
-- 3. Policies para tabelas com barbershopId NULLABLE
--    (NULL = global, visível para todos)
-- ============================================================

-- service_categories (NULL = global category, non-null = shop-specific)
CREATE POLICY tenant_isolation ON service_categories
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" IS NULL OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- expense_categories (NULL = global category, non-null = shop-specific)
CREATE POLICY tenant_isolation ON expense_categories
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" IS NULL OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- users (NULL = MASTER_ADMIN without shop, non-null = staff of a shop)
CREATE POLICY tenant_isolation ON users
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" IS NULL OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- blocked_entities (shared across tenants for security)
CREATE POLICY tenant_isolation ON blocked_entities
  USING (current_setting('app.current_barbershop_id', true) = '' OR "barbershopId" IS NULL OR "barbershopId" = current_setting('app.current_barbershop_id', true)::uuid);

-- ============================================================
-- 4. Policies para referrals (dois FKs)
-- ============================================================

CREATE POLICY tenant_isolation ON referrals
  USING (
    current_setting('app.current_barbershop_id', true) = ''
    OR "referrerBarbershopId" = current_setting('app.current_barbershop_id', true)::uuid
    OR "refereeBarbershopId" = current_setting('app.current_barbershop_id', true)::uuid
  );

-- ============================================================
-- 5. NOTA: audit_logs, access_logs, error_logs NÃO têm RLS
--    pois são tabelas globais de sistema. O cron cleanOldLogs
--    usa $executeRawUnsafe que não passa pela extension.
-- ============================================================

-- ============================================================
-- 6. Habilitar RLS forçado (impede owners de bypassar via role)
-- ============================================================

ALTER TABLE queue FORCE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE salon_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;
ALTER TABLE schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE feed_posts FORCE ROW LEVEL SECURITY;
ALTER TABLE fiados FORCE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE service_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE client_packages FORCE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE referral_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE referrals FORCE ROW LEVEL SECURITY;
ALTER TABLE service_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE expense_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE blocked_entities FORCE ROW LEVEL SECURITY;
