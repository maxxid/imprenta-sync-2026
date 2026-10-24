import React, { useState } from 'react';
import { Icon } from '../Icons';
import {
  fmt, RETIRO_LOCAL, turnoFromHorario, buildOrder, computeOrderStatus,
  buildConfirmationMessage, calcEncuadernacion,
  ensureBookVariantes, getBookCombinations, calcPrecioItem, bookCareerId
} from '../../lib/utils';
import { saveOrderToSupabase } from '../../lib/supabase';

const hoy = () => new Date().toISOString().split('T')[0];
const formBase = () => ({
  nombre: '', whatsapp: '', fecha: hoy(), hora: '',
  pago: 'total', parcial: 0, encuadernacion: 'ninguna'
});

/**
 * Tab Pedido Nuevo: carga manual de un pedido. Buscador de catálogo para agregar
 * libros al toque, botón "Calcular PDF" (se salta a la Calculadora y vuelve con el
 * resultado) y formulario (nombre, tel, fecha/hora de retiro, pago nulo/parcial/total,
 * encuadernación). Crea el pedido en `pedidos` (igual que checkout/parser): queda en
 * Pedidos y deja la confirmación pendiente en el tab WhatsApp.
 * El borrador vive en AdminPanel (`pedidoDraft`) para sobrevivir el cambio de tab.
 */
export function AdminPedidoNuevo({ config, books, setOrders, pedidoDraft, setPedidoDraft, setTab, setCalcFromOrder }) {
  const form = pedidoDraft?.form || formBase();
  const items = pedidoDraft?.items || [];
  const [q, setQ] = useState('');
  const [creando, setCreando] = useState(false);

  function setForm(patch) {
    setPedidoDraft(prev => ({ ...prev, form: { ...(prev?.form || formBase()), ...patch } }));
  }
  function setItems(nuevos) {
    setPedidoDraft(prev => ({ ...prev, items: nuevos }));
  }
  function vaciar() {
    setPedidoDraft({ items: [], form: formBase() });
    setQ('');
  }

  // ─── Buscador de catálogo ────────────────────────────────────────────
  const query = q.trim().toLowerCase();
  const resultados = query
    ? (books || [])
        .filter(b => b.activo !== false)
        .filter(b => `${b.titulo || ''} ${b.materia || ''} ${b.carrera || ''}`.toLowerCase().includes(query))
        .slice(0, 8)
    : [];

  function agregarDeCatalogo(book) {
    const wb = ensureBookVariantes(book, config);
    const combos = getBookCombinations(wb);
    const combo = combos[0] || null;
    const variante = combo?.variante || null;
    const price = calcPrecioItem(wb, variante, 'basica', config);
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
  }

  function quitarItem(id) {
    setItems(items.filter(i => i.id !== id));
  }
  function setComentario(id, valor) {
    setItems(items.map(i => (i.id === id ? { ...i, comentario: valor } : i)));
  }

  function irACalculadora() {
    setCalcFromOrder(true);
    setTab('calculadora');
  }

  // ─── Totales ────────────────────────────────────────────────────────
  const subtotal = items.reduce((acc, i) => acc + (Number(i.precio) || 0), 0);
  const enc = calcEncuadernacion(items, form.encuadernacion, config);
  const total = subtotal + enc.costo;

  async function crearPedido() {
    if (!(form.nombre || '').trim()) { alert('Cargá el nombre del alumno.'); return; }
    if (!items.length) { alert('Agregá al menos un ítem (buscador o calculadora).'); return; }
    if (!form.fecha) { alert('Cargá la fecha de retiro.'); return; }
    if (form.pago === 'parcial' && !(Number(form.parcial) > 0)) { alert('Cargá el monto pagado (o elegí Nulo / Total).'); return; }

    setCreando(true);
    try {
      // Ítems + línea de encuadernación (si corresponde) como ítem más.
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
        horario: form.hora || 'A coordinar',
        turno: form.hora ? turnoFromHorario(form.hora) : '',
        label: form.hora || 'A coordinar'
      };
      const order = buildOrder(
        itemsFinales,
        { nombre: form.nombre, whatsapp: form.whatsapp, pago: 'total', modalidad: RETIRO_LOCAL },
        slot, config, null, 'talo'
      );

      // Pago nulo / parcial / total (buildOrder asume 'total').
      const monto = form.pago === 'nulo' ? 0
        : form.pago === 'parcial' ? Math.max(0, Math.min(Number(form.parcial) || 0, order.total))
        : order.total;
      order.monto_pagado = monto;
      order.saldo_pendiente = Math.max(0, order.total - monto);
      order.pago_modalidad = form.pago;
      order.estado = computeOrderStatus(monto);
      order.items = order.items.map(i => ({ ...i, estado: order.estado }));
      order.encuadernacion_modo = form.encuadernacion;
      order.wa_confirmacion = buildConfirmationMessage(order);

      const saved = await saveOrderToSupabase(order, config);
      if (!saved) { alert('No se pudo guardar el pedido. Revisá la conexión.'); return; }

      setOrders(prev => [order, ...(prev || [])]);
      setPedidoDraft({ items: [], form: formBase() });
      setQ('');
      alert(`Pedido ${order.id} creado ✓ (queda en Pedidos y la confirmación pendiente en WhatsApp).`);
      setTab('pedidos');
    } catch (e) {
      console.error('Error creando pedido manual:', e);
      alert('Ocurrió un error al crear el pedido.');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div>
      {/* Buscador + atajo a calculadora */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3">
            <Icon.Search />
            <input
              className="flex-1 bg-transparent border-0 py-2 text-sm outline-none"
              placeholder="Buscar libro en el catálogo… (título, materia, carrera)"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          {query && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-[300px] overflow-y-auto">
              {resultados.length === 0
                ? <div className="p-3 text-xs text-ink-400">Sin resultados en el catálogo.</div>
                : resultados.map(b => (
                    <button
                      key={b.id}
                      onClick={() => agregarDeCatalogo(b)}
                      className="w-full text-left px-3 py-2 hover:bg-surface-hover flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate text-ink-700">{b.titulo}</span>
                      <span className="text-[11px] text-ink-400 flex-shrink-0">{b.materia}</span>
                    </button>
                  ))}
            </div>
          )}
        </div>
        <button onClick={irACalculadora} className="btn-secondary text-sm px-4 py-2 flex items-center gap-2" title="Calcular un PDF que no está en el catálogo">
          <Icon.Table /> Calcular PDF
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Ítems */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-700 text-sm text-ink-800">Ítems del pedido ({items.length})</div>
            {items.length > 0 && <button onClick={vaciar} className="text-xs text-ink-400 hover:text-danger">Vaciar</button>}
          </div>

          {items.length === 0 ? (
            <div className="text-sm text-ink-400 py-6 text-center">
              Buscá un libro del catálogo arriba, o tocá <span className="font-700">Calcular PDF</span> para uno que no esté.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-ink-50 flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-sm font-600 text-ink-800 truncate">{item.titulo}</div>
                    <div className="text-[11px] text-ink-400">
                      {item.paginas} págs{item.origen === 'calculadora' ? ' · calculadora' : ''}
                      {item.comentario ? ` · ${item.comentario}` : ''}
                    </div>
                  </div>
                  <input
                    className="input-field text-xs py-1 w-[180px]"
                    placeholder="Comentario (opcional)"
                    value={item.comentario || ''}
                    onChange={e => setComentario(item.id, e.target.value)}
                  />
                  <div className="text-sm font-700 text-ink-700 w-[90px] text-right">{fmt(Number(item.precio) || 0)}</div>
                  <button onClick={() => quitarItem(item.id)} className="text-ink-400 hover:text-danger text-lg leading-none" title="Quitar">✕</button>
                </div>
              ))}
              {enc.costo > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-brand-50 text-sm">
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

        {/* Formulario */}
        <div className="card p-5 space-y-3">
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
            </div>
          </div>

          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Pago</label>
            <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
              {[['nulo', 'Nulo'], ['parcial', 'Parcial'], ['total', 'Total']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setForm({ pago: v })}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-700 transition-colors ${form.pago === v ? 'bg-brand-DEFAULT text-white' : 'text-ink-500 hover:text-ink-700'}`}
                >{l}</button>
              ))}
            </div>
            {form.pago === 'parcial' && (
              <input
                className="input-field mt-2"
                type="number"
                placeholder="Monto pagado"
                value={form.parcial || ''}
                onChange={e => setForm({ parcial: Number(e.target.value) || 0 })}
              />
            )}
          </div>

          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1">Encuadernación (PDFs de la calculadora)</label>
            <select className="input-field" value={form.encuadernacion} onChange={e => setForm({ encuadernacion: e.target.value })}>
              <option value="ninguna">Sin encuadernación</option>
              <option value="cada">Cada PDF por su lado</option>
              <option value="todos">Todos juntos en una</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-ink-100">
            <span className="text-sm font-700 text-ink-800">Total</span>
            <span className="text-lg font-700 text-brand-DEFAULT">{fmt(total)}</span>
          </div>
          {form.pago === 'parcial' && (
            <div className="text-xs text-ink-400 -mt-1">Saldo: {fmt(Math.max(0, total - (Number(form.parcial) || 0)))}</div>
          )}

          <button onClick={crearPedido} disabled={creando} className="btn-primary w-full py-3">
            {creando ? '…Creando' : 'Crear pedido'}
          </button>
          <button onClick={() => setTab('pedidos')} className="btn-ghost w-full text-xs">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
