import { useState, useMemo, useRef } from 'react';
import { Icon } from '../Icons';
import {
  fmt, RETIRO_LOCAL, turnoFromHorario, buildOrder, computeOrderStatus,
  buildConfirmationMessage, calcEncuadernacion, roundTotal,
  ensureBookVariantes, getBookCombinations, calcPrecioItem, bookCareerId,
  getCategorias, calcPdfPaginas, calcPdfPrecio
} from '../../lib/utils';
import { saveOrderToSupabase, saveConfigToSupabase } from '../../lib/supabase';

const hoy = () => new Date().toISOString().split('T')[0];
const formBase = () => ({
  nombre: '', whatsapp: '', fecha: hoy(), hora: '',
  parcial: 0, encuadernacion: 'ninguna'
});
const pdfBase = () => ({ nombre: '', paginas: {} });
const EMPTY_ITEMS = [];

/**
 * Tab único "Pedido Nuevo": antes eran dos tabs (Calculadora + Pedido Nuevo)
 * vinculados por saltos. Ahora es un solo lugar donde se agregan ítems —
 * catálogo (buscador) o PDF propio (compositor inline, cobro por página) — y se
 * completan los datos del alumno.
 *
 * Flujo pensado para teclado: foco inicial en el buscador, ↑↓ + Enter agrega
 * del catálogo, Tab recorre el compositor de PDF y Enter agrega otro PDF, y en
 * el formulario Enter (o Ctrl+Enter en cualquier lado) crea el pedido.
 * El borrador vive en AdminPanel (`pedidoDraft`) para sobrevivir el cambio de tab.
 */
export function AdminPedidoNuevo({ config, setConfig, books, setOrders, pedidoDraft, setPedidoDraft, setTab }) {
  const form = pedidoDraft?.form || formBase();
  const items = pedidoDraft?.items || EMPTY_ITEMS;
  const categorias = getCategorias(config);

  const [q, setQ] = useState('');
  const [searchIdx, setSearchIdx] = useState(0);
  const [pdf, setPdf] = useState(pdfBase);
  const [pdfMsg, setPdfMsg] = useState('');
  const [ajustes, setAjustes] = useState(null);
  const [guardandoAjustes, setGuardandoAjustes] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');

  const searchRef = useRef(null);
  const pdfNameRef = useRef(null);

  // ─── Estado del borrador ────────────────────────────────────────────
  function setForm(patch) {
    setPedidoDraft(prev => ({ ...prev, form: { ...(prev?.form || formBase()), ...patch } }));
  }
  function setItems(nuevos) {
    setPedidoDraft(prev => ({ ...prev, items: nuevos }));
  }
  function vaciar() {
    setPedidoDraft({ items: [], form: formBase() });
    setQ('');
    setPdf(pdfBase());
    setError('');
  }

  // ─── Buscador de catálogo ───────────────────────────────────────────
  const resultados = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return (books || [])
      .filter(b => b.activo !== false)
      .filter(b => `${b.titulo || ''} ${b.materia || ''} ${b.carrera || ''}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [q, books]);
  const idxSeguro = resultados.length ? Math.min(searchIdx, resultados.length - 1) : 0;

  function agregarDeCatalogo(book) {
    const wb = ensureBookVariantes(book, config);
    const combo = getBookCombinations(wb)[0] || null;
    const price = calcPrecioItem(wb, combo?.variante || null, 'basica', config);
    const item = {
      id: `${wb.id}_${Date.now().toString(36)}`,
      libroId: wb.id,
      titulo: wb.titulo,
      materia: wb.materia || '',
      carrera: wb.carrera || '',
      id_carrera: bookCareerId(wb),
      paginas: Number(wb.paginas) || 0,
      hojas: price.hojas,
      formato: combo?.label || 'A4',
      varianteId: combo?.key || '',
      encuadernacion: 'basica',
      color: Boolean(combo?.color),
      express: false,
      precio: price.total,
      tipo: price.tipo,
      imagen_url: wb.imagen_url || '',
      origen: 'catalogo',
      comentario: ''
    };
    setItems([...items, item]);
    setQ('');
    setSearchIdx(0);
    searchRef.current?.focus();
  }

  function onSearchKeyDown(e) {
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (resultados.length) setSearchIdx(i => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (resultados.length) {
        e.preventDefault();
        agregarDeCatalogo(resultados[idxSeguro]);
      }
    } else if (e.key === 'Escape') {
      setQ('');
    }
  }

  // ─── Compositor de PDF propio (antes tab Calculadora) ───────────────
  const pdfPaginas = calcPdfPaginas(pdf.paginas);
  const pdfPrecio = calcPdfPrecio(categorias, pdf.paginas, config);
  const pdfsEnPedido = items.filter(i => i.origen === 'calculadora').length;

  function setPaginaPdf(catId, valor) {
    setPdf(prev => ({ ...prev, paginas: { ...prev.paginas, [catId]: Math.max(0, Number(valor) || 0) } }));
    setPdfMsg('');
  }

  function agregarPdf() {
    if (pdfPaginas <= 0) {
      setPdfMsg('Cargá al menos una página.');
      return;
    }
    const hojas = Math.ceil(pdfPaginas / 2);
    const umbral = Number(config?.encuadernacion?.umbral_anillado_hojas || 40);
    const nombre = (pdf.nombre || '').trim() || `PDF ${pdfsEnPedido + 1}`;
    const item = {
      id: `calc_${Date.now().toString(36)}`,
      titulo: nombre,
      materia: '',
      carrera: '',
      id_carrera: '',
      paginas: pdfPaginas,
      hojas,
      formato: 'A4',
      varianteId: '',
      encuadernacion: 'basica',
      color: false,
      express: false,
      precio: pdfPrecio,
      tipo: hojas >= umbral ? 'anillado' : 'abrochado',
      imagen_url: '',
      origen: 'calculadora',
      es_unico: true,
      comentario: ''
    };
    setItems([...items, item]);
    setPdf(pdfBase());
    setPdfMsg('');
    pdfNameRef.current?.focus();
  }

  function onPdfKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.target.tagName === 'BUTTON') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarPdf();
    }
  }

  // ─── Ajustes rápidos de tarifas (mismo camino que Ajustes → Calculadora) ──
  function toggleAjustes() {
    setAjustes(prev => (prev ? null : {
      categorias: getCategorias(config).map(c => ({ ...c })),
      redondear_impar: Boolean(config?.calculadora?.redondear_impar)
    }));
  }
  function setCatAjuste(idx, patch) {
    setAjustes(a => ({ ...a, categorias: a.categorias.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  }
  async function guardarAjustes() {
    if (!ajustes) return;
    setGuardandoAjustes(true);
    const nuevaConfig = {
      ...config,
      calculadora: {
        ...(config?.calculadora || {}),
        categorias: ajustes.categorias,
        redondear_impar: ajustes.redondear_impar
      }
    };
    const ok = await saveConfigToSupabase(nuevaConfig, nuevaConfig);
    if (ok) setConfig(nuevaConfig);
    setGuardandoAjustes(false);
    setAjustes(null);
  }

  // ─── Ítems ──────────────────────────────────────────────────────────
  function quitarItem(id) {
    setItems(items.filter(i => i.id !== id));
  }
  function setComentario(id, valor) {
    setItems(items.map(i => (i.id === id ? { ...i, comentario: valor } : i)));
  }

  // Combos de variante por ítem (memoizado: no recalcula en cada tecla del form).
  const combosPorItem = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!item?.libroId) continue;
      const libro = (books || []).find(b => b.id === item.libroId);
      if (libro) map[item.id] = getBookCombinations(ensureBookVariantes(libro, config));
    }
    return map;
  }, [items, books, config]);

  /** Chip de variante: cambia formato/color y recalcula precio, hojas y tipo. */
  function setVarianteItem(id, key) {
    setItems(items.map(i => {
      if (i.id !== id) return i;
      const combo = (combosPorItem[id] || []).find(c => c.key === key);
      if (!combo) return i;
      const libro = (books || []).find(b => b.id === i.libroId);
      if (!libro) return i;
      const price = calcPrecioItem(ensureBookVariantes(libro, config), combo.variante || null, 'basica', config);
      return {
        ...i,
        formato: combo.label,
        varianteId: combo.key,
        color: Boolean(combo.color),
        hojas: price.hojas,
        precio: price.total,
        tipo: price.tipo
      };
    }));
  }

  // ─── Totales ────────────────────────────────────────────────────────
  const subtotal = items.reduce((acc, i) => acc + (Number(i.precio) || 0), 0);
  const enc = calcEncuadernacion(items, form.encuadernacion, config);
  const total = subtotal + enc.costo;
  const totalFinal = roundTotal(total, config);
  // Monto pagado: vacío o 0 = nulo; al escribir se acota a ≤ total.
  const montoPagado = Math.min(Math.max(0, Number(form.parcial) || 0), totalFinal);
  const pagoResumen = montoPagado === 0
    ? 'Vacío o 0 = pago nulo.'
    : montoPagado >= totalFinal
      ? 'Pago total ✓'
      : `Parcial · saldo: ${fmt(totalFinal - montoPagado)}`;

  async function crearPedido() {
    setError('');
    if (!(form.nombre || '').trim()) { setError('Cargá el nombre del alumno.'); return; }
    if (!items.length) { setError('Agregá al menos un ítem (catálogo o PDF propio).'); return; }
    if (!form.fecha) { setError('Cargá la fecha de retiro.'); return; }

    setCreando(true);
    try {
      let itemsFinales = items;
      if (enc.costo > 0) {
        itemsFinales = [...items, {
          id: `enc_${Date.now().toString(36)}`,
          titulo: `Encuadernación (${form.encuadernacion === 'todos' ? 'todos juntos' : 'cada PDF'})${enc.size ? ` · espiral ${enc.size}` : ''}`,
          materia: '', carrera: '', id_carrera: '',
          paginas: 0, hojas: 0,
          formato: '', varianteId: '', encuadernacion: 'basica',
          color: false, express: false,
          precio: enc.costo, tipo: 'anillado',
          imagen_url: '', origen: 'encuadernacion', comentario: ''
        }];
      }

      const slot = {
        fecha: form.fecha,
        horario: form.hora || '',
        turno: form.hora ? turnoFromHorario(form.hora) : '',
        label: ''
      };
      const order = buildOrder(
        itemsFinales,
        { nombre: form.nombre, whatsapp: form.whatsapp, pago: 'total', modalidad: RETIRO_LOCAL },
        slot, config, null, 'talo'
      );

      const monto = montoPagado;
      order.monto_pagado = monto;
      order.saldo_pendiente = Math.max(0, order.total - monto);
      order.pago_modalidad = monto === 0 ? 'nulo' : (monto >= order.total ? 'total' : 'parcial');
      order.estado = computeOrderStatus(monto);
      order.items = order.items.map(i => ({ ...i, estado: order.estado }));
      order.encuadernacion_modo = form.encuadernacion;
      order.wa_confirmacion = buildConfirmationMessage(order, config);

      const saved = await saveOrderToSupabase(order, config);
      if (!saved) { setError('No se pudo guardar el pedido. Revisá la conexión.'); return; }

      setOrders(prev => [order, ...(prev || [])]);
      setPedidoDraft({ items: [], form: formBase() });
      setQ('');
      setPdf(pdfBase());
      alert(`Pedido ${order.id} creado ✓ (queda en Pedidos y la confirmación pendiente en Avisos WA).`);
      setTab('pedidos');
    } catch (e) {
      console.error('Error creando pedido manual:', e);
      setError('Ocurrió un error al crear el pedido.');
    } finally {
      setCreando(false);
    }
  }

  function onFormKeyDown(e) {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && e.target.tagName === 'INPUT') {
      e.preventDefault();
      crearPedido();
    }
  }

  function onRootKeyDown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      crearPedido();
    } else if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }

  return (
    <div onKeyDown={onRootKeyDown}>
      {/* Header: total + crear siempre a la vista */}
      <div className="flex items-end gap-3 flex-wrap mb-4">
        <div>
          <div className="text-lg font-700 text-ink-800 leading-tight">Nuevo pedido</div>
          <div className="text-xs text-ink-400">
            <span className="font-700">Tab</span> para moverte · <span className="font-700">Enter</span> agrega ítems / crea · <span className="font-700">↑↓</span> en el buscador · <span className="font-700">Ctrl+Enter</span> crea
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-ink-400 font-700">Total</div>
            <div className="text-xl font-700 text-brand-DEFAULT leading-none">{fmt(totalFinal)}</div>
          </div>
          <button onClick={crearPedido} disabled={creando} className="btn-primary px-5 py-2.5">
            {creando ? 'Creando…' : 'Crear pedido'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Columna principal: agregar + ítems ───────────────────── */}
        <div className="space-y-4">
          {/* Buscador de catálogo */}
          <div className="card p-4">
            <div className="relative">
              <div className="flex items-center gap-2 bg-input-bg border-[1.5px] border-input-border rounded-xl px-3 transition-colors focus-within:border-brand-DEFAULT focus-within:ring-4 focus-within:ring-brand-DEFAULT/10">
                <Icon.Search />
                <input
                  ref={searchRef}
                  autoFocus
                  className="flex-1 bg-transparent border-0 py-2.5 text-sm outline-none"
                  placeholder="Buscar libro en el catálogo… (título, materia, carrera)"
                  value={q}
                  onChange={e => { setQ(e.target.value); setSearchIdx(0); }}
                  onKeyDown={onSearchKeyDown}
                />
                {q && (
                  <button onClick={() => { setQ(''); searchRef.current?.focus(); }} className="text-ink-400 hover:text-ink-700" title="Limpiar (Esc)">
                    <Icon.X />
                  </button>
                )}
              </div>

              {q && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-xl shadow-lg max-h-[320px] overflow-y-auto">
                  {resultados.length === 0
                    ? <div className="p-3 text-xs text-ink-400">Sin resultados en el catálogo.</div>
                    : resultados.map((b, i) => (
                        <button
                          key={b.id}
                          onClick={() => agregarDeCatalogo(b)}
                          onMouseEnter={() => setSearchIdx(i)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-sm ${i === idxSeguro ? 'bg-brand-muted' : 'hover:bg-surface-hover'}`}
                        >
                          <span className="truncate text-ink-700">{b.titulo}</span>
                          <span className="text-[11px] text-ink-400 flex-shrink-0">{b.materia}</span>
                        </button>
                      ))}
                </div>
              )}
            </div>
            <div className="text-[11px] text-ink-400 mt-2">
              <span className="font-700 text-ink-500">↑↓</span> para elegir · <span className="font-700 text-ink-500">Enter</span> para agregar · <span className="font-700 text-ink-500">Esc</span> limpia
            </div>
          </div>

          {/* Compositor de PDF propio */}
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-700 text-ink-500 uppercase tracking-wide">PDF propio · cobro por página</div>
              <button
                type="button"
                onClick={toggleAjustes}
                className={`text-xs font-700 px-2 py-1 rounded-lg transition-colors ${ajustes ? 'text-brand-DEFAULT bg-brand-muted' : 'text-ink-400 hover:text-ink-700 hover:bg-surface-hover'}`}
                title="Editar tarifas por página y redondeo"
              >⚙ Tarifas</button>
            </div>

            <div className="flex items-end gap-2 flex-wrap" onKeyDown={onPdfKeyDown}>
              <div className="flex-1 min-w-[170px]">
                <label className="text-[10px] font-700 text-ink-400 uppercase block mb-1">Nombre (opcional)</label>
                <input
                  ref={pdfNameRef}
                  className="input-field text-sm py-1.5"
                  placeholder={`PDF ${pdfsEnPedido + 1}`}
                  value={pdf.nombre}
                  onChange={e => setPdf(prev => ({ ...prev, nombre: e.target.value }))}
                />
              </div>
              {categorias.map(cat => (
                <div key={cat.id} className="w-[96px]">
                  <label className="text-[10px] font-700 text-ink-400 uppercase block mb-1 truncate" title={`${cat.nombre} — ${fmt(Number(cat.precio) || 0)} /pág`}>
                    {cat.nombre}
                  </label>
                  <input
                    className="input-field text-sm py-1.5 text-center"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={pdf.paginas?.[cat.id] || ''}
                    onChange={e => setPaginaPdf(cat.id, e.target.value)}
                    title={`${cat.nombre} — ${fmt(Number(cat.precio) || 0)} /pág`}
                  />
                </div>
              ))}
              <div className="text-right pb-1">
                <div className="text-[10px] font-700 text-ink-400 uppercase">Subtotal</div>
                <div className="font-700 text-ink-700">{fmt(pdfPrecio)}</div>
              </div>
              <button type="button" onClick={agregarPdf} className="btn-secondary px-3 py-2 whitespace-nowrap">
                ＋ Agregar
              </button>
            </div>
            <div className="text-[11px] mt-1.5">
              {pdfMsg
                ? <span className="text-danger font-700">{pdfMsg}</span>
                : <span className="text-ink-400">{pdfPaginas} página{pdfPaginas !== 1 ? 's' : ''} · <span className="font-700 text-ink-500">Enter</span> agrega otro PDF</span>}
            </div>

            {ajustes && (
              <div className="mt-3 pt-3 border-t border-ink-100">
                <div className="text-[11px] font-700 text-ink-500 uppercase tracking-wide mb-2">Tarifas por página</div>
                <div className="space-y-2">
                  {ajustes.categorias.map((cat, idx) => (
                    <div key={cat.id || idx} className="flex items-center gap-2 flex-wrap">
                      <input className="input-field flex-1 min-w-[140px] text-sm py-1.5" type="text" placeholder="Ej: Blanco y negro" value={cat.nombre} onChange={e => setCatAjuste(idx, { nombre: e.target.value })} />
                      <input className="input-field w-[110px] text-sm py-1.5" type="number" min="0" value={cat.precio} onChange={e => setCatAjuste(idx, { precio: Number(e.target.value || 0) })} />
                      <span className="text-xs text-ink-400 font-700">$ / pág</span>
                      <button
                        type="button"
                        onClick={() => setAjustes(a => ({ ...a, categorias: a.categorias.length <= 1 ? a.categorias : a.categorias.filter((_, i) => i !== idx) }))}
                        disabled={ajustes.categorias.length <= 1}
                        className="text-ink-400 hover:text-danger disabled:opacity-30 text-lg leading-none"
                        title="Quitar categoría"
                      >✕</button>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-x-4 gap-y-3 flex-wrap mt-3">
                  <button type="button" onClick={() => setAjustes(a => ({ ...a, categorias: [...a.categorias, { id: `cat_${Date.now().toString(36)}`, nombre: '', precio: 0 }] }))} className="btn-secondary text-xs px-3 py-1.5">
                    + Agregar categoría
                  </button>
                  <label className="flex items-center gap-2 text-xs font-700 text-ink-600 cursor-pointer select-none pb-1.5">
                    <input type="checkbox" className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT" checked={ajustes.redondear_impar} onChange={e => setAjustes(a => ({ ...a, redondear_impar: e.target.checked }))} />
                    Redondear a par
                  </label>
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => setAjustes(null)} className="btn-ghost text-xs px-3 py-1.5">Cancelar</button>
                    <button type="button" onClick={guardarAjustes} disabled={guardandoAjustes} className="btn-primary text-xs px-4 py-1.5">
                      {guardandoAjustes ? '…' : 'Guardar tarifas'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ítems del pedido */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-700 text-sm text-ink-800">Ítems del pedido ({items.length})</div>
              {items.length > 0 && <button onClick={vaciar} className="text-xs text-ink-400 hover:text-danger">Vaciar todo</button>}
            </div>

            {items.length === 0 ? (
              <div className="text-sm text-ink-400 py-8 text-center">
                Buscá un libro del catálogo o cargá un <span className="font-700">PDF propio</span> para empezar.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => {
                  const combos = combosPorItem[item.id] || [];
                  return (
                    <div key={item.id} className="flex items-center gap-3 p-2 rounded-xl bg-ink-50 flex-wrap">
                      <div className="flex-1 min-w-[160px]">
                        <div className="text-sm font-600 text-ink-800 truncate">
                          {item.titulo}
                          {item.origen === 'calculadora' && <span className="ml-2 badge bg-brand-muted text-brand-DEFAULT align-middle">PDF</span>}
                        </div>
                        <div className="text-[11px] text-ink-400">
                          {item.paginas} págs{item.hojas ? ` · ${item.hojas} hojas` : ''}
                          {item.comentario ? ` · ${item.comentario}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 w-[180px]">
                        <input
                          className="input-field text-xs py-1"
                          placeholder="Comentario (opcional)"
                          value={item.comentario || ''}
                          onChange={e => setComentario(item.id, e.target.value)}
                        />
                        {combos.length > 1 && (
                          <div className="flex items-center gap-1 flex-wrap" title="Variante del libro (formato/precio)">
                            {combos.map(c => {
                              const activa = (item.varianteId || '') === (c.key || '');
                              return (
                                <button
                                  key={c.key || c.label}
                                  type="button"
                                  onClick={() => setVarianteItem(item.id, c.key)}
                                  className={`text-[10px] font-700 px-1.5 py-0.5 rounded-full border transition-colors ${activa ? 'bg-brand-DEFAULT text-white border-brand-DEFAULT' : 'bg-surface border-border text-ink-600 hover:border-brand-DEFAULT hover:text-brand-DEFAULT'}`}
                                  title={`Cambiar a ${c.label} — ${fmt(c.precio || 0)}`}
                                >{c.label}</button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-700 text-ink-700 w-[90px] text-right">{fmt(Number(item.precio) || 0)}</div>
                      <button onClick={() => quitarItem(item.id)} className="text-ink-400 hover:text-danger text-lg leading-none" title="Quitar">✕</button>
                    </div>
                  );
                })}
                {enc.costo > 0 && (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-brand-50 text-sm">
                    <span className="text-ink-600">Encuadernación ({form.encuadernacion === 'todos' ? 'todos juntos' : 'cada PDF'}){enc.size ? ` · espiral ${enc.size}` : ''}</span>
                    <span className="font-700">{fmt(enc.costo)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-ink-100">
              <span className="text-sm text-ink-500">Subtotal ítems</span>
              <span className="font-700 text-ink-800">{fmt(subtotal)}</span>
            </div>
          </div>
        </div>

        {/* ── Datos del pedido ─────────────────────────────────────── */}
        <div className="card p-5 space-y-3 self-start lg:sticky lg:top-4" onKeyDown={onFormKeyDown}>
          <div className="font-700 text-sm text-ink-800">Datos del pedido</div>

          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Nombre</label>
            <input className="input-field" value={form.nombre} onChange={e => setForm({ nombre: e.target.value })} placeholder="Nombre del alumno" />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">WhatsApp</label>
            <input className="input-field" value={form.whatsapp} onChange={e => setForm({ whatsapp: e.target.value })} placeholder="3885111222" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Fecha retiro</label>
              <input className="input-field" type="date" value={form.fecha} onChange={e => setForm({ fecha: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Hora</label>
              <input className="input-field" type="time" value={form.hora} onChange={e => setForm({ hora: e.target.value })} />
              <div className="text-[10px] text-ink-400 mt-1">Vacío = a coordinar</div>
            </div>
          </div>

          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Pago</label>
            <div className="flex items-center gap-2">
              <input
                className="input-field flex-1"
                type="number"
                min={0}
                max={totalFinal}
                placeholder="Monto pagado (vacío = nulo)"
                value={form.parcial || ''}
                onChange={e => setForm({ parcial: Math.min(Math.max(0, Number(e.target.value) || 0), totalFinal) })}
              />
              <button type="button" onClick={() => setForm({ parcial: totalFinal })} className="btn-secondary text-xs px-3 py-2 whitespace-nowrap" title="Autocompletar el monto con el total">Total</button>
            </div>
            <div className="text-xs text-ink-400 mt-1">{pagoResumen}</div>
          </div>

          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Encuadernación (PDFs propios)</label>
            <select className="input-field" value={form.encuadernacion} onChange={e => setForm({ encuadernacion: e.target.value })}>
              <option value="ninguna">Sin encuadernación</option>
              <option value="cada">Cada PDF por su lado</option>
              <option value="todos">Todos juntos en una</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-ink-100">
            <span className="text-sm font-700 text-ink-800">Total</span>
            <span className="text-lg font-700 text-brand-DEFAULT">{fmt(totalFinal)}</span>
          </div>

          {error && <div className="text-xs font-700 text-danger bg-danger-muted rounded-lg px-3 py-2">{error}</div>}

          <button onClick={crearPedido} disabled={creando} className="btn-primary w-full py-3">
            {creando ? '…Creando' : 'Crear pedido'}
          </button>
          <div className="text-[11px] text-ink-400 text-center">Tab para moverte · Enter crea el pedido</div>
          <button onClick={() => setTab('pedidos')} className="btn-ghost w-full text-xs">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
