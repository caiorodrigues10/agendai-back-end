# Inventário de scripts — Backend (`agendai-back-end`)

## Contrato com o frontend

No checkout irmão `agendai`, executar `npm run contract:check` e `npm run test:contract`; `API_CONTRACT_BACKEND` permite apontar para outra raiz backend. O check lê as rotas registradas sem iniciar API/banco ou carregar segredos. O modo `npm run contract:check:strict` também reprova a dívida legada de endpoints. Detalhes e smoke de login, dashboard, relatórios, configurações, clima e logout ficam em `agendai/docs/agents/DELIVERY_CHECKS.md`. Swagger já está configurado em `src/config/swagger.ts`; não há cliente gerado e a checagem de método/caminho não valida payloads.

> Diretório de execução: raiz do repositório **`agendai-back-end/`**.
> Atualize este arquivo no mesmo PR que alterar `package.json#scripts`.

| Script | Comando (resumo) | Tipo | Pré-requisitos | Efeito |
|---|---|---|---|---|
| `dev` | `tsx watch --env-file=.env …/server.ts` | leitura/dev | `.env`, Postgres | API em watch |
| `dev:docker` | `tsx watch …/server.ts` | leitura/dev | env do container | API em watch sem `--env-file` |
| `build` | `tsup` | geração | `npm install` | Bundle em `dist/` |
| `start` | `node dist/.../server.js` | runtime | build | Sobe API compilada |
| `start:prod` | `prisma migrate deploy && node …` | **altera banco** + runtime | build, `DATABASE_URL` | Migra e sobe |
| `typecheck` | `tsc --noEmit` | leitura | `npm install` | TypeScript |
| `test` | `vitest` | testes | setup | Vitest (modo interativo/padrão do CLI) |
| `test:unit` | `vitest run --exclude "src/tests/integration/**"` | testes | — | Unitários (exclui integration; aspas obrigatórias — sem elas o shell expande o glob e a suíte inteira não roda) |
| `test:integration` | `dotenv-cli` + vitest integration | testes | Postgres `:5442`, Redis | Integration contra DB local |
| `test:integration:containers` | vitest + testcontainers | testes | Docker | Integration com containers |
| `test:pentest` | vitest pentest | testes | Docker / env pentest | Suite de segurança |
| `test:security` | vitest arquivos de security | testes | — | Subconjunto segurança |
| `test:watch` | `vitest --watch` | testes | — | Watch |
| `test:coverage` | `vitest run --exclude integration` | testes | — | **Não** configura `coverage` em `vitest.config.mts`; não gera relatório de cobertura sozinho |
| `test:all` | `test:unit` + `test:integration` | testes | DB/Redis | Suite ampla |
| `prisma:migrate` | `prisma migrate dev` | **altera banco** | Postgres | Cria/aplica migration em dev |
| `prisma:migrate:prod` | `prisma migrate deploy` | **altera banco** | Postgres | Aplica migrations |
| `db:migrate:status` | `prisma migrate status` | leitura | Postgres | Status |
| `db:validate-schema` | `prisma validate && migrate status` | leitura | Postgres | Valida schema + status |
| `prisma:generate` | `prisma generate` | geração | — | Gera client |
| `prisma:seed` | `tsx prisma/seed.ts` | **altera banco** | Postgres | Seed |
| `security:audit-logs` | `tsx scripts/remediateSensitiveAuditLogs.ts` | **altera dados** | Postgres | Remediação de logs |
| `prisma:studio` / `db:studio` | `prisma studio` | leitura | Postgres | UI Prisma |
| `db:push` | `prisma db push` | **altera banco** | Postgres | Push sem migration (dev) |
| `db:push:prod` | `node -e "… process.exit(1)"` | bloqueio | — | **Bloqueado** de propósito |
| `docs:check` | `node scripts/check-docs.mjs` | leitura | Node | Valida inventários documentais + lista de módulos vs disco |
| `verify:delivery` | `node scripts/verify-delivery.mjs` | leitura | `npm install` | Encadeia docs, typecheck, unit e security (sem produção) |

## Observações críticas

- **Não existe script `lint`** neste `package.json`. Não recomendar `npm run lint` no backend.
- Prisma no código: **6.4.0** (`@prisma/client`, `prisma`). Não documentar como 7.x.
- Produção: preferir `prisma migrate deploy` (`start:prod` / `prisma:migrate:prod`). `db:push` não é caminho de produção.
- Migrations: ver também `docs/RUNBOOK_MIGRATIONS.md`.
