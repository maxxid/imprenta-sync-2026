-- ============================================================
-- RLS (Row Level Security) para Imprenta Sync 2026
-- Ejecutar en SQL Editor de Supabase (https://hjtbwnsxgellbtfariog.supabase.co)
-- Idempotente: se puede correr multiples veces sin error
-- 
-- NOTA: Para multi-tenant, ejecutar primero migration_multi_tenant.sql
-- ============================================================

-- ============ PEDIDOS ============
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_pedidos" ON pedidos;
CREATE POLICY "anon_insert_pedidos" ON pedidos
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_pedidos" ON pedidos;
CREATE POLICY "authenticated_update_pedidos" ON pedidos
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_delete_pedidos" ON pedidos;
CREATE POLICY "authenticated_delete_pedidos" ON pedidos
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "anon_select_pedidos" ON pedidos;
CREATE POLICY "anon_select_pedidos" ON pedidos
  FOR SELECT TO anon
  USING (true);


-- ============ LIBROS ============
ALTER TABLE libros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_libros" ON libros;
CREATE POLICY "anon_select_libros" ON libros
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "authenticated_insert_libros" ON libros;
CREATE POLICY "authenticated_insert_libros" ON libros
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_libros" ON libros;
CREATE POLICY "authenticated_update_libros" ON libros
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_delete_libros" ON libros;
CREATE POLICY "authenticated_delete_libros" ON libros
  FOR DELETE TO authenticated
  USING (true);


-- ============ CONFIG ============
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_config" ON config;
CREATE POLICY "anon_select_config" ON config
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "authenticated_insert_config" ON config;
CREATE POLICY "authenticated_insert_config" ON config
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_config" ON config;
CREATE POLICY "authenticated_update_config" ON config
  FOR UPDATE TO authenticated
  USING (true);
