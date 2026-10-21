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
src/lib/supabase.js         Cliente + CRUD + Sheets + shops/admins
src/lib/utils.js            Precios, pedidos, carreras, helpers
src/lib/shop.js             getShopId / setGlobalShop
src/lib/constants.js        STORAGE, ORDER_STATES, fallbacks
src/components/Store.jsx    Tienda alumno
src/components/AdminPanel.jsx + admin/*   Panel por shop
src/components/admin/GlobalAdminDashboard.jsx   Panel global
config.json                 Supabase URL/key + integraciones (Sheets, pagos)
vercel.json                 SPA rewrite → index.html
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

## Prompt y catálogo de Gemini (parser WhatsApp)

- **Dónde se edita:** Admin → Ajustes → card "Prompt y catálogo de Gemini (parser WhatsApp)". Botón "Usar el default" deja el prompt vacío (= default), y el toggle "Catálogo que se le manda" elige entre `compacto` (filtrado previo, default) y `completo` (como antes).
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
- Ojo: el **otro** prompt de Gemini (`?mode=generate-wa`, mensaje de seguimiento desde Pedidos/Checkout) vive en el **Apps Script de Google Sheets**, no en este repo.

## Retiro en local (modelo de negocio, 2026-10-21)

Cambio de modelo: **ya no hay entregas a domicilio ni en la facultad**. El alumno **retira en el local físico** (cerca de la facultad). Las "ventanas de entrega" ahora son **turnos de retiro**: el alumno elige día/hora para que el admin tenga el pedido **impreso y listo** en el local (le sirve para organizarse, no es delivery).

- **`config.local`** = `{ nombre, direccion }` (editable en Ajustes → card "Local físico"). Hoy está **vacío (placeholder)**: el usuario lo completa cuando quiera. Mientras esté vacío, el lugar cae al `direccion_entrega` de la facultad como fallback.
- **Modalidad única:** `RETIRO_LOCAL = 'Retiro en local'`. Se quitó la selección de modalidades del checkout (antes: Retiro facultad / Cadete / Retiro domicilio) → ahora es 100% retiro en local. Cadete/domicilio se conservan solo para **pedidos viejos** ya guardados (`isRetiroLocal()` acepta la legacy `'Retiro facultad'`; `normalizeOrder` la mapea a `'Retiro en local'` al cargar).
- **Funciones nuevas** en `utils.js`: `RETIRO_LOCAL`, `isRetiroLocal(modalidad)`, `localPlace(config)`. `deliveryPlaceFor()` ahora devuelve el **local** (no la facultad).
- **`config.entrega.cadete_minimo`** se eliminó del código y de Ajustes (ya no hay cadete). Puede seguir existiendo en configs viejas de DB; es inofensivo.
- **Mensajes:** el `DEFAULT_PARSER_PROMPT` (regla 8, y reglas 4/6) y `buildWhatsAppMessage()` (fallback) ahora dicen **"pasá a retirarlo por el local"** en vez de "te llevamos a la facultad". *Si el usuario llegara a guardar un prompt custom en Ajustes, hay que tocar "Usar el default" para que aplique el nuevo (verificado: hoy `config.prompts` está vacío → aplica el default).*
- **Landing (App.jsx):** copy de "entrega en facultad" → "retiro en tu local".
- **Smoke:** sección 17 (`npm run smoke`) cubre `isRetiroLocal` / `localPlace` / `deliveryPlaceFor` / `buildOrder` / `normalizeOrder` con el local configurado (79 checks).

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
