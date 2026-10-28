-- Conversão de dados: posts ainda agendados (SCHEDULED) viram rascunhos (DRAFT).
-- A UI de agendamento foi removida do frontend; nenhum post pode permanecer em
-- SCHEDULED senão ficaria invisível nas sub-abas (Publicados / Rascunhos).
-- O enum FeedPostStatus.SCHEDULED e as rotas legadas de agendamento permanecem
-- no backend por compatibilidade (o cron também não publica mais nada novo).
-- Idempotente: roda de novo e não altera linhas (WHERE já exclui as convertidas).
UPDATE "feed_posts"
SET "status" = 'DRAFT', "scheduledFor" = NULL
WHERE "status" = 'SCHEDULED';
