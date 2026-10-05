# Estabilização do painel — resultado (2026-10-05)

> Rodada guiada pelo "Plano de estabilização do Agenda Já" (lotes 1–8).
> Evidências por fluxo, riscos remanescentes e instrução de migração.

## Comandos de validação (estado final)

| Gate | Resultado |
|---|---|
| backend `verify:delivery` (docs + typecheck + unit + security) | OK — **142 arqs / 1291 testes** + 7/7 |
| backend `test:integration` (Postgres :5442 + Redis de teste) | OK — **4 arqs / 25 testes** |
| frontend `verify:delivery` (docs + typecheck + test:contract + contract:check + vitest) | OK — **90 arqs / 389 testes** |
| frontend `npm run build` | OK (PWA generateSW, 91 entries) |

## Lote 1 — Segurança e integridade da fila

- **`requirePermission` centralizado** (`shared/infra/http/middlewares/requirePermission.ts`): OWNER/MASTER_ADMIN passam; token sem claim hidrata do banco (revogação imediata, sem depender de refresh). Cópias locais de fiado/expenses removidas; 403 agora no padrão `AppError`.
- **Rotas da fila**: `PATCH/DELETE /queue/:id` + `GET /queue/metrics` exigem `QUEUE_MANAGE` (EMPLOYEE). Público (listagem mascarada/entrada) intacto. Teste de integração: 403 sem permissão, 2xx com ela, tenant 403 mantido no use case.
- **Conclusão atômica** (`QueueRepository.completeWithCommissions`): guarda atômica IN_CHAIR→COMPLETED, comissões (dedupe natural pela unique), ledger e **fiado na mesma transação**. Falha em qualquer etapa reverte tudo (teste: "falha na gravação do fiado reverte a conclusão inteira").
- **Idempotente (duplo clique/retry)**: repetir a conclusão responde **200 com `alreadyCompleted: true`**; guarda da transação impede segunda comissão/fiado; venda anexada dedupada por `queue:${id}`. Efeitos pós-commit (CRM, avaliação, WhatsApp) todos tolerantes a falha.
- **Arquivamento lógico**: `QueueItem.archivedAt/archivedBy/archiveReason` (migration `20261005000001_queue_item_soft_archive`, apenas aditiva). DELETE vira "remover da visualização"; listagens operacionais filtram arquivados; **métricas/ledger/relatórios continuam contando** (totais históricos intactos). Integração: item arquivado some das vistas e `completedCount` inalterado.

## Lote 2 — Contratos da agenda e estados

- **`procedure`** chega ao backend: `queueSchemas.procedure` (título 1-120, fórmula/detalhes ≤2000) + controller repassa; persiste como `ClientProcedureRecord` (melhor esforço, como a agenda já fazia).
- **Intervalo real**: `from`/`to` aceitos em `GET /appointments` (limites civis UTC; `date` tem precedência). Antes o zod descartava silenciosamente e a paginação não tinha intervalo.
- **Frontend**: `listAppointments` devolve `{items, meta}`; painel busca todas as páginas do período (cap 10 páginas com sinalização), cancela requisições antigas (AbortController + request ids), reseta referência ao trocar de salão.
- **Estados loading/empty/error/stale** por recurso; erro nunca vira "lista vazia"; `EmptyState` apenas após resposta válida vazia; `SectionError`/"Tentar novamente"; banner "dados desatualizados" quando stale; **spinner full-screen removido** em favor de skeletons do kit.
- **Toasts honestos**: ações destrutivas (sair da fila, cancelar, check-in) aguardam a resposta; erro de rede vira toast de erro, nunca confirmação falsa.

## Lote 3 — Permissões do painel

- Matriz: `agendai/docs/agents/PERMISSIONS_MATRIX.md` (papel × permissão × tela × operação, com divergências history → corrigidas).
- `/auth/me` e login/google retornam `permissions` (EMPLOYEE); privilégio de dono/admin continua implícito.
- Menus e router alinhados à permissão: tabs finance/reports/profit/equipment/posts declaram a permissão; abertura direta de URL proibida mostra **AccessDeniedPage** sem montar a tela (TabGuard). Backend permanece autoridade: `/barbershop/financial/*` (FINANCE_VIEW), closeout GET/POST (VIEW/MANAGE), `profit/*` leitura (REPORTS_VIEW).
- 4 perfis cobertos por teste de integração/unidade (proprietário, empregado com e sem permissão, cross-shop).

## Lote 4 — Posts, e2e, qualidade operacional

- **Flake do postRenderPool corrigida na causa**: o teste deixava `POST_RENDER_TIMEOUT_MS=1000` valendo para o render de recuperação — sob carga da suíte, o respawn do worker ultrapassa 1s antes de desenhar. Escopo do env agora cobre só o SVG pesado. Suíte completa passou 2× limpa depois.
- PWA: mensagem "interface abre, dados/ações precisam de internet" já corresponde à realidade (`NetworkOnly` em `/api/*` confirmado); nenhum dado sensível é cacheado (sem mudança de risco). A falsa confirmação offline foi corrigida no Lote 2 (toasts).
- E2E do painel: `agendai/e2e/panel-queue.spec.ts` (login → fila → chamar → concluir duplo → arquivar; URL proibida por permissão), **gated em `PANEL_E2E=1`** pois exige o stack completo — mesmo padrão de `post-editor.spec.ts`.
- Higiene: `catch {}` restantes nas rotas da fila são tolerâncias documentadas pós-commit (CRM/avaliação/WhatsApp/procedure) — por design; nenhum mascaramento de regra financeira.

## Instrução de migração (produção)

1. Deploy do backend normal: `start:prod` roda `prisma migrate deploy` e aplica `20261005000001_queue_item_soft_archive` (apenas `ADD COLUMN ... NULL`; sem backfill, sem DROP).
2. Pós-deploy: `prisma migrate status` + `migrate diff --from-schema-datasource ... --to-schema-datamodel ...` devem sair vazios (regra do RUNBOOK_MIGRATIONS.md).

## Riscos remanescentes

- `commissions.routes.ts` ainda autoriza por papel (qualquer EMPLOYEE lê) — anotado na matriz.
- `crm.routes.ts` idem (staff + plano com dashboard); permissões `CRM_*` existem mas não protegem os controllers.
- Permissões do usuário são globais (não por-loja na multiunidade).
- E2E do painel só roda com stack dedicada (CI provisionar `PANEL_E2E=1`).
- Redis de teste local movido para a porta **6380** (6379 ocupada pelo compose de outro projeto); script `test:integration` espera 6379 — ajustar conforme o ambiente de cada dev.
