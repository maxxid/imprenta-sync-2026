-- ============================================================
-- MIGRACIÓN PORTADA AUTOMÁTICA — Imprenta Sync 2026
-- Ejecutar en SQL Editor de Supabase ANTES de guardar libros
-- desde la web nueva (sino el upsert falla por columna inexistente).
-- Idempotente: se puede correr múltiples veces sin error
-- ============================================================

ALTER TABLE libros ADD COLUMN IF NOT EXISTS portada jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN libros.portada IS
  'Portada automática editable: {titulo, filas}. titulo vacío = usa libros.titulo; filas = 1..4 líneas del texto.';
