-- Seed default subscription plans so public pricing endpoints always have data.
-- Idempotent: safe to run multiple times on the same database.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plans WHERE name = 'Essencial') THEN
    UPDATE plans
    SET
      description = 'Fila, agenda e equipe ilimitada. Ideal para começar — sem relatórios avançados.',
      price = 14.0,
      "billingCycle" = 'MONTHLY',
      "maxEmployees" = 0,
      "hasDashboard" = false,
      "tierKey" = 'essential',
      features = ARRAY[
        'Fila digital ilimitada',
        'Agendamentos online 24h',
        'Funcionários ilimitados',
        'Perfil e feed do salão',
        'Suporte por e-mail',
        'Sem dashboard de relatórios/financeiro'
      ]::text[],
      active = true,
      "updatedAt" = NOW()
    WHERE name = 'Essencial';
  ELSE
    INSERT INTO plans (
      id,
      name,
      description,
      price,
      "billingCycle",
      "maxEmployees",
      "hasDashboard",
      "tierKey",
      features,
      active,
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      'Essencial',
      'Fila, agenda e equipe ilimitada. Ideal para começar — sem relatórios avançados.',
      14.0,
      'MONTHLY',
      0,
      false,
      'essential',
      ARRAY[
        'Fila digital ilimitada',
        'Agendamentos online 24h',
        'Funcionários ilimitados',
        'Perfil e feed do salão',
        'Suporte por e-mail',
        'Sem dashboard de relatórios/financeiro'
      ]::text[],
      true,
      NOW(),
      NOW()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plans WHERE name = 'Essencial Anual') THEN
    UPDATE plans
    SET
      description = 'Mesmo Essencial, cobrado anualmente. Equivale a 10 meses — 2 meses grátis.',
      price = 140.0,
      "billingCycle" = 'YEARLY',
      "maxEmployees" = 0,
      "hasDashboard" = false,
      "tierKey" = 'essential',
      features = ARRAY[
        'Tudo do Essencial',
        '2 meses grátis (pague 10, use 12)',
        'Funcionários ilimitados',
        'Prioridade na fila de suporte'
      ]::text[],
      active = true,
      "updatedAt" = NOW()
    WHERE name = 'Essencial Anual';
  ELSE
    INSERT INTO plans (
      id,
      name,
      description,
      price,
      "billingCycle",
      "maxEmployees",
      "hasDashboard",
      "tierKey",
      features,
      active,
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      'Essencial Anual',
      'Mesmo Essencial, cobrado anualmente. Equivale a 10 meses — 2 meses grátis.',
      140.0,
      'YEARLY',
      0,
      false,
      'essential',
      ARRAY[
        'Tudo do Essencial',
        '2 meses grátis (pague 10, use 12)',
        'Funcionários ilimitados',
        'Prioridade na fila de suporte'
      ]::text[],
      true,
      NOW(),
      NOW()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plans WHERE name = 'Pro') THEN
    UPDATE plans
    SET
      description = 'Acesso completo: operação + dashboard de relatórios e financeiro do salão.',
      price = 20.0,
      "billingCycle" = 'MONTHLY',
      "maxEmployees" = 0,
      "hasDashboard" = true,
      "tierKey" = 'pro',
      features = ARRAY[
        'Tudo do Essencial',
        'Dashboard de relatórios',
        'Painel financeiro (despesas e fiado)',
        'Insights de movimento',
        'Funcionários ilimitados',
        'Suporte prioritário'
      ]::text[],
      active = true,
      "updatedAt" = NOW()
    WHERE name = 'Pro';
  ELSE
    INSERT INTO plans (
      id,
      name,
      description,
      price,
      "billingCycle",
      "maxEmployees",
      "hasDashboard",
      "tierKey",
      features,
      active,
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      'Pro',
      'Acesso completo: operação + dashboard de relatórios e financeiro do salão.',
      20.0,
      'MONTHLY',
      0,
      true,
      'pro',
      ARRAY[
        'Tudo do Essencial',
        'Dashboard de relatórios',
        'Painel financeiro (despesas e fiado)',
        'Insights de movimento',
        'Funcionários ilimitados',
        'Suporte prioritário'
      ]::text[],
      true,
      NOW(),
      NOW()
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plans WHERE name = 'Pro Anual') THEN
    UPDATE plans
    SET
      description = 'Pro completo no anual. Equivale a 10 meses — 2 meses grátis (melhor retenção).',
      price = 200.0,
      "billingCycle" = 'YEARLY',
      "maxEmployees" = 0,
      "hasDashboard" = true,
      "tierKey" = 'pro',
      features = ARRAY[
        'Tudo do Pro',
        '2 meses grátis (pague 10, use 12)',
        'Dashboard + financeiro',
        'Melhor custo anual da plataforma'
      ]::text[],
      active = true,
      "updatedAt" = NOW()
    WHERE name = 'Pro Anual';
  ELSE
    INSERT INTO plans (
      id,
      name,
      description,
      price,
      "billingCycle",
      "maxEmployees",
      "hasDashboard",
      "tierKey",
      features,
      active,
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid(),
      'Pro Anual',
      'Pro completo no anual. Equivale a 10 meses — 2 meses grátis (melhor retenção).',
      200.0,
      'YEARLY',
      0,
      true,
      'pro',
      ARRAY[
        'Tudo do Pro',
        '2 meses grátis (pague 10, use 12)',
        'Dashboard + financeiro',
        'Melhor custo anual da plataforma'
      ]::text[],
      true,
      NOW(),
      NOW()
    );
  END IF;
END $$;
