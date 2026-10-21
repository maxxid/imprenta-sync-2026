-- ============================================================
-- MIGRACIÓN VARIANTES LIBRES — Imprenta Sync 2026
-- Ejecutar en SQL Editor de Supabase
-- Idempotente: se puede correr múltiples veces sin error
-- ============================================================

ALTER TABLE libros ADD COLUMN IF NOT EXISTS variantes jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN libros.variantes IS
  'Opciones de impresión libres: [{id,label,paginas_por_hoja,color,precio,habilitado,sugerido}]';
