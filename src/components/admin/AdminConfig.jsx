import React, { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { Alert } from '../UI';
import { getCareers, careerLabel, DIAS, DIAS_ORDER, buildVentana, normalizeVentanas, turnoFromHorario, nextHorario, slug } from '../../lib/utils';
import { saveConfigToSupabase, saveLocal, loadLocal, deepMerge } from '../../lib/supabase';
import { STORAGE, DEFAULT_PARSER_PROMPT, DEFAULT_WA_PROMPT } from '../../lib/constants';

export function AdminConfig({ config, setConfig }) {
  const [configDraft, setConfigDraft] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // 'ok' | 'local' | null
  const [newHoliday, setNewHoliday] = useState({ fecha: '', motivo: '', universidad: '' });
  const [bulkTime, setBulkTime] = useState('19:00');
  const [addTimes, setAddTimes] = useState({}); // horario tipeado en "Agregar" por (carrera|día)

  const universities = [...new Set(
    (config.carreras || []).filter(c => c.universidad).map(c => c.universidad)
  )];

  useEffect(() => {
    setConfigDraft(JSON.parse(JSON.stringify(config)));
  }, [config]);

  if (!configDraft) return null;

  const hayCambios = JSON.stringify(config) !== JSON.stringify(configDraft);

  function descartar() {
    setConfigDraft(JSON.parse(JSON.stringify(config)));
    setSaveMsg(null);
  }

  async function guardar() {
    setSavingConfig(true);
    setSaveMsg(null);
    await new Promise(r => setTimeout(r, 300));
    const draft = JSON.parse(JSON.stringify(configDraft));
    (draft.carreras || []).forEach(c => { c.ventanas = normalizeVentanas(c.ventanas); });
    const finalConfig = deepMerge(JSON.parse(JSON.stringify(config)), draft);
    let ok = false;
    try {
      saveLocal(STORAGE.config, finalConfig);
      ok = await saveConfigToSupabase(finalConfig, finalConfig);
    } catch (e) {
      console.error('SAVE ERROR:', e);
      ok = false;
    }
    setConfig(finalConfig);
    setSavingConfig(false);
    setSaveMsg(ok ? 'ok' : 'local');
    setTimeout(() => setSaveMsg(null), 4000);
  }

  function irA(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ─── Edición de la agenda de turnos (configDraft.carreras[].ventanas) ───
  const careerKeyOf = c => (c && (c.id_carrera || slug(c.nombre))) || '';

  function mutarVentanas(careerKey, updater) {
    setConfigDraft(cur => ({
      ...cur,
      carreras: (cur.carreras || []).map(c => (careerKeyOf(c) === careerKey
        ? { ...c, ventanas: updater([...(c.ventanas || [])]) }
        : c))
    }));
  }

  function setHora(careerKey, gi, horario) {
    mutarVentanas(careerKey, arr => {
      if (!arr[gi]) return arr;
      arr[gi] = { ...arr[gi], horario, turno: turnoFromHorario(horario) };
      return arr;
    });
  }

  function toggleTurno(careerKey, gi) {
    mutarVentanas(careerKey, arr => {
      if (!arr[gi]) return arr;
      arr[gi] = { ...arr[gi], activa: arr[gi].activa === false };
      return arr;
    });
  }

  function quitarTurno(careerKey, gi) {
    mutarVentanas(careerKey, arr => { arr.splice(gi, 1); return arr; });
  }

  function agregarTurno(careerKey, dia, horario) {
    mutarVentanas(careerKey, arr => {
      const delDia = arr.filter(v => Number(v.dia) === dia);
      let base = String(horario || '').trim();
      if (!base) {
        if (delDia.length) {
          const last = delDia.reduce((a, b) => {
            const ma = (+String(a.horario).split(':')[0]) * 60 + (+String(a.horario).split(':')[1] || 0);
            const mb = (+String(b.horario).split(':')[0]) * 60 + (+String(b.horario).split(':')[1] || 0);
            return mb > ma ? b : a;
          });
          base = nextHorario(last.horario);
        } else {
          base = '19:00';
        }
      }
      if (!/^\d{1,2}:\d{2}$/.test(base)) return arr;
      if (delDia.some(v => String(v.horario) === base)) return arr;
      arr.push(buildVentana(dia, base));
      return arr;
    });
  }

  function toggleDia(careerKey, dia, open) {
    mutarVentanas(careerKey, arr => arr.map(v => (Number(v.dia) === dia ? { ...v, activa: open !== false } : v)));
  }

  function bulkAdd(dias, horario) {
    const h = String(horario || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(h)) return;
    setConfigDraft(cur => ({
      ...cur,
      carreras: (cur.carreras || []).map(c => {
        const arr = [...(c.ventanas || [])];
        dias.forEach(dia => {
          if (!arr.some(v => Number(v.dia) === dia && String(v.horario) === h)) arr.push(buildVentana(dia, h));
        });
        return { ...c, ventanas: normalizeVentanas(arr) };
      })
    }));
  }

  const secciones = [
    ['local', 'Local'],
    ['capacidad', 'Producción'],
    ['precios', 'Precios'],
    ['espirales', 'Espirales'],
    ['pagos', 'Pagos'],
    ['feriados', 'Feriados'],
    ['gemini', 'Gemini'],
    ['turnos', 'Turnos']
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-800 text-lg text-ink-900">Ajustes</div>
          <div className="text-xs text-ink-400">Configuración general de la tienda. Los cambios se aplican recién al guardar.</div>
        </div>
        <div className="flex items-center gap-2 h-7">
          {saveMsg === 'ok' && <span className="badge bg-emerald-50 text-emerald-700 text-xs flex items-center gap-1"><Icon.Check /> Guardado</span>}
          {saveMsg === 'local' && <span className="badge bg-amber-50 text-amber-700 text-xs">Guardado solo local · falló la nube</span>}
          {!saveMsg && <span className={`badge text-xs ${hayCambios ? 'bg-amber-50 text-amber-700' : 'bg-ink-100 text-ink-500'}`}>{hayCambios ? 'Cambios sin guardar' : 'Sin cambios'}</span>}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {secciones.map(([id, label]) => (
          <button
            key={id}
            onClick={() => irA(id)}
            className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-700 text-ink-600 border border-ink-100 bg-ink-50 hover:bg-ink-100 hover:text-ink-800 transition-colors"
          >{label}</button>
        ))}
      </div>

      <div id="local" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-1">Local físico</div>
        <div className="text-xs text-ink-400 mb-4">Lugar donde los alumnos retiran sus pedidos. Se usa en el checkout, en el seguimiento y en los mensajes de WhatsApp.</div>
        {!(configDraft.local?.nombre || '').trim() && !(configDraft.local?.direccion || '').trim() && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 text-xs text-amber-800">
            <span className="flex-shrink-0 mt-0.5 text-amber-500"><Icon.AlertCircle /></span>
            <span>Todavía no cargaste el local: por ahora los mensajes y el checkout muestran la dirección de la facultad como referencia.</span>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Nombre del local</label>
            <input className="input-field" type="text" placeholder="Ej: Fotocopiadora UNJu" value={configDraft.local?.nombre || ''} onChange={event => setConfigDraft(current => ({ ...current, local: { ...(current.local || {}), nombre: event.target.value } }))} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Dirección</label>
            <input className="input-field" type="text" placeholder="Ej: Rivadavia 1234, cerca de la facultad" value={configDraft.local?.direccion || ''} onChange={event => setConfigDraft(current => ({ ...current, local: { ...(current.local || {}), direccion: event.target.value } }))} />
          </div>
        </div>
      </div>

      <div id="capacidad" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-4">Capacidad de impresión</div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Capacidad diaria</label>
            <input className="input-field" type="number" value={configDraft.produccion.capacidad_diaria_paginas} onChange={event => setConfigDraft(current => ({ ...current, produccion: { ...current.produccion, capacidad_diaria_paginas: Number(event.target.value || 0) } }))} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Precio promedio hoja</label>
            <input className="input-field" type="number" value={configDraft.produccion.precio_promedio_hoja} onChange={event => setConfigDraft(current => ({ ...current, produccion: { ...current.produccion, precio_promedio_hoja: Number(event.target.value || 0) } }))} />
          </div>
        </div>
      </div>

      <div id="precios" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-4">Precios y redondeo</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            ['A4 menos 50', configDraft.precios.A4.menos_50, value => ({ precios: { ...configDraft.precios, A4: { ...configDraft.precios.A4, menos_50: value } } })],
            ['A4 mas 50', configDraft.precios.A4.mas_50, value => ({ precios: { ...configDraft.precios, A4: { ...configDraft.precios.A4, mas_50: value } } })],
            ['A5 fijo', configDraft.precios.A5.unico, value => ({ precios: { ...configDraft.precios, A5: { ...configDraft.precios.A5, unico: value } } })],
            ['Anillado', configDraft.encuadernacion.basica, value => ({ encuadernacion: { ...configDraft.encuadernacion, basica: value } })],
            ['Redondeo', configDraft.redondeo.multiplo, value => ({ redondeo: { ...configDraft.redondeo, multiplo: value } })]
          ].map(([label, value, builder]) => (
            <div key={label}>
              <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">{label}</label>
              <input className="input-field" type="number" value={value} onChange={event => setConfigDraft(current => ({ ...current, ...builder(Number(event.target.value || 0)) }))} />
            </div>
          ))}
        </div>
      </div>

      <div id="espirales" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-4">Espirales (umbral en hojas)</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {((configDraft.encuadernacion?.espirales) || [
            { hasta: 70, size: '9 mm' },
            { hasta: 100, size: '12 mm' },
            { hasta: 120, size: '14 mm' },
            { hasta: 150, size: '17 mm' },
            { hasta: 220, size: '25 mm' },
            { hasta: 999, size: '40 mm' }
          ]).map((e, idx) => (
            <div key={idx}>
              <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Hasta {e.hasta} hojas</label>
              <input className="input-field" value={e.size} onChange={event => {
                const espirales = [...(configDraft.encuadernacion?.espirales || [
                  { hasta: 70, size: '9 mm' }, { hasta: 100, size: '12 mm' }, { hasta: 120, size: '14 mm' },
                  { hasta: 150, size: '17 mm' }, { hasta: 220, size: '25 mm' }, { hasta: 999, size: '40 mm' }
                ])];
                espirales[idx] = { ...espirales[idx], size: event.target.value };
                setConfigDraft(current => ({ ...current, encuadernacion: { ...current.encuadernacion, espirales } }));
              }} />
            </div>
          ))}
        </div>
      </div>

      <div id="pagos" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-4">Configuración de pagos</div>
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm font-700 text-ink-700 cursor-pointer">
              <input type="checkbox" checked={configDraft.pagos?.talo_activo !== false} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, talo_activo: e.target.checked } }))} className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT" />
              Talo activo
            </label>
            <label className="flex items-center gap-2 text-sm font-700 text-ink-700 cursor-pointer">
              <input type="checkbox" checked={configDraft.pagos?.transferencia_activa === true} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, transferencia_activa: e.target.checked } }))} className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT" />
              Transferencia bancaria activa
            </label>
          </div>
          {configDraft.pagos?.transferencia_activa && (
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-4 space-y-3">
              <div className="text-xs font-700 text-ink-500 uppercase tracking-wide">Datos bancarios</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-ink-500 block mb-1">Alias</label>
                  <input className="input-field" value={configDraft.pagos?.datos_bancarios?.alias || ''} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, datos_bancarios: { ...current.pagos.datos_bancarios, alias: e.target.value } } }))} placeholder="mi.alias.mp" />
                </div>
                <div>
                  <label className="text-xs text-ink-500 block mb-1">CBU/CVU</label>
                  <input className="input-field" value={configDraft.pagos?.datos_bancarios?.cbu || ''} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, datos_bancarios: { ...current.pagos.datos_bancarios, cbu: e.target.value } } }))} placeholder="0000000000000000000000" />
                </div>
                <div>
                  <label className="text-xs text-ink-500 block mb-1">Titular</label>
                  <input className="input-field" value={configDraft.pagos?.datos_bancarios?.titular || ''} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, datos_bancarios: { ...current.pagos.datos_bancarios, titular: e.target.value } } }))} placeholder="Nombre Apellido" />
                </div>
                <div>
                  <label className="text-xs text-ink-500 block mb-1">Banco</label>
                  <input className="input-field" value={configDraft.pagos?.datos_bancarios?.banco || ''} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, datos_bancarios: { ...current.pagos.datos_bancarios, banco: e.target.value } } }))} placeholder="Mercado Pago" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-ink-500 block mb-1">Notas adicionales</label>
                  <input className="input-field" value={configDraft.pagos?.datos_bancarios?.notas || ''} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, datos_bancarios: { ...current.pagos.datos_bancarios, notas: e.target.value } } }))} placeholder="Ej: Enviar comprobante por WhatsApp" />
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-ink-500 block mb-1">WhatsApp admin (para comprobantes)</label>
            <input className="input-field" value={configDraft.pagos?.whatsapp_admin || ''} onChange={e => setConfigDraft(current => ({ ...current, pagos: { ...current.pagos, whatsapp_admin: e.target.value } }))} placeholder="5493885888949" />
          </div>
        </div>
      </div>

      <div id="feriados" className="card p-5 scroll-mt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-700 text-sm text-ink-800">Feriados y días inhabilitados</div>
          <span className="text-xs text-ink-400">{(configDraft.feriados || []).length} registrados</span>
        </div>
        <div className="space-y-2 mb-4">
          {(configDraft.feriados || []).length === 0 && (
            <div className="text-xs text-ink-400 py-2">No hay feriados cargados. Agregá fechas para bloquear días de retiro.</div>
          )}
          {(configDraft.feriados || []).map((f, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-lg border border-ink-100 bg-ink-50 p-3">
              <div className="flex items-center gap-1.5 min-w-[110px]">
                <Icon.Calendar />
                <span className="font-700 text-sm text-ink-900">{f.fecha}</span>
              </div>
              <div className="text-xs text-ink-600 flex-1">{f.motivo}</div>
              <span className={`badge text-xs ${f.universidad ? 'bg-accent-muted text-accent' : 'bg-red-50 text-red-600'}`}>{f.universidad || 'Todas las universidades'}</span>
              <button className="text-xs text-red-500 hover:text-red-700 font-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors" onClick={() => setConfigDraft(current => ({ ...current, feriados: (current.feriados || []).filter((_, i) => i !== idx) }))}>Eliminar</button>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
          <div className="text-xs font-700 text-ink-500 uppercase tracking-wide mb-3">Agregar feriado</div>
          <div className="grid gap-3 md:grid-cols-4">
            <input type="date" className="input-field" value={newHoliday.fecha} onChange={e => setNewHoliday(current => ({ ...current, fecha: e.target.value }))} />
            <input type="text" className="input-field" placeholder="Motivo (ej: Paro, Desinfección)" value={newHoliday.motivo} onChange={e => setNewHoliday(current => ({ ...current, motivo: e.target.value }))} />
            <select className="input-field" value={newHoliday.universidad} onChange={e => setNewHoliday(current => ({ ...current, universidad: e.target.value }))}>
              <option value="">Todas las universidades</option>
              {universities.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
            <button className="btn-primary text-xs" onClick={() => {
              if (!newHoliday.fecha || !newHoliday.motivo) return;
              setConfigDraft(current => ({ ...current, feriados: [...(current.feriados || []), { ...newHoliday }] }));
              setNewHoliday({ fecha: '', motivo: '', universidad: '' });
            }} disabled={!newHoliday.fecha || !newHoliday.motivo}>Agregar feriado</button>
          </div>
        </div>
      </div>

      <div id="gemini" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-1">Prompts de Gemini</div>
        <div className="text-xs text-ink-400 mb-4">
          Dos prompts controlan la IA: el del <span className="font-700">parser</span> (convierte el WhatsApp en pedidos)
          y el del <span className="font-700">aviso</span> (redacta el mensaje de "pedido listo para retirar").
          Se editan acá y quedan activos al guardar, sin redeploy.
        </div>

        <div className="text-xs font-700 text-ink-500 uppercase tracking-wide mb-1.5">Endpoint del proxy de Gemini</div>
        <input
          className="input-field font-mono text-xs w-full mb-1"
          value={configDraft.integraciones?.GEMINI_ENDPOINT || ''}
          placeholder="https://PROYECTO.supabase.co/functions/v1/gemini"
          onChange={e => setConfigDraft(current => ({ ...current, integraciones: { ...(current.integraciones || {}), GEMINI_ENDPOINT: e.target.value } }))}
        />
        <div className="text-[11px] text-ink-400 mb-4">
          URL de la Supabase Edge Function que reemplazó al Apps Script. Si queda vacía, se usa la legacy
          <span className="font-mono"> SHEETS_API_URL</span>{configDraft.integraciones?.SHEETS_API_URL ? ' (hoy apuntando al Apps Script viejo)' : ''}.
        </div>

        <div className="border-t border-ink-100 pt-4 mb-1 flex items-center justify-between gap-3 flex-wrap">
          <div className="font-700 text-sm text-ink-800">1 · Prompt del parser</div>
          <button
            className="btn-secondary text-xs px-3 py-1.5"
            onClick={() => setConfigDraft(current => ({ ...current, prompts: { ...(current.prompts || {}), parser_wa: '' } }))}
            title="Vuelve al prompt original del sistema"
          >Usar el default</button>
        </div>
        <div className="text-xs text-ink-400 mb-3">
          Se usa en <span className="font-700">Pedidos → Parsear con Gemini</span>. Editá las reglas y, sobre todo,
          la regla 8 (redacción del <span className="font-700">msj_ws</span>, el mensaje que le llega al cliente).
          <span className="font-700 text-ink-500"> Vacío = prompt por defecto.</span>
        </div>

        <div className="text-xs font-700 text-ink-500 uppercase tracking-wide mb-1.5">Catálogo que se le manda</div>
        <div className="grid gap-3 sm:grid-cols-2 mb-4">
          {[
            ['compacto', 'Filtrado previo (sin IA)', 'Ficha completa solo de los ~10 libros más probables según el mensaje + índice de títulos. Menos ruido (−55% de tokens) y score local con IDs y títulos.'],
            ['completo', 'Catálogo completo (como antes)', 'Una ficha detallada por cada libro activo. Más contexto para Gemini, pero ~7.000 chars de catálogo con 69 libros.']
          ].map(([valor, titulo, detalle]) => {
            const activo = (configDraft.prompts?.catalogo_modo || 'compacto') === valor;
            return (
              <button
                key={valor}
                type="button"
                onClick={() => setConfigDraft(current => ({ ...current, prompts: { ...(current.prompts || {}), catalogo_modo: valor } }))}
                className={`radio-tile text-left ${activo ? 'active' : ''}`}
              >
                <div className="font-700 text-sm">{titulo}</div>
                <div className="text-[11px] text-ink-400 mt-1 leading-snug">{detalle}</div>
              </button>
            );
          })}
        </div>
        <div className="text-[11px] text-ink-400 -mt-2 mb-4">
          En ambos modos Gemini ve todos los títulos del catálogo: la diferencia es cuánta ficha detallada recibe.
          Cambio que impacta solo en parseos futuros.
        </div>
        <textarea
          className="input-field font-mono text-xs leading-relaxed w-full"
          rows={20}
          spellCheck={false}
          value={configDraft.prompts?.parser_wa || ''}
          placeholder={DEFAULT_PARSER_PROMPT}
          onChange={e => setConfigDraft(current => ({ ...current, prompts: { ...(current.prompts || {}), parser_wa: e.target.value } }))}
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[11px] font-700 text-ink-500 uppercase tracking-wide">Tokens</span>
          {['{{fecha}}', '{{mensaje}}', '{{catalogo}}'].map(t => (
            <code key={t} className="badge bg-ink-100 text-ink-600 text-[11px] font-mono">{t}</code>
          ))}
          <span className="text-[11px] text-ink-400 ml-1">se reemplazan al parsear (fecha de hoy, mensaje del alumno, listado de libros).</span>
        </div>
        <div className="text-[11px] text-ink-400 mt-2">
          Si borrás un token, esa parte se agrega igual al final; y si borrás el bloque JSON de salida se re-anexa,
          porque sin él el parser no puede leer la respuesta de Gemini.
        </div>

        <div className="border-t border-ink-100 mt-5 pt-4 mb-1 flex items-center justify-between gap-3 flex-wrap">
          <div className="font-700 text-sm text-ink-800">2 · Prompt del recordatorio (día del retiro)</div>
          <button
            className="btn-secondary text-xs px-3 py-1.5"
            onClick={() => setConfigDraft(current => ({ ...current, prompts: { ...(current.prompts || {}), wa_aviso: '' } }))}
            title="Vuelve al prompt original del sistema"
          >Usar el default</button>
        </div>
        <div className="text-xs text-ink-400 mb-3">
          Redacta <span className="font-700 text-ink-600">EL mensaje importante</span>: el recordatorio que se manda el
          <span className="font-700 text-ink-600"> MISMO DÍA del retiro pactado</span> para avisarle al alumno que su pedido
          está LISTO y a qué hora pasa a buscarlo por el local (eligen el turno según sus clases → por eso importa la hora).
          Se genera desde el <span className="font-700">tab WhatsApp</span> y con <span className="font-700">🔄 Regenerar</span> del parser.
          <span className="font-700 text-ink-500"> Vacío = prompt por defecto.</span>
        </div>
        <textarea
          className="input-field font-mono text-xs leading-relaxed w-full"
          rows={16}
          spellCheck={false}
          value={configDraft.prompts?.wa_aviso || ''}
          placeholder={DEFAULT_WA_PROMPT}
          onChange={e => setConfigDraft(current => ({ ...current, prompts: { ...(current.prompts || {}), wa_aviso: e.target.value } }))}
        />
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-[11px] font-700 text-ink-500 uppercase tracking-wide">Tokens</span>
          {['{{fecha}}', '{{fecha_pedido}}', '{{hora}}', '{{nombre}}', '{{telefono}}', '{{libros}}', '{{lugar}}', '{{saldo}}'].map(t => (
            <code key={t} className="badge bg-ink-100 text-ink-600 text-[11px] font-mono">{t}</code>
          ))}
          <span className="text-[11px] text-ink-400 ml-1">se reemplazan con los datos del pedido (hoy, día del retiro, hora, alumno, teléfono, libros, lugar y saldo).</span>
        </div>
        <div className="text-[11px] text-ink-400 mt-2">
          Si borrás un token, ese dato no se inyecta (el resto del prompt se respeta). Dejá siempre la línea final
          "Respondé ÚNICAMENTE con el mensaje de WhatsApp" para que Gemini no agregue texto de más.
        </div>
      </div>

      <div id="turnos" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-1">Universidades y horarios de retiro</div>
        <div className="text-xs text-ink-400 -mt-1 mb-4">
          Horarios en los que el alumno pasa a retirar el pedido por el local. Cargá, editá o quitá horarios por día.
          El punto verde activa/desactiva y el ✕ quita el turno.
        </div>

        {/* Carga masiva */}
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-xl border border-ink-100 bg-ink-50 p-3">
          <span className="text-xs font-700 text-ink-600">Agregar un mismo horario a varios días:</span>
          <input type="time" value={bulkTime} onChange={e => setBulkTime(e.target.value)} className="input-field text-xs w-auto py-1" />
          <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => bulkAdd([1, 2, 3, 4, 5], bulkTime)}>Lun a Vie</button>
          <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => bulkAdd([1, 2, 3, 4, 5, 6], bulkTime)}>Lun a Sáb</button>
          <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => bulkAdd(DIAS_ORDER, bulkTime)}>Todos</button>
          <span className="text-[11px] text-ink-400 ml-auto">No duplica horarios existentes.</span>
        </div>

        <div className="space-y-5">
          {getCareers(configDraft).map(career => {
            const careerKey = careerKeyOf(career);
            const ventanas = career.ventanas || [];
            const activasCount = ventanas.filter(v => v.activa !== false).length;
            const sinConfig = ventanas.length === 0;
            return (
              <div key={careerKey} className="rounded-xl border border-ink-100 bg-ink-50 p-4">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <div>
                    <div className="font-800 text-sm text-ink-900">{careerLabel(career)}</div>
                    <div className="text-xs text-ink-500 mt-0.5">{career.universidad}</div>
                  </div>
                  <span className={`badge text-[11px] shrink-0 ${sinConfig ? 'bg-ink-100 text-ink-500' : activasCount ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {sinConfig ? 'Turnos por defecto' : `${activasCount} de ${ventanas.length} activos`}
                  </span>
                </div>
                <div className="mb-2 text-[11px] text-ink-400">
                  {sinConfig && 'Sin horarios cargados: se usan los de por defecto (Lun a Vie · 10:00 y 19:00). Cargá horarios para personalizar.'}
                  {!sinConfig && activasCount === 0 && <span className="text-amber-600 font-700">Sin turnos activos: el alumno no podrá elegir turno de retiro.</span>}
                </div>

                <div>
                  {DIAS_ORDER.map(dia => {
                    const delDia = ventanas.map((v, gi) => ({ v, gi })).filter(({ v }) => Number(v.dia) === dia);
                    const diaAbierto = delDia.some(({ v }) => v.activa !== false);
                    const addKey = `${careerKey}|${dia}`;
                    const addVal = addTimes[addKey] || '';
                    return (
                      <div key={dia} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-t border-ink-100 first:border-t-0">
                        <div className="w-[136px] flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              if (delDia.length === 0) agregarTurno(careerKey, dia, '19:00');
                              else toggleDia(careerKey, dia, !diaAbierto);
                            }}
                            className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors ${diaAbierto ? 'bg-emerald-500' : 'bg-gray-300 hover:bg-gray-400'}`}
                            title={delDia.length === 0 ? 'Abrir este día (agrega 19:00)' : diaAbierto ? 'Cerrar este día' : 'Abrir este día'}
                          />
                          <span className={`text-xs font-700 ${diaAbierto ? 'text-ink-800' : 'text-ink-400'}`}>{DIAS[dia]}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[180px]">
                          {delDia.length === 0 && <span className="text-[11px] text-ink-400">Cerrado</span>}
                          {delDia.map(({ v, gi }) => {
                            const isActive = v.activa !== false;
                            return (
                              <span
                                key={gi}
                                className={`inline-flex items-center gap-1 rounded-lg border pl-1.5 pr-1 py-1 transition-all ${isActive ? 'bg-white border-ink-200' : 'bg-ink-100 border-ink-200'}`}
                              >
                                <button
                                  onClick={() => toggleTurno(careerKey, gi)}
                                  className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                  title={isActive ? 'Clic para desactivar' : 'Clic para activar'}
                                />
                                <input
                                  type="time"
                                  value={v.horario || ''}
                                  onChange={e => setHora(careerKey, gi, e.target.value)}
                                  className={`bg-transparent text-xs font-700 outline-none w-[58px] ${isActive ? 'text-ink-800' : 'text-ink-400'}`}
                                />
                                <button
                                  onClick={() => quitarTurno(careerKey, gi)}
                                  className="text-ink-400 hover:text-red-500 leading-none px-0.5 text-sm"
                                  title="Quitar turno"
                                >×</button>
                              </span>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={addVal}
                            onChange={e => setAddTimes(cur => ({ ...cur, [addKey]: e.target.value }))}
                            className="input-field text-xs w-auto py-1"
                          />
                          <button
                            className="btn-secondary text-xs px-2 py-1"
                            onClick={() => { agregarTurno(careerKey, dia, addVal); setAddTimes(cur => ({ ...cur, [addKey]: '' })); }}
                          >+ Agregar</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 sticky bottom-4 bg-surface-hover/80 backdrop-blur-sm p-3 rounded-xl border border-ink-100 shadow-sm z-10">
        <span className="text-xs mr-auto">
          {saveMsg === 'ok' ? <span className="text-emerald-600 font-700">Cambios guardados ✓</span>
            : saveMsg === 'local' ? <span className="text-amber-600 font-700">Guardado solo local · falló la nube</span>
            : hayCambios ? <span className="text-amber-600 font-700">Cambios sin guardar</span>
            : <span className="text-ink-400">Sin cambios</span>}
        </span>
        <button className="btn-secondary text-sm px-4 py-2" onClick={descartar} disabled={savingConfig || !hayCambios}>Descartar</button>
        <button className="btn-primary text-sm px-4 py-2" disabled={savingConfig || !hayCambios} onClick={guardar}>{savingConfig ? <span className="flex items-center gap-1"><span className="spinner-sm" /> Guardando...</span> : 'Guardar cambios'}</button>
      </div>
    </div>
  );
}
