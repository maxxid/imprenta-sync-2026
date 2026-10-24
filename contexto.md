# Contexto — Imprenta Sync 2026

> Brújula de trabajo para este repo. Actualizar siempre que cambie arquitectura, flujo, URLs, convenciones o decisiones relevantes. **No hace falta preguntar** antes de actualizarlo.

## Qué es

SPA de pedidos para imprenta universitaria (multi-tenant por subdominio).  
Stack: **React 19 + Vite 8 + Tailwind 4 + Supabase + Vercel**.  
Docs profundas: `AGENTS.md` (arquitectura/código) · `ONBOARDING.md` (alta de fotocopiadora).

## Repo y entorno local

| Item | Valor |
|------|--------|
| GitHub | https://github.com/maxxid/imprenta-sync-2026 |
| Local | `C:\Users\maxib\imprenta-sync-2026` |
| Branch de deploy | `main` |
| Deploy | Vercel (push a `main` → rebuild automático) |
| Dev | `npm install` → `npm run dev` |
| Build | `npm run build` |
| Smoke test | `npm run smoke` (capa variantes/precios, node puro) |

## URLs

| Rol | URL |
|-----|-----|
| Landing / root | https://imprenta.store |
| Admin global | https://admin.imprenta.store |
| Shop ejemplo | `https://{slug}.imprenta.store` |
| Admin de shop | `https://{slug}.imprenta.store/admin` |

## Flujo de trabajo (este chat)

1. Editar en local (`C:\Users\maxib\imprenta-sync-2026`)
2. Probar con `npm run dev` cuando el cambio lo justifique
3. Commit con prefijos: `feat:` / `fix:` / `style:` / `refactor:` / `chore:` / `docs:` (español)
4. `git push origin main` → Vercel actualiza la página
5. **Actualizar este `contexto.md`** si el cambio afecta contexto, rutas, reglas o decisiones

## Multi-tenant (resumen)

- Subdominio → `getSubdomainSlug()` en `App.jsx` → fila en `shops` → `shop_id` global (`src/lib/shop.js`)
- Queries Supabase filtran / escriben con `shop_id`
- Upserts multi-tenant: `onConflict: 'id, shop_id'` (libros/pedidos/config)
- Storage: path `{shopId}/...`
- Root domain → landing; `admin.` → panel global

## Mapa rápido de código

```
src/App.jsx                 Auth, routing, shop detection, estado global
src/lib/supabase.js         Cliente + CRUD + shops/admins
src/lib/utils.js            Precios, pedidos, carreras, helpers
src/lib/shop.js             getShopId / setGlobalShop
src/lib/constants.js        STORAGE, ORDER_STATES, fallbacks
src/components/Store.jsx    Tienda alumno
src/components/AdminPanel.jsx + admin/*   Panel por shop
src/components/admin/GlobalAdminDashboard.jsx   Panel global
config.json                 Supabase URL/key + integraciones (Gemini endpoint, pagos)
vercel.json                 SPA rewrite → index.html
supabase/functions/gemini/  Edge Function: proxy de Gemini (parser WA + generate-wa)
```

## Estados de pedido

`Pendiente de pago` → `Pendiente de impresión` → `Imprimiendo` → `Para encuadernar` → `Listo` → `Entregado`

## Pedidos admin — Ocultar Entregados

- Carga inicial: `fetchOrdersFromSupabase(config)` **sin** `Entregado` (ahorra red).
- Toggle **Ocultar Entregados** en tab Pedidos: **ON por defecto**.
  - OFF → refetch con `{ includeEntregados: true }` y merge por `id`.
  - ON de nuevo → saca entregados del state local (sin refetch).
- Resetear filtros **no** apaga este toggle.
- Tracking alumno: al buscar por WhatsApp usa `fetchOrdersByPhoneFromSupabase` (incluye entregados).

## Variantes de impresión (libros)

Fuente de verdad: `libro.variantes[]` (JSONB en Supabase).

```js
{ id, label, paginas_por_hoja, color, precio, habilitado, sugerido }
```

- Migración SQL: `migration_variantes.sql` (correr en Supabase si aún no existe la columna).
- Compat: columnas `a4_*` / `a5_*` se **espejan al guardar** (`prepareBookForSave` / `mirrorLegacyColumns`).
- Lectura: `ensureBookVariantes` deriva variantes desde columnas legacy si el array está vacío.
- UI: `BookFormPanel` edita variantes libres; catálogo muestra badges; tienda elige por `varianteId` + `label` en el ítem del carrito.
- Helpers: `getBookCombinations`, `seedDefaultVariantes`, `findVariante`, `resolveVarianteByLabel` (interna).
- `calcPrecioItem(libro, ref, encuadernacion, config, ...)`: si `ref` es **objeto variante**, el 5to arg es `express`; si es **string** (id, 'A4', 'A5' o label libre), el 5to es `color` y el 6to `express`. Resuelve por id → por label (slug incluido) → fallback clásico A4/A5.
- Ítem de carrito/pedido guarda `varianteId` + `formato` (= label de la variante).

## Prompts de Gemini (parser + aviso de WhatsApp)

La card de Ajustes ahora se llama **"Prompts de Gemini"** y tiene **dos prompts numerados**, cada uno con su botón "Usar el default", su descripción y sus tokens.

### 1 · Prompt del parser (Pedidos → Parsear con Gemini)

- **Dónde se edita:** Admin → Ajustes → card "Prompts de Gemini" → sección **"1 · Prompt del parser"**. Botón "Usar el default" deja el prompt vacío (= default), y el toggle "Catálogo que se le manda" elige entre `compacto` (filtrado previo, default) y `completo` (como antes).
- **Persistencia:** `config.prompts.parser_wa` → JSONB de la tabla `config` (más `saveLocal`). Editable por shop.
- **Tokens:** `{{fecha}}` (fecha larga es-AR), `{{mensaje}}` (crudo del alumno), `{{catalogo}}` (libros activos). Se reemplazan en `buildParserPrompt` (`src/lib/utils.js`).
- **Redes de seguridad:** si borrás un token, esa parte se anexa igual al final; si borrás el bloque JSON de salida, se re-anexa (`PARSER_OUTPUT_SCHEMA` en `constants.js`) — sin ese bloque el parser no puede leer la respuesta.
- Default: `DEFAULT_PARSER_PROMPT` en `src/lib/constants.js` (regla 8 = redacción del `msj_ws`, el mensaje al cliente).
- **Catálogo (toggle en Ajustes → "Catálogo que se le manda", `config.prompts.catalogo_modo`):**
  - `'compacto'` (default) → `buildParserCatalog(books, mensaje)`: ficha completa solo de los ~10 libros con más probabilidad (score local con IDF: palabras genéricas como "libro"/"materia" no puntúan; título completo en el mensaje = +10) y el resto como índice de títulos. Medido sobre `libros.json` (69 activos): **7.168 → 3.187 chars (−56%)**. Sin esto Gemini recibía 70+ fichas completas aunque el alumno mencionara un libro.
  - `'completo'` → `buildParserCatalogFull(books)`: una ficha por libro activo, la versión anterior.
  - `buildParserCatalogForMode(books, mensaje, modo)` es el selector que usa `AdminParserWA`.
- **`mensajeSinRuidoParaScore()`**: antes de puntuar saca teléfonos, horarios, montos y estados de pago. Con mensajes reales, `+54 9 388 581-1006` o `$9.600` matcheaban dígitos de títulos ("Fallos - 19 Fallos", libros de Medicina) y ensuciaban las fichas.
- **Formatos:** si el alumno escribe "A4 vertical", la regla 1 del prompt pide devolver el **nombre exacto de la variante**; `AdminParserWA` lo matchea por `slug(label).includes(...)`. "A4" solo → primer combo A4.
- **Fixtures:** los mensajes reales de la fotocopiadora (separados por `/`, tipo "Daniela Puca. CCC A4 vertical. Miercoles 18hs. pagado.") están en `npm run smoke` y en `scripts/test-msgs-reales.mjs`.
- **Nota sobre "varios alumnos":** los mensajes de la fotocopiadora que se usaron de fixture van **separados por `/` en el chat**, pero **cada mensaje es UN solo alumno** (nombre, teléfono y sus libros). No hay lote. Solo sería un tema si algún mensaje real traía varios alumnos en un mismo texto (no se observó).
- El emparejamiento final contra la DB lo hace la app por slug (`books.find(...)` en `AdminParserWA`), por eso `hojas`/`paginas` y `precio` del JSON de Gemini solo afectan a libros que no existen en el catálogo.
### 2 · Prompt del aviso de WhatsApp (🔄 Regenerar)

- **Qué hace:** redacta el mensaje que le avisa al alumno que su pedido está **LISTO para retirar en el local**. Se usa al crear el pedido (checkout) y con el botón **🔄 Regenerar** del parser.
- **Dónde se edita:** misma card, sección **"2 · Prompt del aviso de WhatsApp"**. Persistencia: `config.prompts.wa_aviso` (JSONB de `config`, editable por shop). Vacío = default.
- **Tokens:** `{{fecha}}` (hoy, es-AR), `{{fecha_pedido}}` (día elegido), `{{nombre}}`, `{{telefono}}`, `{{libros}}` (listado), `{{lugar}}` (lugar de retiro; vacío → "nuestro local"), `{{saldo}}` (frase según saldo: pagado / debe $X). Se resuelven en **`buildWaPrompt(template, data)`** (`src/lib/utils.js`); vacío → `DEFAULT_WA_PROMPT` (`constants.js`).
- **Envío:** la web arma el prompt y lo manda como **`prompt`** junto a `data` en `GET ?mode=generate-wa&data=...&prompt=...`. La Edge Function usa ese `prompt` si llega; si no (llamada directa o web vieja), cae a su copia de respaldo (`buildWaPrompt()` en `index.ts`).

## Retiro en local (modelo de negocio, 2026-10-21)

Cambio de modelo: **ya no hay entregas a domicilio ni en la facultad**. El alumno **retira en el local físico** (cerca de la facultad). Las "ventanas de entrega" ahora son **turnos de retiro**: el alumno elige día/hora para que el admin tenga el pedido **impreso y listo** en el local (le sirve para organizarse, no es delivery).

- **`config.local`** = `{ nombre, direccion }` (editable en Ajustes → card "Local físico"). Hoy está **vacío (placeholder)**: el usuario lo completa cuando quiera. Mientras esté vacío, el lugar cae al `direccion_entrega` de la facultad como fallback.
- **Modalidad única:** `RETIRO_LOCAL = 'Retiro en local'`. Se quitó la selección de modalidades del checkout (antes: Retiro facultad / Cadete / Retiro domicilio) → ahora es 100% retiro en local. Cadete/domicilio se conservan solo para **pedidos viejos** ya guardados (`isRetiroLocal()` acepta la legacy `'Retiro facultad'`; `normalizeOrder` la mapea a `'Retiro en local'` al cargar).
- **Funciones nuevas** en `utils.js`: `RETIRO_LOCAL`, `isRetiroLocal(modalidad)`, `localPlace(config)`. `deliveryPlaceFor()` ahora devuelve el **local** (no la facultad).
- **`config.entrega.cadete_minimo`** se eliminó del código y de Ajustes (ya no hay cadete). Puede seguir existiendo en configs viejas de DB; es inofensivo.
- **Mensajes:** el `DEFAULT_PARSER_PROMPT` (regla 8, y reglas 4/6) y `buildWhatsAppMessage()` (fallback) ahora dicen **"pasá a retirarlo por el local"** en vez de "te llevamos a la facultad". *Si el usuario llegara a guardar un prompt custom en Ajustes, hay que tocar "Usar el default" para que aplique el nuevo (verificado: hoy `config.prompts` está vacío → aplica el default).*
- **Landing (App.jsx):** copy de "entrega en facultad" → "retiro en tu local".
- **Smoke:** `npm run smoke` cubre retiro en local (17), `geminiEndpoint` (18), la agenda de turnos (19), `buildWaPrompt`/aviso (20), confirmación (21), calculadora (22), lugar de retiro (23) y agenda con/sin hora (24) — 206 checks.

## Horarios de retiro (agenda en Ajustes, 2026-10-21)

Rediseño de la card **"Universidades y horarios de retiro"** (antes en `AdminConfig` solo dejaba **activar/desactivar** turnos pre-cargados; no se podían agregar, quitar ni editar).

- **Ahora es un editor de agenda semanal** por carrera: 7 filas (Lun→Dom) y por día:
  - **Agregar** un horario (`<input type="time">` + "+ Agregar"; si lo dejás vacío sugiere el siguiente turno, o `19:00` si el día está vacío).
  - **Editar** el horario in-situ (el chip contiene el `input type="time"`).
  - **Activar/desactivar** cada turno (punto verde del chip).
  - **Quitar** el turno (✕).
  - **Abrir/cerrar el día** con el punto del día (si el día está vacío, el clic agrega `19:00`).
- **Carga masiva** arriba de la card: un horario + botones **"Lun a Vie" / "Lun a Sáb" / "Todos"** (aplica a todas las carreras; no duplica horarios ya existentes).
- **Ayuda en la UI:** badge con `"N de M activos"`, aviso ámbar si una carrera queda **sin turnos activos**, e indicador "Turnos por defecto" si no cargó ninguno.
- **Helpers nuevos en `utils.js`:** `DIAS`, `DIAS_CORTO`, `DIAS_ORDER`, `turnoFromHorario(h)`, `buildVentana(dia, h, activa)`, `normalizeVentanas(ventanas)`, `nextHorario(h)`.
- **Al guardar** se normaliza `career.ventanas[]` con `normalizeVentanas()`: valida (`dia` 0-6, `HH:MM`), **deduplica** día+hora, deriva `turno` y `label`, y **ordena** día→hora. El orden en pantalla se mantiene estable mientras editás (para que el input no salte); el orden cronológico se aplica recién al guardar.
- **Modelo de dato sin cambios** (compat con lo ya guardado, sin migración): `career.ventanas[] = { dia, horario, turno, label, activa }` (`dia` = `getDay()`; 0 = domingo).
- **Fix en `getNextSlots` (`supabase.js`):** los turnos por defecto (Lun–Vie 10:00 y 19:00) ahora **solo** se usan si la carrera **no tiene** `ventanas` cargadas. Antes, un día hábil sin turnos activos igual caía a esos defaults → era imposible cerrar un día. Ahora un día sin turnos activos queda **cerrado** (sin slots). `turno` ahora se deriva del `horario` si falta.

## Proxy de Gemini → Supabase Edge Function (2026-10-21)

Se eliminó la dependencia del **Google Apps Script**. El proxy de Gemini (parse del parser WhatsApp + generador de mensaje `generate-wa`) ahora es una **Supabase Edge Function** en `supabase/functions/gemini/index.ts`. La API key vive como secret en Supabase (nunca llega al navegador).

- **Contrato idéntico** al Apps Script que reemplaza, así la lógica de fetch de la web no cambia:
  - `POST` urlencoded `{ mensaje, prompt }` → `{ pedidos, timestamp }` (parser WhatsApp).
  - `GET ?mode=generate-wa&data=<json>[&prompt=<texto>]` → `{ msj_ws }` (aviso "pedido listo" / botón "Regenerar"). `prompt` es opcional: la web manda el resuelto desde `config.prompts.wa_aviso`; sin él, la función usa su default local.
  - Errores devueltos en `200` con `{ error }` (como el script viejo), para que la web muestre el mensaje real.
- **Config:** `integraciones.GEMINI_ENDPOINT` (clave nueva). `geminiEndpoint(config)` en `utils.js` la lee y **cae a la legacy `SHEETS_API_URL`** si está vacía (migración sin romper). URL de la función: `https://{project-ref}.supabase.co/functions/v1/gemini`.
- **Secretos:** `GEMINI_API_KEY` (requerido). Opcionales: `GEMINI_MODEL` (default `gemini-3.1-flash-lite-preview`), `GEMINI_MODEL_FALLBACK` (`gemini-3-flash-preview`), `GEMINI_RATE_MAX` (10/min por IP).
- **Deploy:** `supabase functions deploy gemini --no-verify-jwt` (la web la llama sin auth) y `supabase secrets set GEMINI_API_KEY=...`.
- **generate-wa reframeado a retiro en local y ahora editable:** el aviso dice que el pedido está **listo para retirar en el local** (el alumno pasa a buscarlo). El prompt vive en **Ajustes → "2 · Prompt del aviso"** (`config.prompts.wa_aviso`; default `DEFAULT_WA_PROMPT`); la web lo resuelve con `buildWaPrompt()` y lo manda como `prompt`, que la función usa si llega (si no, su `buildWaPrompt()` local de respaldo).
- **Rate limiting:** best-effort por IP (leen `x-forwarded-for`), in-memory por instancia — sin el bloqueo persistente/email del script viejo (no hay `MailApp`).
- **Baja del sync de Sheets (obsoleto):** se eliminaron `syncOrderToSheets` y `fetchOrdersFromSheets` de `supabase.js`, la copia local en `Store.jsx` y su import muerto en `AdminPedidos.jsx`. Ya no funcionaba contra el Apps Script actual (ese script ya no tenía handler de Sheets).

### Pasos de migración (usuario)
1. `supabase secrets set GEMINI_API_KEY=<tu-key>` (CLI linkeado al proyecto `hjtbwnsxgellbtfariog`).
2. `supabase functions deploy gemini --no-verify-jwt`.
3. Probar: `curl "https://hjtbwnsxgellbtfariog.supabase.co/functions/v1/gemini"` → debe devolver `{ status, tip }`.
4. En **Ajustes → card "Prompts de Gemini"** setear el **"Endpoint del proxy de Gemini"** (`integraciones.GEMINI_ENDPOINT`) a esa URL y guardar. Vaciar `SHEETS_API_URL` cuando todo funcione.
5. Verificar parser WA + "Regenerar" mensaje desde el admin.

## Directivas para el agente

1. **Trabajar en este repo** salvo que se indique otro path.
2. **Commit + push a `main` tras cada cambio validado** (`npm run build` + `npm run smoke`): el usuario lo estableció así — *"siempre commit and push"* (2026-10-20). No esperar permiso para pushear.
3. **No commitear secretos nuevos** (`.env`); `config.json` ya tiene anon key pública de Supabase — no ampliar superficie.
4. **Respetar multi-tenant**: no romper filtros `shop_id` ni `onConflict` compuestos.
5. **Cambios mínimos** al objetivo; no refactors colaterales.
6. **Mantener `contexto.md` al día** sin pedir permiso (decisiones, URLs, flujos, gotchas).
7. Para detalle de funciones/API interna → `AGENTS.md`. Para alta de cliente → `ONBOARDING.md`.

## Gotchas conocidos

- Upsert libros/pedidos: constraint compuesta `(id, shop_id)` — usar `onConflict: 'id, shop_id'` cuando hay shop.
- `getSubdomainSlug` debe ignorar `www` y subdominios anidados tipo `admin`.
- `rounding.js` es script global (`window.roundingUtils`), no módulo ES.
- Catálogo offline de respaldo: `libros.json`.
- Columna `libros.variantes` debe existir en Supabase (`migration_variantes.sql`); sin ella el upsert de libros puede fallar.
- Pedidos entregados no vienen en la carga inicial: no asumir que están en `orders` hasta desactivar el toggle o buscar por teléfono.
- **Encoding**: los `.jsx`/`.js` son UTF-8 con fin de línea LF. No editar con `Get-Content`/`Set-Content` de PowerShell 5 (rompe acentos); usar herramientas de texto que preserven UTF-8 y LF.
- `npm run smoke` debe pasar después de tocar `src/lib/utils.js` (variantes/precios).

## Sesión actual

- Clonado localmente (2026-10-20).
- Implementado: Ocultar Entregados (fetch lazy) + variantes libres de impresión.
- Pendiente usuario: correr `migration_variantes.sql` en Supabase; commit/push cuando lo pida.
- Migrado el proxy de Gemini a Supabase Edge Function (`supabase/functions/gemini`); baja del sync de Sheets. **Pendiente del usuario:** deployar la function + `secrets set GEMINI_API_KEY` + setear `integraciones.GEMINI_ENDPOINT` (pasos en la sección "Proxy de Gemini → Supabase Edge Function").
- Rediseñada la agenda de horarios en Ajustes (editor semanal completo, ya no solo on/off) + fix de `getNextSlots` para poder cerrar días. Pendiente: probarla con el usuario y deployar Gemini.

### Flujo de mensajes WhatsApp (2026-10-24) — 2 toques

Decidido con el usuario: **la hora es clave** (los alumnos eligen el turno según sus clases). Dos mensajes, gestionados en el nuevo **tab WhatsApp** (`AdminWA.jsx`):

1. **Confirmación de carga** — plantilla **FIJA, sin IA** (`CONFIRMATION_TEMPLATE` → `buildConfirmationMessage`). Se arma al crear el pedido (checkout, ambos medios de pago) y entra como **pendiente** al tab. Presencial y virtual. Campo: `wa_confirmacion`.
2. **Recordatorio (día del retiro)** — **con IA** (`generateRecordatorio` → prompt `config.prompts.wa_aviso`, ahora rotulado "2 · Prompt del recordatorio (día del retiro)" en Ajustes). Se genera con clic en el tab y se manda el **MISMO DÍA** del retiro pactado. Texto en `wa_message`. Token nuevo **`{{hora}}`** en `buildWaPrompt`/`DEFAULT_WA_PROMPT`.

- **Tab:** sub-tabs **Hoy** (retiros de hoy + atrasados → recordatorio) y **Próximos** (futuros → confirmaciones); pendientes arriba; por pedido: mensaje editable + **Enviar** (`wa.me`) + **marcar enviado** (toggle).
- **Selección múltiple + Omitir (2026-10-24):** checkbox por fila + "Seleccionar pendientes (N)" + botón **Omitir (N)** con **Deshacer** (8 s). Omitir reutiliza el **mismo flag de enviado** (`wa_recordatorio_enviado` / `wa_confirmacion_enviada`, decisión del usuario → **sin migración**): la fila sale de pendientes y queda con el badge "Enviado ✓". Se persiste el pedido **original** de `orders` (nunca el de `lista`, que trae `_pend` derivado → haría fallar el upsert). **Teclado:** ↑↓ mueven el foco entre checkboxes; **Shift+↑↓** y **Shift+clic** seleccionan rango desde el ancla (`ancla`, se limpia al cambiar de sub-tab o con Limpiar); el foco visible va con `focus:ring-2`.
- **NO hay mensaje "listo" separado antes del día**: se concentra todo en el recordatorio del mismo día.
- Parser: se quitó el **select global A4/A5** redundante; el formato es **por libro** (ya lo era en datos y en cada fila).
- **Checkout ya NO llama a Gemini** (antes generaba el "listo" prematuro); ahora solo arma la confirmación fija (instantáneo).

**Pendientes del usuario (M3/M4):**
1. Correr `migration_wa_flujo.sql` en Supabase (`hjtbwnsxgellbtfariog`) **antes** de que el front escriba los campos nuevos (sino el upsert falla por columna inexistente).
2. Redeployar la función si se tocó `index.ts`: `supabase functions deploy gemini --no-verify-jwt` (el `{{hora}}` del fallback).

### Calculadora + Pedido Nuevo (2026-10-24) — 2 tabs vinculados

Dos pestañas nuevas en el panel, vinculadas en los 2 sentidos:

- **Calculadora** (`admin/AdminCalculadora.jsx`): sub-pestañas = **1 PDF por archivo** (renombrables, ✓ incluir/excluir, quitar). Por PDF se cargan **páginas por categoría** y se cobra **POR PÁGINA** (no por hoja) según el contenido. Abajo: total del presupuesto + **"Dejar guardado"** (persiste en `config.calc_borrador`, JSONB → **sin migración**) + **"Cargar los ✓ a Pedido Nuevo"**.
- **Pedido Nuevo** (`admin/AdminPedidoNuevo.jsx`): **buscador del catálogo** (título/materia/carrera → clic agrega el ítem con su precio), botón **"Calcular PDF"** (salta a Calculadora con `calcFromOrder` y de ahí se vuelve con el/los PDF ✓), formulario (nombre, WhatsApp, fecha/hora de retiro, **monto pagado**, encuadernación, comentario por ítem) y **Crear pedido** → `buildOrder` + `saveOrderToSupabase`. El pedido entra a **Pedidos** con la **confirmación pendiente en WhatsApp** (`wa_confirmacion`). Carga manual: **sin agenda ni control de capacidad**; carrera vacía (retiro en local).
  - **Variantes en chips (feedback del usuario: "no me muestra las variantes disponibles"):** cada ítem de catálogo muestra debajo del input **Comentario** los **chips de variante** (`combosDeItem(item)` → `getBookCombinations(ensureBookVariantes(...))`; se ven solo si hay ≥2). El chip activo va resaltado y `setVarianteItem()` recalcula **formato, varianteId, color, hojas, precio y tipo** con `calcPrecioItem`. Ítems de la calculadora/sin `libroId` no muestran chips.
  - **Pago = un input + botón Total** (reemplazó el segmented *Nulo/Parcial/Total*): `form.parcial` es el monto; **vacío o 0 = nulo**, al escribir se **acota a ≤ `totalFinal`** (`roundTotal(total, config)`, el monto real que se cobra) y el botón **Total** lo autocompleta. `pago_modalidad` se deriva al crear (0 → `nulo`, ≥ total → `total`, otro → `parcial`) y el renglón bajo el input avisa *nulo / Parcial · saldo / Pago total ✓*. Se muestra `totalFinal` (redondeado) en el rótulo Total.
- **Estado compartido** en `AdminPanel`: `pedidoDraft { items, form }` + `calcFromOrder` (sobreviven el cambio de tab).

Decisiones de precio (ok del usuario 2026-10-24):

- **Página en blanco por impar: NO se cobra** (el papel va amortizado en la tarifa). Toggle opcional en **Ajustes → Calculadora** → "Redondear a par" (`calculadora.redondear_impar`, **default apagado**) que suma 1 página a la tarifa más barata.
- **Categorías y tarifas editables** en Ajustes → Calculadora (semilla: *Blanco y negro 35 · Poco color 40 · Color 60*). Helpers en `utils.js`: `getCategorias` / `calcPdfPaginas` / `calcPdfPrecio`.
- **Encuadernación a nivel PEDIDO** (en Pedido Nuevo): *Sin / Cada PDF por su lado / Todos juntos en una* → `calcEncuadernacion(items, modo, config)` reusa la config actual (`encuadernacion.basica` = 600 si `hojas >= umbral(40)`); "todos juntos" muestra además el tamaño de espiral (`getEspiralSize`). Se cobra como **línea de ítem** y solo se calcula sobre los ítems con `origen === 'calculadora'` (los del catálogo ya traen encuadernación en el precio de la variante → no se duplica).
- Ítems del pedido ahora pueden traer `origen: 'calculadora' | 'catalogo' | 'encuadernacion'` y `comentario`.

**Smoke: 206 checks** (sección 22 = calculadora: categorías, páginas, precio por página, toggle impar y encuadernación; 23 = lugar de retiro en los mensajes; 24 = agenda con/sin hora + observaciones sin hora).

### Fix: lugar de retiro en los mensajes de WhatsApp (2026-10-24)

**Problema reportado:** un recordatorio decía *"Podés retirarlo en el Aula Magna / Quincho de la Facultad de Ciencias Jurídicas (UNJu)"*. Dos causas:

1. `{{lugar}}` salía de `order.lugar_entrega`, **guardado al crear el pedido** → los pedidos viejos traían la dirección de la facultad del modelo anterior.
2. **`config.local` está VACÍO en producción** (`nombre: ""`, `direccion: ""` en `hjtbwnsxgellbtfariog`) → todo lo que depende del local cae al fallback de facultad.

**Fix:** `lugarRetiro(order, config)` (utils) resuelve el lugar **AL MOMENTO DE GENERAR**: retiro en local → `localPlace(config)`; si no hay nombre/dirección cargados → la frase fija **`LUGAR_FALLBACK` = "nuestro local"** (constants) — **nunca `''` y nunca la facultad** —, así el mensaje no queda a criterio de la IA ni tira texto roto; modalidades heredadas (Cadete / domicilio) conservan su texto guardado. Lo usan `buildConfirmationMessage(order, config?, template?)`, `generateRecordatorio` (`data.lugar_entrega`) y el 🔄 Regenerar del parser (`lugarRetiro({}, config)`).

- El prompt default y el fallback de la Edge Function ya caían a "nuestro local"; el hueco era `lugarRetiro` devolviendo `''` — ahora lo resuelve él y todos los consumidores reciben el valor armado.

- El prompt **default ya decía "NO hacemos entregas ni en la facultad"**: el error era solo el valor del token.
- El tab WhatsApp **regenera solo las confirmaciones intactas** (las que son exactamente las guardadas al crear) con el lugar actual; las editadas a mano se respetan.
- **Pendiente del usuario:** cargar **Ajustes → Local físico** (nombre y dirección); si no, los mensajes quedan en "nuestro local" sin dirección.

### Tab Pedidos: selección múltiple + Avanzar / Retroceder (2026-10-24)

Misma UX que en el tab WhatsApp, adaptada a la grilla de Pedidos. **Cada fila = 1 ítem** (no un pedido) — decisión del usuario: la selección es **por fila = ítem** y las acciones son **solo Avanzar / Retroceder** (sin cambio de estado libre ni borrado masivo).

- **Sin icono de check en la grilla** (decisión del usuario: la columna ya tiene muchos datos y el icono ocupaba espacio). **La fila entera es el "checkbox":** clic en la fila la selecciona; los controles de adentro (botones, links, inputs, selects) tienen su propia acción y quedan salvados con `closest('button, a, input, select, textarea, label')`. La celda Pedido quedó como antes (el `#` vuelve con la columna colapsada).
- **Efecto visual** (index.css, `.table-shell tr.sel-row`): tinte azul **translúcido** sobre los `td` (`color-mix(... 16%, transparent)`) + barra de acento `inset 3px` en la primer celda. Va en los `td` y no en el `tr` porque `border-collapse: collapse` no pinta `box-shadow` en filas, y al ser translúcido **sigue verse el color de estado** (`STATE_ROW_BG`). Fila con foco de teclado → tinte 34% (`:focus-visible`, anillo nativo anulado). Filas con `cursor: pointer`.
- Barra sobre la grilla: **"Seleccionar visibles (N)"** (toggle; **↓ desde ahí entra a la primera fila**), badge "N seleccionadas", **← Retroceder (N)**, **Avanzar (N) →** y **Limpiar**.
- **La barra se simplifica con 0 seleccionadas** (decisión del usuario): con nada seleccionado queda **solo "Seleccionar visibles" + el hint**; el badge y los botones **← Retroceder / Avanzar / Limpiar** aparecen recién con **≥1 fila seleccionada**.
- **Multi-filtros arranca minimizado** (decisión del usuario): `filtersVisible` default `false`; el botón de ojo se reemplazó por **"Mostrar / Minimizar"** con chevron rotatorio, y si está plegado con algún filtro puesto muestra el badge **"Filtros activos"** (`filtrosActivos`) para que no se pierda de vista que la grilla está filtrada.
- **Teclado:** las filas son focueables (`tabIndex={0}`); **↑↓** mueven el foco entre filas, **Espacio/Enter** alternan la selección y **Shift+↑↓ / Shift+clic** seleccionan rango desde la ancla. Clave de fila = `` `${pedidoId}-${itemIndex}` `` (la misma que usa `savingItemStates` de los ←/→ por fila). El handler se saltea si el foco está dentro de un input (no se come las teclas mientras se edita).
- **`aplicarEstadoSeleccion(direction)` agrupa por pedido y escribe UNA sola vez por pedido**: si se marcan 2 ítems del mismo pedido y se corren por separado, el segundo write partiría de los ítems viejos y pisaría el primero. Recalcula `deriveOrderEstado(items)` y persiste con `normalizeOrder` + `persistOrder` (mismo camino que `advanceItemState`); solo persiste los pedidos que realmente cambiaron.
- **La selección se limpia** al cambiar filtros/orden/excluir estados/u ocultar entregados, y se **poda sola** si una fila dejó de estar visible (p. ej. cambió de estado y salió del filtro) → nunca quedan claves fantasma que inflen el contador.
- Durante la corrida se pintan las filas en `savingItemStates` (los ←/→ por fila quedan con spinner y deshabilitados) y `bulkSaving` deshabilita los botones de la barra.

### Agenda con/sin hora de retiro (2026-10-24)

**Regla (decisión del usuario):** un pedido se agenda **CON hora solo si la hora existe** —detectada en el parse del mensaje o elegida en Pedido Nuevo—; si no, se agenda **SIN hora** (sin error y **sin horario inventado**) y queda **editable en Pedidos** para cargarla después de preguntarle al alumno a qué hora lo necesita.

- **Modelo:** `horario_entrega` = `'HH:MM'` o `''` (sin hora). **`tieneHora(h)`** (utils) es la **única puerta** para decidir si hay hora: lo que no pase ('', `'A coordinar'`, `'manana'`, basura legacy) = sin hora. `turno` = derivado (`manana`/`tarde` vía `turnoFromHorario`) o `''`; solo se rescata si es un `HH:MM` legacy.
- **Los 3 lugares que INVENTABAN horario quedaron sin fallback:**
  1. Parser (`msgTime || turno==='manana' ? '10:00' : '19:00'`) → ahora `horario: msgTime || ''`.
  2. `normalizeOrder` (`|| '10:00'`, que además **se escribía en el campo** en cada guardado) → `''`.
  3. `saveEditedOrder` (`turno || '10:00'` y pisaba `horario_entrega` con `turno`) → no inventa y arma `ventana_retiro = "fecha · hora|A coordinar"`.
- **Parse:** con hora → agenda con esa hora y `turno = turnoFromHorario(hora)`; sin hora → `horario_entrega: ''`, `turno: ''` y `ventana_retiro = "fecha · A coordinar"`.
- **La hora se ve y se edita en el preview del parser** (feedback del usuario: "no veo la opción en ningún lado"): al parsear se guarda `parserPreview.entrega.hora` (detectada con `extractTimeFromMessage`) y el panel derecho tiene una fila **"Hora retiro"** (`input type="time"`, editable) junto a "Fecha entrega". Si no se detectó nada, el campo queda vacío con el aviso *"No se detectó hora en el mensaje · vacío = sin hora; cargala acá si ya la sabés."*. **Importar y "Regenerar" el mensaje usan el valor del preview** (lo que editaste ahí), no vuelven a releer el texto crudo → lo corregido en el preview es lo que se agenda.
- **Pedido Nuevo:** `input type="time"` libre; vacío → `slot.horario = ''` (antes guardaba la literal `'A coordinar'` y la ventana salía `"A coordinar · A coordinar"` o `"14:30 · 14:30"`). `slot.label = ''` para que `buildOrder` arme la ventana con `fechaLabel` (antes repetía la hora).
- **Edición en Pedidos:** la celda **Retiro** en modo editar ahora tiene `input type="time"` sobre **`horario_entrega`** (antes era un `<select>` que escribía en **`turno`**, el campo equivocado, sin opción de vacío, y forzaba 10:00 al guardar) + hint *"Hora vacía = sin hora"*. `updateHora()` mantiene `horario_entrega` + `turno` juntos.
- **Mensajes:** sin hora, `{{hora}}` → "a coordinar" y **`cierraSinHora()`** reescribe el `"a las …"` colgado → **"(horario a coordinar)"** (`buildConfirmationMessage` y `buildWaPrompt`). La Edge Function (`index.ts`) hace lo mismo en su prompt de fallback → **redeployada** (`supabase functions deploy gemini --no-verify-jwt`).
- **Visores:** tab WhatsApp muestra "· a coordinar"; tracking del alumno muestra "· a coordinar" / "Horario a coordinar" (antes "·  hs").
- **Filtro Ventana** en Pedidos: ahora compara **`horario_entrega`** (agrupa por hora: "10:00 hs" = 10:00–10:59) y agrega la opción **"Sin hora"**.
- **La hora NO se agenda en observaciones/notas** (pregunta del usuario): el prompt del parser decía *"OBSERVACIONES: 🕒hora…"*, con lo que la hora quedaba duplicada en `observaciones` de ítem y en `notas_admin`. Ahora: (1) `DEFAULT_PARSER_PROMPT` regla 4 dice explícitamente **NO pongas la hora** (la detecta el sistema y va a `horario_entrega`), (2) **`observacionesSinHora()`** (utils) limpia el patrón legacy `🕒18hs` y menciones `a las 18 hs` al importar (`observaciones` del ítem y `notas_admin`), (3) el placeholder del input pasó de *"ej: 🕒14hs 📍Lavalle"* a *"ej: 📍Lavalle · 🚨otro"*. Producción **no tiene prompt custom** (`prompts` solo tiene `catalogo_modo`) → el cambio aplica de una, sin tocar config.
- **Filtro de libros en el preview del parser** (feedback: "no tiene un input para poder filtrar entre tantos libros"): input **"Filtrar libros…"** (🔍, con ✕ para limpiar) en la cabecera de la lista que filtra los `<select>` de **todas** las filas por **título / materia / carrera** (insensible a acentos vía `slug`) y muestra el contador *"`N` de `M`"*. El libro ya elegido en cada fila **siempre queda en sus opciones** (si no, el `<select>` se quedaría sin `value` al filtrar). **"+ Agregar del catálogo"** con filtro activo agrega el **primer libro que matchee** (sin filtro = primero activo, como antes). El filtro se limpia al parsear vacío y al importar.
- **Legacy:** `normalizeOrder` (corre en **cada lectura** de pedidos) cura las ventanas repetidas del Pedido Nuevo viejo y no inventa hora → el dato queda saneado en pantalla y al próximo guardado.
- Smoke **206 checks** (sección 24: agenda con/sin hora + observaciones sin hora).
