-- Fase 1 da importação: os formatos aceitos passam a ser identificados pelo
-- conteúdo do arquivo (magic bytes). O enum ganha os formatos novos.
--
-- O prefixo segue a regra do AGENTS.md §migrations com timestamp futuro:
-- precisa ser MAIOR que `20261110120000` (última migration aplicada) para não
-- entrar fora de ordem no `migrate deploy`.
ALTER TYPE "ImportFileFormat" ADD VALUE IF NOT EXISTS 'XLSM';
ALTER TYPE "ImportFileFormat" ADD VALUE IF NOT EXISTS 'XLS';
ALTER TYPE "ImportFileFormat" ADD VALUE IF NOT EXISTS 'ODS';
ALTER TYPE "ImportFileFormat" ADD VALUE IF NOT EXISTS 'PDF';
