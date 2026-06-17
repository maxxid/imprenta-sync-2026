-- ============================================================
-- MIGRACIÓN MULTI-TENANT — Imprenta Sync 2026
-- Ejecutar en SQL Editor de Supabase (https://hjtbwnsxgellbtfariog.supabase.co)
-- Idempotente: se puede correr multiples veces sin error
-- ============================================================

-- ============ 1. TABLA shops ============
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  suscripcion_status TEXT DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar el shop UNJu (tu cliente actual)
INSERT INTO shops (slug, name, subdomain, suscripcion_status)
VALUES ('unju', 'Imprenta UNJu', 'unju.imprenta.store', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ============ 2. FK shop_id en tablas existentes ============

-- libros
ALTER TABLE libros ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);

-- pedidos  
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);

-- config
ALTER TABLE config ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id);

-- ============ 3. Migrar datos al shop UNJu ============
DO $$
DECLARE
  unju_id UUID;
BEGIN
  SELECT id INTO unju_id FROM shops WHERE slug = 'unju';
  
  UPDATE libros  SET shop_id = unju_id WHERE shop_id IS NULL;
  UPDATE pedidos SET shop_id = unju_id WHERE shop_id IS NULL;
  UPDATE config  SET shop_id = unju_id WHERE shop_id IS NULL;
END $$;

-- ============ 4. NOT NULL en shop_id ============
ALTER TABLE libros  ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE pedidos ALTER COLUMN shop_id SET NOT NULL;
ALTER TABLE config  ALTER COLUMN shop_id SET NOT NULL;

-- ============ 5. RLS Policies actualizadas con shop_id ============

-- PEDIDOS
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_pedidos" ON pedidos;
CREATE POLICY "anon_insert_pedidos" ON pedidos
  FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_pedidos" ON pedidos;
CREATE POLICY "anon_select_pedidos" ON pedidos
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "authenticated_update_pedidos" ON pedidos;
CREATE POLICY "authenticated_update_pedidos" ON pedidos
  FOR UPDATE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_delete_pedidos" ON pedidos;
CREATE POLICY "authenticated_delete_pedidos" ON pedidos
  FOR DELETE TO authenticated
  USING (true);

-- LIBROS
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

-- CONFIG
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

-- ============ 6. admin_email en shops (panel global) ============
ALTER TABLE shops ADD COLUMN IF NOT EXISTS admin_email TEXT;

-- ============ 7. Índices para queries por shop_id ============
CREATE INDEX IF NOT EXISTS idx_libros_shop_id ON libros(shop_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_shop_id ON pedidos(shop_id);
CREATE INDEX IF NOT EXISTS idx_config_shop_id ON config(shop_id);
