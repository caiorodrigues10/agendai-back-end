# GitHub Copilot — Agenda Já Backend

Siga **AGENTS.md** na raiz de `agendai-back-end/`.

- Fluxo: Route/middleware → Controller → UseCase → IRepository/Provider.
- Zod na entrada; `AppError` em regras de negócio; DI via tsyringe.
- Prisma 6.4 + `migrate deploy` em produção (não `db push`).
- Não sugerir `npm run lint` (script inexistente).
- Inventários: `docs/agents/PACKAGES.md`, `SCRIPTS.md`, `BUSINESS_RULES.md`.
- Transações para estoque/fiado/comissões/pagamentos.
