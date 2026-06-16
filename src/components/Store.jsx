import React from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Icon } from './Icons';
import { Cover, Alert, Spinner, CareerCombobox, fechaLabel, buildWhatsAppMessage } from './UI';
import { fmt, slug, normalizePhone, getBookFormats, getBookCombinations, getMinPrice, HOJAS, calcPrecioItem, roundTotal, getCareers, getCareer, careerLabel, careerAddress, deliveryPlaceFor, getEspiralSize, computeOrderStatus, buildOrder, recalcBookSugeridos, bookCareerId } from '../lib/utils';
import { COMBO_LABELS, STORAGE, STATE_STYLES, STATE_LABELS } from '../lib/constants';
import { getSupabase, saveOrderToSupabase, updateOrderInSupabase, getNextSlots, getNextBusinessDay, saveLocal, copyToClipboard } from '../lib/supabase';

function isDeliveryDay(order) {
  if (!order.fecha) return false;
  const today = new Date().toISOString().split('T')[0];
  return order.fecha === today;
}

function needsAttendanceConfirmation(order) {
  const readyStates = ['Listo'];
  return readyStates.includes(order.estado) && isDeliveryDay(order) && !order.asistencia_confirmada;
}

async function confirmAttendance(order, setOrders, config) {
  const updated = {
    ...order,
    asistencia_confirmada: true,
    asistencia_ts: new Date().toISOString()
  };
  await updateOrderInSupabase(updated, config);
  setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
  syncOrderToSheets(updated, config);
  return updated;
}

async function rescheduleOrder(order, newFecha, newTurno, newHorario, newLabel, setOrders, config) {
  const updated = {
    ...order,
    fecha: newFecha,
    turno: newTurno,
    horario_entrega: newHorario,
    ventana_retiro: `${newLabel || newFecha} · ${newHorario}`,
    asistencia_confirmada: false,
    asistencia_ts: null
  };
  await updateOrderInSupabase(updated, config);
  setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
  syncOrderToSheets(updated, config);
  return updated;
}

async function generateWhatsAppMessageForOrder(order, config) {
  const url = config.integraciones?.SHEETS_API_URL;
  if (!url) return buildWhatsAppMessage(order);
  try {
    const librosPayload = order.items ? order.items.map(i => ({
      titulo: i.titulo,
      hojas: i.hojas,
      paginas: i.paginas,
      precio: i.precio
    })) : [{ titulo: order.libro, hojas: order.hojas, paginas: order.paginas, precio: order.total }];

    const data = JSON.stringify({
      nombre: order.nombre,
      whatsapp: order.whatsapp,
      libros: librosPayload,
      fecha: order.fecha,
      lugar_entrega: order.lugar_entrega || '',
      saldo: Number(order.saldo_pendiente) || 0
    });

    const sheetsBase = url;
    const response = await fetch(`${sheetsBase}?mode=generate-wa&data=${encodeURIComponent(data)}`);
    if (!response.ok) throw new Error('Error');
    const result = await response.json();
    if (result.msj_ws) return result.msj_ws;
  } catch (err) {
    console.warn('Fallo al generar mensaje con Gemini, usando fallback:', err);
  }
  return buildWhatsAppMessage(order);
}

async function syncOrderToSheets(order, config) {
  const url = config.integraciones?.SHEETS_API_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(order)
    });
  } catch (err) {
    console.error('Error sincronizando con Sheets:', err);
  }
}

function getOrdersByPhone(orders, phone) {
  const normalized = normalizePhone(phone);
  if (normalized.length < 8) return [];
  return orders.filter(order => normalizePhone(order.whatsapp) === normalized);
}

function HomeScreen({ books, config, carrito, onSelectLibro, catalogFilters, setCatalogFilters }) {
  const career = catalogFilters.career || '';
  const query = catalogFilters.query || '';
  const materiaSel = catalogFilters.materia || '';
  const setCareer = value => setCatalogFilters(current => ({ ...current, career: value, materia: '' }));
  const setQuery = value => setCatalogFilters(current => ({ ...current, query: value }));
  const setMateria = value => setCatalogFilters(current => ({ ...current, materia: current.materia === value ? '' : value }));
  const careers = getCareers(config, books);
  const selectedCareer = careers.find(item => item.id_carrera === career);
  const materias = [...new Set(books.filter(book => !career || bookCareerId(book) === career).map(book => book.materia))];

  const activeBooks = books.filter(book => book.activo !== false && getBookCombinations(book).length > 0);

  const filtered = activeBooks.filter(book => {
    const matchCareer = !career || bookCareerId(book) === career;
    const matchMateria = !materiaSel || book.materia === materiaSel;
    const q = slug(query);
    const matchQuery = !q || [book.titulo, book.materia, book.autor, book.carrera].some(field => slug(field).includes(q));
    return matchCareer && matchMateria && matchQuery;
  });

  const now = new Date();
  const warning = now.getHours() >= config.produccion.deadline_hora - 1 && now.getHours() < config.produccion.deadline_hora;
  const afterDeadline = now.getHours() >= config.produccion.deadline_hora;

  return (
    <div className="fade-in">
      <div className="hero-glow mb-6">
        <div className="relative z-10">
          <div className="text-xs font-semibold uppercase tracking-widest text-sky-300 mb-1">Imprenta Sync 2026</div>
          <h1 className="text-2xl font-black mb-1">Tus apuntes listos para retirar</h1>
          <p className="text-sky-100/70 text-sm mb-5">Elegí carrera, armá el carrito y confirmá con pago total o seña del 50%.</p>
        </div>
        {warning && <Alert type="warn"><Icon.Clock /><span>Pagando antes de las {config.produccion.deadline_hora}:00 hs conservás las ventanas próximas de tu carrera.</span></Alert>}
        {afterDeadline && <Alert type="info"><Icon.Clock /><span>El corte de hoy ya pasó. Si la ventana de mañana queda cerrada, elegí otro horario disponible.</span></Alert>}
      </div>

      <div className="card p-4 mb-4">
        <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Carrera</label>
            <CareerCombobox careers={careers} value={career} onChange={setCareer} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Buscar materia o libro</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"><Icon.Search /></span>
              <input className="input-field" style={{paddingLeft: '2.75rem'}} value={query} onChange={event => setQuery(event.target.value)} placeholder="Ej: Anatomia, Constitucional..." />
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {selectedCareer && <span className="badge bg-brand-muted text-brand-dark whitespace-nowrap">{selectedCareer.direccion_entrega}</span>}
          {materias.slice(0, 8).map(materia => (
            <button key={materia} onClick={() => setMateria(materia)} className={`badge whitespace-nowrap transition-colors ${materiaSel === materia ? 'bg-brand-DEFAULT text-white' : 'bg-ink-100 text-ink-500 hover:bg-brand-muted hover:text-brand-dark'}`}>
              {materia}
            </button>
          ))}
          {materias.length === 0 && <span className="text-xs text-ink-400">Elegí una carrera para ver materias relacionadas.</span>}
        </div>
      </div>

      <div className="card p-4 mb-5 border-dashed border-2 border-ink-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ink-100 flex items-center justify-center text-ink-500"><Icon.Upload /></div>
          <div className="flex-1">
            <div className="font-700 text-sm text-ink-800">¿Tu material no está en el catálogo?</div>
            <div className="text-xs text-ink-400 mt-0.5">Subí tu PDF propio, elegí formato y lo sumamos al carrito como cualquier libro.</div>
          </div>
          <button className="btn-secondary text-xs px-3 py-2" onClick={() => onSelectLibro({ id: `pdf-${Date.now()}`, titulo: 'PDF propio', materia: 'Material del alumno', carrera: selectedCareer?.nombre || 'Carrera a seleccionar', id_carrera: selectedCareer?.id_carrera || '', autor: 'Archivo subido', paginas: 80, paginas_por_hoja: 2, pdf_url: '', activo: true, a4_bn_habilitado: true, a4_bn_sugerido: 0, a4_bn_ajuste: 0, a4_bn_final: 0, a4_color_habilitado: false, a4_color_final: 0, a5_bn_habilitado: true, a5_bn_sugerido: 0, a5_bn_ajuste: 0, a5_bn_final: 0, a5_color_habilitado: false, a5_color_final: 0, imagen_url: 'https://placehold.co/420x520/E8ECF2/0D1117?text=PDF+Propio', isPdfPropio: true })}>
            <Icon.Upload /> Subir PDF
          </button>
        </div>
      </div>

      <div className="text-xs font-700 uppercase tracking-widest text-ink-400 mb-3">
        {selectedCareer ? careerLabel(selectedCareer) : 'Todas las carreras'} · {filtered.length} resultados · {carrito.length} en pedido
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map(book => {
          const combos = getBookCombinations(book);
          const minPrice = getMinPrice(book);
          const hojas = HOJAS(book.paginas, book.paginas_por_hoja || 2);
          const tipo = book.encuadernacion || (hojas >= config.encuadernacion.umbral_anillado_hojas ? 'anillado' : 'abrochado');
          return (
            <button key={book.id} onClick={() => onSelectLibro(book)} className="card p-4 text-left hover:bg-surface-hover hover:border-brand transition-all btn-press">
              <div className="grid grid-cols-[88px_1fr] gap-4 items-start">
                <Cover src={book.imagen_url} alt={book.titulo} />
                <div>
                  <span className="badge bg-ink-100 text-ink-500 mb-2">{book.carrera}</span>
                  <div className="font-700 text-sm text-ink-900 leading-tight mb-1">{book.titulo}</div>
                  <div className="text-xs text-ink-400 mb-1">{book.materia}</div>
                  <div className="text-xs text-ink-400 mb-3">{book.autor}</div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className={`badge ${tipo === 'anillado' ? 'tag-link' : 'tag-staple'}`}>{tipo === 'anillado' ? '🪢 Anillado' : '📎 Abrochado'}</span>
                    <span className="badge bg-ink-100 text-ink-500">{book.paginas} pags · {hojas} hojas · {book.paginas_por_hoja === 4 ? '4' : '2'} pág/hoja</span>
                    {combos.map(c => <span key={c.key} className={`badge ${c.color ? 'bg-accent-muted text-accent' : 'bg-brand-muted text-brand-dark'}`}>{c.label}</span>)}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-800 text-lg text-ink-900">Desde {fmt(minPrice)}</span>
                    <span className="text-xs font-700 text-brand-DEFAULT">Ver detalle</span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FichaScreen({ book, config, pedidos, carrito, onAgregar, onVolver }) {
  const combos = book.isPdfPropio ? [] : getBookCombinations(book);
  const [selectedCombo, setSelectedCombo] = React.useState(combos[0]?.key || 'a4_bn');
  const [pdfPages, setPdfPages] = React.useState(book.paginas || 80);
  const [pdfDetected, setPdfDetected] = React.useState(null);
  const [showPdfModal, setShowPdfModal] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [showExpressModal, setShowExpressModal] = React.useState(false);
  const [expressSlotSel, setExpressSlotSel] = React.useState(null);
  const [expressCartWarn, setExpressCartWarn] = React.useState(false);

  function handleAgregar(item, isExpress) {
    setToast({ msg: isExpress ? '⚡ Libro express agregado al pedido!' : '📚 Libro agregado al pedido!', type: 'ok' });
    setTimeout(() => setToast(null), 3700);
    setTimeout(() => onAgregar(item, isExpress), isExpress ? 600 : 400);
  }

  function handleComprarAhora() {
    onAgregar({
      id: `${workingBook.id}-${selectedCombo}-${Date.now()}`,
      libroId: book.id,
      titulo: workingBook.titulo,
      materia: workingBook.materia,
      carrera: workingBook.carrera,
      id_carrera: bookCareerId(workingBook),
      paginas: workingBook.paginas,
      hojas: pricing.hojas,
      formato,
      encuadernacion: 'basica',
      color,
      express: false,
      precio: pricing.total,
      tipo: pricing.tipo,
      imagen_url: workingBook.imagen_url,
      origen: book.isPdfPropio ? 'pdf-propio' : 'catalogo'
    }, true);
  }

  const workingBook = React.useMemo(() => {
    if (!book.isPdfPropio) return book;
    const b = { ...book, paginas: pdfPages };
    return recalcBookSugeridos(b, config);
  }, [book, pdfPages, config]);

  const combo = combos.find(c => c.key === selectedCombo) || combos[0];
  const formato = combo ? combo.formato : (selectedCombo.startsWith('a5') ? 'A5' : 'A4');
  const color = combo ? combo.color : selectedCombo.endsWith('color');
  const pricing = calcPrecioItem(workingBook, formato, 'basica', config, color);

  async function handlePdfFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      setPdfPages(pdf.numPages);
      setPdfDetected(pdf.numPages);
    } catch (err) {
      setPdfDetected(null);
    }
  }

  return (
    <div className="fade-in">
      <button onClick={onVolver} className="flex items-center gap-2 text-sm text-ink-400 hover:text-ink-700 mb-5 font-700">← Volver al catalogo</button>
      <div className="card p-6">
        <div className="grid gap-5 grid-cols-1 md:grid-cols-[240px_1fr]">
          <div className="space-y-3 w-full">
            <Cover src={workingBook.imagen_url} alt={workingBook.titulo} />
            {workingBook.pdf_url && (
              <button
                onClick={() => setShowPdfModal(true)}
                className="hidden md:flex w-full items-center justify-center gap-2 bg-ink-900 text-white dark:bg-ink-900 dark:text-black rounded-xl py-3 px-4 text-sm font-700 hover:bg-ink-800 dark:hover:bg-ink-200 transition-colors btn-press"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Ver muestra
              </button>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="badge text-xs bg-ink-100 text-ink-500">
                <Icon.Book /> {workingBook.carrera || 'Sin carrera'}
              </span>
              <span className="badge text-xs bg-ink-100 text-ink-500">{workingBook.paginas} pags · {HOJAS(workingBook.paginas, workingBook.paginas_por_hoja)} hojas</span>
            </div>
            <h1 className="text-xl font-800 text-ink-900 dark:text-white mb-1 leading-tight">{workingBook.titulo}</h1>
            <p className="text-sm text-ink-500 mb-2">{workingBook.materia || 'Sin materia'}</p>
            {workingBook.autor && <p className="text-sm text-ink-400 mb-4">{workingBook.autor}</p>}
            {workingBook.pdf_url && (
              <button
                onClick={() => setShowPdfModal(true)}
                className="md:hidden w-full flex items-center justify-center gap-2 bg-ink-900 text-white dark:bg-ink-900 dark:text-black rounded-xl py-3 px-4 text-sm font-700 hover:bg-ink-800 dark:hover:bg-ink-200 transition-colors btn-press mb-4"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Ver muestra
              </button>
            )}

            {book.isPdfPropio && (
              <div className="grid gap-4 md:grid-cols-[1fr_160px] mb-4">
                <div>
                  <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Archivo PDF</label>
                  <input className="input-field" type="file" accept="application/pdf" onChange={handlePdfFile} />
                  {pdfDetected && <div className="text-xs text-ok-DEFAULT font-700 mt-1">✓ {pdfDetected} páginas detectadas</div>}
                </div>
                <div>
                  <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Páginas</label>
                  <input className="input-field" type="number" min="1" value={pdfPages} onChange={event => setPdfPages(Number(event.target.value || 1))} />
                </div>
                <div className="text-xs text-ink-400 flex items-center gap-3 flex-wrap">
                  <span>🖨️ Doble faz</span>
                  <span>📄 Hojas 75gr</span>
                </div>
              </div>
            )}

            <div className={`rounded-2xl p-4 mb-4 ${(workingBook.encuadernacion || pricing.tipo) === 'anillado' ? 'bg-blue-50 border border-blue-100' : 'bg-emerald-50 border border-emerald-100'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{(workingBook.encuadernacion || pricing.tipo) === 'anillado' ? '🪢' : '📎'}</span>
                <span className={`font-700 text-base ${(workingBook.encuadernacion || pricing.tipo) === 'anillado' ? 'text-blue-800' : 'text-emerald-800'}`}>
                  {(workingBook.encuadernacion || pricing.tipo) === 'anillado' ? 'Anillado' : 'Abrochado'}
                </span>
              </div>
              <div className={`text-sm ${(workingBook.encuadernacion || pricing.tipo) === 'anillado' ? 'text-blue-700' : 'text-emerald-700'}`}>
                {workingBook.encuadernacion
                  ? `Configurado como ${workingBook.encuadernacion === 'anillado' ? 'anillado' : 'abrochado'} por el administrador.`
                  : pricing.tipo === 'anillado'
                    ? `Supera ${config.encuadernacion.umbral_anillado_hojas} hojas, por eso pasa a anillado.`
                    : `Tiene ${pricing.hojas} hojas y conserva el abrochado gratis.`}
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Combinación</label>
              <div className={`grid gap-3 ${book.isPdfPropio ? 'grid-cols-2' : `grid-cols-${Math.min(combos.length, 4)}`}`}>
                {book.isPdfPropio ? (
                  ['a4_bn', 'a5_bn'].map(key => (
                    <button key={key} onClick={() => setSelectedCombo(key)} className={`radio-tile ${selectedCombo === key ? 'active' : ''}`}>
                      <div className="font-700 text-sm">{COMBO_LABELS[key]}</div>
                      <div className="text-xs text-ink-400 mt-1">{fmt(Number(workingBook[`${key}_final`] || 0))}</div>
                    </button>
                  ))
                ) : (
                  combos.map(c => (
                    <button key={c.key} onClick={() => setSelectedCombo(c.key)} className={`radio-tile ${selectedCombo === c.key ? 'active' : ''}`}>
                      <div className="font-700 text-sm">{c.label}</div>
                      <div className="text-xs text-ink-400 mt-1">{fmt(c.precio)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="bg-ink-50 rounded-xl p-4 mb-2 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-500">{pricing.hojas} hojas · {formato} · {color ? 'Color' : 'B/N'}</span>
                <span className="font-600">{fmt(pricing.total)}</span>
              </div>
              <div className="flex justify-between font-800 text-lg border-t border-ink-200 pt-2">
                <span>Precio del libro</span>
                <span>{fmt(pricing.total)}</span>
              </div>
            </div>
            <div className="text-xs text-ink-400 mb-5">El redondeo (múltiplo de {fmt(config.redondeo.multiplo)}) se aplica al total del carrito.</div>

            <div className="space-y-3 mb-3">
              <button
                onClick={handleComprarAhora}
                className="w-full btn-primary text-base btn-press rounded-2xl h-14"
                disabled={pricing.total <= 0}
              >
                Comprar ahora - {fmt(pricing.total)}
              </button>
              <button
                onClick={() => handleAgregar({
                  id: `${workingBook.id}-${selectedCombo}-${Date.now()}`,
                  libroId: book.id,
                  titulo: workingBook.titulo,
                  materia: workingBook.materia,
                  carrera: workingBook.carrera,
                  id_carrera: bookCareerId(workingBook),
                  paginas: workingBook.paginas,
                  hojas: pricing.hojas,
                  formato,
                  encuadernacion: 'basica',
                  color,
                  express: false,
                  precio: pricing.total,
                  tipo: pricing.tipo,
                  imagen_url: workingBook.imagen_url,
                  origen: book.isPdfPropio ? 'pdf-propio' : 'catalogo'
                })}
                className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl border-2 border-brand-DEFAULT bg-brand-muted hover:bg-brand-muted/70 dark:bg-brand-muted dark:hover:bg-brand-muted/80 text-brand-dark dark:text-brand-light font-700 text-sm transition-all btn-press"
                disabled={pricing.total <= 0}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                Agregar al carrito
              </button>
            </div>

            {pricing.hojas <= (config.produccion.capacidad_express_paginas || 300) && (
              <>
                <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/70 p-4 mb-3">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl flex-shrink-0">⚡</span>
                    <div>
                      <div className="font-700 text-sm text-ink-800 mb-1">¿Necesitás prioridad de impresión?</div>
                      <ul className="text-xs text-ink-500 space-y-1">
                        <li>· Disponible para pedidos de un único libro.</li>
                        <li>· Producción prioritaria y entregas especiales sujetas a disponibilidad.</li>
                        <li>· Ideal para entregas con poca anticipación.</li>
                      </ul>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setExpressSlotSel(null);
                      setExpressCartWarn(false);
                      setShowExpressModal(true);
                    }}
                    className="w-full rounded-xl bg-orange-100 border border-orange-300 text-orange-800 font-700 text-sm py-2.5 hover:bg-orange-200 transition-colors"
                  >
                    Ver disponibilidad
                  </button>
                </div>

                {showExpressModal && (() => {
                  const career = getCareer(config, [workingBook], bookCareerId(workingBook));
                  const expressSlots = getNextSlots(config, pedidos, career, true);
                  const precioExpress = Math.round(pricing.total * 1.2);
                  const hasCartItems = carrito && carrito.length > 0;

                  return (
                    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" onClick={() => setShowExpressModal(false)}>
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                      <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-y-auto sm:mx-4 slide-up" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-surface rounded-t-2xl border-b border-ink-100 px-5 py-4 flex items-center justify-between z-10">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">⚡</span>
                            <span className="font-800 text-ink-900">Prioridad de impresión</span>
                          </div>
                          <button onClick={() => setShowExpressModal(false)} className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-400"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                        <div className="p-5 space-y-4">
                          <div className="bg-ink-50 rounded-xl p-4">
                            <ul className="text-xs text-ink-500 space-y-2 list-none m-0 p-0">
                              <li className="flex items-start gap-2"><span className="text-brand-DEFAULT font-700 flex-shrink-0">·</span> <strong>1 libro por pedido.</strong> No se combina con otros productos del carrito.</li>
                              <li className="flex items-start gap-2"><span className="text-brand-DEFAULT font-700 flex-shrink-0">·</span> <strong>Procesamiento separado.</strong> Corre por fuera del flujo normal de producción.</li>
                              <li className="flex items-start gap-2"><span className="text-brand-DEFAULT font-700 flex-shrink-0">·</span> <strong>Ventanas especiales.</strong> Sujetas a la capacidad productiva del día.</li>
                              <li className="flex items-start gap-2"><span className="text-brand-DEFAULT font-700 flex-shrink-0">·</span> <strong>Recargo del 20%.</strong> Aplicado sobre el precio base del libro.</li>
                            </ul>
                          </div>

                          <div className="bg-ink-50 rounded-xl p-4 flex justify-between items-center">
                            <div>
                              <div className="text-xs text-ink-400">Precio con prioridad</div>
                              <div className="font-800 text-lg text-ink-900">{fmt(precioExpress)}</div>
                            </div>
                            <span className="badge bg-orange-100 text-orange-700 text-xs">+20% recargo</span>
                          </div>

                          <div>
                            <div className="font-700 text-sm text-ink-800 mb-3">Ventanas disponibles</div>
                            {expressSlots.filter(s => s.disponible).length === 0 ? (
                              <div className="text-sm text-ink-400 text-center py-6 bg-ink-50 rounded-xl">
                                No hay ventanas express disponibles en este momento.
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                {expressSlots.filter(s => s.disponible).slice(0, 8).map((slot, idx) => (
                                  <button
                                    key={`${slot.fecha}-${slot.turno}`}
                                    onClick={() => setExpressSlotSel(slot)}
                                    className={`w-full text-left rounded-xl p-3 border-2 transition-all ${expressSlotSel?.fecha === slot.fecha && expressSlotSel?.turno === slot.turno && expressSlotSel?.horario === slot.horario ? 'border-brand-DEFAULT bg-brand-muted' : 'border-ink-100 hover:border-ink-200 bg-surface'}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="font-700 text-sm text-ink-800">{fechaLabel(slot.fecha, slot.dOffset)} · {slot.horario}</div>
                                        <div className="text-xs text-ink-400 mt-0.5">{deliveryPlaceFor('Retiro facultad', career, config)}</div>
                                      </div>
                                      {expressSlotSel?.fecha === slot.fecha && expressSlotSel?.turno === slot.turno && expressSlotSel?.horario === slot.horario && <span className="text-brand-DEFAULT"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {hasCartItems && !expressCartWarn && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                              <div className="flex items-start gap-2">
                                <span className="text-amber-600 flex-shrink-0 mt-0.5"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                                <div>
                                  <div className="font-700 text-sm text-amber-800 mb-1">Tenés productos en tu carrito</div>
                                  <div className="text-xs text-amber-700">La prioridad de impresión solo está disponible para pedidos de un único libro. Si continuás, este pedido se procesará por separado del resto de tu carrito.</div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-3 pt-2">
                            <button className="btn-secondary flex-1 text-sm py-3" onClick={() => setShowExpressModal(false)}>Cancelar</button>
                            <button
                              className="btn-primary flex-1 text-sm py-3 bg-orange-500 hover:bg-orange-600 text-white"
                              disabled={!expressSlotSel || expressSlots.filter(s => s.disponible).length === 0}
                              onClick={() => {
                                if (hasCartItems && !expressCartWarn) {
                                  setExpressCartWarn(true);
                                  return;
                                }
                                setShowExpressModal(false);
                                handleAgregar({
                                  id: `${workingBook.id}-${selectedCombo}-EXPRESS-${Date.now()}`,
                                  libroId: book.id,
                                  titulo: workingBook.titulo,
                                  materia: workingBook.materia,
                                  carrera: workingBook.carrera,
                                  id_carrera: bookCareerId(workingBook),
                                  paginas: workingBook.paginas,
                                  hojas: pricing.hojas,
                                  formato,
                                  encuadernacion: 'basica',
                                  color,
                                  express: true,
                                  precio: precioExpress,
                                  tipo: pricing.tipo,
                                  imagen_url: workingBook.imagen_url,
                                  origen: book.isPdfPropio ? 'pdf-propio' : 'catalogo'
                                }, true);
                              }}
                            >
                              {hasCartItems && !expressCartWarn ? 'Continuar con pedido prioritario' : 'Solicitar prioridad'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {toast && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
                <div className="slide-up bg-ink-900 dark:bg-white text-white dark:text-black rounded-xl px-5 py-3 text-sm font-700 shadow-2xl flex items-center gap-2">
                  {toast.msg}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowPdfModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-surface rounded-2xl shadow-xl p-6 max-w-sm mx-4 w-full text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-ink-100 flex items-center justify-center mx-auto mb-4 text-ink-500">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <h3 className="font-800 text-lg text-ink-900 mb-2">Vista previa del libro</h3>
            <p className="text-sm text-ink-500 mb-6">Se mostrará una porción del libro para que verifiques el contenido antes de encargarlo.</p>
            <div className="flex gap-3">
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  setShowPdfModal(false);
                  const url = workingBook.pdf_url;
                  if (url && /^https?:\/\//i.test(url)) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                Abrir PDF
              </button>
              <button className="btn-secondary" onClick={() => setShowPdfModal(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckoutScreen({ carrito, pedidos, setPedidos, config, onVolver, onSuccess, setCarrito, form, setForm }) {
  const [step, setStep] = React.useState(1);
  const [slotSel, setSlotSel] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = React.useState(null);
  const [expressItem, setExpressItem] = React.useState(null);
  const [expressConfirm, setExpressConfirm] = React.useState(null);
  const pagosConfig = config.pagos || { talo_activo: true, transferencia_activa: false, datos_bancarios: {}, whatsapp_admin: '5493885888949' };
  const [metodoPago, setMetodoPago] = React.useState(
    pagosConfig.talo_activo !== false ? 'talo' : (pagosConfig.transferencia_activa ? 'transferencia' : 'talo')
  );
  const [copiedField, setCopiedField] = React.useState(null);
  const [showTransferConfirm, setShowTransferConfirm] = React.useState(false);
  const nombreRef = React.useRef(null);
  const whatsappRef = React.useRef(null);

  function goToStep(newStep) {
    setStep(newStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  React.useEffect(() => {
    const taloActivo = pagosConfig.talo_activo !== false;
    const transfActiva = pagosConfig.transferencia_activa === true;
    if (taloActivo && !transfActiva && metodoPago !== 'talo') {
      setMetodoPago('talo');
    } else if (!taloActivo && transfActiva && metodoPago !== 'transferencia') {
      setMetodoPago('transferencia');
    }
  }, [pagosConfig.talo_activo, pagosConfig.transferencia_activa]);

  const activeCareer = getCareer(config, carrito, carrito[0]?.id_carrera || '');
  const total = carrito.reduce((acc, item) => acc + item.precio, 0);
  const totalRounded = roundTotal(total, config);
  const anticipo = roundTotal(totalRounded * 0.5, config);
  const saldo = Math.max(0, totalRounded - anticipo);
  const totalHojas = carrito.reduce((acc, item) => acc + item.hojas, 0);
  const isExpressOrder = carrito.length === 1 && carrito[0]?.express;
  const dailyCap = isExpressOrder
    ? (config.produccion.capacidad_express_paginas || 300)
    : config.produccion.capacidad_diaria_paginas;
  const excedeCapacidad = !isExpressOrder && totalHojas > dailyCap;
  const slots = getNextSlots(config, pedidos, activeCareer, isExpressOrder);
  const needsSlot = form.modalidad === 'Retiro facultad';

  function getStateIndexForConfirm(estado) {
    if (estado === 'Pendiente de pago' || estado === 'Pendiente de impresión') return 0;
    if (estado === 'Imprimiendo' || estado === 'Para encuadernar') return 1;
    if (estado === 'Listo') return 2;
    if (estado === 'Entregado') return 3;
    return 0;
  }

  function toggleExpress(item) {
    if (item.express) {
      setCarrito(current => current.map(ci => ci.id === item.id ? { ...ci, express: false, precio: ci.precio / 1.2, expressRecargo: 0 } : ci));
    } else {
      setExpressItem(item);
      setExpressConfirm(null);
    }
  }

  function activateExpress(item) {
    const recargo = Math.round(item.precio * 0.2);
    const roundedRecargo = roundTotal(recargo, config);
    setCarrito(current => current.map(ci => ci.id === item.id ? { ...ci, express: true, precio: ci.precio + roundedRecargo, expressRecargo: roundedRecargo } : ci));
    setExpressItem(null);
  }

  React.useEffect(() => {
    saveLocal(STORAGE.carrito, carrito);
  }, [carrito]);

  React.useEffect(() => {
    if (step === 4 && pedidoConfirmado && carrito.length > 0) {
      setCarrito([]);
    }
  }, [step, pedidoConfirmado]);

  async function handlePagar() {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1400));
      const order = buildOrder(carrito, form, slotSel, config, activeCareer, metodoPago);
      if (excedeCapacidad) {
        order.excede_capacidad = true;
        order.hojas_primera_entrega = dailyCap;
        order.hojas_segunda_entrega = totalHojas - dailyCap;
        order.segunda_entrega_fecha = getNextBusinessDay(order.fecha || new Date().toISOString().split('T')[0]);
        order.notas_admin = `Pedido grande. Parte 1: ${dailyCap} hojas el ${order.fecha}. Parte 2: ${order.hojas_segunda_entrega} hojas el ${order.segunda_entrega_fecha}.`;
      }
      order.wa_message = await generateWhatsAppMessageForOrder(order, config);
      const saved = await saveOrderToSupabase(order, config);
      if (!saved) {
        alert('Error al guardar el pedido. Revisá tu conexión e intentá de nuevo.');
        return;
      }
      setPedidos(previous => [order, ...previous]);
      setPedidoConfirmado(order);
      syncOrderToSheets(order, config);
      goToStep(4);
    } catch (err) {
      console.error('Error en handlePagar:', err);
      alert('Ocurrió un error al procesar el pago. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleTransferenciaPagar() {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      const order = buildOrder(carrito, form, slotSel, config, activeCareer, 'transferencia');
      if (excedeCapacidad) {
        order.excede_capacidad = true;
        order.hojas_primera_entrega = dailyCap;
        order.hojas_segunda_entrega = totalHojas - dailyCap;
        order.segunda_entrega_fecha = getNextBusinessDay(order.fecha || new Date().toISOString().split('T')[0]);
        order.notas_admin = `Pedido grande. Parte 1: ${dailyCap} hojas el ${order.fecha}. Parte 2: ${order.hojas_segunda_entrega} hojas el ${order.segunda_entrega_fecha}.`;
      }
      const saved = await saveOrderToSupabase(order, config);
      if (!saved) {
        alert('Error al guardar el pedido. Revisá tu conexión e intentá de nuevo.');
        return;
      }
      setPedidos(previous => [order, ...previous]);
      setPedidoConfirmado(order);

      const libroPrincipal = carrito[0]?.titulo || '';
      const esExpress = carrito[0]?.express;
      const tipoPago = form.pago === 'sena' ? 'Transferí la seña del 50%.' : 'Realicé el pago total.';
      const msj = `Hola Pau! Soy ${form.nombre}.\n\nYa realicé la transferencia correspondiente al pedido ${esExpress ? '⚡ EXPRESS ' : ''}${order.id} ("${libroPrincipal}").\n\n${tipoPago}\n\nSi necesitás el comprobante, te lo envío.\n\nGracias 😊`;
      window.open(`https://wa.me/${pagosConfig.whatsapp_admin || '5493885888949'}?text=${encodeURIComponent(msj)}`, '_blank');
      goToStep(4);
    } catch (err) {
      console.error('Error en handleTransferenciaPagar:', err);
      alert('Ocurrió un error al procesar el pago. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (carrito.length === 0 && step !== 4) {
    return (
      <div className="fade-in">
        <div className="card p-8 text-center">
          <div className="text-xl font-800 text-ink-900 mb-2">Tu pedido esta vacio</div>
          <p className="text-sm text-ink-400 mb-4">Volvé al catalogo para sumar libros antes de pasar al pago.</p>
          <button className="btn-primary" onClick={onVolver}>Ir al catalogo</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {step !== 4 && (
        <button
          onClick={() => {
            if (step > 1) {
              goToStep(step - 1);
            } else {
              onVolver();
            }
          }}
          className="flex items-center gap-2 text-sm text-ink-400 hover:text-ink-700 mb-5 font-700"
        >
          ← Volver
        </button>
      )}

      {step === 4 && pedidoConfirmado && (
        <div className="slide-up text-center">
          <div className="w-20 h-20 rounded-full bg-ok-muted flex items-center justify-center text-4xl mx-auto mb-5">✓</div>
          <h2 className="text-2xl font-800 text-ink-900 mb-2">Pedido confirmado</h2>
          <p className="text-ink-400 text-sm mb-5">ID {pedidoConfirmado.id} · {pedidoConfirmado.modalidad_entrega}</p>

          <div className="card p-5 mb-5">
            <div className="font-700 text-sm text-ink-800 mb-4">Seguimiento de tu pedido</div>
            <div className="timeline mb-4">
              {['Pedido recibido', 'En preparacion', 'Terminado!', 'Entregado'].map((label, idx) => {
                const currentIndex = getStateIndexForConfirm(pedidoConfirmado.estado);
                const isCompleted = idx < currentIndex;
                const isCurrent = idx === currentIndex;
                const isLast = idx === 3;
                return (
                  <React.Fragment key={label}>
                    <div className="timeline-step">
                      <div className={`timeline-dot ${isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}`}>
                        {isCompleted ? <Icon.Check /> : idx + 1}
                      </div>
                      <div className={`timeline-label ${isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}`}>{label}</div>
                    </div>
                    {!isLast && <div className={`timeline-line ${isCompleted ? 'completed' : 'pending'}`} />}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="text-xs text-ink-400">Estado actual: <strong className="text-ink-700">{pedidoConfirmado.estado}</strong></div>
          </div>

          {pedidoConfirmado.metodo_pago === 'transferencia' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-left">
              <div className="flex items-start gap-3">
                <span className="text-blue-600 flex-shrink-0 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </span>
                <div>
                  <div className="font-700 text-sm text-blue-800">Pago por transferencia</div>
                  <div className="text-xs text-blue-700 mt-1">Recordá enviar el comprobante por WhatsApp para que confirmemos tu pedido. Te contactaremos apenas lo recibamos.</div>
                </div>
              </div>
            </div>
          )}

          <div className="card p-5 mb-6 text-left">
            <div className="font-700 text-sm text-ink-800 mb-4">Resumen de tu pedido</div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-ink-500">Nombre</span><span className="font-700 text-right ml-4">{pedidoConfirmado.nombre}</span></div>
              <div className="flex justify-between text-sm"><span className="text-ink-500">WhatsApp</span><span className="font-700">{pedidoConfirmado.whatsapp}</span></div>
              <div className="border-t border-ink-100 pt-3">
                <div className="text-xs font-700 text-ink-400 uppercase tracking-wide mb-2">Libros pedidos</div>
                {pedidoConfirmado.items?.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm mb-1">
                    <span className="text-ink-700">{item.titulo} <span className="text-ink-400">({item.formato} · {item.hojas} hojas{item.express ? ' · Express' : ''})</span></span>
                    <span className="font-700">{fmt(item.precio)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-ink-100 pt-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-ink-500">Total</span><span className="font-800 text-ink-900">{fmt(pedidoConfirmado.total)}</span></div>
                {pedidoConfirmado.metodo_pago === 'transferencia' ? (
                  <div className="flex justify-between text-sm"><span className="text-ink-500">Estado del pago</span><span className="font-700 text-blue-600">Pendiente de confirmacion</span></div>
                ) : (
                  <div className="flex justify-between text-sm"><span className="text-ink-500">Pagaste</span><span className="font-700 text-ok-DEFAULT">{fmt(pedidoConfirmado.monto_pagado)}</span></div>
                )}
                {pedidoConfirmado.saldo_pendiente > 0 && (
                  <div className="flex justify-between text-sm bg-accent-muted/30 rounded-lg px-3 py-2 -mx-1">
                    <span className="font-700 text-accent">Saldo pendiente</span>
                    <span className="font-800 text-accent">{fmt(pedidoConfirmado.saldo_pendiente)}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-ink-100 pt-3 space-y-2">
                {pedidoConfirmado.excede_capacidad ? (
                  <>
                    <div className="text-xs font-700 text-ink-400 uppercase tracking-wide mb-1">Entregas (pedido dividido)</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-500">Parte 1</span>
                      <span className="font-700 text-right ml-4">{pedidoConfirmado.ventana_retiro} <span className="text-ink-400">({pedidoConfirmado.hojas_primera_entrega} hojas)</span></span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-ink-500">Parte 2</span>
                      <span className="font-700 text-right ml-4">{new Date(`${pedidoConfirmado.segunda_entrega_fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} <span className="text-ink-400">({pedidoConfirmado.hojas_segunda_entrega} hojas)</span></span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm"><span className="text-ink-500">Entrega</span><span className="font-700 text-right ml-4">{pedidoConfirmado.ventana_retiro}</span></div>
                )}
                <div className="flex justify-between text-sm"><span className="text-ink-500">Lugar</span><span className="font-700 text-right ml-4">{pedidoConfirmado.lugar_entrega}</span></div>
              </div>
              <div className="border-t border-ink-100 pt-2">
                <div className="flex justify-between text-xs"><span className="text-ink-400">{pedidoConfirmado.metodo_pago === 'transferencia' ? 'Ref. Transferencia' : 'Ref. Talo'}</span><span className="font-700 text-ink-500">{pedidoConfirmado.talo_ref}</span></div>
              </div>
            </div>
          </div>

          <button className="btn-primary w-full" onClick={onSuccess}>Volver al inicio</button>
        </div>
      )}

      {step !== 4 && (
        <>
          <div className="flex items-center gap-2 mb-6">
            {[['Datos', 1], [needsSlot ? 'Turno' : 'Entrega', 2], ['Pago', 3]].map(([label, index], position) => (
              <React.Fragment key={label}>
                <div className={`flex items-center gap-1.5 text-xs font-700 ${step >= index ? 'text-brand-DEFAULT' : 'text-ink-300'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-800 ${step >= index ? 'bg-brand-DEFAULT text-white' : 'bg-ink-100 text-ink-400'}`}>{step > index ? '✓' : index}</div>
                  {label}
                </div>
                {position < 2 && <div className={`flex-1 h-0.5 ${step > index ? 'bg-brand-DEFAULT' : 'bg-ink-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          <div className="card p-4 mb-5">
            <div className="text-xs font-700 text-ink-400 uppercase tracking-wide mb-3">Tu pedido</div>
            <div className="space-y-3">
              {carrito.map(item => (
                <div key={item.id} className={`grid grid-cols-[56px_1fr_auto] gap-3 items-center rounded-xl p-2 transition-all ${item.express ? 'bg-accent-muted/50 border border-accent/20' : ''}`}>
                  <Cover src={item.imagen_url} alt={item.titulo} />
                  <div className="min-w-0">
                    <div className="text-sm font-700 text-ink-900 truncate">{item.titulo}</div>
                    <div className="text-xs text-ink-400">{item.formato} · {item.hojas} hojas · {item.color ? 'Color' : 'B/N'} · {item.tipo === 'anillado' ? 'Anillado' : 'Abrochado'}{item.express ? ' · Express' : ''}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`font-700 text-sm ${item.express ? 'text-accent' : ''}`}>
                      {fmt(item.precio)}
                      {item.express && <span className="text-xs text-accent/70 ml-1">incl. express</span>}
                    </span>
                    <button
                      className="text-xs font-700 text-danger hover:underline"
                      onClick={() => setCarrito(current => current.filter(cartItem => cartItem.id !== item.id))}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-4 mt-4 border-t border-ink-100">
              <span className="font-700">Total</span>
              <span className="font-800 text-xl text-ink-900">{fmt(totalRounded)}</span>
            </div>
          </div>

          {expressItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setExpressItem(null)}>
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
              <div className="relative card p-6 max-w-sm w-full slide-up" onClick={e => e.stopPropagation()}>
                <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center mx-auto mb-4 text-accent">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                </div>
                <div className="text-center mb-4">
                  <div className="font-800 text-xl text-ink-900 mb-1">Salta la fila!</div>
                  <div className="text-sm text-ink-500 leading-relaxed">
                    Este libro entra en <strong className="text-ink-800">produccion inmediata</strong>. Nos salteamos la cola y nos ponemos a trabajar YA.
                  </div>
                </div>
                <div className="bg-ink-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-ink-500">Libro</span><span className="font-600 text-right ml-4 truncate max-w-[140px]">{expressItem.titulo}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Precio base</span><span className="font-600">{fmt(expressItem.precio)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Recargo express (20%)</span><span className="font-700 text-accent">+{fmt(roundTotal(Math.round(expressItem.precio * 0.2), config))}</span></div>
                  <div className="flex justify-between font-800 border-t border-ink-200 pt-2"><span>Nuevo precio</span><span>{fmt(expressItem.precio + roundTotal(Math.round(expressItem.precio * 0.2), config))}</span></div>
                </div>
                <div className="bg-accent-muted/40 rounded-xl p-3 mb-5 flex items-start gap-2.5">
                  <span className="text-accent text-sm flex-shrink-0 mt-0.5"><Icon.AlertCircle /></span>
                  <span className="text-xs text-accent/80 font-600">Al activar Express te contactamos al toque para coordinar la entrega prioritaria.</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1 bg-accent hover:bg-accent-light" onClick={() => activateExpress(expressItem)}>
                    <Icon.Zap /> Activar Express
                  </button>
                  <button className="btn-secondary" onClick={() => setExpressItem(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="slide-up">
              <div className="card p-5 mb-5 space-y-4">
                <div>
                  <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Nombre y apellido</label>
                  <input ref={nombreRef} className="input-field" value={form.nombre} onChange={event => setForm(current => ({ ...current, nombre: event.target.value }))} placeholder="Ej: Candela Lopez" />
                </div>
                <div>
                  <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">WhatsApp</label>
                  <div className="flex">
                    <span className="border border-r-0 border-ink-200 bg-ink-50 rounded-l-xl px-3 flex items-center text-sm text-ink-500 font-700">+54 9</span>
                    <input ref={whatsappRef} className="input-field rounded-l-none" value={form.whatsapp} onChange={event => setForm(current => ({ ...current, whatsapp: event.target.value }))} placeholder="388 1234 5678" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Forma de confirmacion</label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[['total', 'Pago total', totalRounded, 0], ['sena', 'Solo seña 50%', anticipo, saldo]].map(([value, label, payNow, pending]) => (
                      <button key={value} onClick={() => setForm(current => ({ ...current, pago: value }))} className={`radio-tile ${form.pago === value ? 'active' : ''}`}>
                        <div className="font-700 text-sm">{label}</div>
                        <div className="text-xs text-ink-400 mt-1">Pagas ahora {fmt(payNow)}{pending ? ` · saldo ${fmt(pending)}` : ''}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Modalidad de entrega</label>
                  <div className="grid gap-3 md:grid-cols-3">
                    {['Retiro domicilio', 'Retiro facultad', 'Cadete'].map(option => (
                      <button key={option} onClick={() => {
                        setForm(current => ({ ...current, modalidad: option }));
                        if (option !== 'Retiro facultad') {
                          const primerSlot = slots.find(s => s.disponible);
                          setSlotSel(primerSlot || null);
                        }
                      }} className={`radio-tile ${form.modalidad === option ? 'active' : ''}`}>
                        <div className="font-700 text-sm">{option}</div>
                        <div className="text-xs text-ink-400 mt-1">
                          {option === 'Cadete' ? `Se coordina por WhatsApp · a cargo del cliente` : option === 'Retiro domicilio' ? 'Chijra, coordinamos por WhatsApp' : deliveryPlaceFor(option, activeCareer, config)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button className="btn-primary w-full text-base" onClick={() => {
                if (form.nombre.trim().length < 3) {
                  nombreRef.current?.focus();
                  nombreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  nombreRef.current?.classList.add('ring-2', 'ring-red-400');
                  setTimeout(() => nombreRef.current?.classList.remove('ring-2', 'ring-red-400'), 1500);
                  return;
                }
                if (normalizePhone(form.whatsapp).length < 8) {
                  whatsappRef.current?.focus();
                  whatsappRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  whatsappRef.current?.classList.add('ring-2', 'ring-red-400');
                  setTimeout(() => whatsappRef.current?.classList.remove('ring-2', 'ring-red-400'), 1500);
                  return;
                }
                goToStep(2);
              }}>
                {needsSlot ? 'Elegir ventana de retiro' : 'Ir al pago'}
              </button>
            </div>
          )}

          {step === 2 && !needsSlot && (
            <div className="slide-up">
              <div className="card p-5 mb-5">
                <div className="text-xs font-700 text-ink-400 uppercase tracking-wide mb-4">Coordinacion por WhatsApp</div>
                {slotSel && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon.Check />
                      <span className="font-700 text-sm text-emerald-800">Se te asigno la entrega mas cercana disponible</span>
                    </div>
                    <div className="text-sm text-emerald-700">
                      Tu pedido estará listo el <strong>{fechaLabel(slotSel.fecha, slotSel.dOffset)}</strong> a las <strong>{slotSel.horario} hs. Si esta antes te avisaremos</strong>.
                    </div>
                  </div>
                )}
                <Alert type="info"><Icon.Message /><span>{form.modalidad === 'Cadete' ? `Cuando esté listo te contactamos por WhatsApp para coordinar el cadete. El costo corre por cuenta del alumno.` : `Cuando esté listo te contactamos por WhatsApp para coordinar la entrega en tu domicilio.`}</span></Alert>
              </div>
              <button className="btn-primary w-full text-base" onClick={() => goToStep(3)}>Ir al pago</button>
            </div>
          )}

          {step === 2 && needsSlot && (
            <div className="slide-up">
              <div className="card p-5 mb-5">
                <div className="text-xs font-700 text-ink-400 uppercase tracking-wide mb-4">Ventanas disponibles</div>
                <div className="space-y-3">
                  {slots.map(slot => (
                    <button key={`${slot.fecha}-${slot.turno}-${slot.horario}`} disabled={!slot.disponible} onClick={() => slot.disponible && setSlotSel(slot)} className={`turn-card w-full text-left ${slotSel?.fecha === slot.fecha && slotSel?.turno === slot.turno && slotSel?.horario === slot.horario ? 'selected' : ''} ${!slot.disponible ? 'disabled' : ''}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-700 text-sm text-ink-800">{fechaLabel(slot.fecha, slot.dOffset)} · {slot.label}</div>
                          <div className="text-xs text-ink-500 mt-0.5">{slot.horario} · {deliveryPlaceFor(form.modalidad, activeCareer, config)}</div>
                        </div>
                        {!slot.disponible ? <span className="badge bg-red-50 text-red-600">{slot.bloqueado}</span> : slotSel?.fecha === slot.fecha && slotSel?.turno === slot.turno && slotSel?.horario === slot.horario ? <Icon.Check /> : <Icon.ChevronRight />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn-primary w-full text-base" disabled={!slotSel} onClick={() => goToStep(3)}>Ir al pago</button>
            </div>
          )}

          {step === 3 && (
            <div className="slide-up">
              {(pagosConfig.talo_activo !== false && pagosConfig.transferencia_activa === true) && (
                <div className="card p-4 mb-5">
                  <div className="text-xs font-700 text-ink-400 uppercase tracking-wide mb-3">Metodo de pago</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMetodoPago('talo')} className={`radio-tile ${metodoPago === 'talo' ? 'active' : ''}`}>
                      <div className="font-700 text-sm">Talo</div>
                      <div className="text-xs text-ink-400 mt-1">Pago online instantaneo</div>
                    </button>
                    <button onClick={() => setMetodoPago('transferencia')} className={`radio-tile ${metodoPago === 'transferencia' ? 'active' : ''}`}>
                      <div className="font-700 text-sm">Transferencia</div>
                      <div className="text-xs text-ink-400 mt-1">CBU / Alias</div>
                    </button>
                  </div>
                </div>
              )}

              {metodoPago === 'talo' && pagosConfig.talo_activo !== false ? (
                <div className="talo-box mb-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-800 text-lg">Confirmacion por Talo</span>
                    <span className="inline-flex items-center gap-1.5 badge bg-[#22C55E]/20 text-[#4ADE80] text-xs px-3 py-1.5 border border-[#22C55E]/30">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 17 10"/></svg>
                      Pago Seguro
                    </span>
                  </div>
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-ok-DEFAULT/20 flex items-center justify-center flex-shrink-0 mt-0.5"><Icon.Zap /></div>
                    <div>
                      <div className="font-700 text-sm">Se valida automaticamente</div>
                      <div className="text-xs text-ink-300 mt-0.5">Si elegiste seña, el saldo pendiente queda informado para la entrega.</div>
                    </div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-ink-300">Pagas ahora</span><span className="font-800">{fmt(form.pago === 'sena' ? anticipo : totalRounded)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-ink-300">Saldo pendiente</span><span className="font-800">{fmt(form.pago === 'sena' ? saldo : 0)}</span></div>
                  </div>
                </div>
              ) : metodoPago === 'transferencia' && pagosConfig.transferencia_activa ? (
                <div className="card p-5 mb-5 border-2 border-emerald-200 shadow-lg shadow-emerald-500/10 bg-emerald-50/30">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-800 text-lg text-ink-900">Pago por transferencia</span>
                    <span className="inline-flex items-center gap-1.5 badge bg-emerald-100 text-emerald-700 text-xs px-3 py-1.5 border border-emerald-200">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 17 10"/></svg>
                      Transferencia bancaria
                    </span>
                  </div>
                  <div className="bg-surface rounded-xl p-4 space-y-3 border border-ink-200 shadow-sm">
                    <div className="text-xs font-700 text-ink-400 uppercase tracking-wide">Datos bancarios</div>
                    {pagosConfig.datos_bancarios?.alias && (
                      <div className="flex items-center gap-2 bg-ink-50 rounded-lg p-2.5 border border-ink-100">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-400 flex-shrink-0"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-ink-400 uppercase tracking-wide">Alias</div>
                          <div className="font-700 text-ink-900 text-sm truncate">{pagosConfig.datos_bancarios.alias}</div>
                        </div>
                        <button onClick={() => copyToClipboard(pagosConfig.datos_bancarios.alias, () => { setCopiedField('alias'); setTimeout(() => setCopiedField(null), 1500); })} className="text-[11px] font-700 text-emerald-600 hover:text-emerald-700 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 transition-colors flex-shrink-0">{copiedField === 'alias' ? 'Copiado!' : 'Copiar'}</button>
                      </div>
                    )}
                    {pagosConfig.datos_bancarios?.cbu && (
                      <div className="flex items-center gap-2 bg-ink-50 rounded-lg p-2.5 border border-ink-100">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-400 flex-shrink-0"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-ink-400 uppercase tracking-wide">CBU/CVU</div>
                          <div className="font-700 text-ink-900 text-sm truncate">{pagosConfig.datos_bancarios.cbu}</div>
                        </div>
                        <button onClick={() => copyToClipboard(pagosConfig.datos_bancarios.cbu, () => { setCopiedField('cbu'); setTimeout(() => setCopiedField(null), 1500); })} className="text-[11px] font-700 text-emerald-600 hover:text-emerald-700 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 transition-colors flex-shrink-0">{copiedField === 'cbu' ? 'Copiado!' : 'Copiar'}</button>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {pagosConfig.datos_bancarios?.titular && (
                        <div className="bg-ink-50 rounded-lg p-2.5 border border-ink-100"><div className="text-[10px] text-ink-400 uppercase tracking-wide">Titular</div><div className="font-600 text-ink-900 text-sm">{pagosConfig.datos_bancarios.titular}</div></div>
                      )}
                      {pagosConfig.datos_bancarios?.banco && (
                        <div className="bg-ink-50 rounded-lg p-2.5 border border-ink-100"><div className="text-[10px] text-ink-400 uppercase tracking-wide">Banco</div><div className="font-600 text-ink-900 text-sm">{pagosConfig.datos_bancarios.banco}</div></div>
                      )}
                    </div>
                    {pagosConfig.datos_bancarios?.notas && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">{pagosConfig.datos_bancarios.notas}</div>
                    )}
                    <div className="border-t border-ink-100 pt-3 space-y-2">
                      <div className="flex justify-between items-center"><span className="text-sm text-ink-500">{form.pago === 'sena' ? 'Seña a transferir' : 'Total a transferir'}</span><span className="font-800 text-ink-900 text-lg">{fmt(form.pago === 'sena' ? anticipo : totalRounded)}</span></div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-ink-500">
                          {form.pago === 'sena' ? (
                            <span>Saldo restante <span className="text-xs">🙌</span></span>
                          ) : (
                            <span>Pago Total <span className="text-xs">👍</span></span>
                          )}
                        </span>
                        <span className={`font-700 ${form.pago === 'sena' ? 'text-accent' : 'text-ok-DEFAULT'}`}>{form.pago === 'sena' ? fmt(saldo) : '$0'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card p-5 mb-5 text-center">
                  <div className="text-sm text-ink-400">No hay metodos de pago disponibles.</div>
                </div>
              )}

              <div className="card p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Nombre</span><span className="font-600">{form.nombre}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">WhatsApp</span><span className="font-600">+54 9 {normalizePhone(form.whatsapp)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Modalidad</span><span className="font-600">{form.modalidad}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Ventana</span><span className="font-600 text-right ml-4">{needsSlot ? (slotSel ? `${fechaLabel(slotSel.fecha, slotSel.dOffset)} · ${slotSel.horario}` : '-') : 'Se coordina por WhatsApp'}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Lugar</span><span className="font-600 text-right ml-4">{deliveryPlaceFor(form.modalidad, activeCareer, config)}</span></div>
                {carrito.some(item => item.express) && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ink-100">
                    <span className="text-accent"><Icon.Zap /></span>
                    <span className="text-xs font-700 text-accent">{carrito.filter(i => i.express).length} libro{carrito.filter(i => i.express).length > 1 ? 's' : ''} en modo Express</span>
                  </div>
                )}
              </div>

              {excedeCapacidad && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <span className="text-amber-600 flex-shrink-0 mt-0.5">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </span>
                  <div>
                    <div className="font-700 text-sm text-amber-800">Entrega dividida</div>
                    <div className="text-xs text-amber-700 mt-1">Tu pedido es grande y no entra completo en la agenda de la fecha elegida. Lo dividiremos en 2 entregas y te contactamos por WhatsApp para coordinar la prioridad.</div>
                  </div>
                </div>
              )}

              {metodoPago === 'transferencia' && pagosConfig.transferencia_activa ? (
                (pagosConfig.datos_bancarios?.alias || pagosConfig.datos_bancarios?.cbu) ? (
                <>
                  <button className="btn-primary w-full text-base bg-[#25D366] hover:bg-[#128C7E] text-white flex items-center justify-center gap-2 btn-press" onClick={() => setShowTransferConfirm(true)} disabled={loading}>
                    {loading ? (
                      <><span className="spinner-sm" /> Guardando pedido...</>
                    ) : (
                      <><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Ya transferí - Continuar por WhatsApp</>
                    )}
                  </button>
                  {showTransferConfirm && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                      <div className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-6 slide-up border border-ink-100">
                        <div className="text-center mb-5">
                          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-3">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          </div>
                          <div className="font-800 text-ink-900 text-base mb-2">Continuá solo si ya realizaste la transferencia.</div>
                          <p className="text-sm text-ink-400">Si el pago no impacta, podremos solicitarte el comprobante por WhatsApp.</p>
                        </div>
                        <div className="flex gap-3">
                          <button className="btn-secondary flex-1 text-sm py-2.5" onClick={() => setShowTransferConfirm(false)}>Cancelar</button>
                          <button className="btn-primary flex-1 text-sm py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white" onClick={() => { setShowTransferConfirm(false); handleTransferenciaPagar(); }}>Continuar</button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-3 text-center">
                  <div className="text-sm font-700 text-red-700 mb-1">Medio de pago no configurado</div>
                  <div className="text-xs text-red-600">El administrador debe completar los datos bancarios para habilitar este medio de pago.</div>
                </div>
              )
              ) : (
                <button className="btn-primary w-full text-base btn-press mb-3" onClick={handlePagar} disabled={loading}>
                  {loading ? <><span className="spinner-sm" /> Procesando pedido...</> : 'Confirmar pedido'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrderTracker({ orders, setOrders, books, config, onVolver }) {
  const [phone, setPhone] = React.useState('');
  const [searched, setSearched] = React.useState(false);
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [rescheduleMode, setRescheduleMode] = React.useState(false);
  const [rescheduleSlot, setRescheduleSlot] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  const matchedOrders = React.useMemo(() => {
    return getOrdersByPhone(orders, phone);
  }, [orders, phone]);

  const career = getCareer(config, books, matchedOrders[0]?.id_carrera || '');
  const slots = getNextSlots(config, orders, career);

  function handleSearch() {
    if (normalizePhone(phone).length >= 8) {
      setSearched(true);
      setSelectedOrder(null);
      setRescheduleMode(false);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleConfirmAttendance(order) {
    await confirmAttendance(order, setOrders, config);
    setSelectedOrder(prev => ({ ...prev, asistencia_confirmada: true, asistencia_ts: new Date().toISOString() }));
    showToast('Confirmaste tu asistencia correctamente!');
  }

  async function handleReschedule(order) {
    if (!rescheduleSlot) return;
    await rescheduleOrder(order, rescheduleSlot.fecha, rescheduleSlot.turno, rescheduleSlot.horario, rescheduleSlot.label, setOrders, config);
    setSelectedOrder(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        fecha: rescheduleSlot.fecha,
        turno: rescheduleSlot.turno,
        horario_entrega: rescheduleSlot.horario,
        ventana_retiro: `${rescheduleSlot.label || rescheduleSlot.fecha} · ${rescheduleSlot.horario}`,
        asistencia_confirmada: false,
        asistencia_ts: null
      };
    });
    setRescheduleMode(false);
    setRescheduleSlot(null);
    showToast('Tu pedido fue reagendado correctamente!');
  }

  function getStateIndex(estado) {
    if (estado === 'Pendiente de pago' || estado === 'Pendiente de impresión') return 0;
    if (estado === 'Imprimiendo' || estado === 'Para encuadernar') return 1;
    if (estado === 'Listo') return 2;
    if (estado === 'Entregado') return 3;
    return 0;
  }

  const TIMELINE_STEPS = [
    { label: 'Pedido recibido' },
    { label: 'En preparacion' },
    { label: 'Terminado!' },
    { label: 'Entregado' }
  ];

  return (
    <div className="fade-in">
      <button onClick={onVolver} className="flex items-center gap-2 text-sm text-ink-400 hover:text-ink-700 mb-5 font-700">← Volver</button>

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 slide-up">
          <div className="bg-ink-900 dark:bg-black text-white rounded-xl px-5 py-3 text-sm font-700 shadow-xl flex items-center gap-2">
            <Icon.Check /> {toast}
          </div>
        </div>
      )}

      <div className="bg-ink-900 dark:bg-black text-white rounded-2xl p-6 mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-300 mb-1">Segui tu pedido</div>
        <h1 className="text-2xl font-black mb-1">Donde estan tus apuntes?</h1>
        <p className="text-ink-300 text-sm mb-5">Ingresá tu número de celular y te mostramos el estado.</p>
        <div className="flex gap-2">
          <div className="flex flex-1">
            <span className="border border-r-0 border-ink-600 bg-ink-800 rounded-l-xl px-3 flex items-center text-sm text-ink-400 font-700">+54 9</span>
            <input
              className="input-field rounded-l-none bg-ink-800 border-ink-600 text-white placeholder-ink-400"
              value={phone}
              onChange={e => { setPhone(e.target.value); setSearched(false); }}
              placeholder="11 1234 5678"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button className="btn-primary flex-shrink-0" onClick={handleSearch} disabled={normalizePhone(phone).length < 8}>
            <Icon.Search /> Buscar
          </button>
        </div>
      </div>

      {searched && matchedOrders.length === 0 && (
        <div className="card p-8 text-center slide-up">
          <div className="w-16 h-16 rounded-full bg-ink-100 flex items-center justify-center mx-auto mb-4 text-ink-400">
            <Icon.Search />
          </div>
          <div className="font-700 text-lg text-ink-900 mb-1">No encontramos pedidos</div>
          <p className="text-sm text-ink-400">No hay pedidos asociados a este número. Verificá que esté bien escrito o contactanos.</p>
        </div>
      )}

      {searched && matchedOrders.length > 0 && !selectedOrder && (
        <div className="space-y-3 slide-up">
          <div className="text-xs font-700 uppercase tracking-widest text-ink-400 mb-2">{matchedOrders.length} pedido{matchedOrders.length > 1 ? 's' : ''} encontrado{matchedOrders.length > 1 ? 's' : ''}</div>
          {matchedOrders.map(order => {
            const isReady = needsAttendanceConfirmation(order);
            return (
              <button key={order.id} onClick={() => setSelectedOrder(order)} className="card p-4 w-full text-left hover:bg-surface-hover hover:border-brand transition-all btn-press">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-700 text-sm text-ink-900 truncate">{order.libro}</div>
                    <div className="text-xs text-ink-400 mt-0.5">{order.fecha} · {order.horario_entrega}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className={`status-chip ${STATE_STYLES[order.estado] || 'bg-ink-100 text-ink-700'}`}>{STATE_LABELS[order.estado] || order.estado}</span>
                    {isReady && (
                      <span className="badge bg-accent-muted text-accent animate-pulse">Confirmar asistencia</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedOrder && (
        <div className="space-y-4 slide-up">
          <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-2 text-sm text-brand-DEFAULT hover:underline font-700">← Ver todos mis pedidos</button>

          <div className="card p-5">
            <div className="font-700 text-sm text-ink-800 mb-1">Pedido {selectedOrder.id}</div>
            <div className="text-xs text-ink-400 mb-4">{selectedOrder.libro}</div>

            {selectedOrder.metodo_pago === 'transferencia' && selectedOrder.estado === 'Pendiente de pago' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-start gap-2.5">
                <span className="text-blue-600 flex-shrink-0 mt-0.5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </span>
                <div>
                  <div className="font-700 text-sm text-blue-800">Pago pendiente</div>
                  <div className="text-xs text-blue-700 mt-0.5">Envianos el comprobante de transferencia por WhatsApp para confirmar tu pedido.</div>
                </div>
              </div>
            )}

            <div className="timeline mb-4">
              {TIMELINE_STEPS.map((step, idx) => {
                const currentIdx = getStateIndex(selectedOrder.estado);
                const isCompleted = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                const isLast = idx === TIMELINE_STEPS.length - 1;
                return (
                  <React.Fragment key={step.label}>
                    <div className="timeline-step">
                      <div className={`timeline-dot ${isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}`}>
                        {isCompleted ? <Icon.Check /> : idx + 1}
                      </div>
                      <div className={`timeline-label ${isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}`}>{step.label}</div>
                    </div>
                    {!isLast && <div className={`timeline-line ${isCompleted ? 'completed' : 'pending'}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {needsAttendanceConfirmation(selectedOrder) && (
              <div className="notification-banner mb-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Icon.Bell />
                  </div>
                  <div>
                    <div className="font-800 text-base">Tus apuntes estan listos!</div>
                    <div className="text-sm text-white/80 mt-0.5">Confirmá que vas a asistir para que los tengamos listos en tu horario.</div>
                  </div>
                </div>
                <div className="bg-white/10 rounded-xl p-3 mb-3 text-sm space-y-1.5">
                  <div className="flex items-center gap-2"><Icon.MapPin /> {selectedOrder.lugar_entrega}</div>
                  <div className="flex items-center gap-2"><Icon.Clock /> {selectedOrder.horario_entrega} hs</div>
                </div>
                <button
                  className="order-action-btn bg-surface text-brand-dark dark:text-brand-light hover:bg-surface-hover"
                  onClick={() => handleConfirmAttendance(selectedOrder)}
                >
                  <Icon.Check /> Confirmo que voy a asistir
                </button>
              </div>
            )}

            {selectedOrder.asistencia_confirmada && (
              <div className="rounded-xl bg-ok-muted border border-ok-DEFAULT/30 p-4 mb-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-ok-DEFAULT/20 flex items-center justify-center flex-shrink-0 text-ok-DEFAULT">
                  <Icon.Check />
                </div>
                <div>
                  <div className="font-700 text-sm text-ok-DEFAULT">Asistencia confirmada</div>
                  <div className="text-xs text-ok-DEFAULT/70">Te esperamos en el horario pactado.</div>
                </div>
              </div>
            )}

            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">Formato</span><span className="font-600">{selectedOrder.formato}</span></div>
              {selectedOrder.excede_capacidad ? (
                <>
                  <div className="flex justify-between"><span className="text-ink-500">Entrega 1° parte</span><span className="font-600 text-right ml-4">{selectedOrder.ventana_retiro} <span className="text-ink-400">({selectedOrder.hojas_primera_entrega} hojas)</span></span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Entrega 2° parte</span><span className="font-600 text-right ml-4">{new Date(`${selectedOrder.segunda_entrega_fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })} <span className="text-ink-400">({selectedOrder.hojas_segunda_entrega} hojas)</span></span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-ink-500">Entrega</span><span className="font-600 text-right ml-4">{selectedOrder.ventana_retiro}</span></div>
              )}
              <div className="flex justify-between"><span className="text-ink-500">Lugar</span><span className="font-600 text-right ml-4">{selectedOrder.lugar_entrega}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Total</span><span className="font-800">{fmt(selectedOrder.total)}</span></div>
              {selectedOrder.metodo_pago === 'transferencia' ? (
                <div className="flex justify-between"><span className="text-ink-500">Pago</span><span className={`font-700 ${selectedOrder.estado === 'Pendiente de pago' ? 'text-blue-600' : 'text-ok-DEFAULT'}`}>{selectedOrder.estado === 'Pendiente de pago' ? 'Pendiente de confirmacion' : 'Transferencia confirmada'}</span></div>
              ) : (
                <>
                  {selectedOrder.saldo_pendiente > 0 && (
                    <div className="flex justify-between"><span className="text-ink-500">Saldo pendiente</span><span className="font-800 text-danger">{fmt(selectedOrder.saldo_pendiente)}</span></div>
                  )}
                </>
              )}
              <div className="flex justify-between"><span className="text-ink-500">{selectedOrder.metodo_pago === 'transferencia' ? 'Ref. Transferencia' : 'Ref. Talo'}</span><span className="font-600">{selectedOrder.talo_ref}</span></div>
            </div>
          </div>

          {false && selectedOrder.estado !== 'Entregado' && (
            <div className="card p-5">
              <div className="font-700 text-sm text-ink-800 mb-3">Gestion de tu pedido</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedOrder.saldo_pendiente > 0 && (
                  <button className="order-action-btn bg-ok-muted text-ok-DEFAULT hover:bg-ok-muted/80" disabled>
                    <Icon.CreditCard /> Abonar saldo pendiente
                  </button>
                )}
                {selectedOrder.fecha && (
                  <button className="order-action-btn bg-brand-muted text-brand-dark hover:bg-brand-muted/80" onClick={() => setRescheduleMode(true)} disabled={selectedOrder.asistencia_confirmada}>
                    <Icon.Calendar /> Reagendar entrega
                  </button>
                )}
              </div>
            </div>
          )}

          {rescheduleMode && (
            <div className="card p-5 slide-up">
              <div className="font-700 text-sm text-ink-800 mb-3">Elegí un nuevo horario</div>
              <div className="space-y-2 mb-4">
                {slots.map(slot => (
                  <button key={`${slot.fecha}-${slot.turno}-${slot.horario}`} disabled={!slot.disponible} onClick={() => slot.disponible && setRescheduleSlot(slot)} className={`turn-card w-full text-left ${rescheduleSlot?.fecha === slot.fecha && rescheduleSlot?.turno === slot.turno && rescheduleSlot?.horario === slot.horario ? 'selected' : ''} ${!slot.disponible ? 'disabled' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-700 text-sm text-ink-800">{fechaLabel(slot.fecha, slot.dOffset)} · {slot.label}</div>
                        <div className="text-xs text-ink-500 mt-0.5">{slot.horario}</div>
                      </div>
                      {!slot.disponible ? <span className="badge bg-red-50 text-red-600">{slot.bloqueado}</span> : rescheduleSlot?.fecha === slot.fecha && rescheduleSlot?.turno === slot.turno && rescheduleSlot?.horario === slot.horario ? <Icon.Check /> : <Icon.ChevronRight />}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary flex-1" disabled={!rescheduleSlot} onClick={() => handleReschedule(selectedOrder)}>Confirmar nuevo horario</button>
                <button className="btn-secondary" onClick={() => { setRescheduleMode(false); setRescheduleSlot(null); }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AyudaScreen({ config, onVolver }) {
  const [openFaq, setOpenFaq] = React.useState(null);
  const faqs = [
    { q: 'Como hago mi pedido?', a: 'Elegí tu carrera, buscá la materia, seleccioná formato (A4/A5, color o B/N) y agregá al carrito. Luego completá tus datos y elegí horario de retiro.' },
    { q: 'Puedo pagar en cuotas?', a: 'No trabajamos con cuotas. Podés pagar el total o una seña del 50% y el saldo al retirar.' },
    { q: 'Que significa la seña del 50%?', a: 'Es un anticipo que reserva tu pedido. El saldo restante se paga al momento de retirar tus apuntes.' },
    { q: 'Puedo cambiar el horario de retiro?', a: 'Si, contactanos por WhatsApp con tu ID de pedido y lo reagendamos al horario disponible que necesites.' },
    { q: 'Como sé si mi pedido está listo?', a: 'Ingresá a "Segui tu pedido" con tu número de celular y vas a ver el estado en tiempo real. Cuando esté listo, te avisamos.' },
    { q: 'Que pasa si no puedo ir el dia pactado?', a: 'No hay problema. Avisanos por WhatsApp y reagendamos sin costo adicional.' },
    { q: 'Cuanto tarda en estar listo?', a: 'Si pagás antes de las 20:00 hs, tu pedido entra en producción y suele estar listo en 24-48 hs hábiles.' },
    { q: 'Puedo subir mi propio PDF?', a: 'Si! Desde el catálogo hay un boton "Subir PDF propio". Elegí el archivo, seleccioná formato y lo agregamos al carrito.' }
  ];

  return (
    <div className="fade-in">
      <button onClick={onVolver} className="flex items-center gap-2 text-sm text-ink-400 hover:text-ink-700 mb-5 font-700">← Volver</button>

      <div className="bg-ink-900 dark:bg-black text-white rounded-2xl p-6 mb-6">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-300 mb-1">Centro de ayuda</div>
        <h1 className="text-2xl font-black mb-1">Como te ayudamos?</h1>
        <p className="text-ink-300 text-sm mb-5">Respuestas rapidas a las consultas mas frecuentes.</p>
      </div>

      <div className="card p-4 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-brand-muted flex items-center justify-center text-brand-DEFAULT">
            <Icon.Message />
          </div>
          <div className="flex-1">
            <div className="font-700 text-sm text-ink-800">Necesitas ayuda personalizada?</div>
            <div className="text-xs text-ink-400">Escribinos por WhatsApp y te respondemos al toque.</div>
          </div>
        </div>
        <a className="order-action-btn bg-ok-muted text-ok-DEFAULT hover:bg-ok-muted/80" href={`https://wa.me/${config?.pagos?.whatsapp_admin || '5493885888949'}`} target="_blank" rel="noreferrer">
          <Icon.Phone /> Abrir WhatsApp
        </a>
      </div>

      <div className="text-xs font-700 uppercase tracking-widest text-ink-400 mb-3">Preguntas frecuentes</div>
      <div className="space-y-2">
        {faqs.map((faq, idx) => (
          <button key={idx} onClick={() => setOpenFaq(openFaq === idx ? null : idx)} className="card p-4 w-full text-left hover:bg-surface-hover transition-all">
            <div className="flex items-center justify-between gap-3">
              <div className="font-700 text-sm text-ink-800">{faq.q}</div>
              <span className={`text-ink-400 transition-transform flex-shrink-0 ${openFaq === idx ? 'rotate-90' : ''}`}>
                <Icon.ChevronRight />
              </span>
            </div>
            {openFaq === idx && (
              <div className="text-sm text-ink-500 mt-3 pt-3 border-t border-ink-100 leading-relaxed">{faq.a}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Store({ books, config, orders, setOrders, screen, setScreen, carrito, setCarrito, bookSel, setBookSel, theme, setTheme, checkoutForm, setCheckoutForm, cliente, setCliente }) {
  const [catalogFilters, setCatalogFilters] = React.useState({ career: '', query: '', materia: '' });

  if (screen === 'book' || screen === 'ficha') {
    if (!bookSel) return null;
    return (
      <FichaScreen
        book={bookSel}
        config={config}
        pedidos={orders}
        carrito={carrito}
        onVolver={() => setScreen('home')}
        onAgregar={(item, isExpress) => {
          if (isExpress) {
            setCarrito([item]);
            setScreen('checkout');
          } else {
            setCarrito(current => [...current, item]);
            setScreen('home');
          }
        }}
      />
    );
  }

  if (screen === 'checkout') return (
    <CheckoutScreen
      carrito={carrito}
      pedidos={orders}
      setPedidos={setOrders}
      config={config}
      onVolver={() => setScreen('home')}
      onSuccess={() => { setCarrito([]); setScreen('home'); }}
      setCarrito={setCarrito}
      form={checkoutForm}
      setForm={setCheckoutForm}
    />
  );

  if (screen === 'tracking' || screen === 'pedido') return (
    <OrderTracker
      orders={orders}
      setOrders={setOrders}
      books={books}
      config={config}
      onVolver={() => setScreen('home')}
    />
  );

  if (screen === 'ayuda') return (
    <AyudaScreen
      config={config}
      onVolver={() => setScreen('home')}
    />
  );

  return (
    <HomeScreen
      books={books}
      config={config}
      carrito={carrito}
      catalogFilters={catalogFilters}
      setCatalogFilters={setCatalogFilters}
      onSelectLibro={book => { setBookSel(book); setScreen('ficha'); }}
    />
  );
}
