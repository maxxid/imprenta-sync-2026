-- migration_wa_flujo.sql
-- Flujo de mensajes de WhatsApp (confirmación de carga + recordatorio día del retiro)
--
-- La tabla `pedidos` tiene columnas explícitas y el upsert del front manda TODO el
-- objeto del pedido (saveOrderToSupabase → sb.from('pedidos').upsert(...)). Si el front
-- envía un campo que no es columna, PostgREST falla. Por eso hay que crear estas
-- columnas ANTES de desplegar el código que las escribe.
--
-- Ejecutar en el SQL Editor de Supabase (proyecto imprenta → hjtbwnsxgellbtfariog).

-- 1) Mensaje de CONFIRMACIÓN de carga (plantilla fija, se arma al crear el pedido).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS wa_confirmacion TEXT;

-- 2) Marca de cuándo se mandó la confirmación. NULL = pendiente (va al tab WhatsApp).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS wa_confirmacion_enviada TIMESTAMPTZ;

-- 3) Marca de cuándo se mandó el RECORDATORIO (día del retiro). NULL = pendiente.
--    El texto del recordatorio se guarda en la columna existente `wa_message`.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS wa_recordatorio_enviado TIMESTAMPTZ;

-- (Opcional) índice liviano para armar el tab "Hoy" por fecha de retiro.
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos (fecha);
