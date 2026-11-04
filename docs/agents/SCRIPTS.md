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
| `test` | `NODE_OPTIONS=--max-old-space-size=2048 vitest run --exclude "src/tests/integration/**" --maxWorkers=2` | testes | `npm install` | Unitários (sem integration; 2 workers). Suíte completa só no CI |
| `test:unit` | `vitest run --exclude "src/tests/integration/**" --maxWorkers=2` | testes | — | Unitários (exclui integration; aspas obrigatórias — sem elas o shell expande o glob e a suíte inteira não roda) |
| `test:changed` | `NODE_OPTIONS=… vitest run --changed --maxWorkers=2` | testes | `npm install` + git | Só testes afetados pelos arquivos alterados — preferir durante o desenvolvimento |
| `test:related` | `NODE_OPTIONS=… vitest related --maxWorkers=2` | testes | `npm install` + git | Testes relacionados aos arquivos informados (`-- <arquivos>`) — preferir durante o desenvolvimento |
| `test:integration` | `dotenv-cli` + vitest integration (`--maxWorkers=1 --no-file-parallelism`) | testes | Postgres `:5442`, Redis | Integration contra DB local, serializada |
| `test:integration:containers` | vitest + testcontainers | testes | Docker | Integration com containers |
| `test:pentest` | vitest pentest | testes | Docker / env pentest | Suite de segurança |
| `test:security` | vitest arquivos de security | testes | — | Subconjunto segurança |
| `test:watch` | `NODE_OPTIONS=… vitest --pool=forks --maxWorkers=2` | testes | — | Watch (limitado) |
| `test:coverage` | `vitest run --exclude integration` | testes | — | **Não** configura `coverage` em `vitest.config.mts`; não gera relatório de cobertura sozinho |
| `test:all` | `test:unit` + `test:integration` | testes | DB/Redis | Suite ampla |
| `prisma:migrate` | `prisma migrate dev` | **altera banco** | Postgres | Cria/aplica migration em dev |
| `prisma:migrate:prod` | `prisma migrate deploy` | **altera banco** | Postgres | Aplica migrations |
| `db:migrate:status` | `prisma migrate status` | leitura | Postgres | Status |
| `db:validate-schema` | `prisma validate && migrate status` | leitura | Postgres | Valida schema + status |
| `prisma:generate` | `prisma generate` | geração | — | Gera client |
| `prisma:seed` | `tsx prisma/seed.ts` | **altera banco** | Postgres | Seed base (system user, planos, admin via `SEED_MASTER_ADMIN_*`, dados globais). Perfil via `--profile=`/`SEED_PROFILE` (`base`|`demo`|`all`) |
| `prisma:seed:demo` | `tsx prisma/seed.ts --profile=demo` | **altera banco** | Postgres, `SEED_DEMO=true` | Cria/atualiza o salão demo + defaults (guard: recusa produção) |
| `prisma:seed:tenant` | `tsx prisma/seed.ts --tenant` | **altera banco** | Postgres, `--barbershopId=<uuid>` | Defaults de um salão existente (`npm run prisma:seed:tenant -- --barbershopId=<uuid>`) |
| `prisma:seed:perf-fixture` | `tsx scripts/seed-perf-fixture.ts` | **altera banco** (leitura/purge com flags) | Postgres | Seed idempotente do fixture de performance (salão "Barbearia Sintetica Perf" UUID fixo + 30 produtos + dono local). `--list-accounts` lista contas de teste (leitura); `--purge` é dry-run e só apaga com `--purge --confirm` (guard de produção) |
| `prisma:seed:qa-fixture` | `tsx scripts/seed-qa-fixture.ts` | **altera banco** (leitura/purge com flags) | Postgres | Fixture `[QA]` idempotente de ponta a ponta (salão "[QA] Salao Beta" UUID fixo + OWNER + EMPLOYEE + cliente "[QA] Cliente Beta"). `--list` só lê; `--purge` é dry-run e só apaga com `--purge --confirm` (guard de produção). Senhas via `SEED_QA_OWNER_PASSWORD`/`SEED_QA_EMPLOYEE_PASSWORD` |
| `prisma:seed:last-account` | `tsx scripts/seed-last-account.ts` | **altera banco** | Postgres | Popula a última conta criada no painel (salão "Salão" `d8122a7c-1312-4c1d-b86e-a00c1572137b`, dona dirce) com dados de demonstração brasileiros: 3 funcionários, 15 clientes, agenda passada/futura, fila do dia, catálogo, produtos + estoque + vendas, despesas/caixa, fiados, avaliações, fidelidade e eventos do CRM. Aborta se já populado; `--force` apaga os dados do salão e recria (guard de produção). Senha da equipe via `SEED_LAST_ACCOUNT_PASSWORD` (default `SenhaForte#123`) |
| `segments:parity` | `tsx scripts/generateSegmentParity.ts` | leitura/escrita de arquivo | Node | Regenera `src/shared/segments/segmentParity.json` a partir da config central (labels, público, modo sugerido, aviso de saúde, ficha auxiliar, catálogo e preset de horário). Rodar depois de mexer em `src/shared/segments` — o JSON é o contrato lido pelo teste de paridade do frontend |
| `security:audit-logs` | `tsx scripts/remediateSensitiveAuditLogs.ts` | **altera dados** | Postgres | Remediação de logs |
| `ledger:backfill` | `tsx scripts/backfillFinancialLedger.ts` | **altera banco** (dry-run por padrão) | Postgres | Backfill idempotente do livro financeiro: agendamentos/conclusões de fila sem `SERVICE_SALE` e pagamentos de fiado sem `FIADO_PAYMENT` (+ comissão padrão do serviço). `npm run ledger:backfill` só reporta; aplicar com `npm run ledger:backfill -- --apply [--barbershop=<uuid>] [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--no-commissions]` |
| `audit:backfill-shop` | `tsx scripts/backfillAuditLogBarbershop.ts` | **altera banco** (dry-run por padrão) | Postgres | Backfill idempotente de `audit_logs.barbershop_id` (inferência por `resourceId`/`details`/uuid na `action` contra `barbershops`). `npm run audit:backfill-shop` só reporta; aplicar com `npm run audit:backfill-shop -- --apply` |
| `images:migrate-cloudinary` | `tsx scripts/migrate-images-to-cloudinary.ts` | **altera banco + storage** (dry-run por padrão) | Postgres, `CLOUDINARY_*`, bucket GCS legado legível | Migra imagens GCS → Cloudinary (avatar, logo, capa do tema, produto, mídia de post, imagem/vídeo de feed). `npm run images:migrate-cloudinary` só relata; aplicar com `-- --apply [--barbershop=<uuid>] [--limit=N] [--delete-source]` |
| `prisma:studio` / `db:studio` | `prisma studio` | leitura | Postgres | UI Prisma |
| `db:push` | `prisma db push` | **altera banco** | Postgres | Push sem migration (dev) |
| `db:push:prod` | `node -e "… process.exit(1)"` | bloqueio | — | **Bloqueado** de propósito |
| `docs:check` | `node scripts/check-docs.mjs` | leitura | Node | Valida inventários documentais + lista de módulos vs disco |
| `ocr:tessdata` | `node scripts/fetch-ocr-tessdata.mjs` | escrita (arquivo local) + **rede** | rede (build/preparação) | Baixa o traineddata do Tesseract (`eng`, `por`) para `OCR_TESSDATA_PATH` (padrão `.tesseract-cache`). **Roda no build, nunca em runtime.** `--lang=eng`, `--cache-dir=…`, `--base-url=file://…` (origem local para build offline) |
| `verify:delivery` | `node scripts/verify-delivery.mjs` | leitura | `npm install` | Encadeia docs, typecheck, unit e security (sem produção) |
| `whatsappai:check` | `node scripts/check-whatsapp-ai-config.mjs` | leitura | env (`.env`) | Confere env do atendente de IA no WhatsApp (instância própria, segredo do webhook, Redis/DB) e imprime a URL de webhook a configurar na Evolution. Aceita `--env=<arquivo>` |

## Observações críticas

- **Não existe script `lint`** neste `package.json`. Não recomendar `npm run lint` no backend.
- Prisma no código: **6.4.0** (`@prisma/client`, `prisma`). Não documentar como 7.x.
- Produção: preferir `prisma migrate deploy` (`start:prod` / `prisma:migrate:prod`). `db:push` não é caminho de produção.
- Migrations: ver também `docs/RUNBOOK_MIGRATIONS.md`.
- **Timestamp de migration: uma única regra, sem contradição — prefixo estritamente MAIOR que o maior prefixo já existente em `prisma/migrations/`.** Hoje o teto é **`20261110130000`** (`20261110130000_import_file_formats`). As 11 migrations mais recentes da pasta (`20261105120000` … `20261110130000`) têm data de criação posterior à de hoje (2026-11-01) e **já estão aplicadas** em `agendai` e `agendai_db`. O Prisma ordena migrations pelo nome da pasta: uma migration nova com prefixo ≤ o teto seria aplicada **fora de ordem** (Prisma sinaliza "migration applied out of order"; `migrate dev` vira erro P3009). **Não existe mais a exigência de "prefixo ≤ data real do dia"**: ela contradiz a ordem de aplicação enquanto a série datada em 2026-11-05…2026-11-10 existir (a data real de hoje é menor que os prefixos já aplicados). Regras: (a) prefixo novo > maior prefixo da pasta; (b) prefixo único, formato `AAAAMMDDHHMMSS` em UTC; (c) o prefixo continua na série 2026-11-10+ até a série ser renomeada. **Escopo real do rename: 37 migrations** (as 11 da série + 26 mais antigas com prefixo posterior ao dia de criação da pasta), registrado como **dívida técnica com prazo 2026-12-31** em `AGENTS.md` §"Dívida técnica — renomear as migrations com prefixo inconsistente" — tarefa separada, ainda não autorizada. Números verificados: 125 migrations na pasta, 126 linhas em `_prisma_migrations` do `agendai` (1 excedente: `20261027000000_post_media_gallery_default`), 125 no `agendai_db`.
