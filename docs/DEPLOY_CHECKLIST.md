# Checklist de deploy — compartilhamento `/s/salon/:id` + grade 4:5

> **Status: RASCUNHO para revisão — nada abaixo foi executado nem commitado.**
> Escopo: back `#6` (`feat/post-format-portrait-default`) e `#7` (`feat/share-salon-meta`);
> front `#2` (`feat/post-grid-4x5-og-cap`) e `#3` (`feat/share-url-salon-route`);
> ativação do rewrite `/s/*` no host do front.
> Documentos relacionados: [RELEASE_PLAN.md](RELEASE_PLAN.md) (processo de merge/segredos),
> [RUNBOOK_MIGRATIONS.md](RUNBOOK_MIGRATIONS.md) (Prisma), [CLOUDINARY_SETUP.md](CLOUDINARY_SETUP.md),
> front `docs/agents/BUSINESS_RULES.md` → "Ativação em staging" e `docs/agents/DELIVERY_CHECKS.md` (smoke).
> Ordem dos itens é obrigatória. Nada de push direto em `main`, nada de `--force`.

---

## 0. Gates antes de qualquer passo

- [ ] Todos os PRs deste escopo com CI verde e `MERGEABLE` (hoje: front `#2`/`#3` verdes;
      back `#6`/`#7` com `Secret scan` falhando por findings históricos de `.env` — ver §0.1).
- [ ] Revisão do próprio checklist e aprovação do dono do deploy.
- [ ] Janela de deploy combinada (back e front) e pessoa de plantão para rollback.
- [ ] Rollback previsto: build anterior do front e release anterior do back localizáveis
      (número do deploy/commit) **antes** de começar.

### 0.1 Pendência conhecida: `Secret scan` do back

O job `secrets` (gitleaks, histórico completo) falha com 7 findings de `.env` em commits
de 07/2026 e **bloqueia o job `backend`** (`needs: secrets`). Falha igual em `main` e em
todos os PRs abertos — não é regressão deste escopo. Correção prevista no próprio
`.gitleaks.toml`: rotacionar as credenciais no provedor e depois aplicar
`docs/security/gitleaksignore.draft` por fingerprint. **Não contornar** com allowlist.

- [ ] Decisão registrada: (a) rotacionar + aplicar o draft antes do merge, ou
      (b) seguir com CI local equivalente (`docs:check`, `typecheck`, `test:unit`,
      `test:security`, `prisma validate`) assumindo o gate manual.

---

## 1. Variáveis de ambiente do backend (painel da plataforma, não no `.env` do repo)

| # | Env | Valor | Obrigatória | Efeito se ausente | Como validar |
|---|---|---|---|---|---|
| 1 | `NODE_ENV` | `production` | Sim | Helmet sai do modo produção: **CSP e HSTS desligados** (`app.ts` liga só com `isProd`), logs no modo dev | Log de boot com `"env":"production"` |
| 2 | `PUBLIC_APP_URL` | `https://<origem do app>` **sem barra final** (igual à `VITE_PUBLIC_SITE_URL` do front) | Sim | Em produção cai para a origem da requisição (errada atrás de proxy) em canonical/`og:url`/redirect; aviso no boot | Sem a linha `PUBLIC_APP_URL ausente em produção` no boot + `curl -sI .../s/salon/<id>` conferindo `<link rel="canonical" href="https://<app>/..."` |
| 3 | `PUBLIC_API_URL` | `https://<origem da API>` sem barra (pode ser igual à 2 se `/api` estiver exposto nela) | Sim, salvo quando `/api` vive na origem da 2 | Sem capa, `og:image` sai de `PUBLIC_APP_URL`; sem nenhuma das duas, o `og:image` é **omitido**; aviso no boot | Sem a linha `PUBLIC_API_URL ausente em produção` + `curl -s .../s/salon/<id> \| grep og:image` → URL absoluta que responde `200` |
| 4 | `TRUST_PROXY` | `1` (número de hops) ou CIDRs do proxy — **nunca `true`** | Sim, atrás de proxy | `request.protocol`/`hostname` ignoram `X-Forwarded-Proto/Host` → origem vira `http://` interna; rate limit/brute force/audit log passam a compartilhar a cota de todos; aviso no boot | Sem as linhas `TRUST_PROXY ausente/true em produção` + teste com `curl -H "X-Forwarded-Proto: https" -H "X-Forwarded-Host: <app>"` refletido no HTML (só funciona com o hop correto) |
| 5 | `CLOUDINARY_CLOUD_NAME`<br>`CLOUDINARY_API_KEY`<br>`CLOUDINARY_API_SECRET` | credencial do cloud (ver [CLOUDINARY_SETUP.md](CLOUDINARY_SETUP.md)) | Sim | Upload de imagem falha com `503` na primeira tentativa (`CloudinaryStorageProvider`); sem capa nova não há prévia com foto | Upload de teste no painel ou chamada assinada; ver também §6 |
 | 6 | `ALLOWED_ORIGINS` | incluir a origem exata do front (mesma da 2) | Sim | Chamadas de `https://<app>` para `/api` devolvem `403` de CORS (a rota deixa de responder para o front) | `curl -sI -H "Origin: https://<app>" "https://<API>/api/barbershops/<id>/page-theme/og-image"` → `access-control-allow-origin` |
| 7 | `RUN_MIGRATIONS` | `true` em **uma** instância `PROCESS_ROLE=api`; `false` nas demais | Sim | Duplicidade de migration ou migration não aplicada | [RUNBOOK_MIGRATIONS.md](RUNBOOK_MIGRATIONS.md) + `prisma migrate status` |
| 8 | `LOG_LEVEL` | `info` (ou conforme padrão) | Não | — | — |

Checklist de envs:

- [ ] 1–5 configuradas no painel **e conferidas uma a uma** (coluna "Como validar").
- [ ] Boot da API sem nenhum aviso de `TRUST_PROXY`/`PUBLIC_APP_URL`/`PUBLIC_API_URL`.
- [ ] `npx prisma validate` e `npx prisma migrate status` ok no ambiente alvo
      (hoje existe `20261023210000_bootstrap_master_admin` em `main` pendente em ambiente local).
- [ ] Nenhum segredo novo escrito em PR/issue/comentário.

---

## 2. Ordem de merge dos PRs

| # | Repo | PR | Branch | Por que nesta posição |
|---|---|---|---|---|
| 1 | back | [#6](https://github.com/caiorodrigues10/agendai-back-end/pull/6) `feat(posts): formato padrão price-split 4:5` | `feat/post-format-portrait-default` | Publica `defaultFormat` em `GET /api/posts/templates`, que o front `#2` lê. Sem ele o front usa o fallback local (funciona, mas a regra fica duplicada nos dois lados). |
| 2 | back | [#7](https://github.com/caiorodrigues10/agendai-back-end/pull/7) `feat(share): rota GET /s/salon/:id` | `feat/share-salon-meta` | Cria a rota servida pelo rewrite. Merge **antes** de qualquer ativação de `/s/*`. Não toca `prisma/`. |
| 3 | front | [#2](https://github.com/caiorodrigues10/agendai/pull/2) `feat(posts): grade 4:5 + catálogo + og:image JPEG` | `feat/post-grid-4x5-og-cap` | Independente do back em runtime (usa o fallback do `#6` se este ainda não estiver deployado). Pode ser mergeado junto com 1–2. |
| 4 | — | **Deploy do back** (§3) | — | Só depois dos merges 1–2: a rota precisa existir em produção antes do link do front circular. |
| 5 | front | [#3](https://github.com/caiorodrigues10/agendai/pull/3) `feat(share): link público do perfil vira /s/salon/:id` | `feat/share-url-salon-route` | Passa o botão **Compartilhar** a gerar `/s/salon/:id`. Depois do deploy do back para não gerar link 404 no meio do caminho. |
| 6 | front | [#1](https://github.com/caiorodrigues10/agendai/pull/1) `chore: baseline de warnings 491` | `chore/lint-warning-ratchet` | Independente; merge quando quiser (o `#2` já assume a baseline 491). |

Regras:

- [ ] Merge **somente via PR**, com CI verde; `main` nunca recebe push direto.
- [ ] Se `main` avançar e os PRs ficarem `BEHIND`, novo merge de `origin/main` na branch e revalidar checks antes do merge.
- [ ] PRs `#5` e `#3` do back (price-split/allowlist) e outros do front **não fazem parte deste escopo** — não misturar no mesmo deploy se não estiverem prontos.
- [ ] Deploy do front **sem** o rewrite ligado (§4) antes do §5.

---

## 3. Deploy do backend (após §2 itens 1–2)

- [ ] `RUN_MIGRATIONS=true` só numa instância; demais com `false` (§1.7).
- [ ] CI do back verde ou gate manual documentado (§0.1); em CI: `docs:check`, `prisma validate`,
      `migrate deploy` + `migrate status` + checagem de drift, `typecheck`, `test:security`, `vitest run`.
- [ ] Pós-deploy, no host público (`<API>`):

  ```bash
  ID=<uuid de um salão ativo>
  curl -sI https://<API>/s/salon/$ID            # 200, text/html, etag, cache-control: max-age=300
  curl -s  https://<API>/s/salon/$ID | head -30  # canonical/og:url = PUBLIC_APP_URL, og:image absoluto
  curl -s  https://<API>/s/salon/$ID | grep -c '<script'   # 0
  curl -sI https://<API>/s/salon/$ID -H "If-None-Match: <etag>"   # 304
  curl -sI https://<API>/s/salon/11111111-1111-1111-1111-111111111111  # 404 + HTML noindex
  curl -sI "https://<API>/api/barbershops/$ID/page-theme/og-image"      # 200 image/*
  curl -sI -H "Origin: https://<app>" "https://<API>/api/barbershops/$ID/page-theme/og-image" | grep -i "access-control-allow-origin"  # presente (CORS /api)
  curl -sI -H "Origin: https://<app>" "https://<API>/s/salon/$ID"     | grep -i "access-control-allow-origin"  # VAZIO (rota fora do CORS)
  curl -sI -H "Origin: https://origem-nao-permitida.com" "https://<API>/api/barbershops/$ID/page-theme/og-image"  # 403 (allowlist)
  ```

- [ ] Log de boot sem avisos de env (§1).
- [ ] Smoke do front sobre o back novo: login, dashboard, upload de imagem (§6 do
      front `DELIVERY_CHECKS.md` — as 6 etapas).

---

## 4. Deploy do front **sem** o rewrite (após §2 item 5)

- [ ] Merge do `#2` e `#3`, build e deploy do site estático (Render: `npm install && npm run build` → `dist`).
- [ ] `VITE_PUBLIC_SITE_URL` do build = mesma origem do `PUBLIC_APP_URL` do back.
- [ ] Smoke público: `npm run build && npm run test:e2e` (e o smoke manual de
      `DELIVERY_CHECKS.md`).
- [ ] Conferir que `/s/salon/<id>` **ainda** devolve o `index.html` da SPA (rewrite desligado) —
      é o estado esperado nesta etapa e a prova de que o §5 ainda não rodou.

---

## 5. Ativação do rewrite `/s/*` + testes de staging e de crawler

> A regra está **comentada** em `render.yaml` (Render) e `public/_redirects` (Netlify/Cloudflare)
> por decisão desta entrega. Ativar apenas com a URL pública do back confirmada.

### 5.1 Staging/preview (antes de produção)

- [ ] Descomentar a regra **no ambiente de staging/preview** com a URL real do back
      (`source: /s/*` → `destination: https://<API>/s/*`; em `_redirects`: `/s/*  https://<API>/s/*  200`).
      A regra precisa ficar **antes** do catch-all da SPA.
- [ ] Deploy do front nesse ambiente.
- [ ] Testes (todos apontando para o **host do front**):
  1. [ ] `curl -s https://<front>/s/salon/<id> | head -30` → tem `<title>`, `og:url` e
         `<meta http-equiv="refresh"`; se vier `<div id="root">` a regra está inativa ou depois do catch-all.
  2. [ ] `curl -sI https://<front>/s/salon/<id>` → `content-type: text/html` + cabeçalhos do back
         (`etag`, `cache-control: public, max-age=300`); id inexistente → `404` HTML (não `200` da SPA).
  3. [ ] `curl -s https://<front>/s/salon/<id> | grep -o 'property="og:image" content="[^"]*"'` e
         `curl -sI <valor>` → `200` (valida também a origem de `/api`/`PUBLIC_API_URL`).
  4. [ ] Crawler/preview: Facebook Sharing Debugger (ou opengraph.xyz/LinkedIn Post Inspector)
         na URL do staging → título, descrição e imagem aparecem; sem erro de "sem imagem".
  5. [ ] Compartilhamento real: WhatsApp/LinkedIn → prévia renderizada e clique abre o perfil
         (`/queue/<id>?tab=profile`).
- [ ] Registrar prints/URLs das préviaes como evidência.

### 5.2 Produção (só com 5.1 verde)

- [ ] Mesma regra comentada → descomentada com a URL de produção, deploy do front.
- [ ] Repetir os 5 testes de 5.1 contra o domínio de produção.
- [ ] Conferir cabeçalhos de cache/CDN: o `etag`/`max-age=300` do back não pode ser
      substituído por cache longo do CDN sem revalidação (prévia antiga duraria 5 min, ok;
      duraria horas, não).
- [ ] Smoke completo do front (login, dashboard, configurações, upload) — §6 de `DELIVERY_CHECKS.md`.

---

## 6. Pós-ativação

- [ ] Botão **Compartilhar** do painel gera `${VITE_PUBLIC_SITE_URL}/s/salon/<id>` e a prévia sai correta.
- [ ] Log de boot sem avisos de env; nenhum erro novo 5xx nas primeiras horas (correlation ID).
- [ ] Revisar que nenhum outro `source`/rota do host do front foi afetado pela regra nova.
- [ ] Registrar no plano de release: versão do back, commit do front, horário, resultado.

---

## 7. Rollback (por camada — executar de cima para baixo, na primeira falha)

| # | Camada | Ação | Efeito | Dado afetado? |
|---|---|---|---|---|
| 1 | Rewrite (mais rápido) | Recomentar/remover a regra `source: /s/*` e redeploy do front (ou reverter no painel do host) | `/s/salon/:id` volta a cair no `index.html` da SPA; links quebram só enquanto a regra estiver fora — na prática volta ao comportamento pré-entrega (sem prévia) | Não |
| 2 | Build do front | Reverter o commit de rewrite se ele já estiver versionado (`git revert`) + redeploy, ou redeploy da build anterior | Idem 1 | Não |
| 3 | Link do front | `git revert a87fae9` (`feat/share-url-salon-route`) + redeploy | Botão volta a gerar `/queue/<id>?tab=profile`; previews antigos já publicados continuam válidos no crawler | Não |
| 4 | Grade (front) | `git revert a80e30b` + redeploy | Grade volta ao `aspect-square` (recorte de arte volta ao comportamento antigo) | Não |
| 5 | Release do back | Redeploy da release anterior (`#7`/`#6` não aplicados) | Rota `/s/salon/:id` e `defaultFormat` somem; `/s/*` com regra ainda ligada devolve **404** → fazer o passo 1 **antes** desse se a prévia for crítica | Não (nenhuma migration nova neste escopo) |
| 6 | Envs | Corrigir no painel e reiniciar (sem novo build) | `PUBLIC_API_URL`/`PUBLIC_APP_URL` erradas afetam só os metadados; `TRUST_PROXY` errado afeta rate limit/brute force e a origem pública | Não |
| 7 | Credenciais | Rotacionar Cloudinary/`.env` se uma chave vazou (§0.1) | Exige novo valor no painel | Não |

Regras de rollback:

- [ ] Ordem padrão: **1 → 2 → 3 → 4 → 5 → 6** (o mais reversível e sem build primeiro).
- [ ] **Nunca** desligar `TRUST_PROXY` atrás de proxy como "rollback" — colapsa o rate limit
      (todos os IPs viram um só) e invalida os avisos de boot; se precisar, corrigir o valor
      (hops/CIDR), não remover.
- [ ] **Não** rodar `prisma migrate down` (o projeto não usa down migrations; ver
      [RUNBOOK_MIGRATIONS.md](RUNBOOK_MIGRATIONS.md)). Neste escopo não há migration nova —
      rollback de schema é aplicável apenas se um PR futuro adicionar uma; nesse caso, nova
      migration de correção, nunca editar a aplicada.
- [ ] Após cada rollback, repetir o smoke mínimo de §4/§5 e registrar horário + motivo.

---

## 8. Evidências a anexar

- [ ] Prints/URLs das préviaes (staging e produção) e resultado dos 5 testes de §5.
- [ ] Versão do back (commit), commit do front e horário dos dois deploys.
- [ ] Log de boot limpo (sem avisos de env) e ausência de 5xx correlacionados.
- [ ] Smoke manual completo (6 etapas de `DELIVERY_CHECKS.md`).
