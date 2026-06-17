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
├── vercel.json             # Config de deploy Vercel
├── dist/                   # Build de producción (generado)
└── src/
    ├── main.jsx            # Punto de entrada React
    ├── App.jsx             # App principal: auth, routing, estado global, detección subdominio
    ├── index.css           # Tailwind v4 + @variant dark + estilos personalizados
    ├── lib/
    │   ├── constants.js    # STORAGE, ORDER_STATES, FALLBACK_CONFIG, etc.
    │   ├── utils.js        # fmt, slug, calcSugerido, buildOrder, etc.
    │   ├── supabase.js     # Cliente Supabase (singleton) + CRUD + Sheets sync
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
            ├── AdminPedidos.jsx    # Grilla de pedidos con filtros y edición
            ├── AdminCatalogo.jsx   # Grilla de libros con bulk edit
            ├── AdminConfig.jsx     # Configuración: precios, carreras, feriados
            └── AdminParserWA.jsx   # Parser de mensajes WhatsApp
```

## Stack

| Componente | Tecnología |
|------------|-----------|
| Frontend   | React 19 + Vite 8 |
| Estilos    | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Backend    | Supabase (PostgreSQL + Auth + Storage) |
| Sync       | Google Sheets vía Apps Script |
| Pagos      | Talo (códigos de referencia) |
| Deploy     | Vercel |
| Fonts      | DM Sans (Google Fonts) |

## Flujo de datos

```
Cliente → Catálogo → Ficha → Carrito → Checkout → Supabase (pedidos)
                                                      ↓
                                              Google Sheets (sync)
                                                      ↓
Admin → Dashboard/Pedidos → Supabase ← Estado pedidos
         ↓                                           ↓
    WhatsApp (Gemini IA) ← Google Sheets ← Notificaciones
```

## Estados de pedidos

1. Pendiente de pago
2. Pendiente de impresión
3. Imprimiendo
4. Para encuadernar
5. Listo
6. Entregado

## Funciones clave por dominio

### Catálogo (src/lib/utils.js)
- `HOJAS(paginas, pph)` — Calcula cantidad de hojas
- `calcSugerido(paginas, formato, config, pph)` — Precio sugerido por formato
- `calcPrecioItem(libro, formato, encuadernacion, config, color)` — Precio final
- `getBookFormats(book)`, `getBookCombinations(book)` — Formatos y combos disponibles
- `migrateBook(book, config)` — Migra libros de formato legacy al modelo actual
- `recalcBookSugeridos(book, config)` — Recalcula precios sugeridos

### Pedidos (src/lib/utils.js)
- `buildOrder(items, form, slot, config, career, metodoPago)` — Crea nuevo pedido
- `normalizeOrder(order, config)` — Normaliza datos de pedido
- `deriveOrderEstado(items)` — Deriva estado desde items
- `computeOrderStatus(montoPagado)` — Estado según pago
- `orderPagesForCapacity(order)` — Hojas que consumen capacidad

### Supabase (src/lib/supabase.js)
- `getSupabase(config)` — Cliente singleton
- `fetchBooksFromSupabase(config)` — Carga libros
- `saveBookToSupabase(book, config)` — Upsert libro
- `deleteBookFromSupabase(id, config)` — Elimina libro
- `fetchOrdersFromSupabase(config)` — Carga pedidos
- `saveOrderToSupabase(order, config)` — Guarda pedido
- `updateOrderInSupabase(order, config)` — Actualiza pedido
- `uploadPdfToStorage(file, bookId, config)` — Sube PDF
- `subirPortada(file, bookId, config)` — Sube imagen de portada
- `fetchConfigFromSupabase(config)` / `saveConfigToSupabase(...)` — Config remota
- `getNextBusinessDay(fecha)` — Próximo día hábil
- `getNextSlots(config, pedidos, career, isExpress)` — Slots de entrega disponibles
- `syncOrderToSheets(order, config)` — Sincroniza con Google Sheets
- `getOrdersByPhone(orders, phone)` — Busca pedidos por WhatsApp

### Utilidades (src/lib/utils.js)
- `fmt(n)` — Formatea a moneda ARS
- `slug(text)` — Normaliza texto para búsqueda
- `normalizePhone(value)` — Limpia número de teléfono
- `roundTotal(value, config)` — Redondea total según config
- `getCareers(config, books)`, `getCareer(...)`, `careerLabel(...)`, `careerAddress(...)` — Gestión de carreras
- `deliveryPlaceFor(modalidad, career, config)` — Lugar de entrega
- `getEspiralSize(hojas, config)` — Tamaño de espiral
- `extractTimeFromMessage(text)` — Extrae hora de mensaje WA

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
- **Google Sheets:** Sync vía `SHEETS_API_URL` en `config.integraciones`
- **Redondeo:** `rounding.js` cargado como script global, accedido vía `window.roundingUtils`
