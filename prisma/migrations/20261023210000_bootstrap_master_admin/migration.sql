-- Bootstrap idempotente do primeiro administrador master.
-- A senha nunca fica em texto puro; o valor abaixo é um hash bcrypt.
-- Remover esta migration do fluxo futuro caso o usuário já tenha sido criado
-- em um ambiente diferente antes do deploy.

INSERT INTO "users" (
  "id",
  "name",
  "email",
  "password",
  "role",
  "active",
  "permissions",
  "createdAt",
  "updatedAt"
)
VALUES (
  gen_random_uuid(),
  'Administrador',
  'caio.henrique.rodrigues10@gmail.com',
  '$2a$12$6DcwzGkXGXCG4utlYyzafuYgr84JLU4gvxSerNf.H4YlFwAqIOIR.',
  'MASTER_ADMIN',
  true,
  ARRAY[]::text[],
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO NOTHING;
