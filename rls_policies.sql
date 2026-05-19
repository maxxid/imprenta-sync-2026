-- ============================================================
-- RLS (Row Level Security) para Imprenta Sync 2026
-- Ejecutar en SQL Editor de Supabase (https://hjtbwnsxgellbtfariog.supabase.co)
-- ============================================================

-- ============ PEDIDOS ============
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede crear pedidos (checkout público)
CREATE POLICY "anon_insert_pedidos" ON pedidos
  FOR INSERT TO anon
  WITH CHECK (true);

-- Solo usuarios autenticados (admin) pueden modificar pedidos
CREATE POLICY "authenticated_update_pedidos" ON pedidos
  FOR UPDATE TO authenticated
  USING (true);

-- Solo usuarios autenticados (admin) pueden eliminar pedidos
CREATE POLICY "authenticated_delete_pedidos" ON pedidos
  FOR DELETE TO authenticated
  USING (true);

-- Todos pueden leer pedidos
CREATE POLICY "anon_select_pedidos" ON pedidos
  FOR SELECT TO anon
  USING (true);


-- ============ LIBROS ============
ALTER TABLE libros ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer el catálogo
CREATE POLICY "anon_select_libros" ON libros
  FOR SELECT TO anon
  USING (true);

-- Solo admin puede crear/modificar/eliminar libros
CREATE POLICY "authenticated_insert_libros" ON libros
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_libros" ON libros
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "authenticated_delete_libros" ON libros
  FOR DELETE TO authenticated
  USING (true);


-- ============ CONFIG ============
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer config (precios, temas, etc.)
CREATE POLICY "anon_select_config" ON config
  FOR SELECT TO anon
  USING (true);

-- Solo admin puede modificar config
CREATE POLICY "authenticated_insert_config" ON config
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_config" ON config
  FOR UPDATE TO authenticated
  USING (true);
