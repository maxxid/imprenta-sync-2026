# Onboarding: Nueva fotocopiadora

Guía paso a paso para dar de alta un nuevo cliente en Imprenta Sync 2026.

---

## 1. Crear el shop (panel global)

1. Entrá a `https://admin.imprenta.store`
2. Iniciá sesión con Google (tu cuenta `maxi@barconte.com.ar`)
3. Click en **"+ Nueva fotocopiadora"**
4. Completá:
   - **Nombre**: `Fotocopiadora Claudio`
   - **Slug**: `claudio` (solo minúsculas, números y guiones)
   - **Email admin**: _opcional, se puede agregar después_
5. Click **"Crear fotocopiadora"**
6. El modal muestra las instrucciones DNS. Guardalas.

---

## 2. DNS (dns-parking.com / Hostinger / donde tengas el dominio)

Agregá un registro **A**:

| Tipo | Nombre | Valor |
|------|--------|-------|
| A | `claudio` | `76.76.21.21` |

Tiempo de propagación: 1 a 5 minutos.

---

## 3. Vercel — Agregar subdominio

```bash
vercel domains add claudio.imprenta.store
```

O desde el dashboard: **Settings → Domains → Add** → `claudio.imprenta.store`

---

## 4. Agregar administradores al shop

1. En `https://admin.imprenta.store`, columna **Admins** → click en el shop
2. Completá:
   - **Email del nuevo admin**: `claudio@fotocop.com`
   - **Contraseña inicial**: `Temp1234` (mínimo 6 caracteres)
3. Click **"Agregar administrador"**
4. **Compartile las credenciales al cliente** por WhatsApp o email:
   > Usuario: `claudio@fotocop.com`  
   > Contraseña: `Temp1234`  
   > Entrá a: `https://claudio.imprenta.store/admin`  
   > En tu primer acceso te va a pedir que cambies la contraseña.

---

## 5. Primer acceso del cliente

1. El cliente entra a `https://claudio.imprenta.store/admin`
2. Ingresa email + contraseña inicial
3. El sistema le pide:
   - **Tu nombre** (ej: `Claudio García`)
   - **Nueva contraseña** (la que él elija)
4. Listo, ya está en su panel de administración.

---

## 6. Configuración inicial del shop (lo hace el cliente)

Desde su panel admin (`claudio.imprenta.store/admin`):

### 6.1 Configurar precios y ventanas
Ir a **Config**:
- **Precios**: A4 menos de 50 hojas, A4 más de 50, A5 único
- **Encuadernación**: Precio base de anillado, umbral de hojas
- **Producción**: Capacidad diaria, horas de anticipación
- **Carreras y ventanas**: Agregar facultades con días y horarios de entrega

### 6.2 Cargar catálogo
Ir a **Catálogo**:
- Click **"+ Nuevo libro"** o **"Importar"** desde JSON
- Completar título, autor, materia, carrera, páginas
- Subir PDF y portada
- Configurar precios por combinación (A4 B/N, A4 Color, A5 B/N, A5 Color)
- Guardar

### 6.3 Probar
El catálogo ya está visible en `https://claudio.imprenta.store`. El cliente puede:
- Navegar el catálogo como alumno
- Agregar libros al carrito
- Hacer un pedido de prueba
- Seguirlo desde "Seguí tu pedido"

---

## 7. Verificar desde el panel global

En `https://admin.imprenta.store` podés ver:
- Estado del shop (activo / prueba / suspendido)
- Cantidad de libros y pedidos activos
- Administradores asignados

---

## Resumen rápido (nuevo cliente)

| Paso | Dónde | Qué |
|------|-------|-----|
| 1 | `admin.imprenta.store` | Crear shop (nombre + slug) |
| 2 | DNS (dns-parking) | Registro A `slug` → `76.76.21.21` |
| 3 | Vercel | Agregar dominio `slug.imprenta.store` |
| 4 | `admin.imprenta.store` | Agregar admin (email + contraseña inicial) |
| 5 | WhatsApp | Compartir credenciales al cliente |
| 6 | Cliente | Primer login + cambio de contraseña |
| 7 | Cliente | Configurar precios, catálogo, ventanas |

---

## Solución de problemas

| Problema | Solución |
|----------|---------|
| "Ese email no está autorizado" | Verificar que el email esté agregado en **Admins** del shop |
| El subdominio no carga | Revisar DNS: `nslookup claudio.imprenta.store` debe devolver `76.76.21.21` |
| Magic link redirige mal | Supabase → Authentication → URL Configuration → Site URL: `https://imprenta.store` |
| "No tenés acceso al sistema de X" | El admin está intentando entrar al shop equivocado. Cada admin solo accede a SU shop |
| El cliente olvidó la contraseña | Desde el login, click en "Enviar enlace de acceso" (magic link) |
