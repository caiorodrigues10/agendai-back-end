# Posts e perfil social do salão

## Conteúdo e mídia

O catálogo `postTemplates.ts` é a fonte única dos modelos, grupos, formatos e requisitos de foto. O catálogo v2 mantém as chaves antigas e acrescenta seis composições editoriais. Cada modelo informa `photoMode` (`none`, `optional`, `required`) e `requiredMedia`.

As três fotografias geradas em `src/modules/posts/assets/` são **ilustrativas**, não resultados de clientes. Só são fallback nos modelos editoriais que declaram `stockImageKey`. Nunca são usadas para antes/depois, profissionais ou depoimentos. Os prompts e a origem estão no README dos assets. O build copia esses arquivos para `dist`.

Fotos enviadas precisam pertencer à biblioteca do salão. Modelos de resultados não podem ser publicados/agendados sem as fotos necessárias. Rascunhos incompletos são permitidos. Vídeos usam o upload existente do salão, limite de 25 MB e identificação de tenant no arquivo. Publicação e envio por WhatsApp permanecem ações diferentes.

## Perfil público

- Post permanente: `/saloes/:salonId/posts/:postId` no frontend.
- Perfil do salão: `/queue/:salonId?tab=profile`.
- Stories: publicações no formato `STORY`, disponíveis por 24 horas desde `publishedAt` (com fallback para `createdAt` apenas em dados legados).
- Rascunhos, posts agendados e salões inativos não entram nas leituras públicas.
- Vídeos preservam o arquivo original; a imagem gerada pode ser usada como capa.
- Avaliações reutilizam o módulo de reputação. Não criar nota, seguidores, depoimentos ou contadores fictícios. Respeitar `showAverage` e o limiar de avaliações do backend.

## API social (prefixo `/api`)

| Método | Rota | Autorização |
|---|---|---|
| GET | `/salons/:salonId/posts/:postId` | Pública, post publicado do salão |
| GET | `/salons/:salonId/stories` | Pública, stories ativos |
| GET | `/salons/:salonId/posts/:postId/comments?page=1` | Pública, 20 comentários por página |
| POST | `/salons/:salonId/posts/:postId/comments` | Staff JWT válido ou sessão OTP de cliente |
| DELETE | `/salons/:salonId/posts/:postId/comments/:commentId` | Autor, proprietário do salão ou MASTER_ADMIN |
| GET | `/salons/:salonId/tagged?pending=false` | Pública, apenas marcações aprovadas |
| GET | `/salons/:salonId/tagged?pending=true` | Proprietário do salão ou MASTER_ADMIN |
| POST | `/salons/:salonId/posts/:postId/tags` | Equipe do salão autor ou MASTER_ADMIN |
| PATCH | `/salons/:salonId/tags/:tagId` | Proprietário do salão marcado ou MASTER_ADMIN |

Comentários: texto simples, entre 1 e 500 caracteres após trim; sem HTML. Identificação pública limitada ao nome. Criação limitada a 10 requisições/minuto. Staff é revalidado como ativo no banco; cliente precisa de identidade com telefone verificado. Avaliar um atendimento continua exigindo o token do módulo de reputação — comentar um post não concede essa permissão.

Marcações: `{ targetBarbershopId }` solicita; `{ approve: true|false }` aprova/rejeita. Um salão não se marca a si mesmo, nem marca stories. Um post só pode ter uma solicitação por salão. Rejeitar remove a marcação. Deletar o post remove comentários e marcações por FK/cascade.

## Banco e implantação

Migration: `20261002000004_add_post_social_interactions`. Cria `post_comments` e `post_tags`, índices de paginação/FK, constraints, RLS e revogação de acesso direto de `anon`/`authenticated` no Supabase. Não usar `db push`.

Aplicar pelo fluxo normal de deploy, com `prisma migrate deploy`, **antes** de iniciar o backend novo. `start:prod` já executa essa etapa. Esta entrega não executa migrations no banco de produção.

Validação isolada da SQL, incluindo grants, RLS, FKs e cascade:

```powershell
node scripts/verify-post-social-migration.mjs <caminho-do-modulo-PGlite>
npm run test:unit -- src/modules/feed/social src/modules/posts
npm run typecheck
npm run build
npm run docs:check
```

O script PGlite cria um banco em memória e não lê `DATABASE_URL`. Os testes HTTP usam injeção Fastify e dependências isoladas; não são testes contra serviços de produção.
