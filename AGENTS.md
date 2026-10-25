# Imprenta Sync 2026

Sistema de gestión de pedidos para imprenta universitaria. SPA construida con **Vite + React 19 + Tailwind CSS 4**. Deploy en Vercel, backend en Supabase.

## Arquitectura

```
imprenta-sync-2026/
├── index.html              # Entry point (Vite)
├── vite.config.js          # Vite + React + Tailwind v4 plugin
├── package.json            # Dependencias y scripts
├── config.json             # Configuración (Supabase, pagos, carreras)
├── libros.json             # Catálogo local (fallback offline)
├── rounding.js             # Utilidad de redondeo (cargada como <script>)
├── rls_policies.sql        # Row Level Security de Supabase
├── migration_multi_tenant.sql # Migración multi-tenant: shops + FK + índices
├── migration_wa_flujo.sql # Migración flujo WA: wa_confirmacion + banderas de enviado en pedidos
├── vercel.json             # Config de deploy Vercel
├── supabase/functions/gemini/index.ts  # Edge Function: proxy de Gemini (parser WA + generate-wa)
├── dist/                   # Build de producción (generado)
└── src/
    ├── main.jsx            # Punto de entrada React
    ├── App.jsx             # App principal: auth, routing, estado global, detección subdominio
    ├── index.css           # Tailwind v4 + @variant dark + estilos personalizados
    ├── lib/
    │   ├── constants.js    # STORAGE, ORDER_STATES, FALLBACK_CONFIG, etc.
    │   ├── utils.js        # fmt, slug, calcSugerido, buildOrder, etc.
    │   ├── supabase.js     # Cliente Supabase (singleton) + CRUD + shops/admins
    │   └── shop.js         # Contexto global de shop (multi-tenant)
    └── components/
        ├── Icons.jsx       # 21 iconos SVG (Home, Cart, Settings, etc.)
        ├── UI.jsx          # Componentes base: statusBadge, Alert, Spinner, Cover, etc.
        ├── Store.jsx       # Tienda (catálogo, ficha, carrito, checkout, tracking, ayuda)
        ├── AdminPanel.jsx  # Panel admin (ruteo de pestañas)
        ├── AdminLogin.jsx  # Login de administrador
        ├── BookFormPanel.jsx # Formulario de edición de libro
        └── admin/
            ├── AdminDashboard.jsx  # Dashboard: capacidad, pendientes, saldos
            ├── AdminPedidos.jsx    # Grilla de pedidos: filtros, edición y selección múltiple (Avanzar/Retroceder en bloque)
            ├── AdminCatalogo.jsx   # Grilla de libros con bulk edit
            ├── AdminConfig.jsx     # Configuración (cards plegables): precios, calculadora, carreras, feriados
            ├── AdminParserWA.jsx   # Parser de mensajes WhatsApp
            ├── AdminCalculadora.jsx # Tab Calculadora: 1 sub-pestanya por PDF, precio por página
            ├── AdminPedidoNuevo.jsx # Tab Pedido Nuevo: buscador + formulario + creación manual
            └── AdminWA.jsx         # Tab WhatsApp: confirmación de carga + recordatorio día del retiro
```

## Stack

| Componente | Tecnología |
|------------|-----------|
| Frontend   | React 19 + Vite 8 |
| Estilos    | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Backend    | Supabase (PostgreSQL + Auth + Storage) |
| Proxy IA   | Supabase Edge Function (`supabase/functions/gemini`) |
| Pagos      | Talo (códigos de referencia) |
| Deploy     | Vercel |
| Fonts      | DM Sans (Google Fonts) |

## Flujo de datos

```
Cliente → Catálogo → Ficha → Carrito → Checkout → Supabase (pedidos)

Admin → Dashboard/Pedidos → Supabase ← Estado pedidos
         ↓
    WhatsApp (Gemini IA) ← Edge Function `gemini` (parse + generate-wa)
```

## Estados de pedidos

1. Pendiente de pago
2. Pendiente de impresión
3. Imprimiendo
4. Para encuadernar
5. Listo
6. Entregado

## Pestañas del panel (orden — decisión del usuario)

`AdminPanel.jsx` arma el array de tabs en este orden (el `id` es el que se pasa a `setTab`):

**Dashboard → Catálogo → Pedidos → Pedido Nuevo → Parser WA → Calculadora → Avisos WA → Config**

- El tab de avisos de WhatsApp se llama **Avisos WA** (id `whatsapp`, componente `AdminWA`); en textos y comentarios se lo referencia por ese nombre (antes "tab WhatsApp").
- Cambiar el orden solo implica reordenar ese array: los ids y los `tab === '...'` del ruteo no cambian.

**Tab Config (`AdminConfig.jsx`) — cards plegables:** las 9 cards (Local, Producción, Precios, Calculadora, Espirales, Pagos, Feriados, Gemini, Turnos) usan el componente `CardAjuste` con botón **Minimizar / Mostrar** en la cabecera. **Arrancan todas minimizadas** (decisión del usuario; `useState` con un `Set` de ids de `SECCIONES`) y los chips del menú lateral (`irA`) **expanden la card destino** antes del scroll. La cabecera conserva título + descripción (+ badge `meta`: "⚠ Falta cargar" en Local si `local` está vacío, "N registrados" en Feriados) — así el aviso del local se ve aunque la card esté plegada.

## Calculadora + Pedido Nuevo (2 tabs vinculados)

Dos pestañas del panel vinculadas en los 2 sentidos (estado compartido `pedidoDraft { items, form }` + `calcFromOrder` en `AdminPanel.jsx`, sobrevive el cambio de tab):

1. **Calculadora** (`admin/AdminCalculadora.jsx`) — sub-pestañas = **1 PDF por archivo**. Carga **páginas por categoría** y cobra **POR PÁGINA** según el contenido. Botón **⚙ Ajustes** (header) → panel chico con los costos y variables de la pestaña: tarifas por categoría (agregar/quitar), **Redondear a par**, **Anillado ($)** y **Anillado desde (hojas)** — borrador local + `saveConfigToSupabase` (mismo camino que "Dejar guardado"; ✕/Cancelar descarta). Botones: **Dejar guardado** (`config.calc_borrador`, JSONB → sin migración) y **Cargar los ✓ a Pedido Nuevo** (crea ítems con `origen: 'calculadora'`, `es_unico: true`).
2. **Pedido Nuevo** (`admin/AdminPedidoNuevo.jsx`) — **buscador del catálogo** (clic = ítem con su precio vía `calcPrecioItem`), botón **Calcular PDF** (salta a Calculadora y vuelve con el resultado), formulario (nombre, WhatsApp, fecha/hora de retiro, **monto pagado**: input único —vacío o 0 = **nulo**, acotado a ≤ total, botón **Total** autocompleta—, encuadernación) y **Crear pedido** → `buildOrder` + `saveOrderToSupabase` (queda en Pedidos + confirmación pendiente en WhatsApp). Cada ítem de catálogo muestra **chips de variante bajo "Comentario"** (`combosDeItem`/`setVarianteItem` → recalcula precio, hojas y tipo; antes elegía `combos[0]` sin poder cambiarlo). Sin agenda ni control de capacidad: fecha/hora a mano; carrera vacía (retiro en local).

**Precios (decidido con el usuario):**
- **Página en blanco por impar: NO se cobra**. Toggle opcional en **Ajustes → Calculadora** ("Redondear a par" → `calculadora.redondear_impar`, **default apagado**) que suma 1 página a la tarifa más barata.
- **Categorías/tarifas editables** en Ajustes → Calculadora (semilla `DEFAULT_CALC_CATEGORIAS`: *Blanco y negro 35 · Poco color 40 · Color 60*).
- **Encuadernación a nivel PEDIDO** en Pedido Nuevo: *Sin / Cada PDF por su lado / Todos juntos en una*; se cobra como **línea de ítem** y solo sobre `origen === 'calculadora'` (los del catálogo ya la traen en el precio de la variante).

## Home / Catálogo de la tienda (Store.jsx · `HomeScreen`)

- **Un solo buscador** (decisión del usuario): input **"Buscar materia o libro"** (columna ancha, `1.6fr`, es el principal) + **selector `<select>` de Carrera** al costado (`1fr`) con **"Todas las carreras" por defecto** y las carreras del config (ej: Abogacía, Enfermería). Antes había **dos inputs con 🔍** lado a lado (el `CareerCombobox` + el de materia/libro); el combobox **se eliminó** de `UI.jsx` (quedó sin uso, junto con sus imports `Icon`/`slug`/`careerLabel` ahí).
- Chips de materia debajo (filtra por materia; `setCareer` sigue limpiando `materia` al cambiar de carrera) y badge con la dirección de la carrera elegida.
- Estado compartido: `catalogFilters { career, query, materia }`.
- **⚡ Prioridad de impresión (express): OCULTA** (decisión del usuario, 2026-10-24) — flag `MOSTRAR_PRIORIDAD = false` (module-level en `Store.jsx`): no se muestra ni la card "¿Necesitás prioridad de impresión?" de la ficha ni el aviso "N en modo Express" del checkout. El código express (modal, +20%, `getNextSlots(..., true)`) queda intacto; con el flag en `true` vuelve.

## Mensajes de WhatsApp (flujo de 2 toques)

El alumno elige el turno de retiro según sus clases → **la hora es clave**. Dos mensajes, gestionados desde el **tab WhatsApp** (`AdminWA.jsx`):

1. **Confirmación de carga** — plantilla **FIJA, sin IA** (`CONFIRMATION_TEMPLATE` → `buildConfirmationMessage`). Se arma al crear el pedido (checkout) y entra como **pendiente** al tab. Aplica a presencial y virtual, para agendar al alumno. Campo: `wa_confirmacion`.
2. **Recordatorio (día del retiro)** — **con IA** (`generateRecordatorio` → prompt `config.prompts.wa_aviso`). Se genera al hacer clic en el tab y se manda el **MISMO DÍA** del retiro pactado. Texto en `wa_message`.

**Tab WhatsApp:** sub-tabs **Hoy** (retiros de hoy + atrasados → recordatorio) y **Próximos** (retiros futuros → confirmaciones). Pendientes arriba; por pedido: mensaje editable, botón **Enviar** (`wa.me`) y **marcar/desmarcar enviado** (toggle). Además: **selección múltiple** (checkbox por fila + "Seleccionar pendientes") con botón **Omitir (N)** + **Deshacer** — reutiliza el flag de enviado (`wa_*_enviado`, **sin migración**) para sacar filas de pendientes. Teclado: **↑↓** mueven el foco y **Shift+↑↓ / Shift+clic** seleccionan rango (ancla `ancla`).

**Banderas** (columnas nuevas → `migration_wa_flujo.sql`): `wa_confirmacion_enviada` y `wa_recordatorio_enviado` (TIMESTAMPTZ; NULL = pendiente).

## Funciones clave por dominio

### Catálogo (src/lib/utils.js)
- Modelo de opciones: `libro.variantes[]` = `{ id, label, paginas_por_hoja, color, precio, habilitado, sugerido }`
- `ensureBookVariantes(book)` / `prepareBookForSave(book)` / `mirrorLegacyColumns(book)` — variantes ↔ columnas a4_*/a5_*
- `seedDefaultVariantes(paginas, config, pph)` — seed clásico A4/A5
- `HOJAS(paginas, pph)` — Calcula cantidad de hojas
- `calcSugerido(paginas, formato, config, pph)` — Precio sugerido A4/A5
- `calcPrecioItem(libro, varianteObj|varianteId|'A4'|'A5'|label, encuadernacion, config, ...)` — Precio final. Si el 2do arg es **objeto variante**, el 5to es `express`; si es **string**, el 5to es `color` y el 6to `express`.
- `getBookFormats(book)`, `getBookCombinations(book)` — opciones habilitadas (desde variantes)
- `migrateBook(book, config)` — Migra legacy + asegura variantes
- `recalcBookSugeridos(book, config)` — Recalcula sugeridos de a4_bn / a5_bn

### Pedidos (src/lib/utils.js)
- `buildOrder(items, form, slot, config, career, metodoPago)` — Crea nuevo pedido
- `normalizeOrder(order, config)` — Normaliza datos de pedido
- `deriveOrderEstado(items)` — Deriva estado desde items
- `computeOrderStatus(montoPagado)` — Estado según pago
- `orderPagesForCapacity(order)` — Hojas que consumen capacidad
- **`tieneHora(h)`** — ¿'HH:MM' válido? Es la **única puerta** para decidir si un pedido está agendado con hora: todo lo que no pase ('', `'A coordinar'`, `'manana'`) = **sin hora** y **nada inventa horarios** (ni '10:00' ni '19:00'). `turno` = `turnoFromHorario(hora)` (`manana`/`tarde`) o `''`.

### Supabase (src/lib/supabase.js)
- `getSupabase(config)` — Cliente singleton
- `fetchBooksFromSupabase(config)` — Carga libros
- `saveBookToSupabase(book, config)` — Upsert libro
- `deleteBookFromSupabase(id, config)` — Elimina libro
- `fetchOrdersFromSupabase(config, { includeEntregados = false })` — Carga pedidos (por defecto **sin** `Entregado`)
- `fetchOrdersByPhoneFromSupabase(config, phone)` — Pedidos de un teléfono **incluyendo** entregados (tracking alumno)
- `saveOrderToSupabase(order, config)` — Guarda pedido
- `updateOrderInSupabase(order, config)` — Actualiza pedido
- `uploadPdfToStorage(file, bookId, config)` — Sube PDF
- `subirPortada(file, bookId, config)` — Sube imagen de portada
- `fetchConfigFromSupabase(config)` / `saveConfigToSupabase(...)` — Config remota
- `getNextBusinessDay(fecha)` — Próximo día hábil
- `getNextSlots(config, pedidos, career, isExpress)` — Slots de retiro disponibles (turnos para tener el pedido listo en el local)
- `getOrdersByPhone(orders, phone)` — Busca pedidos por WhatsApp

### Utilidades (src/lib/utils.js)
- `fmt(n)` — Formatea a moneda ARS
- `slug(text)` — Normaliza texto para búsqueda
- `normalizePhone(value)` — Limpia número de teléfono
- `roundTotal(value, config)` — Redondea total según config
- `getCareers(config, books)`, `getCareer(...)`, `careerLabel(...)`, `careerAddress(...)` — Gestión de carreras
- **Modelo de retiro en local** (reemplazó "entrega en facultad"; ahora el alumno retira en el local físico):
  - `RETIRO_LOCAL` = `'Retiro en local'` — modalidad única canónica
  - `isRetiroLocal(modalidad)` — true para la actual y la legacy `'Retiro facultad'` (no rompe pedidos viejos)
  - `localPlace(config)` — `"nombre — dirección"` desde `config.local` (o '' si está vacío)
  - `deliveryPlaceFor(modalidad, career, config)` — Lugar de retiro: local físico (legacy Cadete/domicilio conservados)
- `getEspiralSize(hojas, config)` — Tamaño de espiral
- `getCategorias(config)` — Categorías de la Calculadora (`config.calculadora.categorias` o `DEFAULT_CALC_CATEGORIAS`)
- `calcPdfPaginas(paginasPorCat)` / `calcPdfPrecio(categorias, paginasPorCat, config)` — Páginas y **precio por página** de un PDF (toggle `calculadora.redondear_impar` para contar la página en blanco a la tarifa más barata, default apagado)
- `calcEncuadernacion(items, modo, config)` — Costo de encuadernación de un pedido: `'ninguna' | 'cada' | 'todos'` sobre los ítems con `origen === 'calculadora'` (usa `encuadernacion.basica` si `hojas >= umbral`; `'todos'` devuelve además `size` vía `getEspiralSize`)
- `extractTimeFromMessage(text)` — Extrae hora de mensaje WA
- **`observacionesSinHora(texto)`** — Saca la hora de observaciones/notas (`🕒18hs`, `a las 18 hs`): la hora vive **solo en `horario_entrega`**, nunca en notas. Se aplica al importar el parser (`observaciones` de ítem + `notas_admin`) y `DEFAULT_PARSER_PROMPT` regla 4 ahora dice **NO pongas la hora**
- `buildParserPrompt(template, { fecha, mensaje, catalogo })` — Arma el prompt del parser WA desde `config.prompts.parser_wa` (editable en Ajustes); cae a `DEFAULT_PARSER_PROMPT` y anexa schema JSON si faltó
- `buildWaPrompt(template, data)` — Arma el prompt del **recordatorio de WhatsApp** (día del retiro: "pedido listo, te esperamos hoy a las X") desde `config.prompts.wa_aviso` (2ª sección de la card Gemini en Ajustes); cae a `DEFAULT_WA_PROMPT` y resuelve `{{fecha}} {{fecha_pedido}} {{hora}} {{nombre}} {{telefono}} {{libros}} {{lugar}} {{saldo}}`
- `buildConfirmationMessage(order, config?, template?)` — Mensaje de **confirmación de carga** (plantilla FIJA, sin IA) desde `CONFIRMATION_TEMPLATE`; tokens `{{nombre}} {{fecha}} {{fecha_larga}} {{hora}} {{lugar}}`. Se arma al crear el pedido y entra como **pendiente** al tab WhatsApp. El `{{lugar}}` sale de `lugarRetiro(order, config)`
- `lugarRetiro(order, config)` — Lugar de retiro para los mensajes **resuelto al generar** (no el guardado en `order.lugar_entrega`): retiro en local → `localPlace(config)`; sin nombre/dirección cargados → `LUGAR_FALLBACK` (**"nuestro local"**), **nunca `''` ni la facultad** (no queda a criterio de la IA); Cadete/domicilio conservan su texto guardado
- `generateRecordatorio(order, config)` — Genera el **recordatorio** (día del retiro) con IA vía la Edge Function; devuelve el texto o lanza error. Se usa desde el tab WhatsApp. `data.lugar_entrega` = `lugarRetiro(order, config)`
- `buildParserCatalog(books, mensaje, { maxDetalle })` — Modo `compacto`: score local con IDF (tokens genéricos no puntúan, título completo +10) → máx. 10 fichas detalladas + índice de títulos (−56% de tokens). Antes de puntuar, `mensajeSinRuidoParaScore()` saca teléfonos, horarios, montos y estados de pago
- `buildParserCatalogFull(books)` — Modo `completo`: una ficha por libro activo (la versión anterior)
- `buildParserCatalogForMode(books, mensaje, modo)` — Selector según `config.prompts.catalogo_modo` ('compacto' default | 'completo'), toggle en Ajustes
- `geminiEndpoint(config)` — URL del proxy de Gemini (Supabase Edge Function); usa `integraciones.GEMINI_ENDPOINT` y cae a la legacy `SHEETS_API_URL`
- **Agenda de turnos de retiro:** `DIAS` / `DIAS_CORTO` / `DIAS_ORDER` (orden Lun→Dom), `turnoFromHorario(h)`, `buildVentana(dia, h, activa)`, `normalizeVentanas(ventanas)` (valida/deduplica/deriva/ordena `career.ventanas[]`), `nextHorario(h)`. `career.ventanas[] = { dia, horario, turno, label, activa }` es el modelo de horarios de retiro por carrera (editor completo en Ajustes).

## Estado global (App.jsx)

| Estado | Tipo | Descripción |
|--------|------|-------------|
| `screen` | string | Pantalla actual (home, ficha, checkout, tracking, ayuda, admin) |
| `books` | array | Catálogo de libros |
| `config` | object | Configuración completa |
| `orders` | array | Pedidos (desde Supabase) |
| `carrito` | array | Items en el carrito |
| `checkoutForm` | object | Datos del formulario de checkout |
| `adminAuthed` | boolean | Admin autenticado |
| `theme` | string | Tema (light/dark) |
| `loading` | boolean | Carga inicial |

## Configuración de Tailwind v4

Los colores personalizados se definen en `src/index.css` vía `@theme`:
- `ink` (50-900) — Escala de grises adaptada al tema
- `brand`, `accent`, `ok`, `warn`, `danger` — Colores semánticos
- `surface`, `border`, `input-*` — Colores de superficie

El tema oscuro se maneja con variables CSS (`:root` / `.dark`) y Tailwind `darkMode: 'class'`.

## Scripts

```bash
npm run dev       # Servidor de desarrollo (HMR)
npm run build     # Build de producción
npm run preview   # Preview del build
npm run smoke     # Smoke test de la capa de variantes/precios (node, sin build)
```

## Multi-tenant (subdominios)

Cada fotocopiadora tiene su propio subdominio que determina qué datos ve.

### Arquitectura

```
unju.imprenta.store   →  misma app  →  Supabase (shop_id = UUID de UNJu)
claudio.imprenta.store →  misma app  →  Supabase (shop_id = UUID de Claudio)
imprenta.store        →  landing page pública
```

### Tabla `shops` (Supabase)

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | Identificador único del shop |
| slug | TEXT UNIQUE | Slug para subdominio (ej: "unju") |
| name | TEXT | Nombre visible (ej: "Imprenta UNJu") |
| subdomain | TEXT UNIQUE | Subdominio completo |
| suscripcion_status | TEXT | trial, active, cancelled |

### Flujo de detección de shop

1. `App.jsx` detecta subdominio vía `getSubdomainSlug()` (lee `hostname`)
2. Busca shop en `shops` por slug → setea `currentShop` y `setGlobalShop()`
3. Si no hay subdominio → muestra landing page (`isRootDomain = true`)
4. `src/lib/shop.js` exporta `getShopId()` que usan todas las queries
5. Todas las queries Supabase filtran por `shop_id` automáticamente

### Aislamiento de datos

- **RLS anónimo:** Los alumnos solo leen libros/pedidos/config de su shop (filtrado en app, no en DB por ahora para compatibilidad con anon)
- **Admin autenticado:** Solo ve/modifica datos de su shop (vía `shop_id` en queries)
- **Storage:** PDFs y portadas usan path `{shopId}/` como namespace

### Nuevo shop (onboarding futuro)

```sql
INSERT INTO shops (slug, name, subdomain) VALUES ('nuevo', 'Fotocopiadora Nueva', 'nuevo.imprenta.store');
```
Luego el admin del nuevo shop carga su catálogo y configura precios/ventanas.

## Convenciones

- **Commits:** feat: / fix: / style: / refactor: en español
- **Nombres:** camelCase para funciones/variables, PascalCase para componentes
- **Estado:** React hooks (useState/useEffect) en componentes funcionales
- **Supabase:** Cliente singleton (no crear nuevas instancias)
- **Gemini (IA):** Proxy vía Supabase Edge Function; URL en `config.integraciones.GEMINI_ENDPOINT` (fallback legacy `SHEETS_API_URL`). Secretos en Supabase (`GEMINI_API_KEY`).
- **Redondeo:** `rounding.js` cargado como script global, accedido vía `window.roundingUtils`
