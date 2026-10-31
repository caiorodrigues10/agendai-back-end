-- ════════════════════════════════════════════════════════════════════════════
-- Exportação em PDF: adiciona o formato PDF ao enum ExportJobFormat.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TYPE "ExportJobFormat" ADD VALUE IF NOT EXISTS 'PDF';
