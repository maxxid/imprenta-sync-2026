import React, { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { Alert } from '../UI';
import { getCareers, careerLabel } from '../../lib/utils';
import { saveConfigToSupabase, saveLocal, loadLocal, deepMerge } from '../../lib/supabase';
import { STORAGE, DEFAULT_PARSER_PROMPT } from '../../lib/constants';

export function AdminConfig({ config, setConfig }) {
  const [configDraft, setConfigDraft] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null); // 'ok' | 'local' | null
  const [newHoliday, setNewHoliday] = useState({ fecha: '', motivo: '', universidad: '' });

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
    const finalConfig = deepMerge(JSON.parse(JSON.stringify(config)), configDraft);
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
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <div className="font-700 text-sm text-ink-800">Prompt y catálogo de Gemini (parser WhatsApp)</div>
          <div className="flex gap-2">
            <button
              className="btn-secondary text-xs px-3 py-1.5"
              onClick={() => setConfigDraft(current => ({ ...current, prompts: { ...(current.prompts || {}), parser_wa: '' } }))}
              title="Vuelve al prompt original del sistema"
            >Usar el default</button>
          </div>
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
      </div>

      <div id="turnos" className="card p-5 scroll-mt-6">
        <div className="font-700 text-sm text-ink-800 mb-4">Universidades y turnos de retiro</div>
        <div className="text-xs text-ink-400 -mt-2 mb-4">Cada turno es un horario en el que el alumno retira en el local. Activá los días y horas que querés ofrecer.</div>
        <div className="space-y-6">
          {getCareers(configDraft).map(career => (
            <div key={career.id_carrera} className="rounded-xl border border-ink-100 bg-ink-50 p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="font-800 text-sm text-ink-900">{careerLabel(career)}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{career.universidad}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(career.ventanas || []).map((window, wIdx) => {
                  const isActive = window.activa !== false;
                  return (
                    <button
                      key={`${career.id_carrera}-${wIdx}`}
                      onClick={() => setConfigDraft(current => ({
                        ...current,
                        carreras: current.carreras.map(c => {
                          if (c.id_carrera !== career.id_carrera) return c;
                          const ventanas = [...(c.ventanas || [])];
                          if (!ventanas[wIdx]) return c;
                          ventanas[wIdx] = { ...ventanas[wIdx], activa: ventanas[wIdx].activa === false ? true : false };
                          return { ...c, ventanas };
                        })
                      }))}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-700 border transition-all ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                      }`}
                      title={isActive ? 'Clic para desactivar' : 'Clic para activar'}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                      {window.label} · {window.horario}
                    </button>
                  );
                })}
                {(career.ventanas || []).length === 0 && (
                  <span className="text-xs text-ink-400">Sin ventanas configuradas</span>
                )}
              </div>
            </div>
          ))}
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
