import React, { useState, useMemo, useCallback } from 'react';
import { Icon } from '../Icons';
import { statusBadge, Alert, Spinner, fechaLabel, buildWhatsAppMessage } from '../UI';
import { fmt, slug, normalizePhone, calcPrecioItem, HOJAS, getCareer, careerLabel, deriveOrderEstado, extractTimeFromMessage, orderPagesForCapacity, getEspiralSize, getBookFormats, roundTotal } from '../../lib/utils';
import { ORDER_STATES, STATE_LABELS, STATE_STYLES, STATE_ROW_BG } from '../../lib/constants';
import { getSupabase, saveOrderToSupabase, syncOrderToSheets, updateOrderInSupabase, saveLocal, loadLocal, formatVentana, formatFechaCorta } from '../../lib/supabase';
import { getShopId } from '../../lib/shop';
import { BookFormPanel } from '../BookFormPanel';

function getFirstName(fullName) {
  return fullName?.split(' ')[0] || 'amigo';
}

function isDeliveryDay(order) {
  if (!order.fecha) return false;
  const today = new Date().toISOString().split('T')[0];
  return order.fecha === today;
}

function needsAttendanceConfirmation(order) {
  const readyStates = ['Listo'];
  return readyStates.includes(order.estado) && isDeliveryDay(order) && !order.asistencia_confirmada;
}

function parseWhatsAppMessage(text, books, config) {
  const lower = slug(text);
  const matchedBooks = books.filter(book => lower.includes(slug(book.titulo)) || lower.includes(slug(book.materia)));
  const firstBook = matchedBooks[0] || books[0];
  const formatoMatch = text.match(/\b(A4|A5)\b/i);
  const phoneMatch = text.match(/(\+?54\s*9\s*)?(\d[\d\s-]{7,})/);
  const namedMatch = text.match(/nombre\s*:\s*(.+)/i);
  const firstTextLine = text.split('\n').map(line => line.trim()).find(line => /^[A-Za-zÁÉÍÓÚáéíóúÑñ ]{5,}$/.test(line));
  const colorMatch = text.match(/\bcolor\b/i);
  const expressMatch = text.match(/urgente|express/i);
  const entregaMatch = text.match(/(\d{4}-\d{2}-\d{2})\s*(manana|tarde)?/i);
  const amountMatch = text.match(/\$\s*([\d\.]+)/);
  const formato = formatoMatch ? formatoMatch[1].toUpperCase() : (firstBook ? getBookFormats(firstBook)[0] : 'A4');
  const previewCalc = firstBook ? calcPrecioItem(firstBook, formato, 'basica', config, Boolean(colorMatch) && Number(firstBook.precio_color) > 0, Boolean(expressMatch)) : null;
  const total = matchedBooks.length > 0
    ? roundTotal(matchedBooks.reduce((acc, book) => acc + calcPrecioItem(book, formato, 'basica', config, Boolean(colorMatch) && Number(book.precio_color) > 0, Boolean(expressMatch)).total, 0), config)
    : (previewCalc ? previewCalc.total : 0);
  const montoPagado = amountMatch ? roundTotal(Number(amountMatch[1].replace(/\./g, '')), config) : 0;
  return {
    nombre: (namedMatch?.[1] || firstTextLine || 'Alumno sin identificar').trim(),
    whatsapp: normalizePhone(phoneMatch?.[2] || ''),
    libros: matchedBooks.length ? matchedBooks : firstBook ? [firstBook] : [],
    formato,
    color: Boolean(colorMatch),
    express: Boolean(expressMatch),
    pago: montoPagado >= total && total > 0 ? 'total' : montoPagado > 0 ? 'sena' : 'pendiente',
    montoPagado,
    saldo: Math.max(0, total - montoPagado),
    total,
    entrega: entregaMatch ? { fecha: entregaMatch[1], turno: (entregaMatch[2] || 'tarde').toLowerCase() } : null
  };
}

export function AdminPedidos({ orders, setOrders, books, config, setTab }) {
  const [filters, setFilters] = useState({
    estado: 'all',
    fecha: 'all',
    ventana: 'all',
    alumno: '',
    libro: '',
    formato: 'all',
    modalidad: 'all',
    hojas: 'all'
  });
  const [excludedStates, setExcludedStates] = useState([]);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [columnVisibility, setColumnVisibility] = useState({
    id: true,
    nombre: true,
    libro: true,
    formato: true,
    ventana_retiro: true,
    total: true,
    observaciones: true,
    estado: true,
    acciones: true
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [summaryVisible, setSummaryVisible] = useState(true);
  const [expandedWaId, setExpandedWaId] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [savingOrder, setSavingOrder] = useState(null);
  const [savingItemStates, setSavingItemStates] = useState({});
  const [resizing, setResizing] = useState(null);

  const sb = useMemo(() => getSupabase(config), [config.supabase.url, config.supabase.anon_key]);

  async function persistOrder(order) {
    try {
      const shopId = getShopId();
      const payload = { ...order, items: order.items || [] };
      if (shopId && !payload.shop_id) payload.shop_id = shopId;
      const upsertOpts = shopId ? { onConflict: 'id, shop_id' } : { onConflict: 'id' };
      await sb.from('pedidos').upsert(payload, upsertOpts);
      return true;
    } catch (err) {
      console.error('Error persistiendo pedido:', err);
      return false;
    }
  }

  async function removeOrder(id) {
    try {
      const query = sb.from('pedidos').delete().eq('id', id);
      const shopId = getShopId();
      if (shopId) query.eq('shop_id', shopId);
      await query;
    } catch (err) {
      console.error('Error eliminando pedido:', err);
    }
  }

  const dates = useMemo(
    () => [...new Set(orders.map(order => order.fecha).filter(Boolean))].sort(),
    [orders]
  );

  const itemRows = useMemo(
    () => orders.flatMap(order => {
      const items = order.items && order.items.length > 0 ? order.items : [{
        titulo: order.libro || 'Sin libro',
        formato: order.formato || 'A4',
        hojas: order.hojas || 0,
        paginas: order.paginas || 0,
        color: false,
        express: order.express || false,
        precio: order.total || 0,
        estado: order.estado || 'Pendiente de impresión'
      }];
      return items.map((item, idx) => ({ order, item, itemIndex: idx }));
    }),
    [orders]
  );

  const filtered = useMemo(() => {
    let result = itemRows.filter(row => {
      const { order, item } = row;
      const itemEstado = item.estado || order.estado || 'Pendiente de impresión';
      const estado = excludedStates.length > 0
        ? !excludedStates.includes(itemEstado)
        : (filters.estado === 'all' || itemEstado === filters.estado);
      const isEditing = editingOrder === order.id;
      const fecha = isEditing || filters.fecha === 'all' || order.fecha === filters.fecha;
      const ventana = isEditing || filters.ventana === 'all' || order.turno === filters.ventana;
      const alumno = !filters.alumno || slug(order.nombre).includes(slug(filters.alumno));
      const libro = !filters.libro || slug(item.titulo || order.libro).includes(slug(filters.libro));
      const formato = filters.formato === 'all' || String(item.formato || order.formato).includes(filters.formato);
      const modalidad = filters.modalidad === 'all' || order.modalidad_entrega === filters.modalidad;
      const hojas = filters.hojas === 'all'
        || (filters.hojas === 'lt100' && (item.hojas || order.hojas) < 100)
        || (filters.hojas === '100to300' && (item.hojas || order.hojas) >= 100 && (item.hojas || order.hojas) <= 300)
        || (filters.hojas === 'gt300' && (item.hojas || order.hojas) > 300);
      return estado && fecha && ventana && alumno && libro && formato && modalidad && hojas;
    });

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let aVal, bVal;
        if (sortConfig.key === 'libro') { aVal = a.item.titulo || a.order.libro; bVal = b.item.titulo || b.order.libro; }
        else if (sortConfig.key === 'estado') { aVal = ORDER_STATES.indexOf(a.item.estado || a.order.estado); bVal = ORDER_STATES.indexOf(b.item.estado || b.order.estado); }
        else if (sortConfig.key === 'formato') { aVal = a.item.formato || a.order.formato; bVal = b.item.formato || b.order.formato; }
        else if (sortConfig.key === 'ventana_retiro') { aVal = (a.order.fecha || '') + (a.order.horario_entrega || a.order.turno || ''); bVal = (b.order.fecha || '') + (b.order.horario_entrega || b.order.turno || ''); }
        else { aVal = a.order[sortConfig.key]; bVal = b.order[sortConfig.key]; }
        if (typeof aVal === 'string') { aVal = slug(aVal); bVal = slug(bVal); }
        if (aVal == null) aVal = ''; if (bVal == null) bVal = '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [itemRows, excludedStates, filters, editingOrder, sortConfig]);

  const pedidosSummary = useMemo(() => {
    const summary = {};
    for (const row of filtered) {
      const estado = row.item.estado || row.order.estado || 'Pendiente de impresión';
      if (!summary[estado]) summary[estado] = { count: 0, libros: 0, total: 0, saldo: 0, hojas: 0, orderIds: new Set() };
      summary[estado].libros++;
      summary[estado].hojas += Number(row.item.hojas || row.order.hojas || 0);
      if (!summary[estado].orderIds.has(row.order.id)) {
        summary[estado].orderIds.add(row.order.id);
        summary[estado].count++;
        summary[estado].total += Number(row.order.total || 0);
        summary[estado].saldo += Number(row.order.saldo_pendiente || 0);
      }
    }
    return summary;
  }, [filtered]);

  const activeFilterLabels = useMemo(() => {
    const labels = [];
    if (excludedStates.length > 0) labels.push('Excluye: ' + excludedStates.map(s => STATE_LABELS[s] || s).join(', '));
    if (filters.estado !== 'all') labels.push('Estado: ' + (STATE_LABELS[filters.estado] || filters.estado));
    if (filters.fecha !== 'all') labels.push('Fecha: ' + filters.fecha);
    if (filters.ventana !== 'all') labels.push('Ventana: ' + filters.ventana);
    if (filters.alumno) labels.push('Alumno: ' + filters.alumno);
    if (filters.libro) labels.push('Libro: ' + filters.libro);
    if (filters.formato !== 'all') labels.push('Formato: ' + filters.formato);
    if (filters.modalidad !== 'all') labels.push('Entrega: ' + filters.modalidad);
    if (filters.hojas !== 'all') labels.push('Hojas: ' + filters.hojas);
    return labels;
  }, [excludedStates, filters]);

  function handleSort(key) {
    setSortConfig(current => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  function handleResizeStart(e, index) {
    setResizing({ index, startX: e.clientX });
  }

  function handleResizeMove(e) {
    if (!resizing) return;
    const th = document.querySelectorAll('.table-shell th')[resizing.index];
    if (th) {
      const newWidth = Math.max(80, th.offsetWidth + (e.clientX - resizing.startX));
      th.style.width = `${newWidth}px`;
      setResizing({ ...resizing, startX: e.clientX });
    }
  }

  function handleResizeEnd() {
    setResizing(null);
  }

  const advanceItemState = useCallback(async (orderId, itemIndex, direction) => {
    const key = `${orderId}-${itemIndex}`;
    if (savingItemStates[key]) return;
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.items || !order.items[itemIndex]) return;
    setSavingItemStates(prev => ({ ...prev, [key]: true }));
    try {
      const item = order.items[itemIndex];
      const idx = ORDER_STATES.indexOf(item.estado);
      const newIdx = direction === 'next' ? Math.min(ORDER_STATES.length - 1, idx + 1) : Math.max(0, idx - 1);
      const newEstado = ORDER_STATES[newIdx];
      const updatedItems = order.items.map((it, i) => i === itemIndex ? { ...it, estado: newEstado } : it);
      const updated = { ...order, items: updatedItems, estado: deriveOrderEstado(updatedItems) };
      const ok = await persistOrder(updated);
      if (!ok) return;
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    } finally {
      setSavingItemStates(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
  }, [orders, savingItemStates, setOrders, persistOrder]);

  const deleteOrder = useCallback(async (orderId) => {
    if (savingOrder) return;
    if (confirm('¿Eliminar este pedido permanentemente?')) {
      setSavingOrder(orderId);
      try {
        removeOrder(orderId);
        setOrders(prev => prev.filter(o => o.id !== orderId));
        if (editingOrder === orderId) setEditingOrder(null);
      } finally {
        setSavingOrder(null);
      }
    }
  }, [savingOrder, editingOrder, setOrders]);

  function updateOrderField(orderId, field, value) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value } : o));
  }

  const saveEditedOrder = useCallback(async (orderId) => {
    setSavingOrder(orderId);
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      const turno = order.turno || '10:00';
      const horario = turno;
      const updated = {
        ...order,
        ventana_retiro: order.fecha ? `${formatFechaCorta(order.fecha)} · ${horario}` : order.ventana_retiro,
        horario_entrega: horario
      };
      await persistOrder(updated);
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
      setEditingOrder(null);
    } finally {
      setSavingOrder(null);
    }
  }, [orders, setOrders, persistOrder]);

  const persistOrderCallback = useCallback(async (order) => {
    setSavingOrder(order.id);
    try {
      const updatedItems = (order.items || []).map(it => ({ ...it, estado: 'Pendiente de impresión' }));
      const updated = { ...order, items: updatedItems, estado: 'Pendiente de impresión', monto_pagado: order.total, saldo_pendiente: 0 };
      await persistOrder(updated);
      setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
    } finally {
      setSavingOrder(null);
    }
  }, [setOrders, persistOrder]);

  const columns = [
    { key: 'id', label: 'Pedido' },
    { key: 'nombre', label: 'Alumno' },
    { key: 'libro', label: 'Libro' },
    { key: 'formato', label: 'Formato' },
    { key: 'ventana_retiro', label: 'Entrega' },
    { key: 'total', label: 'Pago' },
    { key: 'observaciones', label: 'Obs' },
    { key: 'estado', label: 'Estado' },
    { key: null, label: 'Acciones' }
  ];

  return (
    <div className="space-y-5">
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-700 text-ink-800">
            <Icon.Filter /> Multi-filtros
            {excludedStates.length > 0 && <span className="badge bg-accent-muted text-accent text-xs ml-2">Excluyendo {excludedStates.length}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              className={`badge text-xs px-2.5 py-1.5 font-700 transition-colors ${excludedStates.includes('Entregado') && excludedStates.includes('Pendiente de pago') && excludedStates.includes('Listo') ? 'bg-brand-DEFAULT text-white' : 'bg-ink-100 text-ink-600 hover:bg-brand-muted hover:text-brand-DEFAULT'}`}
              onClick={() => {
                const target = ['Entregado', 'Pendiente de pago', 'Listo'];
                const isActive = excludedStates.includes('Entregado') && excludedStates.includes('Pendiente de pago') && excludedStates.includes('Listo');
                if (isActive) {
                  setExcludedStates([]);
                } else {
                  setExcludedStates(target);
                  setFilters(current => ({ ...current, estado: 'all' }));
                }
              }}
              title="Mostrar solo pedidos que requieren acción (excluye Terminado, Entregado y Pendiente de pago)"
            >
              POR HACER
            </button>
            <button
              className={`badge text-xs px-2.5 py-1.5 font-700 transition-colors ${excludedStates.length === 1 && excludedStates.includes('Entregado') ? 'bg-brand-DEFAULT text-white' : 'bg-ink-100 text-ink-600 hover:bg-brand-muted hover:text-brand-DEFAULT'}`}
              onClick={() => {
                const target = ['Entregado'];
                const isActive = excludedStates.length === 1 && excludedStates.includes('Entregado');
                if (isActive) {
                  setExcludedStates([]);
                } else {
                  setExcludedStates(target);
                  setFilters(current => ({ ...current, estado: 'all' }));
                }
              }}
              title="Mostrar pedidos pendientes de entrega (excluye solo Entregado)"
            >
              POR ENTREGAR
            </button>
            <button
              className="btn-ghost text-xs px-2 py-1.5"
              onClick={() => {
                setFilters({ estado: 'all', fecha: 'all', ventana: 'all', alumno: '', libro: '', formato: 'all', modalidad: 'all', hojas: 'all' });
                setExcludedStates([]);
              }}
              title="Resetear filtros"
            >
              Resetear
            </button>
            <button
              className="btn-ghost text-xs px-2 py-1.5"
              onClick={() => setFiltersVisible(!filtersVisible)}
              title={filtersVisible ? 'Ocultar filtros' : 'Mostrar filtros'}
            >
              {filtersVisible ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              )}
            </button>
          </div>
        </div>
        {filtersVisible && (
          <div className="filter-grid">
            <div className="relative">
              <select className="input-field" value={filters.estado} onChange={event => {
                const val = event.target.value;
                if (val === 'invert') {
                  setExcludedStates(ORDER_STATES.filter(s => s !== filters.estado && s !== 'all'));
                  setFilters(current => ({ ...current, estado: 'all' }));
                } else {
                  setExcludedStates([]);
                  setFilters(current => ({ ...current, estado: val }));
                }
              }}>
                <option value="all">Todos los estados</option>
                {ORDER_STATES.map(state => <option key={state} value={state}>{STATE_LABELS[state] || state}</option>)}
                <option value="invert">Invertir selección</option>
              </select>
              {excludedStates.length > 0 && (
                <button
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-accent hover:text-accent-light"
                  onClick={() => setExcludedStates([])}
                >
                  ✕
                </button>
              )}
            </div>
            <select className="input-field" value={filters.fecha} onChange={event => setFilters(current => ({ ...current, fecha: event.target.value }))}>
              <option value="all">Todos los dias</option>
              {dates.map(date => {
                const [y, m, d] = date.split('-').map(Number);
                const dayName = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short' });
                return <option key={date} value={date}>{dayName} {date}</option>;
              })}
            </select>
            <select className="input-field" value={filters.ventana} onChange={event => setFilters(current => ({ ...current, ventana: event.target.value }))}>
              <option value="all">Todas las ventanas</option>
              {Array.from({length: 15}, (_, i) => i + 9).map(h => (
                <option key={h} value={`${String(h).padStart(2, '0')}:00`}>{`${String(h).padStart(2, '0')}:00 hs`}</option>
              ))}
            </select>
            <input className="input-field" placeholder="Alumno" value={filters.alumno} onChange={event => setFilters(current => ({ ...current, alumno: event.target.value }))} />
            <input className="input-field" placeholder="Libro" value={filters.libro} onChange={event => setFilters(current => ({ ...current, libro: event.target.value }))} />
            <select className="input-field" value={filters.formato} onChange={event => setFilters(current => ({ ...current, formato: event.target.value }))}>
              <option value="all">Todos los formatos</option>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
            <select className="input-field" value={filters.modalidad} onChange={event => setFilters(current => ({ ...current, modalidad: event.target.value }))}>
              <option value="all">Todas las entregas</option>
              <option value="Retiro domicilio">Retiro domicilio</option>
              <option value="Retiro facultad">Retiro facultad</option>
              <option value="Cadete">Cadete</option>
            </select>
            <select className="input-field" value={filters.hojas} onChange={event => setFilters(current => ({ ...current, hojas: event.target.value }))}>
              <option value="all">Todas las hojas</option>
              <option value="lt100">Menos de 100</option>
              <option value="100to300">100 a 300</option>
              <option value="gt300">Mas de 300</option>
            </select>
          </div>
        )}
      </div>

      <div className="table-shell" onMouseMove={handleResizeMove} onMouseUp={handleResizeEnd} onMouseLeave={handleResizeEnd}>
        <table>
          <thead>
            <tr>
              {columns.map((col, idx) => {
                const isVisible = columnVisibility[col.key || 'acciones'];
                return (
                  <th
                    key={col.label}
                    className={`${sortConfig.key === col.key ? `sort-${sortConfig.direction}` : ''} ${!isVisible ? 'w-10 min-w-[40px] max-w-[40px]' : ''}`}
                    style={!isVisible ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden' } : {}}
                    onClick={() => col.key && isVisible && handleSort(col.key)}
                  >
                    <div className="flex items-center justify-between">
                      {isVisible ? (
                        <span className="flex items-center">
                          {col.label}
                          {col.key && <span className="sort-icon">{sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}</span>}
                        </span>
                      ) : (
                        <span className="text-xs opacity-50">{col.label.charAt(0)}</span>
                      )}
                      <button
                        className="ml-1 text-ink-400 hover:text-ink-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setColumnVisibility(current => ({ ...current, [col.key || 'acciones']: !current[col.key || 'acciones'] }));
                        }}
                        title={isVisible ? 'Ocultar columna' : 'Mostrar columna'}
                      >
                        {isVisible ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        )}
                      </button>
                    </div>
                    {idx < 7 && isVisible && <div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, idx); }} />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const { order, item, itemIndex } = row;
              const itemEstado = item.estado || order.estado || 'Pendiente de impresión';
              const totalItems = order.items?.length || 1;
              return (
                <tr key={`${order.id}-${itemIndex}`} className={STATE_ROW_BG[itemEstado] || ''}>
                  <td style={!columnVisibility.id ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.id ? (
                      <>
                        {order.wa_raw ? (
                          <button
                            className="font-700 text-ink-900 text-left hover:text-brand-DEFAULT hover:underline cursor-pointer transition-colors"
                            title={order.wa_raw}
                            onClick={() => setExpandedWaId(expandedWaId === order.id ? null : order.id)}
                          >
                            {order.id}
                          </button>
                        ) : (
                          <div className="font-700 text-ink-900">{order.id}</div>
                        )}
                        {expandedWaId === order.id && order.wa_raw && (
                          <div className="text-xs text-ink-500 mt-1 bg-ink-25 rounded p-1.5 max-w-[200px] whitespace-pre-wrap break-words">{order.wa_raw}</div>
                        )}
                        {itemIndex === 0 && order.es_unico && (
                          <span className="badge bg-amber-100 text-amber-700 text-[10px] mt-0.5">Único</span>
                        )}
                        <div className="text-xs text-ink-400">{itemIndex + 1}/{totalItems} · {item.hojas || order.hojas} hojas</div>
                      </>
                    ) : (
                      <span className="text-xs opacity-50">#</span>
                    )}
                  </td>
                  <td style={!columnVisibility.nombre ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.nombre ? (
                      <>
                        <button
                          className="font-700 text-ink-900 text-left hover:text-brand-DEFAULT transition-colors"
                          onClick={() => { setFilters(current => ({ ...current, alumno: order.nombre })); document.activeElement?.blur(); }}
                        >
                          {order.nombre}
                        </button>
                        <a
                          href={`https://wa.me/54${order.whatsapp}?text=${encodeURIComponent(`Hola ${getFirstName(order.nombre)} como estas, te quería preguntar`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-ink-400 hover:text-[#25D366] transition-colors block mt-0.5"
                        >
                          +54 9 {order.whatsapp}
                        </a>
                      </>
                    ) : (
                      <span className="text-xs opacity-50">👤</span>
                    )}
                  </td>
                  <td style={!columnVisibility.libro ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.libro ? (
                      <>
                        <div className="font-700 text-ink-900">{item.titulo || order.libro}</div>
                        <div className="text-xs text-ink-400">{order.carrera}</div>
                      </>
                    ) : (
                      <span className="text-xs opacity-50">📚</span>
                    )}
                  </td>
                  <td style={!columnVisibility.formato ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.formato ? (
                      <>
                        <div className="font-700 text-ink-900">{item.formato || order.formato}{item.color ? ' Color' : ' B/N'}</div>
                        <div className="text-xs text-ink-400">
                          {order.excede_capacidad
                            ? `${order.hojas_primera_entrega} + ${order.hojas_segunda_entrega} = ${order.hojas} hojas`
                            : `${item.hojas || order.hojas} hojas - ${getEspiralSize(item.hojas || order.hojas, config)}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs opacity-50">⚙</span>
                    )}
                  </td>
                  <td style={!columnVisibility.ventana_retiro ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.ventana_retiro ? (
                      editingOrder === order.id ? (
                        <div className="flex flex-col gap-1">
                          <input className="input-field text-xs py-1 w-full" value={order.fecha || ''} onChange={e => updateOrderField(order.id, 'fecha', e.target.value)} type="date" />
                          <select className="input-field text-xs py-1 w-full" value={order.turno || '10:00'} onChange={e => updateOrderField(order.id, 'turno', e.target.value)}>
                            {Array.from({length: 15}, (_, i) => i + 9).map(h => (
                              <option key={h} value={`${String(h).padStart(2, '0')}:00`}>{`${String(h).padStart(2, '0')}:00 hs`}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="font-700 text-ink-900">{order.modalidad_entrega || 'Retiro facultad'}</div>
                          {order.excede_capacidad ? (
                            <div className="text-xs text-ink-400">
                              <div>1°: {formatVentana(order.ventana_retiro, order.fecha, order.horario_entrega)} ({order.hojas_primera_entrega} hojas)</div>
                              <div>2°: {new Date(`${order.segunda_entrega_fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })} ({order.hojas_segunda_entrega} hojas)</div>
                            </div>
                          ) : (
                            <div className="text-xs text-ink-400">{formatVentana(order.ventana_retiro, order.fecha, order.horario_entrega)}</div>
                          )}
                        </>
                      )
                    ) : (
                      <span className="text-xs opacity-50">📅</span>
                    )}
                  </td>
                  <td style={!columnVisibility.total ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.total ? (
                      editingOrder === order.id ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-400">Pagado</span>
                            <input className="input-field text-xs py-1 w-[80px]" type="number" value={order.monto_pagado || 0} onChange={e => updateOrderField(order.id, 'monto_pagado', Number(e.target.value) || 0)} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-400">Saldo</span>
                            <input className="input-field text-xs py-1 w-[80px]" type="number" value={order.saldo_pendiente || 0} onChange={e => updateOrderField(order.id, 'saldo_pendiente', Number(e.target.value) || 0)} />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="font-700 text-ink-900">{fmt(item.precio || 0)}</div>
                          <div className="text-xs text-ink-400">Total {fmt(order.total)} · {fmt(order.monto_pagado)} pagado · {fmt(order.saldo_pendiente)} saldo</div>
                        </>
                      )
                    ) : (
                      <span className="text-xs opacity-50">💰</span>
                    )}
                  </td>
                  <td style={!columnVisibility.observaciones ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.observaciones ? (
                      editingOrder === order.id ? (
                        itemIndex === 0 ? (
                          <input className="input-field text-xs py-1 w-full" value={order.notas_admin || ''} onChange={e => updateOrderField(order.id, 'notas_admin', e.target.value)} placeholder="Observación" />
                        ) : null
                      ) : (
                        itemIndex === 0 && (order.notas_admin || (order.items?.[0]?.observaciones)) ? (
                          <span className="text-xs text-ink-500 truncate block max-w-[120px]" title={order.notas_admin || order.items?.[0]?.observaciones || ''}>
                            {order.notas_admin || order.items?.[0]?.observaciones || ''}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-300">—</span>
                        )
                      )
                    ) : (
                      <span className="text-xs opacity-50">💬</span>
                    )}
                  </td>
                  <td style={!columnVisibility.estado ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.estado ? (
                      <>
                        <div className={`inline-flex items-center gap-1 rounded-full overflow-hidden ${STATE_STYLES[itemEstado] || ''}`}>
                          <button
                            className={`px-2 py-1.5 transition-colors font-bold text-sm ${savingItemStates[`${order.id}-${itemIndex}`] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/10'}`}
                            onClick={() => advanceItemState(order.id, itemIndex, 'prev')}
                            disabled={savingItemStates[`${order.id}-${itemIndex}`]}
                            title="Retroceder estado"
                          >
                            {savingItemStates[`${order.id}-${itemIndex}`] ? <span className="spinner-sm" /> : '←'}
                          </button>
                          <span className="text-xs font-700 px-1">
                            {STATE_LABELS[itemEstado] || itemEstado}
                          </span>
                          <button
                            className={`px-2 py-1.5 transition-colors font-bold text-sm ${savingItemStates[`${order.id}-${itemIndex}`] ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/10'}`}
                            onClick={() => advanceItemState(order.id, itemIndex, 'next')}
                            disabled={savingItemStates[`${order.id}-${itemIndex}`]}
                            title="Avanzar estado"
                          >
                            {savingItemStates[`${order.id}-${itemIndex}`] ? <span className="spinner-sm" /> : '→'}
                          </button>
                        </div>
                        {itemIndex === 0 && order.asistencia_confirmada && <span className="badge bg-ok-muted text-ok-DEFAULT text-xs mt-1 inline-block">✓ Asistencia confirmada</span>}
                        {itemIndex === 0 && needsAttendanceConfirmation(order) && <span className="badge bg-accent-muted text-accent animate-pulse text-xs mt-1 inline-block">Espera confirmacion</span>}
                        {itemIndex === 0 && order.excede_capacidad && <span className="badge bg-amber-50 text-amber-600 text-xs mt-1 inline-block">⚠️ Excede capacidad</span>}
                        {itemIndex === 0 && order.metodo_pago === 'transferencia' && itemEstado === 'Pendiente de pago' && (
                          <span className="badge bg-blue-50 text-blue-600 text-xs mt-1 inline-block">💳 Espera pago</span>
                        )}
                      </>
                    ) : (
                      <button
                        className="text-xs font-bold text-ink-400 hover:text-ink-700 transition-colors px-1"
                        onClick={() => advanceItemState(order.id, itemIndex, 'next')}
                        title={`Avanzar estado (${itemEstado})`}
                      >
                        →
                      </button>
                    )}
                  </td>
                  <td style={!columnVisibility.acciones ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {columnVisibility.acciones ? (
                      <div className="flex items-center gap-2">
                        {editingOrder === order.id ? (
                          <>
                            <button
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-all ${savingOrder === order.id ? 'bg-brand-muted text-brand-DEFAULT' : 'bg-ok-muted text-ok-DEFAULT hover:bg-ok-muted/80'}`}
                              onClick={() => saveEditedOrder(order.id)}
                              disabled={savingOrder !== null}
                              title="Guardar cambios"
                            >
                              {savingOrder === order.id ? (
                                <span className="spinner-sm" />
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              )}
                            </button>
                            <button
                              className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-all ${savingOrder === order.id ? 'bg-red-50/50 text-red-400' : 'bg-red-50 text-red-500 hover:bg-red-100'}`}
                              onClick={() => deleteOrder(order.id)}
                              disabled={savingOrder !== null}
                              title="Eliminar pedido"
                            >
                              {savingOrder === order.id ? (
                                <span className="spinner-sm" />
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              )}
                            </button>
                            <button
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-ink-100 text-ink-500 hover:bg-ink-200 transition-colors"
                              onClick={() => setEditingOrder(null)}
                              title="Cancelar edición"
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            {itemIndex === 0 && order.metodo_pago === 'transferencia' && itemEstado === 'Pendiente de pago' && (
                              <button
                                className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-all ${savingOrder === order.id ? 'bg-blue-50/50 text-blue-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                disabled={savingOrder !== null}
                                onClick={async () => {
                                  if (savingOrder) return;
                                  if (confirm('¿Confirmar que recibiste el pago por transferencia?')) {
                                    await persistOrderCallback(order);
                                  }
                                }}
                                title="Confirmar pago recibido"
                              >
                                {savingOrder === order.id ? (
                                  <span className="spinner-sm" />
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                )}
                              </button>
                            )}
                            <button
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-ink-100 text-ink-500 hover:bg-ink-200 transition-colors"
                              onClick={() => setEditingOrder(order.id)}
                              title="Editar pedido"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <a
                              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#25D366] text-white hover:bg-[#128C7E] transition-colors"
                              href={`https://wa.me/54${order.whatsapp}?text=${encodeURIComponent(buildWhatsAppMessage(order))}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir WhatsApp con mensaje personalizado"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </a>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs opacity-50">⚡</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="8" className="text-center text-ink-400 py-10">No hay pedidos que coincidan con los filtros actuales.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="font-700 text-sm text-ink-800">Resumen</div>
          {activeFilterLabels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activeFilterLabels.map((label, i) => (
                <span key={i} className="badge bg-accent-muted text-accent text-xs">{label}</span>
              ))}
            </div>
          )}
          <button
            className="ml-auto inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-ink-100 text-ink-400 transition-colors"
            onClick={() => setSummaryVisible(v => !v)}
            title={summaryVisible ? 'Ocultar resumen' : 'Mostrar resumen'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: summaryVisible ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
        {summaryVisible && (
          <div className="overflow-x-auto flex justify-center">
            <table className="text-sm">
              <thead>
                <tr className="border-b border-ink-100">
                  <th className="text-left py-1.5 pr-3 text-xs text-ink-400 font-600">Estado</th>
                  <th className="text-right py-1.5 px-2 text-xs text-ink-400 font-600 w-16">Pedidos</th>
                  <th className="text-right py-1.5 px-2 text-xs text-ink-400 font-600 w-16">Libros</th>
                  <th className="text-right py-1.5 px-2 text-xs text-ink-400 font-600 w-20">Total $</th>
                  <th className="text-right py-1.5 px-2 text-xs text-ink-400 font-600 w-20">Saldo $</th>
                  <th className="text-right py-1.5 px-2 text-xs text-ink-400 font-600 w-16">Hojas</th>
                </tr>
              </thead>
              <tbody>
                {ORDER_STATES.map((estado, idx, arr) => {
                  const data = pedidosSummary[estado];
                  const isFirst = idx === 0;
                  const isLast = idx === arr.length - 1;
                  const bgClass = idx % 2 === 0 ? 'bg-ink-25' : 'bg-ink-50';
                  return (
                    <tr key={estado} className={`border-b border-ink-100 ${bgClass}`}>
                      <td className={`py-1.5 pr-3 text-ink-700 font-600 ${isFirst ? 'rounded-tl-lg' : ''} ${isLast ? 'rounded-bl-lg' : ''}`}>{STATE_LABELS[estado] || estado}</td>
                      <td className="py-1.5 px-2 text-right text-ink-700">{data ? data.count : 0}</td>
                      <td className="py-1.5 px-2 text-right text-ink-700">{data ? data.libros : 0}</td>
                      <td className="py-1.5 px-2 text-right font-600 text-ink-800">{fmt(data ? data.total : 0)}</td>
                      <td className="py-1.5 px-2 text-right text-ink-600">{fmt(data ? data.saldo : 0)}</td>
                      <td className={`py-1.5 px-2 text-right text-ink-600 ${isFirst ? 'rounded-tr-lg' : ''} ${isLast ? 'rounded-br-lg' : ''}`}>{data ? data.hojas : 0}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-200 font-700 bg-ink-100">
                  <td className="py-2 pr-3 text-ink-900 rounded-bl-lg">TOTAL GENERAL</td>
                  <td className="py-2 px-2 text-right text-ink-900">{Object.values(pedidosSummary).reduce((a, s) => a + s.count, 0)}</td>
                  <td className="py-2 px-2 text-right text-ink-900">{Object.values(pedidosSummary).reduce((a, s) => a + s.libros, 0)}</td>
                  <td className="py-2 px-2 text-right text-ink-900">{fmt(Object.values(pedidosSummary).reduce((a, s) => a + s.total, 0))}</td>
                  <td className="py-2 px-2 text-right text-ink-900">{fmt(Object.values(pedidosSummary).reduce((a, s) => a + s.saldo, 0))}</td>
                  <td className="py-2 px-2 text-right text-ink-900 rounded-br-lg">{Object.values(pedidosSummary).reduce((a, s) => a + s.hojas, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
