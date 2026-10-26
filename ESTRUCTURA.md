# Estructura del código

Mapa para **encontrar algo sin leer el repo entero** y para saber qué se rompe si lo tocás.
Complementa a `AGENTS.md` (arquitectura y dominios) y `contexto.md` (decisiones y pendientes).

> El bloque **[Dependencias y exports](#dependencias-y-exports)** es **generado**: lo reescribe
> `npm run mapa` (`scripts/mapa-estructura.mjs`). Todo lo de arriba es a mano.

---

## Cómo leer esto en 30 segundos

1. Buscá tu objetivo en el **[Recetario](#recetario-quiero-cambiar-x)** → te da el archivo de entrada.
2. Confirmá el export exacto en el **[Índice de exports](#dependencias-y-exports)** (`archivo#Línea`).
3. Mirá **"Es importado por"** de ese archivo antes de cambiar su firma.
4. Las **[7 funciones de paso obligado](#funciones-de-paso-obligado-no-duplicar-lógica)** son la razón
   por la que una lógica vive en un solo lado. No la reimplementes.

---

## Dónde vive cada cosa

```
src/
├── main.jsx                     monta <App/> (StrictMode) + index.css
├── index.css                    Tailwind v4: @theme (ink/brand/...), @variant dark, .table-shell .sel-row
├── App.jsx                      auth, routing por pantalla, detección de subdominio, estado global
├── lib/
│   ├── constants.js             STORAGE · ORDER_STATES · STATE_* · FALLBACK_CONFIG · prompts default
│   ├── utils.js                 TODO el dominio puro: precios, variantes, portadas, pedidos, mensajes, agenda
│   ├── supabase.js              cliente + CRUD + agenda/slots + shops/admins + local-storage helpers
│   └── shop.js                  estado global del shop (shop_id) — 20 líneas, sin imports
├── components/
│   ├── Icons.jsx                iconos SVG (hoja, sin lógica)
│   ├── UI.jsx                   Alert · Spinner · Cover · statusBadge · fechaLabel · buildWhatsAppMessage
│   ├── Store.jsx                tienda del alumno (home, ficha, carrito, checkout, tracking, ayuda)
│   ├── AdminLogin.jsx           login del panel por shop
│   ├── AdminPanel.jsx           ruteo de tabs del panel (57 líneas)
│   ├── BookFormPanel.jsx        formulario de libro/variantes (lo abre AdminCatalogo)
│   └── admin/
│       ├── AdminDashboard.jsx     capacidad, pendientes, saldos
│       ├── AdminCatalogo.jsx      grilla de libros + bulk edit
│       ├── AdminPedidos.jsx       grilla de pedidos (↑↓, Shift+clic, Avanzar/Retroceder)
│       ├── AdminPedidoNuevo.jsx   alta manual de pedido
│       ├── AdminParserWA.jsx      parser de mensajes de WhatsApp (Gemini)
│       ├── AdminCalculadora.jsx   1 PDF por sub-pestaña, precio por página
│       ├── AdminWA.jsx            avisos de WhatsApp (Hoy / Próximos)
│       ├── AdminConfig.jsx        config del shop (9 cards plegables)
│       ├── GlobalAdminDashboard.jsx  panel multi-tenant (admin.imprenta.store)
│       └── PasswordSetup.jsx      cambio de contraseña del primer ingreso
scripts/
├── smoke-variantes.mjs          `npm run smoke` — 226 checks del dominio puro (node, sin build)
├── test-msgs-reales.mjs         mensajes reales → catálogo del parser (verifica el score)
├── check-variantes-db.mjs       consulta la DB real
└── mapa-estructura.mjs          `npm run mapa` — regenera el bloque de abajo
supabase/functions/gemini/index.ts   proxy de Gemini (parser + generate-wa); secretos server-side
public/rounding.js             script global `window.roundingUtils` (NO es módulo ES)
```

**Ruido que no se toca:** `dist/` (build), `index-old.html` (legacy), `untitled-project/` (sin trackear).

---

## Funciones de paso obligado (no duplicar lógica)

Si una de estas cambia, cambia en **un solo lugar**. Toda la app pasa por acá:

| Función | Archivo | Por qué es la única puerta |
| --- | --- | --- |
| `calcPrecioItem` | `lib/utils.js` | Único cálculo de precio de un ítem. Cambia de firma según el 2º arg sea objeto variante (5º = `express`) o string (5º `color`, 6º `express`). |
| `tieneHora` | `lib/utils.js` | Única decisión de "esto está agendado con hora". Lo que no sea `HH:MM` = sin hora; **nadie inventa horarios**. |
| `lugarRetiro` | `lib/utils.js` | Único lugar de retiro para los mensajes, resuelto **al generar** (no lee `order.lugar_entrega`). Cae a `LUGAR_FALLBACK` ("nuestro local"). |
| `geminiEndpoint` | `lib/utils.js` | Única URL del proxy de IA (`integraciones.GEMINI_ENDPOINT`, fallback legacy `SHEETS_API_URL`). |
| `getShopId` | `lib/shop.js` | Único origen del `shop_id`; lo usan las queries de `supabase.js` y las subidas a Storage. |
| `normalizeOrder` | `lib/utils.js` | Corre en **cada lectura** de pedidos: sanea legacy (modalidad, ventanas, hora). Si algo se ve mal en pantalla, se arregla acá. |
| `coverSrc` | `lib/utils.js` | Única puerta de la portada: imagen propia o SVG generado (`genericCoverSvg`) desde `libro.portada = { titulo, filas }`. No armar `<img src={imagen_url}>` para portadas. |

---

## Recetario: "quiero cambiar X"

| Quiero… | Empezar por |
| --- | --- |
| Cambiar precios de variantes / sugeridos | `lib/utils.js` → `calcSugerido`, `recalcBookSugeridos`, `seedDefaultVariantes`; UI en `BookFormPanel.jsx` |
| Agregar/editar una variante en el formulario | `BookFormPanel.jsx` + `normalizeVariante` / `prepareBookForSave` (espeja columnas `a4_*`/`a5_*`) |
| Cambiar la portada genérica (título, filas, diseño) | `lib/utils.js` → `coverSrc` / `genericCoverSvg` / `splitCoverTitle` / `normalizePortada`; UI en `BookFormPanel.jsx` y `Cover` (`UI.jsx`) |
| Agregar un estado de pedido | `lib/constants.js` (`ORDER_STATES`, `STATE_LABELS`, `STATE_STYLES`, `STATE_ROW_BG`) + `deriveOrderEstado` + `AdminPedidos` + `AdminDashboard` |
| Reordenar / renombrar tabs del panel | `AdminPanel.jsx` (el array de tabs; los `id` no cambian) |
| Agregar una pestaña nueva al panel | Crear en `components/admin/`, sumar al array de `AdminPanel.jsx` |
| Cambiar el texto de confirmación de carga | `lib/constants.js` → `CONFIRMATION_TEMPLATE` (lo resuelve `buildConfirmationMessage`) |
| Cambiar el recordatorio del día de retiro | `lib/constants.js` → `DEFAULT_WA_PROMPT` (+ copia de respaldo en `supabase/functions/gemini/index.ts`) |
| Cambiar el prompt del parser | `lib/constants.js` → `DEFAULT_PARSER_PROMPT` / `PARSER_OUTPUT_SCHEMA`; en prod se pisa desde Ajustes (`config.prompts.*`) |
| Cambiar qué libros ve Gemini | `lib/utils.js` → `buildParserCatalog*` / `mensajeSinRuidoParaScore` (`npm run smoke` + `test-msgs-reales.mjs` lo miden) |
| Tocar el proxy de Gemini | `supabase/functions/gemini/index.ts` + `geminiEndpoint` (requiere `supabase functions deploy gemini --no-verify-jwt`) |
| Cambiar capacidad / días hábiles / feriados | `lib/supabase.js` → `getNextSlots`, `getDayUsage`, `getNextBusinessDay`, `isFeriado` + `utils.orderPagesForCapacity`; UI en `AdminConfig` (Producción, Feriados) |
| Cambiar la agenda de turnos de retiro | `AdminConfig.jsx` (editor semanal) + `utils` `DIAS`/`turnoFromHorario`/`buildVentana`/`normalizeVentanas`/`nextHorario` + `getNextSlots` |
| Tocar el checkout del alumno | `Store.jsx` → `buildOrder` + `buildConfirmationMessage` + `saveOrderToSupabase` |
| Tocar el tracking del alumno | `Store.jsx` → `fetchOrdersByPhoneFromSupabase` (incluye entregados) + `normalizeOrder` |
| Cambiar la calculadora (tarifas, páginas) | `AdminCalculadora.jsx` + `utils` `getCategorias`/`calcPdfPaginas`/`calcPdfPrecio`; semilla en `DEFAULT_CALC_CATEGORIAS` |
| Cambiar encuadernación de un pedido | `utils.calcEncuadernacion` + `AdminPedidoNuevo.jsx` (+ `getEspiralSize`) |
| Agregar un campo al libro en la DB | `supabase.js` → `LIBRO_COLUMNS` + `cleanBookPayload` + migración SQL |
| Agregar una query de pedidos/libros | `supabase.js` (filtrar **siempre** por `getShopId()`) |
| Cambiar el panel global / alta de shops | `GlobalAdminDashboard.jsx` + `supabase.js` (`createShop`, `fetchShopStats`, `addShopAdmin`…) |
| Cambiar la landing / detección de subdominio | `App.jsx` (`getSubdomainSlug`, `isRootDomain`) |
| Colores / tema / dark mode | `src/index.css` (`@theme`, `:root` / `.dark`) |
| Reglas de negocio puras (y sus tests) | `lib/utils.js` + `scripts/smoke-variantes.mjs` (correr `npm run smoke` después) |

---

## Flujos principales (quién llama a quién)

```
Alumno      Store.jsx ──buildOrder/buildConfirmationMessage──▶ supabase.saveOrderToSupabase
                       └─getNextSlots / getNextBusinessDay───▶ supabase.js
                       └─fetchOrdersByPhoneFromSupabase──────▶ tracking

Admin tabs  AdminPanel.jsx ─▶ admin/Admin* (cada tab se monta solo; el panel NO pasa props de dominio)
            AdminPanel retiene: pedidoDraft { items, form } + calcFromOrder  ← vínculo Calculadora ⇄ Pedido Nuevo

Parser WA   AdminParserWA.jsx ─▶ buildParserCatalogForMode + buildParserPrompt
                              ─▶ fetch(geminiEndpoint)  ─▶ Edge Function ─▶ Gemini
                              ─▶ saveOrderToSupabase

Avisos WA   AdminWA.jsx ─┬ buildConfirmationMessage (fijo, sin IA)
                         └ generateRecordatorio ─▶ fetch(geminiEndpoint) ─▶ "pedido listo"
                         └ updateOrderInSupabase (flags wa_*_enviado)

Config      AdminConfig.jsx / AdminCalculadora.jsx ─▶ saveConfigToSupabase ─▶ config (JSONB)
                    └ los prompts viajan en config.prompts.{parser_wa, wa_aviso, catalogo_modo}
```

`App.jsx` es el único que conoce el estado global; los tabs del panel reciben `books`/`config`/`orders`
por props desde `AdminPanel`. `Store.jsx` y `AdminPanel.jsx` **no comparten estado** salvo por Supabase.

---

## Acoplamientos que muerden

- **`lib/utils.js` es el hub**: lo importan 13 archivos. Es puro (solo depende de `constants.js`) — mantenerlo así
  es lo que permite que `npm run smoke` corra en node sin build.
- **`supabase.js` importa de `utils.js`** (`normalizeOrder`, `orderPagesForCapacity`, `tieneHora`, `fechaLabel`…).
  Nunca al revés: si `utils.js` empieza a importar `supabase.js` se rompe el smoke.
- **`UI.jsx` no es solo UI**: exporta `buildWhatsAppMessage` y `fechaLabel`, y `AdminPedidos.jsx` los importa de ahí.
  Antes de borrar exports de `UI.jsx`, buscar consumidores.
- **`constants.js` es hoja** (no importa nada) y lo importan 13 archivos: cambiarlo impacta toda la app.
- **Los prompts viven duplicados**: `constants.js` (default del front) y `index.ts` (fallback de la Edge Function).
  Si cambiás un token, tocar los dos o el `Regenerar` del parser queda desincronizado.
- **`public/rounding.js` es script global** (`window.roundingUtils`), no módulo: no se importa.
- **Multi-tenant**: any query sin `shop_id` es una fuga entre clientes. `getShopId()` está en `lib/shop.js`
  y es estado global mutable (`setShop` lo setea `App.jsx` al detectar el subdominio).

---

## Dependencias y exports

<!-- AUTO:DEPS:START -->
<!-- Generado por `npm run mapa` — no editar a mano dentro de este bloque. -->

### Dependencias entre módulos

| Archivo | Líneas | Importa a | Es importado por |
| --- | --: | --- | --- |
| [`scripts/check-variantes-db.mjs`](./scripts/check-variantes-db.mjs) | 23 | — | — |
| [`scripts/mapa-estructura.mjs`](./scripts/mapa-estructura.mjs) | 178 | — | — |
| [`scripts/smoke-variantes.mjs`](./scripts/smoke-variantes.mjs) | 519 | `lib/constants.js` · `lib/utils.js` | — |
| [`scripts/test-msgs-reales.mjs`](./scripts/test-msgs-reales.mjs) | 33 | `lib/utils.js` | — |
| [`App.jsx`](./src/App.jsx) | 516 | `comp/AdminLogin.jsx` · `comp/Icons.jsx` · `comp/Store.jsx` · `comp/UI.jsx` · `lib/constants.js` · `lib/shop.js` · `lib/supabase.js` · `lib/utils.js` · `comp/AdminPanel.jsx (lazy)` · `comp/admin/GlobalAdminDashboard.jsx (lazy)` · `comp/admin/PasswordSetup.jsx (lazy)` | `main.jsx` |
| [`comp/AdminLogin.jsx`](./src/components/AdminLogin.jsx) | 191 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/constants.js` · `lib/shop.js` · `lib/supabase.js` | `App.jsx` |
| [`comp/AdminPanel.jsx`](./src/components/AdminPanel.jsx) | 57 | `comp/admin/AdminCalculadora.jsx` · `comp/admin/AdminCatalogo.jsx` · `comp/admin/AdminConfig.jsx` · `comp/admin/AdminDashboard.jsx` · `comp/admin/AdminParserWA.jsx` · `comp/admin/AdminPedidoNuevo.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/AdminWA.jsx` · `comp/Icons.jsx` | `App.jsx` (lazy) |
| [`comp/BookFormPanel.jsx`](./src/components/BookFormPanel.jsx) | 286 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/utils.js` | `comp/admin/AdminCatalogo.jsx` |
| [`comp/Icons.jsx`](./src/components/Icons.jsx) | 30 | — | `App.jsx` · `comp/AdminLogin.jsx` · `comp/AdminPanel.jsx` · `comp/BookFormPanel.jsx` · `comp/Store.jsx` · `comp/admin/AdminCatalogo.jsx` · `comp/admin/AdminConfig.jsx` · `comp/admin/AdminParserWA.jsx` · `comp/admin/AdminPedidoNuevo.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/GlobalAdminDashboard.jsx` · `comp/admin/PasswordSetup.jsx` |
| [`comp/Store.jsx`](./src/components/Store.jsx) | 1554 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/constants.js` · `lib/supabase.js` · `lib/utils.js` | `App.jsx` |
| [`comp/UI.jsx`](./src/components/UI.jsx) | 53 | `lib/constants.js` · `lib/utils.js` | `App.jsx` · `comp/AdminLogin.jsx` · `comp/BookFormPanel.jsx` · `comp/Store.jsx` · `comp/admin/AdminParserWA.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/GlobalAdminDashboard.jsx` · `comp/admin/PasswordSetup.jsx` |
| [`comp/admin/AdminCalculadora.jsx`](./src/components/admin/AdminCalculadora.jsx) | 338 | `lib/constants.js` · `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminCatalogo.jsx`](./src/components/admin/AdminCatalogo.jsx) | 503 | `comp/BookFormPanel.jsx` · `comp/Icons.jsx` · `lib/shop.js` · `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminConfig.jsx`](./src/components/admin/AdminConfig.jsx) | 696 | `comp/Icons.jsx` · `lib/constants.js` · `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminDashboard.jsx`](./src/components/admin/AdminDashboard.jsx) | 221 | `lib/constants.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminParserWA.jsx`](./src/components/admin/AdminParserWA.jsx) | 619 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/constants.js` · `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminPedidoNuevo.jsx`](./src/components/admin/AdminPedidoNuevo.jsx) | 370 | `comp/Icons.jsx` · `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminPedidos.jsx`](./src/components/admin/AdminPedidos.jsx) | 1057 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/constants.js` · `lib/shop.js` · `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/AdminWA.jsx`](./src/components/admin/AdminWA.jsx) | 360 | `lib/supabase.js` · `lib/utils.js` | `comp/AdminPanel.jsx` |
| [`comp/admin/GlobalAdminDashboard.jsx`](./src/components/admin/GlobalAdminDashboard.jsx) | 308 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/supabase.js` | `App.jsx` (lazy) |
| [`comp/admin/PasswordSetup.jsx`](./src/components/admin/PasswordSetup.jsx) | 68 | `comp/Icons.jsx` · `comp/UI.jsx` · `lib/constants.js` · `lib/shop.js` · `lib/supabase.js` | `App.jsx` (lazy) |
| [`lib/constants.js`](./src/lib/constants.js) | 228 | — | `scripts/smoke-variantes.mjs` · `App.jsx` · `comp/AdminLogin.jsx` · `comp/Store.jsx` · `comp/UI.jsx` · `comp/admin/AdminCalculadora.jsx` · `comp/admin/AdminConfig.jsx` · `comp/admin/AdminDashboard.jsx` · `comp/admin/AdminParserWA.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/PasswordSetup.jsx` · `lib/supabase.js` · `lib/utils.js` |
| [`lib/shop.js`](./src/lib/shop.js) | 20 | — | `App.jsx` · `comp/AdminLogin.jsx` · `comp/admin/AdminCatalogo.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/PasswordSetup.jsx` · `lib/supabase.js` |
| [`lib/supabase.js`](./src/lib/supabase.js) | 597 | `lib/constants.js` · `lib/shop.js` · `lib/utils.js` | `App.jsx` · `comp/AdminLogin.jsx` · `comp/Store.jsx` · `comp/admin/AdminCalculadora.jsx` · `comp/admin/AdminCatalogo.jsx` · `comp/admin/AdminConfig.jsx` · `comp/admin/AdminParserWA.jsx` · `comp/admin/AdminPedidoNuevo.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/AdminWA.jsx` · `comp/admin/GlobalAdminDashboard.jsx` · `comp/admin/PasswordSetup.jsx` |
| [`lib/utils.js`](./src/lib/utils.js) | 1066 | `lib/constants.js` | `scripts/smoke-variantes.mjs` · `scripts/test-msgs-reales.mjs` · `App.jsx` · `comp/BookFormPanel.jsx` · `comp/Store.jsx` · `comp/UI.jsx` · `comp/admin/AdminCalculadora.jsx` · `comp/admin/AdminCatalogo.jsx` · `comp/admin/AdminConfig.jsx` · `comp/admin/AdminDashboard.jsx` · `comp/admin/AdminParserWA.jsx` · `comp/admin/AdminPedidoNuevo.jsx` · `comp/admin/AdminPedidos.jsx` · `comp/admin/AdminWA.jsx` · `lib/supabase.js` |
| [`main.jsx`](./src/main.jsx) | 11 | `App.jsx` · `index.css` | — |
| [`supabase/functions/gemini/index.ts`](./supabase/functions/gemini/index.ts) | 276 | — | — |

### Índice de exports

Ir directo a la definición: `archivo#Línea`.

**[`lib/utils.js`](./src/lib/utils.js)** · 70 exports
- `fmt` — [`lib/utils.js`](./src/lib/utils.js#L3)
- `slug` — [`lib/utils.js`](./src/lib/utils.js#L7)
- `normalizePhone` — [`lib/utils.js`](./src/lib/utils.js#L11)
- `COVER_MAX_FILAS` — [`lib/utils.js`](./src/lib/utils.js#L17)
- `isCustomCover` — [`lib/utils.js`](./src/lib/utils.js#L20)
- `normalizePortada` — [`lib/utils.js`](./src/lib/utils.js#L26)
- `coverTitleFor` — [`lib/utils.js`](./src/lib/utils.js#L35)
- `coverLineEm` — [`lib/utils.js`](./src/lib/utils.js#L41)
- `splitCoverTitle` — [`lib/utils.js`](./src/lib/utils.js#L55)
- `genericCoverSvg` — [`lib/utils.js`](./src/lib/utils.js#L105)
- `coverSrc` — [`lib/utils.js`](./src/lib/utils.js#L131)
- `isWeekend` — [`lib/utils.js`](./src/lib/utils.js#L137)
- `HOJAS` — [`lib/utils.js`](./src/lib/utils.js#L142)
- `normalizeVariante` — [`lib/utils.js`](./src/lib/utils.js#L146)
- `variantesFromLegacyColumns` — [`lib/utils.js`](./src/lib/utils.js#L159)
- `seedDefaultVariantes` — [`lib/utils.js`](./src/lib/utils.js#L172)
- `mirrorLegacyColumns` — [`lib/utils.js`](./src/lib/utils.js#L185)
- `prepareBookForSave` — [`lib/utils.js`](./src/lib/utils.js#L209)
- `applyClassicColumnPatchesToVariantes` — [`lib/utils.js`](./src/lib/utils.js#L214)
- `ensureBookVariantes` — [`lib/utils.js`](./src/lib/utils.js#L238)
- `getBookFormats` — [`lib/utils.js`](./src/lib/utils.js#L256)
- `getBookCombinations` — [`lib/utils.js`](./src/lib/utils.js#L266)
- `getMinPrice` — [`lib/utils.js`](./src/lib/utils.js#L281)
- `findVariante` — [`lib/utils.js`](./src/lib/utils.js#L286)
- `calcSugerido` — [`lib/utils.js`](./src/lib/utils.js#L309)
- `migrateBook` — [`lib/utils.js`](./src/lib/utils.js#L334)
- `recalcBookSugeridos` — [`lib/utils.js`](./src/lib/utils.js#L356)
- `newVarianteId` — [`lib/utils.js`](./src/lib/utils.js#L368)
- `bookCareerId` — [`lib/utils.js`](./src/lib/utils.js#L373)
- `getCareers` — [`lib/utils.js`](./src/lib/utils.js#L377)
- `getEspiralSize` — [`lib/utils.js`](./src/lib/utils.js#L390)
- `getCareer` — [`lib/utils.js`](./src/lib/utils.js#L405)
- `careerLabel` — [`lib/utils.js`](./src/lib/utils.js#L410)
- `careerAddress` — [`lib/utils.js`](./src/lib/utils.js#L414)
- `DIAS` — [`lib/utils.js`](./src/lib/utils.js#L421)
- `DIAS_CORTO` — [`lib/utils.js`](./src/lib/utils.js#L422)
- `DIAS_ORDER` — [`lib/utils.js`](./src/lib/utils.js#L424)
- `turnoFromHorario` — [`lib/utils.js`](./src/lib/utils.js#L427)
- `buildVentana` — [`lib/utils.js`](./src/lib/utils.js#L432)
- `normalizeVentanas` — [`lib/utils.js`](./src/lib/utils.js#L439)
- `nextHorario` — [`lib/utils.js`](./src/lib/utils.js#L458)
- `RETIRO_LOCAL` — [`lib/utils.js`](./src/lib/utils.js#L465)
- `isRetiroLocal` — [`lib/utils.js`](./src/lib/utils.js#L473)
- `localPlace` — [`lib/utils.js`](./src/lib/utils.js#L482)
- `deliveryPlaceFor` — [`lib/utils.js`](./src/lib/utils.js#L489)
- `lugarRetiro` — [`lib/utils.js`](./src/lib/utils.js#L506)
- `roundTotal` — [`lib/utils.js`](./src/lib/utils.js#L512)
- `calcPrecioItem` — [`lib/utils.js`](./src/lib/utils.js#L529)
- `computeOrderStatus` — [`lib/utils.js`](./src/lib/utils.js#L579)
- `fechaLabel` — [`lib/utils.js`](./src/lib/utils.js#L583)
- `tieneHora` — [`lib/utils.js`](./src/lib/utils.js#L596)
- `buildOrder` — [`lib/utils.js`](./src/lib/utils.js#L613)
- `orderPagesForCapacity` — [`lib/utils.js`](./src/lib/utils.js#L655)
- `deriveOrderEstado` — [`lib/utils.js`](./src/lib/utils.js#L663)
- `buildParserCatalogFull` — [`lib/utils.js`](./src/lib/utils.js#L678)
- `mensajeSinRuidoParaScore` — [`lib/utils.js`](./src/lib/utils.js#L703)
- `buildParserCatalog` — [`lib/utils.js`](./src/lib/utils.js#L738)
- `buildParserCatalogForMode` — [`lib/utils.js`](./src/lib/utils.js#L790)
- `buildParserPrompt` — [`lib/utils.js`](./src/lib/utils.js#L803)
- `buildWaPrompt` — [`lib/utils.js`](./src/lib/utils.js#L828)
- `buildConfirmationMessage` — [`lib/utils.js`](./src/lib/utils.js#L876)
- `generateRecordatorio` — [`lib/utils.js`](./src/lib/utils.js#L893)
- `getCategorias` — [`lib/utils.js`](./src/lib/utils.js#L923)
- `calcPdfPaginas` — [`lib/utils.js`](./src/lib/utils.js#L929)
- `calcPdfPrecio` — [`lib/utils.js`](./src/lib/utils.js#L938)
- `calcEncuadernacion` — [`lib/utils.js`](./src/lib/utils.js#L964)
- `geminiEndpoint` — [`lib/utils.js`](./src/lib/utils.js#L982)
- `observacionesSinHora` — [`lib/utils.js`](./src/lib/utils.js#L994)
- `extractTimeFromMessage` — [`lib/utils.js`](./src/lib/utils.js#L1004)
- `normalizeOrder` — [`lib/utils.js`](./src/lib/utils.js#L1028)

**[`lib/supabase.js`](./src/lib/supabase.js)** · 42 exports
- `getSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L8)
- `getSupabaseAuth` — [`lib/supabase.js`](./src/lib/supabase.js#L13)
- `fetchBooksFromSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L17)
- `LIBRO_COLUMNS` — [`lib/supabase.js`](./src/lib/supabase.js#L32)
- `cleanBookPayload` — [`lib/supabase.js`](./src/lib/supabase.js#L34)
- `saveBookToSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L45)
- `deleteBookFromSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L64)
- `uploadPdfToStorage` — [`lib/supabase.js`](./src/lib/supabase.js#L80)
- `subirPortada` — [`lib/supabase.js`](./src/lib/supabase.js#L100)
- `fetchOrdersFromSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L121)
- `fetchOrdersByPhoneFromSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L138)
- `saveOrderToSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L155)
- `updateOrderInSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L175)
- `fetchConfigFromSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L179)
- `saveConfigToSupabase` — [`lib/supabase.js`](./src/lib/supabase.js#L194)
- `getNextBusinessDay` — [`lib/supabase.js`](./src/lib/supabase.js#L210)
- `isFeriado` — [`lib/supabase.js`](./src/lib/supabase.js#L217)
- `getDayUsage` — [`lib/supabase.js`](./src/lib/supabase.js#L226)
- `getSlotDeadline` — [`lib/supabase.js`](./src/lib/supabase.js#L236)
- `formatDeadline` — [`lib/supabase.js`](./src/lib/supabase.js#L244)
- `getNextSlots` — [`lib/supabase.js`](./src/lib/supabase.js#L256)
- `formatFechaCorta` — [`lib/supabase.js`](./src/lib/supabase.js#L320)
- `formatVentana` — [`lib/supabase.js`](./src/lib/supabase.js#L326)
- `saveLocal` — [`lib/supabase.js`](./src/lib/supabase.js#L336)
- `loadLocal` — [`lib/supabase.js`](./src/lib/supabase.js#L344)
- `loadJson` — [`lib/supabase.js`](./src/lib/supabase.js#L353)
- `deepMerge` — [`lib/supabase.js`](./src/lib/supabase.js#L363)
- `copyToClipboard` — [`lib/supabase.js`](./src/lib/supabase.js#L376)
- `normalizeConfig` — [`lib/supabase.js`](./src/lib/supabase.js#L400)
- `getOrdersByPhone` — [`lib/supabase.js`](./src/lib/supabase.js#L425)
- `isDeliveryDayOrder` — [`lib/supabase.js`](./src/lib/supabase.js#L431)
- `needsAttendance` — [`lib/supabase.js`](./src/lib/supabase.js#L437)
- `fetchAllShops` — [`lib/supabase.js`](./src/lib/supabase.js#L443)
- `fetchShopStats` — [`lib/supabase.js`](./src/lib/supabase.js#L455)
- `createShop` — [`lib/supabase.js`](./src/lib/supabase.js#L469)
- `updateShopStatus` — [`lib/supabase.js`](./src/lib/supabase.js#L489)
- `fetchShopAdmins` — [`lib/supabase.js`](./src/lib/supabase.js#L503)
- `addShopAdmin` — [`lib/supabase.js`](./src/lib/supabase.js#L515)
- `checkPasswordChanged` — [`lib/supabase.js`](./src/lib/supabase.js#L546)
- `markPasswordChanged` — [`lib/supabase.js`](./src/lib/supabase.js#L561)
- `removeShopAdmin` — [`lib/supabase.js`](./src/lib/supabase.js#L574)
- `isShopAdmin` — [`lib/supabase.js`](./src/lib/supabase.js#L586)

**[`lib/constants.js`](./src/lib/constants.js)** · 15 exports
- `STORAGE` — [`lib/constants.js`](./src/lib/constants.js#L1)
- `COMBO_KEYS` — [`lib/constants.js`](./src/lib/constants.js#L11)
- `COMBO_LABELS` — [`lib/constants.js`](./src/lib/constants.js#L12)
- `ORDER_STATES` — [`lib/constants.js`](./src/lib/constants.js#L14)
- `STATE_LABELS` — [`lib/constants.js`](./src/lib/constants.js#L23)
- `STATE_STYLES` — [`lib/constants.js`](./src/lib/constants.js#L27)
- `STATE_ROW_BG` — [`lib/constants.js`](./src/lib/constants.js#L36)
- `FALLBACK_CONFIG` — [`lib/constants.js`](./src/lib/constants.js#L45)
- `DEMO_WHATSAPP` — [`lib/constants.js`](./src/lib/constants.js#L124)
- `DEFAULT_PARSER_PROMPT` — [`lib/constants.js`](./src/lib/constants.js#L135)
- `PARSER_OUTPUT_SCHEMA` — [`lib/constants.js`](./src/lib/constants.js#L160)
- `DEFAULT_WA_PROMPT` — [`lib/constants.js`](./src/lib/constants.js#L180)
- `CONFIRMATION_TEMPLATE` — [`lib/constants.js`](./src/lib/constants.js#L208)
- `DEFAULT_CALC_CATEGORIAS` — [`lib/constants.js`](./src/lib/constants.js#L216)
- `LUGAR_FALLBACK` — [`lib/constants.js`](./src/lib/constants.js#L227)

**[`comp/UI.jsx`](./src/components/UI.jsx)** · 6 exports
- `statusBadge` — [`comp/UI.jsx`](./src/components/UI.jsx#L4)
- `Alert` — [`comp/UI.jsx`](./src/components/UI.jsx#L8)
- `Spinner` — [`comp/UI.jsx`](./src/components/UI.jsx#L18)
- `Cover` — [`comp/UI.jsx`](./src/components/UI.jsx#L22)
- `fechaLabel` — [`comp/UI.jsx`](./src/components/UI.jsx#L26)
- `buildWhatsAppMessage` — [`comp/UI.jsx`](./src/components/UI.jsx#L33)

**[`lib/shop.js`](./src/lib/shop.js)** · 4 exports
- `setShop` — [`lib/shop.js`](./src/lib/shop.js#L4)
- `getShop` — [`lib/shop.js`](./src/lib/shop.js#L9)
- `getShopId` — [`lib/shop.js`](./src/lib/shop.js#L13)
- `isShopLoaded` — [`lib/shop.js`](./src/lib/shop.js#L17)

**[`App.jsx`](./src/App.jsx)** · 1 exports
- `App` — [`App.jsx`](./src/App.jsx#L25)

**[`comp/AdminLogin.jsx`](./src/components/AdminLogin.jsx)** · 1 exports
- `AdminLogin` — [`comp/AdminLogin.jsx`](./src/components/AdminLogin.jsx#L8)

**[`comp/AdminPanel.jsx`](./src/components/AdminPanel.jsx)** · 1 exports
- `AdminPanel` — [`comp/AdminPanel.jsx`](./src/components/AdminPanel.jsx#L12)

**[`comp/BookFormPanel.jsx`](./src/components/BookFormPanel.jsx)** · 1 exports
- `BookFormPanel` — [`comp/BookFormPanel.jsx`](./src/components/BookFormPanel.jsx#L10)

**[`comp/Icons.jsx`](./src/components/Icons.jsx)** · 1 exports
- `Icon` — [`comp/Icons.jsx`](./src/components/Icons.jsx#L1)

**[`comp/Store.jsx`](./src/components/Store.jsx)** · 1 exports
- `Store` — [`comp/Store.jsx`](./src/components/Store.jsx#L1487)

**[`comp/admin/AdminCalculadora.jsx`](./src/components/admin/AdminCalculadora.jsx)** · 1 exports
- `AdminCalculadora` — [`comp/admin/AdminCalculadora.jsx`](./src/components/admin/AdminCalculadora.jsx#L17)

**[`comp/admin/AdminCatalogo.jsx`](./src/components/admin/AdminCatalogo.jsx)** · 1 exports
- `AdminCatalogo` — [`comp/admin/AdminCatalogo.jsx`](./src/components/admin/AdminCatalogo.jsx#L12)

**[`comp/admin/AdminConfig.jsx`](./src/components/admin/AdminConfig.jsx)** · 1 exports
- `AdminConfig` — [`comp/admin/AdminConfig.jsx`](./src/components/admin/AdminConfig.jsx#L54)

**[`comp/admin/AdminDashboard.jsx`](./src/components/admin/AdminDashboard.jsx)** · 1 exports
- `AdminDashboard` — [`comp/admin/AdminDashboard.jsx`](./src/components/admin/AdminDashboard.jsx#L5)

**[`comp/admin/AdminParserWA.jsx`](./src/components/admin/AdminParserWA.jsx)** · 1 exports
- `AdminParserWA` — [`comp/admin/AdminParserWA.jsx`](./src/components/admin/AdminParserWA.jsx#L8)

**[`comp/admin/AdminPedidoNuevo.jsx`](./src/components/admin/AdminPedidoNuevo.jsx)** · 1 exports
- `AdminPedidoNuevo` — [`comp/admin/AdminPedidoNuevo.jsx`](./src/components/admin/AdminPedidoNuevo.jsx#L24)

**[`comp/admin/AdminPedidos.jsx`](./src/components/admin/AdminPedidos.jsx)** · 1 exports
- `AdminPedidos` — [`comp/admin/AdminPedidos.jsx`](./src/components/admin/AdminPedidos.jsx#L24)

**[`comp/admin/AdminWA.jsx`](./src/components/admin/AdminWA.jsx)** · 1 exports
- `AdminWA` — [`comp/admin/AdminWA.jsx`](./src/components/admin/AdminWA.jsx#L20)

**[`comp/admin/GlobalAdminDashboard.jsx`](./src/components/admin/GlobalAdminDashboard.jsx)** · 1 exports
- `GlobalAdminDashboard` — [`comp/admin/GlobalAdminDashboard.jsx`](./src/components/admin/GlobalAdminDashboard.jsx#L6)

**[`comp/admin/PasswordSetup.jsx`](./src/components/admin/PasswordSetup.jsx)** · 1 exports
- `PasswordSetup` — [`comp/admin/PasswordSetup.jsx`](./src/components/admin/PasswordSetup.jsx#L9)

### Entradas y scripts (sin exports)

- [`scripts/check-variantes-db.mjs`](./scripts/check-variantes-db.mjs) · 23 líneas · externos: `node:fs`
- [`scripts/mapa-estructura.mjs`](./scripts/mapa-estructura.mjs) · 178 líneas · externos: `node:fs`, `node:path`
- [`scripts/smoke-variantes.mjs`](./scripts/smoke-variantes.mjs) · 519 líneas · externos: `node:fs`
- [`scripts/test-msgs-reales.mjs`](./scripts/test-msgs-reales.mjs) · 33 líneas · externos: `node:fs`
- [`main.jsx`](./src/main.jsx) · 11 líneas · externos: `react`, `react-dom/client`
- [`supabase/functions/gemini/index.ts`](./supabase/functions/gemini/index.ts) · 276 líneas
<!-- AUTO:DEPS:END -->

---

## Regenerar este documento

```bash
npm run mapa
```

Reescribe **solo** el bloque entre los marcadores `AUTO:DEPS:START` / `AUTO:DEPS:END`
(archivos, líneas, imports cruzados y el índice de exports con `archivo#Línea`).
El resto del documento es a mano: si cambia una responsabilidad o un flujo, editá esa sección.
