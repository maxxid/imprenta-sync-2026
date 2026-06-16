import { COMBO_KEYS, COMBO_LABELS, ORDER_STATES } from './constants.js';

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

export function getBookFormats(book) {
  if (Array.isArray(book.formatos_disponibles) && book.formatos_disponibles.length) return book.formatos_disponibles;
  if ('a4_bn_habilitado' in book) {
    const fmts = new Set();
    if (book.a4_bn_habilitado || book.a4_color_habilitado) fmts.add('A4');
    if (book.a5_bn_habilitado || book.a5_color_habilitado) fmts.add('A5');
    return [...fmts];
  }
  return [
    book.formato_a4 !== false ? 'A4' : null,
    book.formato_a5 ? 'A5' : null
  ].filter(Boolean);
}

export function getBookCombinations(book) {
  return COMBO_KEYS
    .filter(key => book[`${key}_habilitado`] && Number(book[`${key}_final`]) > 0)
    .map(key => ({ key, label: COMBO_LABELS[key], formato: key.startsWith('a4') ? 'A4' : 'A5', color: key.endsWith('color'), precio: Number(book[`${key}_final`]) }));
}

export function getMinPrice(book) {
  const combos = getBookCombinations(book);
  return combos.length ? Math.min(...combos.map(c => c.precio)) : 0;
}

export function calcSugerido(paginas, formato, config, paginasPorHoja = 2) {
  const hojas = HOJAS(paginas, paginasPorHoja);
  let sub = 0;
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

export function migrateBook(book, config) {
  if ('a4_bn_habilitado' in book) {
    const migrated = { ...book };
    if (!('paginas_por_hoja' in migrated)) migrated.paginas_por_hoja = 2;
    if (!('pdf_url' in migrated)) migrated.pdf_url = '';
    return migrated;
  }
  const a4s = calcSugerido(book.paginas, 'A4', config);
  const a5s = calcSugerido(book.paginas, 'A5', config);
  return {
    ...book,
    paginas_por_hoja: 2,
    pdf_url: '',
    activo: book.activo !== false,
    a4_bn_habilitado: book.formato_a4 !== false,
    a4_bn_sugerido: a4s, a4_bn_ajuste: 0, a4_bn_final: a4s,
    a4_color_habilitado: (book.formato_a4 !== false) && Number(book.precio_color) > 0,
    a4_color_final: Number(book.precio_color) || 0,
    a5_bn_habilitado: Boolean(book.formato_a5),
    a5_bn_sugerido: a5s, a5_bn_ajuste: 0, a5_bn_final: a5s,
    a5_color_habilitado: false, a5_color_final: 0
  };
}

export function recalcBookSugeridos(book, config) {
  const pph = Number(book.paginas_por_hoja) || 2;
  const a4s = calcSugerido(book.paginas, 'A4', config, pph);
  const a5s = calcSugerido(book.paginas, 'A5', config, pph);
  return {
    ...book,
    a4_bn_sugerido: a4s,
    a5_bn_sugerido: a5s
  };
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

export function deliveryPlaceFor(modalidad, career, config) {
  if (modalidad === 'Retiro domicilio') return 'Chijra, se coordina por WhatsApp';
  if (modalidad === 'Cadete') return 'Se coordina por WhatsApp';
  return careerAddress(career, config);
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

export function calcPrecioItem(libro, formato, encuadernacion, config, color, express = false) {
  const pph = Number(libro.paginas_por_hoja) || 2;
  const hojas = HOJAS(libro.paginas, pph);
  if ('a4_bn_habilitado' in libro) {
    const comboKey = `${formato.toLowerCase()}_${color ? 'color' : 'bn'}`;
    let precioFinal = Number(libro[`${comboKey}_final`] || 0);
    if (!precioFinal && libro.paginas > 0) {
      precioFinal = calcSugerido(libro.paginas, formato, config, pph);
    }
    const tipo = hojas >= config.encuadernacion.umbral_anillado_hojas ? 'anillado' : 'abrochado';
    return { hojas, subtotal: precioFinal, total: precioFinal, tipo };
  }
  let subtotal = 0;
  if (color && Number(libro.precio_color) > 0) {
    subtotal = Number(libro.precio_color);
  } else if (formato === 'A5') {
    subtotal = hojas * Number(config.precios?.A5?.unico || config.precios?.A5?.mas_50 || 49);
  } else {
    const key = hojas >= 50 ? 'mas_50' : 'menos_50';
    subtotal = hojas * Number(config.precios?.A4?.[key] || 0);
  }
  const tipo = hojas >= config.encuadernacion.umbral_anillado_hojas ? 'anillado' : 'abrochado';
  if (tipo === 'anillado') {
    subtotal += Number(config.encuadernacion.basica || 0);
  }
  return { hojas, subtotal, total: subtotal, tipo };
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

export function buildOrder(items, form, slot, config, career, metodoPago = 'talo') {
  const pages = items.reduce((acc, item) => acc + item.paginas, 0);
  const hojas = items.reduce((acc, item) => acc + item.hojas, 0);
  const subtotal = items.reduce((acc, item) => acc + item.precio, 0);
  const total = roundTotal(subtotal, config);
  const montoPagado = form.pago === 'sena' ? roundTotal(total * 0.5, config) : total;
  const saldo = Math.max(0, total - montoPagado);
  const id = `P${String(Date.now()).slice(-6)}`;
  const modalidad = form.modalidad || 'Retiro facultad';
  const hasWindow = modalidad === 'Retiro facultad' && slot;
  return {
    id,
    nombre: form.nombre,
    whatsapp: normalizePhone(form.whatsapp),
    items: items.map(item => ({ ...item, estado: metodoPago === 'transferencia' ? 'Pendiente de pago' : computeOrderStatus(montoPagado) })),
    libro: items.map(item => item.titulo).join(' + '),
    carrera: [...new Set(items.map(item => item.carrera))].join(' / '),
    id_carrera: career?.id_carrera || items[0]?.id_carrera || '',
    materia: [...new Set(items.map(item => item.materia))].join(' / '),
    formato: [...new Set(items.map(item => `${item.formato} ${item.color ? 'Color' : 'B/N'}${item.express ? ' Express' : ''}`))].join(' / '),
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
    ventana_retiro: slot ? `${slot.label || fechaLabel(slot.fecha, slot.dOffset)} · ${slot.horario}` : 'Se coordina por WhatsApp',
    lugar_entrega: deliveryPlaceFor(modalidad, career, config),
    horario_entrega: slot ? slot.horario : 'A coordinar',
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
  const modalidad = order.modalidad_entrega || 'Retiro facultad';
  const horario = order.horario_entrega || order.turno || '10:00';
  const lugarGuardado = String(order.lugar_entrega || '').includes('Punto de entrega') ? '' : order.lugar_entrega;
  const items = (order.items || []).map(item => ({ ...item, estado: item.estado || estado || 'Pendiente de impresión' }));
  const derivedEstado = deriveOrderEstado(items);
  return {
    ...order,
    items,
    estado: derivedEstado,
    modalidad_entrega: modalidad,
    ventana_retiro: order.ventana_retiro || (modalidad === 'Cadete' || modalidad === 'Retiro domicilio' ? 'Se coordina por WhatsApp' : `${order.fecha || ''} · ${horario}`),
    lugar_entrega: lugarGuardado || config.carreras?.[0]?.direccion_entrega || 'Dirección de facultad según carrera',
    horario_entrega: horario,
    talo_ref: order.talo_ref || '',
    asistencia_confirmada: order.asistencia_confirmada || false,
    asistencia_ts: order.asistencia_ts || null
  };
}
