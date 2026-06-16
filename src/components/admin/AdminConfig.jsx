import React, { useState, useEffect } from 'react';
import { Icon } from '../Icons';
import { Alert } from '../UI';
import { getCareers, careerLabel } from '../../lib/utils';
import { saveConfigToSupabase, saveLocal, loadLocal, deepMerge } from '../../lib/supabase';
import { STORAGE } from '../../lib/constants';

export function AdminConfig({ config, setConfig }) {
  const [configDraft, setConfigDraft] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ fecha: '', motivo: '', universidad: '' });

  const universities = [...new Set(
    (config.carreras || []).filter(c => c.universidad).map(c => c.universidad)
  )];

  useEffect(() => {
    setConfigDraft(JSON.parse(JSON.stringify(config)));
  }, [config]);

  if (!configDraft) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-ink-400">Editando en borrador. Guardá para aplicar los cambios.</div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs px-3 py-2" onClick={() => setConfigDraft(JSON.parse(JSON.stringify(config)))} disabled={savingConfig}>Descartar</button>
          <button className="btn-primary text-xs px-3 py-2" disabled={savingConfig} onClick={async () => { setSavingConfig(true); await new Promise(r => setTimeout(r, 400)); const finalConfig = deepMerge(JSON.parse(JSON.stringify(config)), configDraft); let saved = false; try { saveLocal(STORAGE.config, finalConfig); saved = await saveConfigToSupabase(finalConfig, finalConfig); } catch(e) { console.error('SAVE ERROR:', e); } setConfig(finalConfig); setSavingConfig(false); }}>{savingConfig ? <span className="flex items-center gap-1"><span className="spinner-sm" /> Guardando...</span> : 'Guardar cambios'}</button>
        </div>
      </div>

      <div className="card p-5">
        <div className="font-700 text-sm text-ink-800 mb-4">Control de capacidad y entregas</div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Capacidad diaria</label>
            <input className="input-field" type="number" value={configDraft.produccion.capacidad_diaria_paginas} onChange={event => setConfigDraft(current => ({ ...current, produccion: { ...current.produccion, capacidad_diaria_paginas: Number(event.target.value || 0) } }))} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Precio promedio hoja</label>
            <input className="input-field" type="number" value={configDraft.produccion.precio_promedio_hoja} onChange={event => setConfigDraft(current => ({ ...current, produccion: { ...current.produccion, precio_promedio_hoja: Number(event.target.value || 0) } }))} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Mínimo cadete</label>
            <input className="input-field" type="number" value={configDraft.entrega?.cadete_minimo || 100} onChange={event => setConfigDraft(current => ({ ...current, entrega: { ...current.entrega, cadete_minimo: Number(event.target.value || 0) } }))} />
          </div>
        </div>
      </div>

      <div className="card p-5">
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

      <div className="card p-5">
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

      <div className="card p-5">
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

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-700 text-sm text-ink-800">Feriados y días inhabilitados</div>
          <span className="text-xs text-ink-400">{(configDraft.feriados || []).length} registrados</span>
        </div>
        <div className="space-y-2 mb-4">
          {(configDraft.feriados || []).length === 0 && (
            <div className="text-xs text-ink-400 py-2">No hay feriados registrados. Agregá fechas para bloquear entregas.</div>
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

      <div className="card p-5">
        <div className="font-700 text-sm text-ink-800 mb-4">Universidades y ventanas de entrega</div>
        <div className="space-y-6">
          {getCareers(configDraft).map(career => (
            <div key={career.id_carrera} className="rounded-xl border border-ink-100 bg-ink-50 p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="font-800 text-sm text-ink-900">{careerLabel(career)}</div>
                  <div className="text-xs text-ink-500 mt-0.5">{career.direccion_entrega}</div>
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
        <span className="text-xs text-ink-400 mr-auto">{JSON.stringify(config) !== JSON.stringify(configDraft) ? 'Hay cambios sin guardar' : 'Sin cambios'}</span>
        <button className="btn-secondary text-sm px-4 py-2" onClick={() => setConfigDraft(JSON.parse(JSON.stringify(config)))} disabled={savingConfig}>Descartar</button>
        <button className="btn-primary text-sm px-4 py-2" disabled={savingConfig} onClick={async () => { setSavingConfig(true); await new Promise(r => setTimeout(r, 400)); const finalConfig = deepMerge(JSON.parse(JSON.stringify(config)), configDraft); let saved = false; try { saveLocal(STORAGE.config, finalConfig); saved = await saveConfigToSupabase(finalConfig, finalConfig); } catch(e) { console.error('SAVE ERROR:', e); } setConfig(finalConfig); setSavingConfig(false); }}>{savingConfig ? <span className="flex items-center gap-1"><span className="spinner-sm" /> Guardando...</span> : 'Guardar cambios'}</button>
      </div>
    </div>
  );
}
