import { createClient } from '@supabase/supabase-js';
import { normalizeOrder, orderPagesForCapacity, isWeekend, normalizePhone } from './utils.js';
import { STATE_STYLES, STATE_LABELS, FALLBACK_CONFIG } from './constants.js';
import { getShopId } from './shop.js';

let _sbClient = null;

export function getSupabase(config) {
  if (!_sbClient) _sbClient = createClient(config.supabase.url, config.supabase.anon_key);
  return _sbClient;
}

export function getSupabaseAuth(config) {
  return getSupabase(config);
}

export async function fetchBooksFromSupabase(config) {
  try {
    const sb = getSupabase(config);
    const query = sb.from('libros').select('*');
    const shopId = getShopId();
    if (shopId) query.eq('shop_id', shopId);
    const { data, error } = await query.order('titulo', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error cargando libros desde Supabase:', err);
    return null;
  }
}

export const LIBRO_COLUMNS = ['id','id_libro','titulo','materia','id_carrera','carrera','autor','paginas','paginas_por_hoja','pdf_url','activo','a4_bn_habilitado','a4_bn_sugerido','a4_bn_ajuste','a4_bn_final','a4_color_habilitado','a4_color_final','a5_bn_habilitado','a5_bn_sugerido','a5_bn_ajuste','a5_bn_final','a5_color_habilitado','a5_color_final','imagen_url','encuadernacion','shop_id'];

export function cleanBookPayload(book) {
  const cleaned = {};
  for (const key of LIBRO_COLUMNS) {
    if (key in book) cleaned[key] = book[key];
  }
  cleaned.id_libro = book.id_libro || book.id;
  const shopId = getShopId();
  if (shopId && !cleaned.shop_id) cleaned.shop_id = shopId;
  return cleaned;
}

export async function saveBookToSupabase(book, config) {
  try {
    const sb = getSupabase(config);
    const payload = cleanBookPayload(book);
    const shopId = getShopId();
    const upsertOpts = shopId ? { onConflict: 'id, shop_id' } : { onConflict: 'id' };
    const { error } = await sb.from('libros').upsert(payload, upsertOpts);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error guardando libro en Supabase:', err);
    alert('No se pudo guardar el libro en Supabase. Revisá la consola.');
    return false;
  }
}

export async function deleteBookFromSupabase(id, config) {
  try {
    const sb = getSupabase(config);
    const query = sb.from('libros').delete().eq('id', id);
    const shopId = getShopId();
    if (shopId) query.eq('shop_id', shopId);
    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error eliminando libro de Supabase:', err);
    alert('No se pudo eliminar el libro de Supabase.');
    return false;
  }
}

export async function uploadPdfToStorage(file, bookId, config) {
  const sb = getSupabase(config);
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token || config.supabase.anon_key;
  const shopId = getShopId();
  const prefix = shopId ? `${shopId}/` : '';
  const path = `${prefix}${bookId}.pdf`;
  const url = `${config.supabase.url}/storage/v1/object/pdfs/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: file
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return `${config.supabase.url}/storage/v1/object/public/pdfs/${path}`;
}

export async function subirPortada(file, bookId, config) {
  const sb = getSupabase(config);
  const { data: { session } } = await sb.auth.getSession();
  const token = session?.access_token || config.supabase.anon_key;
  const ext = file.name.split('.').pop() || 'jpg';
  const shopId = getShopId();
  const prefix = shopId ? `portadas/${shopId}/` : 'portadas/';
  const path = `${prefix}${bookId}-${Date.now()}.${ext}`;
  const url = `${config.supabase.url}/storage/v1/object/pdfs/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: file
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || `HTTP ${res.status}`);
  }
  return `${config.supabase.url}/storage/v1/object/public/pdfs/${path}`;
}

export async function fetchOrdersFromSupabase(config) {
  try {
    const sb = getSupabase(config);
    const query = sb.from('pedidos').select('*');
    const shopId = getShopId();
    if (shopId) query.eq('shop_id', shopId);
    const { data, error } = await query.order('ts', { ascending: false });
    if (error) throw error;
    return (data || []).map(o => normalizeOrder(o, config));
  } catch (err) {
    console.error('Error cargando pedidos desde Supabase:', err);
    return null;
  }
}

export async function saveOrderToSupabase(order, config) {
  try {
    const sb = getSupabase(config);
    const payload = { ...order, items: order.items || [] };
    const shopId = getShopId();
    if (shopId && !payload.shop_id) payload.shop_id = shopId;
    const upsertOpts = shopId ? { onConflict: 'id, shop_id' } : { onConflict: 'id' };
    const { error } = await sb.from('pedidos').upsert(payload, upsertOpts);
    if (error) {
      console.error('Supabase error:', error);
      throw new Error(error.message || JSON.stringify(error));
    }
    return true;
  } catch (err) {
    console.error('Error guardando pedido en Supabase:', err);
    alert('No se pudo guardar el pedido en Supabase:\n' + (err.message || err));
    return false;
  }
}

export async function updateOrderInSupabase(order, config) {
  return saveOrderToSupabase(order, config);
}

export async function fetchConfigFromSupabase(config) {
  try {
    const sb = getSupabase(config);
    const query = sb.from('config').select('data').eq('id', 1);
    const shopId = getShopId();
    if (shopId) query.eq('shop_id', shopId);
    const { data, error } = await query.single();
    if (error) throw error;
    return data?.data || null;
  } catch (err) {
    console.warn('Config no encontrada en Supabase, usando valores locales:', err.message);
    return null;
  }
}

export async function saveConfigToSupabase(configData, config) {
  try {
    const sb = await getSupabaseAuth(config);
    const shopId = getShopId();
    const payload = { id: 1, data: configData, updated_at: new Date().toISOString() };
    if (shopId) payload.shop_id = shopId;
    const upsertOpts = shopId ? { onConflict: 'id, shop_id' } : { onConflict: 'id' };
    const { error } = await sb.from('config').upsert(payload, upsertOpts);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error guardando config en Supabase:', err);
    return false;
  }
}

export function getNextBusinessDay(fechaStr) {
  const date = new Date(`${fechaStr}T12:00:00`);
  date.setDate(date.getDate() + 1);
  if (date.getDay() === 0) date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}

export function isFeriado(config, fecha, universidad) {
  const feriados = config?.feriados || [];
  return feriados.find(f => {
    if (f.fecha !== fecha) return false;
    if (!f.universidad) return true;
    return f.universidad === universidad;
  }) || null;
}

export function getDayUsage(pedidos, fecha, isExpress = false) {
  const primary = pedidos
    .filter(order => order.fecha === fecha && (isExpress ? order.express : !order.express))
    .reduce((acc, order) => acc + orderPagesForCapacity(order), 0);
  const secondary = pedidos
    .filter(order => order.segunda_entrega_fecha === fecha && (isExpress ? order.express : !order.express))
    .reduce((acc, order) => acc + (order.hojas_segunda_entrega || 0), 0);
  return primary + secondary;
}

export function getSlotDeadline(slotDate, slotHorario, horasAnticipacion) {
  const [year, month, day] = slotDate.split('-').map(Number);
  const [hours, minutes] = (slotHorario || '19:00').split(':').map(Number);
  const deadline = new Date(year, month - 1, day, hours, minutes || 0);
  deadline.setHours(deadline.getHours() - horasAnticipacion);
  return deadline;
}

export function formatDeadline(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlineDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = deadlineDay.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `hoy a las ${timeStr}`;
  if (diffDays === 1) return `mañana a las ${timeStr}`;
  return `${date.toLocaleDateString('es-AR', { weekday: 'short' })} a las ${timeStr}`;
}

export function getNextSlots(config, pedidos, career, isExpress = false) {
  const now = new Date();
  const dailyCap = isExpress
    ? (config.produccion.capacidad_express_paginas || 300)
    : config.produccion.capacidad_diaria_paginas;
  const horasAnticipacion = isExpress
    ? (config.produccion.horas_anticipacion_express || 2)
    : (config.produccion.horas_anticipacion || 20);
  const windows = (career?.ventanas || []).filter(window => window.activa !== false);
  const slots = [];

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const day = date.getDay();
    const fecha = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const used = getDayUsage(pedidos, fecha, isExpress);
    const remaining = dailyCap - used;
    let dayWindows = windows.length
      ? windows.filter(window => Number(window.dia) === day)
      : (isWeekend(date) ? [] : [
        { label: 'Manana', turno: 'manana', horario: '10:00', activa: true },
        { label: 'Tarde', turno: 'tarde', horario: '19:00', activa: true }
      ]);

    if (dayWindows.length === 0 && !isWeekend(date)) {
      dayWindows = [
        { label: 'Manana', turno: 'manana', horario: '10:00', activa: true },
        { label: 'Tarde', turno: 'tarde', horario: '19:00', activa: true }
      ];
    }

    const feriado = isFeriado(config, fecha, career?.universidad);
    dayWindows.forEach(window => {
      const turno = window.turno || 'tarde';
      const horario = window.horario || (turno === 'manana' ? '10:00' : '19:00');
      let disponible = remaining > 0 && !feriado;
      let bloqueado = feriado ? `Feriado: ${feriado.motivo || 'No laborable'}` : '';

      const slotDeadline = getSlotDeadline(fecha, horario, horasAnticipacion);
      if (!feriado && now >= slotDeadline) {
        disponible = false;
        bloqueado = `Cierra ${formatDeadline(slotDeadline)}`;
      }

      if (!feriado && remaining <= 0) {
        disponible = false;
        bloqueado = isExpress ? 'Agenda Express llena' : 'Agenda llena';
      }

      slots.push({
        fecha,
        turno,
        horario,
        label: window.label || `${fechaLabel(fecha, offset)} ${turno}`,
        disponible,
        bloqueado,
        dOffset: offset
      });
    });

    if (slots.filter(slot => slot.disponible).length >= 6) break;
  }
  return slots.slice(0, 8);
}

export function formatFechaCorta(fecha) {
  if (!fecha) return '';
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
}

export function formatVentana(ventana, fecha, horario) {
  if (ventana && /^\d{4}-\d{2}-\d{2}/.test(ventana)) {
    return ventana.replace(/^\d{4}-\d{2}-\d{2}/, match => formatFechaCorta(match));
  }
  return ventana || (fecha ? `${formatFechaCorta(fecha)} · ${horario}` : '');
}

export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('saveLocal failed:', key, error.message);
  }
}

export function loadLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

export async function loadJson(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(path);
    return await response.json();
  } catch (error) {
    return fallback;
  }
}

export function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export async function copyToClipboard(text, onSuccess) {
  if (!text) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!successful) throw new Error('Fallback copy failed');
    }
    if (onSuccess) onSuccess();
  } catch (err) {
    console.warn('Copy failed:', err);
    alert('No se pudo copiar. Copiá manualmente: ' + text);
  }
}

export function normalizeConfig(config) {
  const merged = {
    ...FALLBACK_CONFIG,
    ...config,
    precios: {
      ...FALLBACK_CONFIG.precios,
      ...(config?.precios || {}),
      A4: { ...FALLBACK_CONFIG.precios.A4, ...(config?.precios?.A4 || {}) },
      A5: { ...FALLBACK_CONFIG.precios.A5, ...(config?.precios?.A5 || {}) }
    },
    encuadernacion: { ...FALLBACK_CONFIG.encuadernacion, ...(config?.encuadernacion || {}) },
    redondeo: { ...FALLBACK_CONFIG.redondeo, ...(config?.redondeo || {}) },
    produccion: { ...FALLBACK_CONFIG.produccion, ...(config?.produccion || {}) },
    entrega: { ...FALLBACK_CONFIG.entrega, ...(config?.entrega || {}) },
    integraciones: { ...FALLBACK_CONFIG.integraciones, ...(config?.integraciones || {}) },
    supabase: { ...FALLBACK_CONFIG.supabase, ...(config?.supabase || {}) },
    pagos: deepMerge(FALLBACK_CONFIG.pagos, config?.pagos || {}),
    carreras: Array.isArray(config?.carreras) && config.carreras.length ? config.carreras : FALLBACK_CONFIG.carreras,
    feriados: Array.isArray(config?.feriados) ? config.feriados : FALLBACK_CONFIG.feriados
  };
  if (!merged.precios.A5.unico) merged.precios.A5.unico = merged.precios.A5.mas_50 || 49;
  if (!merged.produccion.precio_promedio_hoja) merged.produccion.precio_promedio_hoja = merged.precios.A4.mas_50 || 70;
  return merged;
}

export async function syncOrderToSheets(order, config) {
  const url = config.integraciones?.SHEETS_API_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(order)
    });
  } catch (err) {
    console.error('Error sincronizando con Sheets:', err);
  }
}

export async function fetchOrdersFromSheets(config) {
  const url = config.integraciones?.SHEETS_API_URL;
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Error al leer Sheets');
    const data = await response.json();
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.error('Error obteniendo pedidos desde Sheets:', err);
    return null;
  }
}

export function getOrdersByPhone(orders, phone) {
  const norm = normalizePhone(phone);
  if (norm.length < 8) return [];
  return orders.filter(order => normalizePhone(order.whatsapp) === norm);
}

export function isDeliveryDayOrder(order) {
  if (!order.fecha) return false;
  const today = new Date().toISOString().split('T')[0];
  return order.fecha === today;
}

export function needsAttendance(order) {
  return ['Listo'].includes(order.estado) && isDeliveryDayOrder(order) && !order.asistencia_confirmada;
}

// ============ GLOBAL ADMIN ============

export async function fetchAllShops(config) {
  try {
    const sb = getSupabase(config);
    const { data, error } = await sb.from('shops').select('*').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error cargando shops:', err);
    return [];
  }
}

export async function fetchShopStats(config, shopId) {
  try {
    const sb = getSupabase(config);
    const [{ count: bookCount }, { count: activeOrders }] = await Promise.all([
      sb.from('libros').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('activo', true),
      sb.from('pedidos').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).in('estado', ['Pendiente de impresión', 'Imprimiendo', 'Para encuadernar', 'Listo'])
    ]);
    return { bookCount: bookCount || 0, activeOrders: activeOrders || 0 };
  } catch (err) {
    console.error('Error cargando stats del shop:', err);
    return { bookCount: 0, activeOrders: 0 };
  }
}

export async function createShop(config, { slug, name, adminEmail }) {
  try {
    const sb = getSupabase(config);
    const subdomain = `${slug}.imprenta.store`;
    const { error } = await sb.from('shops').insert({
      slug,
      name,
      subdomain,
      admin_email: adminEmail || null,
      suscripcion_status: 'trial',
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString()
    });
    if (error) throw error;
    return { success: true, subdomain };
  } catch (err) {
    console.error('Error creando shop:', err);
    return { success: false, error: err.message };
  }
}

export async function updateShopStatus(config, shopId, status) {
  try {
    const sb = getSupabase(config);
    const { error } = await sb.from('shops').update({ suscripcion_status: status }).eq('id', shopId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error actualizando shop:', err);
    return false;
  }
}

// ============ SHOP ADMINS ============

export async function fetchShopAdmins(config, shopId) {
  try {
    const sb = getSupabase(config);
    const { data, error } = await sb.from('shop_admins').select('*').eq('shop_id', shopId).order('email');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error cargando admins:', err);
    return [];
  }
}

export async function addShopAdmin(config, shopId, email, displayName, initialPassword) {
  try {
    const sb = getSupabase(config);
    // Crear usuario en Supabase Auth
    const { error: signUpErr } = await sb.auth.signUp({
      email: email.trim().toLowerCase(),
      password: initialPassword,
      options: { data: { display_name: displayName || null } }
    });
    if (signUpErr) {
      if (signUpErr.message === 'User already registered') {
        // Ya existe en auth, solo agregamos a shop_admins
      } else {
        throw signUpErr;
      }
    }
    // Insertar en shop_admins
    const { error } = await sb.from('shop_admins').upsert({
      shop_id: shopId,
      email: email.trim().toLowerCase(),
      display_name: displayName || null,
      password_changed: !initialPassword // si no hay password inicial, ya está "cambiado"
    }, { onConflict: 'shop_id, email' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error agregando admin:', err);
    return false;
  }
}

export async function checkPasswordChanged(config, shopId, email) {
  try {
    const sb = getSupabase(config);
    const { data, error } = await sb.from('shop_admins')
      .select('password_changed')
      .eq('shop_id', shopId)
      .eq('email', email)
      .single();
    if (error) return false;
    return data?.password_changed !== false;
  } catch (err) {
    return false;
  }
}

export async function markPasswordChanged(config, shopId, email) {
  try {
    const sb = getSupabase(config);
    await sb.from('shop_admins')
      .update({ password_changed: true })
      .eq('shop_id', shopId)
      .eq('email', email);
    return true;
  } catch (err) {
    return false;
  }
}

export async function removeShopAdmin(config, adminId) {
  try {
    const sb = getSupabase(config);
    const { error } = await sb.from('shop_admins').delete().eq('id', adminId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error eliminando admin:', err);
    return false;
  }
}

export async function isShopAdmin(config, shopId, email) {
  try {
    const sb = getSupabase(config);
    const { count, error } = await sb.from('shop_admins').select('*', { count: 'exact', head: true }).eq('shop_id', shopId).eq('email', email);
    if (error) throw error;
    return (count || 0) > 0;
  } catch (err) {
    console.error('Error verificando admin:', err);
    return false;
  }
}
