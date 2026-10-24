import React, { useState, useMemo } from 'react';
import { Icon } from '../Icons';
import { fmt, buildConfirmationMessage, generateRecordatorio } from '../../lib/utils';
import { updateOrderInSupabase } from '../../lib/supabase';

const hoyISO = () => new Date().toISOString().split('T')[0];

function waLink(whatsapp, texto) {
  const raw = String(whatsapp || '').replace(/\D/g, '');
  const num = raw ? (raw.startsWith('54') ? raw : `54${raw}`) : '';
  return `https://wa.me/${num}?text=${encodeURIComponent(texto || '')}`;
}

/**
 * Tab WhatsApp: gestión de los 2 mensajes del flujo.
 *  · HOY (retiros de hoy + atrasados): RECORDATORIO (día del retiro, IA).
 *  · PRÓXIMOS: CONFIRMACIÓN de carga (plantilla fija).
 * En ambos, los pendientes van arriba; por pedido se ve el mensaje, se puede editar,
 * se envía por wa.me y se marca como enviado (con opción de des-marcar).
 */
export function AdminWA({ orders, setOrders, config }) {
  const [tab, setTab] = useState('hoy');
  const [drafts, setDrafts] = useState({});
  const [genId, setGenId] = useState(null);

  const today = hoyISO();

  const activos = useMemo(
    () => (orders || []).filter(o => o.estado !== 'Entregado'),
    [orders]
  );

  const patchOrder = async (id, patch) => {
    const current = (orders || []).find(o => o.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    setOrders(prev => prev.map(o => o.id === id ? updated : o));
    try { await updateOrderInSupabase(updated, config); }
    catch (e) { console.error('Error guardando marca de WhatsApp:', e); }
  };

  const porFechaYPend = (a, b) => {
    if (a._pend !== b._pend) return a._pend ? -1 : 1;
    return String(a.fecha || '9999-99-99').localeCompare(String(b.fecha || '9999-99-99'));
  };

  const hoyLista = activos
    .filter(o => o.fecha && o.fecha <= today)
    .map(o => ({ ...o, _pend: !o.wa_recordatorio_enviado }));

  const proximosLista = activos
    .filter(o => !o.fecha || o.fecha > today)
    .map(o => ({ ...o, _pend: !o.wa_confirmacion_enviada }));

  const lista = (tab === 'hoy' ? hoyLista : proximosLista).sort(porFechaYPend);
  const pendientes = lista.filter(o => o._pend).length;

  const esHoy = tab === 'hoy';
  const campoMsj = esHoy ? 'wa_message' : 'wa_confirmacion';
  const campoEnviado = esHoy ? 'wa_recordatorio_enviado' : 'wa_confirmacion_enviada';

  // Confirmación: si nadie la editó (es exactamente la que se guardó al crear el
  // pedido, con el lugar de ESE momento) la regeneramos con el lugar ACTUAL — los
  // pedidos viejos guardaron la dirección de la facultad. Si fue editada, se respeta.
  const mensajeDe = (order) => {
    if (esHoy) return order.wa_message || '';
    const guardada = order.wa_confirmacion;
    if (!guardada) return buildConfirmationMessage(order, config);
    const intacta = guardada === buildConfirmationMessage(order); // sin config → lugar guardado
    return intacta ? buildConfirmationMessage(order, config) : guardada;
  };

  const generarRecordatorio = async (order) => {
    setGenId(order.id);
    try {
      const texto = await generateRecordatorio(order, config);
      if (texto) await patchOrder(order.id, { wa_message: texto });
      else alert('El proveedor no devolvió texto. Probá de nuevo.');
    } catch (e) {
      console.error(e);
      alert('No se pudo generar el recordatorio:\n' + (e.message || e));
    } finally { setGenId(null); }
  };

  const enviar = (order) => {
    const texto = (drafts[order.id] ?? mensajeDe(order)) || '';
    if (!texto.trim()) return;
    if (!order.whatsapp) { alert('Este pedido no tiene número de WhatsApp cargado.'); return; }
    window.open(waLink(order.whatsapp, texto), '_blank');
    patchOrder(order.id, { [campoMsj]: texto, [campoEnviado]: new Date().toISOString() });
  };

  const toggleEnviado = (order) => {
    if (order[campoEnviado]) patchOrder(order.id, { [campoEnviado]: null });
    else enviar(order);
  };

  const onDraftChange = (id, valor) => setDrafts(prev => ({ ...prev, [id]: valor }));
  const onDraftBlur = (order) => {
    const draft = drafts[order.id];
    if (draft === undefined) return;
    const original = mensajeDe(order);
    if (draft !== original) patchOrder(order.id, { [campoMsj]: draft });
    setDrafts(prev => { const { [order.id]: _omit, ...resto } = prev; return resto; });
  };

  // ─── Selección múltiple + OMITIR ──────────────────────────────────────
  // "Omitir" reutiliza el MISMO flag que "enviado" (decisión del usuario, sin
  // migración): la fila deja de salir en pendientes. Es reversible con "Deshacer"
  // o con el toggle de la fila.
  const [seleccion, setSeleccion] = useState(new Set());
  const [msg, setMsg] = useState(null); // { texto, ids } → permite deshacer

  const toggleSel = (id) => setSeleccion(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pendientesIds = lista.filter(o => o._pend).map(o => o.id);
  const todosPendSel = pendientesIds.length > 0 && pendientesIds.every(id => seleccion.has(id));
  const seleccionarPendientes = () => setSeleccion(new Set(pendientesIds));
  const limpiarSel = () => setSeleccion(new Set());

  const showMsg = (texto, ids = []) => {
    setMsg({ texto, ids });
    setTimeout(() => setMsg(prev => (prev && prev.texto === texto ? null : prev)), 8000);
  };

  const omitirSeleccion = async () => {
    const ids = lista.filter(o => seleccion.has(o.id)).map(o => o.id);
    if (!ids.length) return;
    const ts = new Date().toISOString();
    const hechos = [];
    for (const id of ids) {
      // Importante: `lista` trae `_pend` (derivado) → se persiste el pedido ORIGINAL.
      const raw = (orders || []).find(o => o.id === id);
      if (!raw) continue;
      const updated = { ...raw, [campoEnviado]: ts };
      const saved = await updateOrderInSupabase(updated, config);
      if (!saved) break; // saveOrderToSupabase ya mostró el alert
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
      hechos.push(id);
    }
    setSeleccion(new Set());
    const fallaron = ids.length - hechos.length;
    showMsg(
      `${hechos.length} omitida${hechos.length === 1 ? '' : 's'} ✓` +
      (fallaron ? ` · ${fallaron} fallaron` : ''),
      hechos
    );
  };

  const deshacerOmitir = async (ids) => {
    for (const id of ids || []) {
      const raw = (orders || []).find(o => o.id === id);
      if (!raw) continue;
      const updated = { ...raw, [campoEnviado]: null };
      const saved = await updateOrderInSupabase(updated, config);
      if (!saved) break;
      setOrders(prev => prev.map(o => o.id === id ? updated : o));
    }
    setMsg(null);
    setSeleccion(new Set());
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
          {[
            { id: 'hoy', label: `Hoy (${hoyLista.length})` },
            { id: 'proximos', label: `Próximos (${proximosLista.length})` }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSeleccion(new Set()); }}
              className={`px-4 py-2 rounded-lg text-sm font-700 transition-colors ${tab === t.id ? 'bg-brand-DEFAULT text-white shadow-md' : 'text-ink-500 hover:text-ink-700 hover:bg-surface-hover'}`}
            >{t.label}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs flex-wrap">
          {msg && (
            <span className="flex items-center gap-2">
              <span className="font-700 text-ok-DEFAULT">{msg.texto}</span>
              {msg.ids.length > 0 && (
                <button
                  onClick={() => deshacerOmitir(msg.ids)}
                  className="font-700 text-brand-DEFAULT underline hover:no-underline"
                >Deshacer</button>
              )}
            </span>
          )}
          <span className="text-ink-400">
            {pendientes > 0
              ? <span className="text-warn-DEFAULT font-700">{pendientes} sin enviar</span>
              : <span className="text-ok-DEFAULT font-700">Todo enviado ✓</span>}
          </span>
        </div>
      </div>

      <div className="text-xs text-ink-400 mb-4">
        {esHoy
          ? <>Retiros de hoy (y atrasados). El recordatorio se manda el MISMO DÍA del retiro pactado; generá el texto con IA y envialo por WhatsApp.</>
          : <>Pedidos con retiro futuro. La confirmación de carga entra acá como pendiente; enviala para que el alumno quede agendado.</>}
      </div>

      {lista.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap card px-4 py-2.5 mb-3">
          <label className="flex items-center gap-2 text-xs font-700 text-ink-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={todosPendSel}
              onChange={() => (todosPendSel ? limpiarSel() : seleccionarPendientes())}
              className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT"
            />
            Seleccionar pendientes ({pendientesIds.length})
          </label>
          {seleccion.size > 0 && (
            <>
              <span className="text-xs text-ink-400">{seleccion.size} seleccionado{seleccion.size === 1 ? '' : 's'}</span>
              <button onClick={limpiarSel} className="btn-ghost text-xs px-2 py-1">Limpiar</button>
              <button
                onClick={omitirSeleccion}
                className="btn-primary text-xs px-3 py-1.5"
                title="Marcar las filas seleccionadas como resueltas y sacarlas de pendientes"
              >Omitir ({seleccion.size})</button>
            </>
          )}
          <span className="ml-auto text-[11px] text-ink-400">Omitir marca la fila como resuelta y la saca de los pendientes (deshacible).</span>
        </div>
      )}

      {lista.length === 0 ? (
        <div className="card p-8 text-center text-ink-400 text-sm">
          {esHoy ? '🎉 Sin retiros para hoy.' : 'No hay pedidos próximos.'}
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(order => {
            const mensajeActual = drafts[order.id] ?? mensajeDe(order);
            const atrasado = esHoy && order.fecha && order.fecha < today;
            const enviado = Boolean(order[campoEnviado]);
            return (
              <div key={order.id} className={`card p-4 ${order._pend ? 'border-l-4 border-l-warn-DEFAULT' : 'opacity-70'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={seleccion.has(order.id)}
                        onChange={() => toggleSel(order.id)}
                        className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT cursor-pointer"
                        title="Seleccionar para omitir"
                      />
                      <span className="font-700 text-sm text-ink-800">{order.nombre || 'Sin nombre'}</span>
                      <span className="text-[11px] font-mono text-ink-400">{order.id}</span>
                      {order._pend
                        ? <span className="badge bg-warn-muted text-warn-DEFAULT text-[10px]">Pendiente</span>
                        : <span className="badge bg-ok-muted text-ok-DEFAULT text-[10px]">Enviado ✓</span>}
                      {atrasado && <span className="badge bg-danger-muted text-danger-DEFAULT text-[10px]">Atrasado</span>}
                    </div>
                    <div className="text-xs text-ink-500 mt-1">
                      {order.fecha || 'sin fecha'}{order.horario_entrega ? ` · ${order.horario_entrega} hs` : ''}
                      {order.lugar_entrega ? ` · ${order.lugar_entrega}` : ''}
                    </div>
                    <div className="text-[11px] text-ink-400 mt-0.5 truncate max-w-[420px]">
                      {order.libro}
                      {Number(order.saldo_pendiente) > 0 ? ` · debe ${fmt(order.saldo_pendiente)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={waLink(order.whatsapp, mensajeActual)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => patchOrder(order.id, { [campoMsj]: mensajeActual, [campoEnviado]: new Date().toISOString() })}
                      className={`btn-secondary text-xs px-3 py-1.5 ${!mensajeActual.trim() || !order.whatsapp ? 'pointer-events-none opacity-40' : ''}`}
                      title={order.whatsapp ? 'Abrir WhatsApp con el mensaje' : 'Sin número cargado'}
                    >{esHoy ? 'Recordatorio' : 'Confirmación'} ✉</a>
                    <button
                      onClick={() => toggleEnviado(order)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-700 border transition-colors ${enviado ? 'bg-ok-muted text-ok-DEFAULT border-ok-DEFAULT' : 'bg-surface text-ink-400 border-border hover:text-ink-600'}`}
                      title={enviado ? 'Des-marcar como enviado' : 'Marcar como enviado'}
                    >{enviado ? '✓ Enviado' : 'Marcar'}</button>
                    {esHoy && (
                      <button
                        onClick={() => generarRecordatorio(order)}
                        disabled={genId === order.id}
                        className="btn-secondary text-xs px-3 py-1.5"
                        title="Generar el texto del recordatorio con IA"
                      >{genId === order.id ? '…Generando' : (order.wa_message ? '🔄' : '+ Generar')}</button>
                    )}
                  </div>
                </div>

                <textarea
                  className="input-field text-xs w-full mt-3 font-mono whitespace-pre-wrap min-h-[70px]"
                  value={mensajeActual}
                  placeholder={esHoy ? 'Generá el recordatorio con "+ Generar" o escribí el mensaje…' : 'Mensaje de confirmación…'}
                  onChange={e => onDraftChange(order.id, e.target.value)}
                  onBlur={() => onDraftBlur(order)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
