import { COMBO_KEYS, COMBO_LABELS, ORDER_STATES, PARSER_OUTPUT_SCHEMA, DEFAULT_PARSER_PROMPT, DEFAULT_WA_PROMPT, CONFIRMATION_TEMPLATE, DEFAULT_CALC_CATEGORIAS, LUGAR_FALLBACK } from './constants.js';

export function fmt(n) {
  return `$${Number(n || 0).toLocaleString('es-AR')}`;
}

export function slug(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isWeekend(date) {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

export function HOJAS(paginas, paginasPorHoja = 2) {
  return Math.ceil(Number(paginas || 0) / (Number(paginasPorHoja) || 2));
}

export function normalizeVariante(v, fallbackPph = 2) {
  const id = String(v?.id || slug(v?.label) || `var-${Date.now()}`).slice(0, 64);
  return {
    id,
    label: String(v?.label || id).trim() || id,
    paginas_por_hoja: Number(v?.paginas_por_hoja) || fallbackPph || 2,
    color: Boolean(v?.color),
    precio: Number(v?.precio) || 0,
    habilitado: v?.habilitado !== false,
    sugerido: Number(v?.sugerido) || 0
  };
}

export function variantesFromLegacyColumns(book) {
  const pph = Number(book.paginas_por_hoja) || 2;
  return COMBO_KEYS.map(key => ({
    id: key,
    label: COMBO_LABELS[key],
    paginas_por_hoja: pph,
    color: key.endsWith('color'),
    precio: Number(book[`${key}_final`]) || 0,
    habilitado: Boolean(book[`${key}_habilitado`]),
    sugerido: Number(book[`${key}_sugerido`]) || 0
  }));
}

export function seedDefaultVariantes(paginas, config, paginasPorHoja = 2) {
  const pph = Number(paginasPorHoja) || 2;
  const a4s = calcSugerido(paginas, 'A4', config, pph);
  const a5s = calcSugerido(paginas, 'A5', config, pph);
  return [
    { id: 'a4_bn', label: 'A4 B/N', paginas_por_hoja: pph, color: false, precio: a4s, habilitado: true, sugerido: a4s },
    { id: 'a4_color', label: 'A4 Color', paginas_por_hoja: pph, color: true, precio: 0, habilitado: false, sugerido: 0 },
    { id: 'a5_bn', label: 'A5 B/N', paginas_por_hoja: pph, color: false, precio: a5s, habilitado: true, sugerido: a5s },
    { id: 'a5_color', label: 'A5 Color', paginas_por_hoja: pph, color: true, precio: 0, habilitado: false, sugerido: 0 }
  ];
}

/** Mirror variantes clasicas hacia columnas a4_* y a5_* (compat Sheets / lecturas viejas). */
export function mirrorLegacyColumns(book) {
  const variantes = Array.isArray(book.variantes) ? book.variantes : [];
  const next = { ...book, variantes };
  for (const key of COMBO_KEYS) {
    const v = variantes.find(x => x.id === key);
    if (v) {
      next[`${key}_habilitado`] = Boolean(v.habilitado);
      next[`${key}_final`] = Number(v.precio) || 0;
      next[`${key}_sugerido`] = Number(v.sugerido) || 0;
      if (key === 'a4_bn' || key === 'a5_bn') {
        next[`${key}_ajuste`] = (Number(v.precio) || 0) - (Number(v.sugerido) || 0);
      }
    } else {
      next[`${key}_habilitado`] = false;
      next[`${key}_final`] = 0;
      if (key === 'a4_bn' || key === 'a5_bn') {
        next[`${key}_sugerido`] = next[`${key}_sugerido`] || 0;
        next[`${key}_ajuste`] = next[`${key}_ajuste`] || 0;
      }
    }
  }
  return next;
}

export function prepareBookForSave(book) {
  return mirrorLegacyColumns(ensureBookVariantes(book));
}

/** Aplica parches de columnas a4_* y a5_* (edicion rapida) sobre variantes. */
export function applyClassicColumnPatchesToVariantes(orig, changes = {}) {
  const merged = { ...orig, ...changes };
  const ensured = ensureBookVariantes(merged);
  let variantes = [...ensured.variantes];
  for (const key of COMBO_KEYS) {
    const touched = [`${key}_habilitado`, `${key}_final`, `${key}_sugerido`, `${key}_ajuste`].some(k => k in changes);
    if (!touched) continue;
    const idx = variantes.findIndex(v => v.id === key);
    const patch = normalizeVariante({
      id: key,
      label: (idx >= 0 ? variantes[idx].label : null) || COMBO_LABELS[key],
      paginas_por_hoja: Number(merged.paginas_por_hoja) || (idx >= 0 ? variantes[idx].paginas_por_hoja : 2),
      color: key.endsWith('color'),
      precio: `${key}_final` in changes || `${key}_final` in merged ? Number(merged[`${key}_final`]) || 0 : (idx >= 0 ? variantes[idx].precio : 0),
      habilitado: `${key}_habilitado` in changes || `${key}_habilitado` in merged ? Boolean(merged[`${key}_habilitado`]) : (idx >= 0 ? variantes[idx].habilitado : false),
      sugerido: Number(merged[`${key}_sugerido`]) || (idx >= 0 ? variantes[idx].sugerido : 0)
    });
    if (idx >= 0) variantes[idx] = patch;
    else variantes.push(patch);
  }
  return mirrorLegacyColumns({ ...ensured, ...changes, variantes });
}

/** Fuente de verdad: book.variantes[]. Si falta, deriva de columnas legacy. */
export function ensureBookVariantes(book, config = null) {
  if (!book) return book;
  const pph = Number(book.paginas_por_hoja) || 2;
  if (Array.isArray(book.variantes) && book.variantes.length > 0) {
    return { ...book, paginas_por_hoja: pph, variantes: book.variantes.map(v => normalizeVariante(v, pph)) };
  }
  if ('a4_bn_habilitado' in book || 'a4_bn_final' in book) {
    return { ...book, paginas_por_hoja: pph, variantes: variantesFromLegacyColumns(book) };
  }
  const seeded = config
    ? seedDefaultVariantes(book.paginas, config, pph)
    : [
        { id: 'a4_bn', label: 'A4 B/N', paginas_por_hoja: pph, color: false, precio: 0, habilitado: true, sugerido: 0 },
        { id: 'a5_bn', label: 'A5 B/N', paginas_por_hoja: pph, color: false, precio: 0, habilitado: false, sugerido: 0 }
      ];
  return { ...book, paginas_por_hoja: pph, variantes: seeded };
}

export function getBookFormats(book) {
  const variantes = ensureBookVariantes(book).variantes.filter(v => v.habilitado && v.precio > 0);
  if (variantes.length) return [...new Set(variantes.map(v => v.label))];
  if (Array.isArray(book.formatos_disponibles) && book.formatos_disponibles.length) return book.formatos_disponibles;
  return [
    book.formato_a4 !== false ? 'A4' : null,
    book.formato_a5 ? 'A5' : null
  ].filter(Boolean);
}

export function getBookCombinations(book) {
  return ensureBookVariantes(book).variantes
    .filter(v => v.habilitado && Number(v.precio) > 0)
    .map(v => ({
      key: v.id,
      id: v.id,
      label: v.label,
      formato: v.label,
      color: Boolean(v.color),
      precio: Number(v.precio) || 0,
      paginas_por_hoja: Number(v.paginas_por_hoja) || 2,
      variante: v
    }));
}

export function getMinPrice(book) {
  const combos = getBookCombinations(book);
  return combos.length ? Math.min(...combos.map(c => c.precio)) : 0;
}

export function findVariante(book, idOrVariante) {
  if (idOrVariante && typeof idOrVariante === 'object' && idOrVariante.id) return normalizeVariante(idOrVariante);
  const variantes = ensureBookVariantes(book).variantes;
  return variantes.find(v => v.id === idOrVariante) || null;
}

/** Resuelve una variante por su label libre ("A4 B/N", "A4 vertical", "A5"). */
function resolveVarianteByLabel(book, token, wantsColor = null) {
  const target = slug(String(token || '').toLowerCase());
  if (!target) return null;
  const variantes = ensureBookVariantes(book).variantes;
  const matches = variantes.filter(v => {
    const label = slug(String(v.label || '').toLowerCase());
    return label === target || label.includes(target) || target.includes(label);
  });
  if (!matches.length) return null;
  if (wantsColor !== null) {
    const byColor = matches.filter(v => Boolean(v.color) === Boolean(wantsColor));
    if (byColor.length) return byColor[0];
  }
  return matches.find(v => v.habilitado && Number(v.precio) > 0) || matches[0];
}

export function calcSugerido(paginas, formato, config, paginasPorHoja = 2) {
  const hojas = HOJAS(paginas, paginasPorHoja);
  let sub;
  if (formato === 'A5') {
    sub = hojas * Number(config.precios?.A5?.unico || 49);
  } else {
    sub = hojas * Number(hojas >= 50 ? config.precios?.A4?.mas_50 || 70 : config.precios?.A4?.menos_50 || 90);
  }
  if (hojas >= (config.encuadernacion?.umbral_anillado_hojas || 40)) {
    sub += Number(config.encuadernacion?.basica || 600);
  }
  return sub;
}

function sugeridoForVariante(variante, paginas, config) {
  const pph = Number(variante.paginas_por_hoja) || 2;
  if (variante.id === 'a4_bn' || (/^a4/i.test(variante.id) && !variante.color)) {
    return calcSugerido(paginas, 'A4', config, pph);
  }
  if (variante.id === 'a5_bn' || (/^a5/i.test(variante.id) && !variante.color)) {
    return calcSugerido(paginas, 'A5', config, pph);
  }
  return Number(variante.sugerido) || 0;
}

export function migrateBook(book, config) {
  let base = { ...book };
  if (!('paginas_por_hoja' in base)) base.paginas_por_hoja = 2;
  if (!('pdf_url' in base)) base.pdf_url = '';
  if (!('a4_bn_habilitado' in base) && !(Array.isArray(base.variantes) && base.variantes.length)) {
    const a4s = calcSugerido(base.paginas, 'A4', config);
    const a5s = calcSugerido(base.paginas, 'A5', config);
    base = {
      ...base,
      activo: base.activo !== false,
      a4_bn_habilitado: base.formato_a4 !== false,
      a4_bn_sugerido: a4s, a4_bn_ajuste: 0, a4_bn_final: a4s,
      a4_color_habilitado: (base.formato_a4 !== false) && Number(base.precio_color) > 0,
      a4_color_final: Number(base.precio_color) || 0,
      a5_bn_habilitado: Boolean(base.formato_a5),
      a5_bn_sugerido: a5s, a5_bn_ajuste: 0, a5_bn_final: a5s,
      a5_color_habilitado: false, a5_color_final: 0
    };
  }
  return mirrorLegacyColumns(ensureBookVariantes(base, config));
}

export function recalcBookSugeridos(book, config) {
  const ensured = ensureBookVariantes(book, config);
  const variantes = ensured.variantes.map(v => {
    if (v.id !== 'a4_bn' && v.id !== 'a5_bn') return v;
    const sugerido = sugeridoForVariante(v, ensured.paginas, config);
    const oldSugerido = Number(v.sugerido) || 0;
    const ajuste = (Number(v.precio) || 0) - oldSugerido;
    return { ...v, sugerido, precio: sugerido + (Number.isFinite(ajuste) ? ajuste : 0) };
  });
  return mirrorLegacyColumns({ ...ensured, variantes });
}

export function newVarianteId(label = 'custom') {
  const base = slug(label).replace(/\s+/g, '-').slice(0, 24) || 'custom';
  return `${base}-${Date.now().toString(36).slice(-4)}`;
}

export function bookCareerId(book) {
  return book.id_carrera || slug(book.carrera);
}

export function getCareers(config, books = []) {
  const configured = Array.isArray(config.carreras) ? config.carreras : [];
  const fromBooks = books.map(book => ({
    id_carrera: bookCareerId(book),
    nombre: book.carrera,
    universidad: book.universidad || '',
    direccion_entrega: config.facultad?.lugar || 'Dirección de facultad según carrera',
    ventanas: []
  }));
  const byId = new Map([...fromBooks, ...configured].map(career => [career.id_carrera || slug(career.nombre), career]));
  return [...byId.values()].filter(career => career.nombre).sort((a, b) => careerLabel(a).localeCompare(careerLabel(b)));
}

export function getEspiralSize(hojas, config) {
  const espirales = config?.encuadernacion?.espirales || [
    { hasta: 70, size: '9 mm' },
    { hasta: 100, size: '12 mm' },
    { hasta: 120, size: '14 mm' },
    { hasta: 150, size: '17 mm' },
    { hasta: 220, size: '25 mm' },
    { hasta: 999, size: '40 mm' }
  ];
  for (const e of espirales) {
    if (hojas <= e.hasta) return e.size;
  }
  return 'N/A';
}

export function getCareer(config, books, id) {
  const careers = getCareers(config, books);
  return careers.find(career => (career.id_carrera || slug(career.nombre)) === id) || careers[0] || null;
}

export function careerLabel(career) {
  return career ? `${career.nombre}${career.universidad && !career.nombre.includes(career.universidad) ? ` · ${career.universidad}` : ''}` : '';
}

export function careerAddress(career, config) {
  return career?.direccion_entrega || config.carreras?.[0]?.direccion_entrega || config.facultad?.lugar || 'Dirección de facultad según carrera';
}

// ─── Agenda de turnos de retiro (ventanas por día) ──────────────────
// `career.ventanas[]` = horarios en los que el alumno pasa a retirar en el local.
// Cada item: { dia: 0-6 (numeración getDay, 0 = domingo), horario: 'HH:MM', turno, label, activa }.
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
// Orden de lectura en la UI (lunes primero). `dia` sigue getDay(): 1..6, 0 = domingo.
export const DIAS_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 'manana' si la hora es antes de las 13:00, si no 'tarde'. */
export function turnoFromHorario(horario) {
  const hora = Number(String(horario || '').split(':')[0]);
  return Number.isFinite(hora) && hora < 13 ? 'manana' : 'tarde';
}

export function buildVentana(dia, horario, activa = true) {
  const d = Number(dia);
  const h = String(horario || '').trim();
  return { dia: d, horario: h, turno: turnoFromHorario(h), label: DIAS[d] || '', activa: activa !== false };
}

/** Valida, deduplica (día+hora), deriva turno/label y ordena (día, luego hora) las ventanas. */
export function normalizeVentanas(ventanas) {
  const seen = new Set();
  const out = [];
  for (const v of (Array.isArray(ventanas) ? ventanas : [])) {
    if (!v) continue;
    const dia = Number(v.dia);
    if (!(Number.isInteger(dia) && dia >= 0 && dia <= 6)) continue;
    const horario = String(v.horario || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(horario)) continue;
    const key = `${dia}|${horario}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(buildVentana(dia, horario, v.activa));
  }
  out.sort((a, b) => DIAS_ORDER.indexOf(a.dia) - DIAS_ORDER.indexOf(b.dia) || a.horario.localeCompare(b.horario));
  return out;
}

/** Suma 1 hora a un 'HH:MM' (sugiere el siguiente turno al agregar). */
export function nextHorario(horario) {
  const [h, m] = String(horario || '19:00').split(':').map(Number);
  const total = (((Number.isFinite(h) ? h : 19) * 60) + (Number.isFinite(m) ? m : 0) + 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Modalidad única actual: el alumno retira en el local físico (cerca de la facultad). */
export const RETIRO_LOCAL = 'Retiro en local';
/** Legacy: la modalidad "Retiro facultad" del modelo anterior (retiro en la facultad). */
const LEGACY_RETIRO_FACULTAD = 'Retiro facultad';

/**
 * ¿La modalidad es retiro en el local? Acepta la actual (RETIRO_LOCAL) y la
 * legacy ("Retiro facultad") para no romper pedidos viejos guardados.
 */
export function isRetiroLocal(modalidad) {
  return !modalidad || modalidad === RETIRO_LOCAL || modalidad === LEGACY_RETIRO_FACULTAD;
}

/**
 * Lugar del local físico (config.local.nombre + config.local.direccion).
 * Devuelve "Nombre — Dirección", solo dirección, solo nombre, o '' si está vacío
 * (para que el caller caiga al fallback de facultad como placeholder).
 */
export function localPlace(config) {
  const nombre = String(config?.local?.nombre || '').trim();
  const direccion = String(config?.local?.direccion || '').trim();
  if (nombre && direccion) return `${nombre} — ${direccion}`;
  return direccion || nombre || '';
}

export function deliveryPlaceFor(modalidad, career, config) {
  if (modalidad === 'Retiro domicilio') return 'Chijra, se coordina por WhatsApp';
  if (modalidad === 'Cadete') return 'Se coordina por WhatsApp';
  // Retiro en el local (actual o legacy): el lugar es el local físico.
  return localPlace(config) || careerAddress(career, config);
}

/**
 * Lugar de retiro para los MENSAJES de WhatsApp, resuelto AL MOMENTO DE GENERAR.
 * `order.lugar_entrega` se guarda al crear el pedido: los pedidos viejos (o creados
 * con el local sin configurar) traen la dirección de la facultad heredada del modelo
 * anterior. Acá se usa SIEMPRE la config vigente: retiro en local → el local físico;
 * si no hay nombre/dirección cargados → la frase fija `LUGAR_FALLBACK` ("nuestro
 * local") — **nunca '' y nunca la facultad**, así el mensaje no queda a criterio de
 * la IA ni tira texto roto. Modalidades heredadas (Cadete / domicilio) conservan su
 * texto guardado.
 */
export function lugarRetiro(order = {}, config) {
  const guardado = String(order?.lugar_entrega ?? '').trim();
  if (config && isRetiroLocal(order?.modalidad)) return localPlace(config) || LUGAR_FALLBACK;
  return guardado || LUGAR_FALLBACK;
}

export function roundTotal(value, config) {
  const base = Number(value || 0);
  const multiple = config?.redondeo?.multiplo ?? 1;
  if (multiple <= 1) return base;
  if (window.roundingUtils?.roundToMultiple) {
    return window.roundingUtils.roundToMultiple(base, multiple);
  }
  return Math.ceil(base / multiple) * multiple;
}

/**
 * Precio de un ítem.
 * - Nuevo: calcPrecioItem(libro, varianteObjeto|varianteId, encuadernacion, config, express?)
 *   (si el 2do arg es un objeto variante, el 5to es express)
 * - Legacy: calcPrecioItem(libro, 'A4'|'A5'|label, encuadernacion, config, color, express?)
 *   (si el 2do arg es string, el 5to es color y el 6to express)
 */
export function calcPrecioItem(libro, formatoOrVariante, encuadernacion, config, colorOrExpress = false, express = false) {
  const book = ensureBookVariantes(libro, config);
  let variante = null;
  let isExpress = express;

  if (formatoOrVariante && typeof formatoOrVariante === 'object') {
    variante = normalizeVariante(formatoOrVariante, Number(book.paginas_por_hoja) || 2);
    isExpress = Boolean(colorOrExpress) || express;
  } else if (typeof formatoOrVariante === 'string') {
    const token = String(formatoOrVariante).trim();
    // Firma legacy: string ('A4', 'A5', 'A4 B/N', id de variante) → 5to arg = color, 6to = express
    const wantsColor = Boolean(colorOrExpress);
    isExpress = express;

    variante = findVariante(book, token) || resolveVarianteByLabel(book, token, wantsColor);
    if (!variante && /^a[45]/i.test(token)) {
      const fmtKey = /^a5/i.test(token) ? 'a5' : 'a4';
      const comboKey = `${fmtKey}_${wantsColor ? 'color' : 'bn'}`;
      variante = findVariante(book, comboKey);
      if (!variante) {
        const pph = Number(book.paginas_por_hoja) || 2;
        const hojas = HOJAS(book.paginas, pph);
        let subtotal = wantsColor && Number(book.precio_color) > 0
          ? Number(book.precio_color)
          : calcSugerido(book.paginas, fmtKey.toUpperCase(), config, pph);
        const tipo = hojas >= (config.encuadernacion?.umbral_anillado_hojas || 40) ? 'anillado' : 'abrochado';
        if (isExpress) subtotal = Math.round(subtotal * (1 + (Number(config.produccion?.recargo_express_pct) || 20) / 100));
        return { hojas, subtotal, total: subtotal, tipo, varianteId: comboKey };
      }
    }
  }

  if (!variante) {
    const combos = getBookCombinations(book);
    variante = combos[0]?.variante || null;
  }

  const pph = Number(variante?.paginas_por_hoja) || Number(book.paginas_por_hoja) || 2;
  const hojas = HOJAS(book.paginas, pph);
  let precioFinal = Number(variante?.precio) || 0;
  if (!precioFinal && book.paginas > 0 && variante) {
    precioFinal = sugeridoForVariante(variante, book.paginas, config);
  }
  if (isExpress) {
    precioFinal = Math.round(precioFinal * (1 + (Number(config.produccion?.recargo_express_pct) || 20) / 100));
  }
  const tipo = hojas >= (config.encuadernacion?.umbral_anillado_hojas || 40) ? 'anillado' : 'abrochado';
  return { hojas, subtotal: precioFinal, total: precioFinal, tipo, varianteId: variante?.id || null };
}

export function computeOrderStatus(montoPagado) {
  return montoPagado > 0 ? 'Pendiente de impresión' : 'Pendiente de pago';
}

export function fechaLabel(fecha, offset) {
  if (offset === 0) return 'Hoy';
  if (offset === 1) return 'Manana';
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
}

/**
 * ¿La hora pactada de retiro es un 'HH:MM' válido? Todo lo que no lo sea
 * ('', 'A coordinar', 'manana', basura legacy) se trata como SIN HORA.
 * Es la única puerta de entrada para decidir si un pedido está agendado con
 * hora: nada inventa horarios (ni '10:00' ni '19:00').
 */
export function tieneHora(h) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(h ?? '').trim());
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/**
 * Quita el "a las …" que queda colgando cuando no hay hora pactada:
 * "…el lunes 27 a las a coordinar…" → "…el lunes 27 (horario a coordinar)…".
 * Solo se aplica cuando NO hay hora válida (si la hay, no toca nada).
 */
function cierraSinHora(msg) {
  return String(msg).replace(/\s*a las a coordinar\b/gi, ' (horario a coordinar)');
}

export function buildOrder(items, form, slot, config, career, metodoPago = 'talo') {
  const pages = items.reduce((acc, item) => acc + item.paginas, 0);
  const hojas = items.reduce((acc, item) => acc + item.hojas, 0);
  const subtotal = items.reduce((acc, item) => acc + item.precio, 0);
  const total = roundTotal(subtotal, config);
  const montoPagado = form.pago === 'sena' ? roundTotal(total * 0.5, config) : total;
  const saldo = Math.max(0, total - montoPagado);
  const id = `P${String(Date.now()).slice(-6)}`;
  const modalidad = isRetiroLocal(form.modalidad) ? RETIRO_LOCAL : (form.modalidad || RETIRO_LOCAL);
  return {
    id,
    nombre: form.nombre,
    whatsapp: normalizePhone(form.whatsapp),
    items: items.map(item => ({ ...item, estado: metodoPago === 'transferencia' ? 'Pendiente de pago' : computeOrderStatus(montoPagado) })),
    libro: items.map(item => item.titulo).join(' + '),
    carrera: [...new Set(items.map(item => item.carrera))].join(' / '),
    id_carrera: career?.id_carrera || items[0]?.id_carrera || '',
    materia: [...new Set(items.map(item => item.materia))].join(' / '),
    formato: [...new Set(items.map(item => `${item.formato || ''}${item.express ? ' Express' : ''}`.trim()))].join(' / '),
    paginas: pages,
    hojas,
    subtotal,
    total,
    monto_pagado: montoPagado,
    saldo_pendiente: saldo,
    pago_modalidad: form.pago,
    metodo_pago: metodoPago,
    estado: metodoPago === 'transferencia' ? 'Pendiente de pago' : computeOrderStatus(montoPagado),
    fecha: slot ? slot.fecha : '',
    turno: slot ? slot.turno : '',
    modalidad_entrega: modalidad,
    express: items.some(item => item.express),
    ventana_retiro: slot
      ? [slot.label || fechaLabel(slot.fecha, slot.dOffset), tieneHora(slot.horario) ? slot.horario : 'A coordinar'].filter(Boolean).join(' · ')
      : 'Se coordina por WhatsApp',
    lugar_entrega: deliveryPlaceFor(modalidad, career, config),
    horario_entrega: slot && tieneHora(slot.horario) ? String(slot.horario).trim() : '',
    talo_ref: metodoPago === 'transferencia' ? `TRANSF-${id}` : `TALO-${id}`,
    ts: new Date().toISOString()
  };
}

export function orderPagesForCapacity(order) {
  if (!['Pendiente de impresión', 'Imprimiendo', 'Para encuadernar', 'Listo'].includes(order.estado)) return 0;
  if (order.excede_capacidad && order.hojas_primera_entrega != null) {
    return Number(order.hojas_primera_entrega || 0);
  }
  return Number(order.hojas || 0);
}

export function deriveOrderEstado(items) {
  if (!items || items.length === 0) return 'Pendiente de impresión';
  const states = items.map(i => i.estado).filter(Boolean);
  if (states.length === 0) return 'Pendiente de impresión';
  for (const state of ORDER_STATES) {
    if (states.includes(state)) return state;
  }
  return states[0];
}

/**
 * CatáLOGO COMPLETO (modo "completo" del toggle de Ajustes): la versión
 * anterior, una ficha por libro activo con todo el detalle. Es lo que se le
 * mandaba a Gemini antes del filtrado previo: ~7.000 chars con 69 libros.
 */
export function buildParserCatalogFull(books) {
  const activos = (books || []).filter(b => b && b.activo !== false && b.titulo);
  return activos.map(book => {
    const combos = getBookCombinations(book);
    const hojas = HOJAS(book.paginas, book.paginas_por_hoja || 2);
    const formatos = combos.length ? combos.map(c => c.label).join(', ') : 'sin variantes';
    return `- [${book.titulo}] | Hojas: ${hojas} | Págs: ${book.paginas || 0} | Formatos: ${formatos} | Precio desde: ${fmt(getMinPrice(book))}`;
  }).join('\n');
}

/** Tokens del mensaje (sin acentos). Palabras cortas salvo números, que suelen ser clave ("42"). */
function parserTokens(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t && (t.length >= 3 || /^\d+$/.test(t)));
}

/**
 * Saca del mensaje lo que no es nombre de libro antes de puntuar: teléfonos,
 * horarios, montos y cantidades. Sin esto, "16:30" o "+54 9 388 581-1006"
 * matchean dígitos que tienen títulos como "Fallos - 19 Fallos" y entran en
 * las fichas libros de Medicina que nadie pidió.
 */
export function mensajeSinRuidoParaScore(text) {
  return String(text || '')
    // horarios: 16:30, 18.30
    .replace(/\b\d{1,2}[:.]\d{2}\b/g, ' ')
    // "18hs", "16 hs", "18 horas"
    .replace(/\b\d{1,2}\s?(?:hs|horas)\b/gi, ' ')
    // teléfonos / números largos: +54 9 388 586-4133, 3886 51-7246, 3885864133
    .replace(/\+?\d[\d\s\-().]{7,}\d/g, ' ')
    // montos con separador de miles: $9.600 / 12.500 / 1,200
    .replace(/[$]?\s?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?/g, ' ')
    // "5mil", "5000 pesos", "2 copias"
    .replace(/\b\d+\s?(?:mil|k|pesos|copias|copia|hojas|paginas|páginas)\b/gi, ' ')
    // estados de pago que aportan ruido
    .replace(/\b(?:pagado|pago|seña|sena|transferi|transferido|abonado)\b/gi, ' ');
}

/**
 * Catálogo compacto para el parser IA.
 *
 * Hoy el 100% del catálogo se mandaba con ficha completa (título, materia,
 * hojas, páginas, formatos, precio). Con 70+ libros eso es miles de tokens de
 * ruido cuando el alumno menciona uno solo, y Gemini se confunde más.
 *
 * Estrategia: score local por palabras del mensaje y mandar
 *   1. "FICHAS": detalle de los `maxDetalle` candidatos más probables.
 *   2. "ÍNDICE": el resto solo como `título` (sigue pudiendo elegir cualquiera,
 *      pero sin ficha larga; el precio no hace falta: el app recalcula todo lo
 *      que matchea contra su catálogo local). El emparejamiento final contra la
 *      DB lo hace la app por slug, así que hojas/páginas tampoco dependen de Gemini.
 *
 * El score usa IDF liviano: un token que aparece en casi todos los libros
 * ("libro", "materia", "apuntes") no aporta puntos; uno raro ("42",
 * "constitucional") vale más. Bonus fuerte si el título completo está en el
 * mensaje.
 */
export function buildParserCatalog(books, mensaje = '', { maxDetalle = 10 } = {}) {
  const activos = (books || []).filter(b => b && b.activo !== false && b.titulo);
  if (!activos.length) return { texto: '', seleccionados: [], conFicha: 0, enIndice: 0 };

  const limpio = mensajeSinRuidoParaScore(mensaje);
  const tokens = parserTokens(limpio);
  const msgSlug = slug(limpio);
  const haystacks = activos.map(book => slug([book.titulo, book.materia, book.carrera, book.autor].filter(Boolean).join(' ')));

  // IDF: cuántos libros contienen cada token (0 = no aparece → no aporta)
  const df = new Map();
  for (const t of tokens) df.set(t, haystacks.reduce((n, hay) => (hay.includes(t) ? n + 1 : n), 0));

  const scored = activos.map((book, i) => {
    const hay = haystacks[i];
    let score = 0;
    for (const t of tokens) {
      if (!hay.includes(t)) continue;
      const ratio = df.get(t) / activos.length;
      if (ratio >= 0.6) continue; // token genérico del catálogo
      score += (1 - ratio) * (t.length >= 5 ? 2 : 1);
    }
    const tituloSlug = slug(book.titulo);
    if (tituloSlug.length >= 6 && msgSlug.includes(tituloSlug)) score += 10;
    return { book, score };
  }).sort((a, b) => b.score - a.score || String(a.book.titulo).localeCompare(String(b.book.titulo), 'es'));

  const porScore = scored.filter(s => s.score > 0).slice(0, maxDetalle).map(s => s.book);
  const seleccionados = porScore.length ? porScore : scored.slice(0, maxDetalle).map(s => s.book);
  const usados = new Set(seleccionados.map(b => b.id || b.titulo));

  const fichas = seleccionados.map(book => {
    const combos = getBookCombinations(book);
    const hojas = HOJAS(book.paginas, book.paginas_por_hoja || 2);
    const formatos = combos.length ? combos.map(c => c.label).join(', ') : 'sin variantes';
    return `- ${book.titulo}${book.materia ? ` (${book.materia})` : ''} | Hojas: ${hojas} | Formatos: ${formatos} | desde ${fmt(getMinPrice(book))}`;
  });

  const indice = activos
    .filter(b => !usados.has(b.id || b.titulo))
    .map(b => `- ${b.titulo}`);

  const partes = [`FICHAS (elegí por título exacto):\n${fichas.join('\n')}`];
  if (indice.length) partes.push(`ÍNDICE (resto de títulos):\n${indice.join('\n')}`);
  return { texto: partes.join('\n\n'), seleccionados, conFicha: fichas.length, enIndice: indice.length };
}

/**
 * Selector de modo (toggle de Ajustes → `config.prompts.catalogo_modo`):
 * - 'compacto' (default): filtrado previo sin IA, 10 fichas + índice.
 * - 'completo': todo el catálogo con ficha completa (como antes del filtrado).
 */
export function buildParserCatalogForMode(books, mensaje = '', modo = 'compacto') {
  if (modo === 'completo') return { texto: buildParserCatalogFull(books), modo: 'completo', conFicha: 0, enIndice: 0 };
  return { ...buildParserCatalog(books, mensaje), modo: 'compacto' };
}

/**
 * Arma el prompt final del Parser WhatsApp desde el template editable
 * (Ajustes → Prompt de Gemini). Tokens: {{fecha}}, {{mensaje}}, {{catalogo}}.
 *
 * Redes de seguridad: si el template editado borró algún token, se anexa esa
 * parte igual; y si borró el bloque JSON de salida, se re-anexa (sin eso el
 * parser no puede interpretar la respuesta).
 */
export function buildParserPrompt(template, { fecha = '', mensaje = '', catalogo = '' } = {}) {
  const base = String(template || '').trim() || DEFAULT_PARSER_PROMPT;
  let prompt = base
    .split('{{fecha}}').join(fecha)
    .split('{{mensaje}}').join(mensaje)
    .split('{{catalogo}}').join(catalogo);

  const extras = [];
  if (!base.includes('{{mensaje}}')) extras.push(`MENSAJE DEL ALUMNO: "${mensaje}"`);
  if (!base.includes('{{catalogo}}')) extras.push(`CATÁLOGO:\n${catalogo}`);
  if (!base.includes('{{fecha}}')) extras.push(`HOY ES: ${fecha}`);
  if (extras.length) prompt = `${prompt}\n\n${extras.join('\n\n')}`;
  if (!base.includes('"libro"')) prompt = `${prompt}\n\n${PARSER_OUTPUT_SCHEMA}`;
  return prompt;
}

/**
 * Arma el prompt del RECORDATORIO de WhatsApp (día del retiro: "pedido listo, te
 * esperamos hoy a las X"). Mismo patrón que el parser: el template vive en
 * `config.prompts.wa_aviso` (editable en Ajustes → Prompts de Gemini, sección 2);
 * vacío → DEFAULT_WA_PROMPT. Acá se resuelven los tokens con los datos del pedido y
 * el resultado se manda a la Edge Function (que, si no llega el prompt, usa su copia
 * de respaldo). Nota: el mensaje de CONFIRMACIÓN de carga NO usa esta función con IA
 * — es una plantilla fija (ver buildConfirmationMessage).
 */
export function buildWaPrompt(template, data = {}) {
  const base = String(template || '').trim() || DEFAULT_WA_PROMPT;
  const hoy = new Date().toLocaleDateString('es-AR');
  const libros = Array.isArray(data?.libros) ? data.libros : [];
  const contextoLibros = libros
    .map(l => `- [${l?.titulo ?? ''}] | Hojas: ${l?.hojas ?? 0} | Págs: ${l?.paginas ?? 0} | Precio: $${l?.precio ?? 0}`)
    .join('\n');
  const lugar = String(data?.lugar_entrega ?? '').trim() || LUGAR_FALLBACK;
  const hora = String(data?.hora ?? '').trim() || String(data?.horario_entrega ?? '').trim() || 'a coordinar';
  const saldo = Number(data?.saldo) || 0;
  const saldoTexto = saldo > 0
    ? `El saldo pendiente es $${saldo}. Decile el monto total a abonar al retirar.`
    : 'Ya tiene todo pagado, no menciones dinero.';
  const msg = base
    .split('{{fecha_pedido}}').join(String(data?.fecha || 'no especificada'))
    .split('{{fecha}}').join(hoy)
    .split('{{hora}}').join(hora)
    .split('{{nombre}}').join(String(data?.nombre ?? ''))
    .split('{{telefono}}').join(String(data?.whatsapp ?? ''))
    .split('{{libros}}').join(contextoLibros || '—')
    .split('{{lugar}}').join(lugar)
    .split('{{saldo}}').join(saldoTexto);
  return tieneHora(hora) ? msg : cierraSinHora(msg);
}

/**
 * "Jueves 25/10" (día de la semana + día/mes) desde una fecha ISO 'YYYY-MM-DD'.
 * Devuelve la fecha cruda si no se puede parsear, o 'a coordinar' si está vacía.
 */
function fechaAmigable(fecha) {
  const raw = String(fecha || '').trim();
  if (!raw) return 'a coordinar';
  const parts = raw.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return raw;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day, 12, 0, 0);
  const dia = DIAS[d.getDay()] || '';
  return `${dia} ${day}/${String(month).padStart(2, '0')}`.trim();
}

/**
 * Mensaje de CONFIRMACIÓN de carga (plantilla FIJA, SIN IA). Se arma al crear el
 * pedido y entra como PENDIENTE al tab Avisos WA. Resuelve unos pocos tokens locales;
 * NO llama a Gemini. Firma: (order, config?, template?).
 * Tokens: {{nombre}} {{fecha}} {{fecha_larga}} {{hora}} {{lugar}}
 * El {{lugar}} sale de `lugarRetiro(order, config)` (config vigente, no el valor
 * guardado al crear → los pedidos viejos ya no dicen "facultad").
 */
export function buildConfirmationMessage(order = {}, config, template) {
  const base = String(template || '').trim() || CONFIRMATION_TEMPLATE;
  const fecha = String(order.fecha || '').trim();
  const hora = String(order.horario_entrega ?? '').trim();
  const msg = base
    .split('{{nombre}}').join(String(order.nombre ?? ''))
    .split('{{fecha}}').join(fecha)
    .split('{{fecha_larga}}').join(fechaAmigable(fecha))
    .split('{{hora}}').join(hora || 'a coordinar')
    .split('{{lugar}}').join(lugarRetiro(order, config));
  return tieneHora(hora) ? msg : cierraSinHora(msg);
}

/**
 * Genera el RECORDATORIO (día del retiro) con IA vía la Edge Function. Devuelve el
 * texto o lanza error (el caller decide reintentar). Se usa desde el tab Avisos WA.
 */
export async function generateRecordatorio(order = {}, config) {
  const url = geminiEndpoint(config);
  if (!url) throw new Error('Sin endpoint de Gemini configurado');
  const items = Array.isArray(order.items) ? order.items : [];
  const librosPayload = items.length
    ? items.map(i => ({ titulo: i.titulo, hojas: i.hojas, paginas: i.paginas, precio: i.precio }))
    : [{ titulo: order.libro, hojas: order.hojas, paginas: order.paginas, precio: order.total }];
  const dataObj = {
    nombre: order.nombre,
    whatsapp: order.whatsapp,
    libros: librosPayload,
    fecha: order.fecha,
    hora: order.horario_entrega || '',
    lugar_entrega: lugarRetiro(order, config),
    saldo: Number(order.saldo_pendiente) || 0
  };
  const prompt = buildWaPrompt(config?.prompts?.wa_aviso, dataObj);
  const response = await fetch(`${url}?mode=generate-wa&data=${encodeURIComponent(JSON.stringify(dataObj))}&prompt=${encodeURIComponent(prompt)}`);
  if (!response.ok) throw new Error('Error generando el recordatorio');
  const result = await response.json();
  return result.msj_ws || null;
}

// ─── CALCULADORA DE PRECIOS (precio por página según contenido) ────────
// Cobro POR PÁGINA (no por hoja): una hoja puede tener texto de un lado e imagen
// del otro, así que se cobra cada página según su contenido. Sin recargo por impar
// (el papel va amortizado en la tarifa); `calculadora.redondear_impar` es un toggle
// apagado por default en Ajustes.

/** Categorías vigentes: config.calculadora.categorias o la semilla por defecto. */
export function getCategorias(config) {
  const cats = config?.calculadora?.categorias;
  return Array.isArray(cats) && cats.length ? cats : DEFAULT_CALC_CATEGORIAS;
}

/** Total de páginas cargadas en un PDF (suma de todas las categorías). */
export function calcPdfPaginas(paginasPorCat = {}) {
  return Object.values(paginasPorCat || {}).reduce((acc, n) => acc + Math.max(0, Number(n) || 0), 0);
}

/**
 * Precio de un PDF: Σ (páginas por categoría × tarifa).
 * Si `config.calculadora.redondear_impar` está activo y el total de páginas es impar,
 * agrega 1 página a la tasa MÁS BARATA (compensación por la hoja a medio usar).
 */
export function calcPdfPrecio(categorias, paginasPorCat = {}, config) {
  const base = (categorias || []).reduce((acc, c) => {
    const n = Math.max(0, Number(paginasPorCat?.[c?.id]) || 0);
    return acc + n * Math.max(0, Number(c?.precio) || 0);
  }, 0);
  if (config?.calculadora?.redondear_impar) {
    const total = calcPdfPaginas(paginasPorCat);
    if (total > 0 && total % 2 === 1) {
      const barata = (categorias || []).reduce((min, c) => {
        const p = Math.max(0, Number(c?.precio) || 0);
        return p < min ? p : min;
      }, Infinity);
      return Math.round(base + (Number.isFinite(barata) ? barata : 0));
    }
  }
  return Math.round(base);
}

/**
 * Costo de encuadernación de un pedido según el modo:
 *  - 'ninguna' → 0
 *  - 'todos'   → un solo costo si el total de hojas llega al umbral
 *  - 'cada'    → un costo por cada ítem que llegue al umbral
 * Se calcula SOLO sobre los ítems con `origen === 'calculadora'` (precio de página puro);
 * los del catálogo ya traen su encuadernación incluida en la variante → no se duplica.
 */
export function calcEncuadernacion(items, modo, config) {
  const calc = (items || []).filter(i => i?.origen === 'calculadora');
  const hojasDe = i => Math.max(0, Number(i?.hojas) || 0);
  const hojas = calc.reduce((acc, i) => acc + hojasDe(i), 0);
  const umbral = Number(config?.encuadernacion?.umbral_anillado_hojas || 40);
  const basica = Number(config?.encuadernacion?.basica || 600);
  let costo = 0;
  if (modo === 'todos') costo = hojas >= umbral ? basica : 0;
  else if (modo === 'cada') costo = calc.reduce((acc, i) => acc + (hojasDe(i) >= umbral ? basica : 0), 0);
  return {
    costo: Math.round(costo),
    hojas,
    size: modo === 'todos' && costo > 0 ? getEspiralSize(hojas, config) : null
  };
}

// URL del proxy de Gemini (Supabase Edge Function). `integraciones.GEMINI_ENDPOINT`
// es la clave actual; cae a la legacy `SHEETS_API_URL` para no romper configs viejas.
export function geminiEndpoint(config) {
  const integraciones = config?.integraciones || {};
  const url = integraciones.GEMINI_ENDPOINT || integraciones.SHEETS_API_URL || '';
  return String(url).trim();
}

/**
 * Saca la hora de un texto de observaciones: el horario de retiro ya se agenda
 * en su campo (`horario_entrega`), no tiene que duplicarse en notas. Limpia el
 * patrón que enseñaba el prompt viejo del parser ("🕒18hs") y menciones tipo
 * "a las 18 hs" que el modelo pueda colar.
 */
export function observacionesSinHora(texto) {
  return String(texto || '')
    .replace(/🕒\s*\d{1,2}(?::\d{2})?\s*(?:hs|horas)?/gi, '')          // patrón del prompt viejo
    .replace(/\b(?:a las\s+)?\d{1,2}(?::\d{2})?\s*(?:hs|horas)\b/gi, '') // "a las 18 hs" / "14hs"
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .replace(/^[\s,;·]+|[\s,;·]+$/g, '')                                // sobras al costado
    .trim();
}

export function extractTimeFromMessage(text) {
  if (!text) return null;
  const hrMatch = text.match(/(?:a\s+las?\s+)?(\d{1,2})(?::?(\d{2}))?\s*(?:hs|horas)\b/gi);
  if (hrMatch) {
    const m = text.match(/(?:a\s+las?\s+)?(\d{1,2})(?::?(\d{2}))?\s*(?:hs|horas)\b/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  const rangeMatch = text.match(/(?:de|entre)?\s*(\d{1,2})\s*(?:hasta|al?|a|y|-|–)\s*(\d{1,2})/i);
  if (rangeMatch) {
    let h = parseInt(rangeMatch[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  const looseMatch = text.match(/(?:a\s+las?\s+)(\d{1,2})(?!\d|:)/i);
  if (looseMatch) {
    let h = parseInt(looseMatch[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

export function normalizeOrder(order, config) {
  const estado = order.estado === 'Impreso' ? 'Listo' : order.estado;
  const modalidad = isRetiroLocal(order.modalidad_entrega) ? RETIRO_LOCAL : (order.modalidad_entrega || RETIRO_LOCAL);
  // Hora pactada: si no hay 'HH:MM' válido, queda SIN HORA ('') — nunca se
  // inventa un horario. Se rescata un 'turno' legacy con hora (parser viejo),
  // pero un turno categoría ('manana'/'tarde') no se cuela como hora.
  const horario = tieneHora(order.horario_entrega)
    ? String(order.horario_entrega).trim()
    : (tieneHora(order.turno) ? String(order.turno).trim() : '');
  const lugarGuardado = String(order.lugar_entrega || '').includes('Punto de entrega') ? '' : order.lugar_entrega;
  const items = (order.items || []).map(item => ({ ...item, estado: item.estado || estado || 'Pendiente de impresión' }));
  const derivedEstado = deriveOrderEstado(items);
  const total = order.total || 0;
  const autoSaldado = derivedEstado === 'Entregado';
  // Ventana de retiro: se cura el legacy de Pedido Nuevo que repetía el dato
  // ("14:30 · 14:30" o "A coordinar · A coordinar") → se rearma abajo.
  const partesVentana = String(order.ventana_retiro || '').split('·').map(s => s.trim());
  const ventanaRepetida = partesVentana.length === 2
    && partesVentana[0] && partesVentana[0] === partesVentana[1]
    && /^(\d{1,2}:\d{2}|a coordinar)$/i.test(partesVentana[0]);
  const ventana = ventanaRepetida ? '' : String(order.ventana_retiro || '').trim();
  return {
    ...order,
    items,
    estado: derivedEstado,
    monto_pagado: autoSaldado ? total : (order.monto_pagado ?? 0),
    saldo_pendiente: autoSaldado ? 0 : (order.saldo_pendiente ?? 0),
    modalidad_entrega: modalidad,
    ventana_retiro: ventana || (modalidad === 'Cadete' || modalidad === 'Retiro domicilio'
      ? 'Se coordina por WhatsApp'
      : [order.fecha, horario || 'A coordinar'].filter(Boolean).join(' · ')),
    lugar_entrega: lugarGuardado || localPlace(config) || config.carreras?.[0]?.direccion_entrega || 'Retiro en nuestro local',
    horario_entrega: horario,
    talo_ref: order.talo_ref || '',
    asistencia_confirmada: order.asistencia_confirmada || false,
    asistencia_ts: order.asistencia_ts || null
  };
}
