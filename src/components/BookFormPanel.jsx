import React, { useState } from 'react';
import { Icon } from './Icons';
import { Alert } from './UI';
import { fmt, slug, HOJAS, getBookCombinations, recalcBookSugeridos, careerLabel } from '../lib/utils';

export function BookFormPanel({ book, config, careers, onSave, onCancel }) {
  const [form, setForm] = useState({ ...book });
  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  function handlePagesChange(val) {
    const paginas = Number(val) || 0;
    const updated = recalcBookSugeridos({ ...form, paginas }, config);
    setForm(updated);
  }

  const hojas = HOJAS(form.paginas, form.paginas_por_hoja || 2);

  function handleCareerChange(id) {
    const career = careers.find(c => c.id_carrera === id);
    setForm(prev => ({ ...prev, id_carrera: id, carrera: career?.nombre || '' }));
  }

  function handleAjuste(comboBase, val) {
    const ajuste = Number(val) || 0;
    const sugerido = Number(form[`${comboBase}_sugerido`]) || 0;
    setForm(prev => ({ ...prev, [`${comboBase}_ajuste`]: ajuste, [`${comboBase}_final`]: sugerido + ajuste }));
  }

  function recalc() {
    setForm(prev => recalcBookSugeridos(prev, config));
  }

  const tipo = hojas >= config.encuadernacion.umbral_anillado_hojas ? 'anillado' : 'abrochado';
  const combos = getBookCombinations(form);
  const minPrice = combos.length ? Math.min(...combos.map(c => c.precio)) : 0;
  const canSave = form.titulo.trim().length >= 2 && form.paginas > 0 && combos.length > 0;

  return (
    <div className="slide-up">
      <button onClick={onCancel} className="flex items-center gap-2 text-sm text-ink-400 hover:text-ink-700 mb-5 font-700">← Volver al listado</button>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="card p-5">
            <div className="font-700 text-sm text-ink-800 mb-4">Información del libro</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Título</label>
                <input className="input-field" value={form.titulo} onChange={e => update('titulo', e.target.value)} placeholder="Ej: Derecho Constitucional - Tomo I" />
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Autor</label>
                <input className="input-field" value={form.autor} onChange={e => update('autor', e.target.value)} placeholder="Ej: Bidart Campos" />
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Materia</label>
                <input className="input-field" value={form.materia} onChange={e => update('materia', e.target.value)} placeholder="Ej: Derecho Constitucional" />
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Carrera</label>
                <select className="input-field" value={form.id_carrera} onChange={e => handleCareerChange(e.target.value)}>
                  {careers.map(c => <option key={c.id_carrera} value={c.id_carrera}>{careerLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Páginas</label>
                <input className="input-field" type="number" min="1" value={form.paginas} onChange={e => handlePagesChange(e.target.value)} />
                <div className="text-xs text-ink-400 mt-1">{hojas} hojas · {tipo}</div>
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Páginas por hoja</label>
                <select className="input-field" value={form.paginas_por_hoja || 2} onChange={e => {
                  const pph = Number(e.target.value) || 2;
                  const updated = recalcBookSugeridos({ ...form, paginas_por_hoja: pph }, config);
                  setForm(updated);
                }}>
                  <option value={2}>2 páginas por hoja (estándar)</option>
                  <option value={4}>4 páginas por hoja (compacto)</option>
                </select>
                <div className="text-xs text-ink-400 mt-1">{form.paginas_por_hoja === 4 ? '4 pág/hoja · letra reducida' : '2 pág/hoja · letra normal'}</div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">URL de portada</label>
                <input className="input-field" value={form.imagen_url} onChange={e => update('imagen_url', e.target.value)} placeholder="https://..." />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Vista previa PDF <span className="text-ink-300 font-normal">(opcional)</span></label>
                <input className="input-field" value={form.pdf_url || ''} onChange={e => update('pdf_url', e.target.value)} placeholder="https://drive.google.com/... o link directo a PDF" />
                <div className="text-xs text-ink-400 mt-1">Si completás este campo, los alumnos verán un botón "Ver Libro" en la ficha.</div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-700 text-sm text-ink-800">Precios por combinación</div>
              <button className="btn-ghost text-xs" onClick={recalc}><Icon.Zap /> Recalcular sugeridos</button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[['a4_bn', 'A4 Blanco y Negro', true], ['a4_color', 'A4 Color', false], ['a5_bn', 'A5 Blanco y Negro', true], ['a5_color', 'A5 Color', false]].map(([key, label, hasCalc]) => (
                <div key={key} className={`rounded-xl border p-4 ${form[`${key}_habilitado`] ? 'border-brand bg-brand-muted/30' : 'border-ink-100 bg-ink-50'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-700 text-sm text-ink-800">{label}</span>
                    <button onClick={() => update(`${key}_habilitado`, !form[`${key}_habilitado`])}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center ${form[`${key}_habilitado`] ? 'bg-brand-DEFAULT justify-end' : 'bg-ink-200 justify-start'}`}>
                      <span className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                    </button>
                  </div>
                  {form[`${key}_habilitado`] && (
                    <div className="space-y-2">
                      {hasCalc ? (
                        <>
                          <div className="flex justify-between text-xs"><span className="text-ink-500">Sugerido</span><span className="font-600">{fmt(form[`${key}_sugerido`] || 0)}</span></div>
                          <div>
                            <label className="text-xs text-ink-500">Ajuste (+/-)</label>
                            <input className="input-field mt-1" type="number" value={form[`${key}_ajuste`] || 0} onChange={e => handleAjuste(key, e.target.value)} />
                          </div>
                          <div className="flex justify-between text-sm font-700 border-t border-ink-100 pt-2"><span>Final</span><span>{fmt(form[`${key}_final`] || 0)}</span></div>
                        </>
                      ) : (
                        <div>
                          <label className="text-xs text-ink-500">Precio total (manual)</label>
                          <input className="input-field mt-1" type="number" value={form[`${key}_final`] || 0} onChange={e => update(`${key}_final`, Number(e.target.value) || 0)} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary flex-1" disabled={!canSave} onClick={() => onSave(form)}>Guardar libro</button>
            <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="font-700 text-xs text-ink-400 uppercase tracking-widest">Vista previa alumno</div>
          <div className="card p-4">
            <img src={form.imagen_url} alt="" className="cover-img mb-3" />
            <span className="badge bg-ink-100 text-ink-500 mb-2">{form.carrera || 'Carrera'}</span>
            <div className="font-700 text-sm text-ink-900 mb-1">{form.titulo || 'Título del libro'}</div>
            <div className="text-xs text-ink-400 mb-1">{form.materia || 'Materia'}</div>
            <div className="text-xs text-ink-400 mb-3">{form.autor || 'Autor'}</div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`badge ${tipo === 'anillado' ? 'tag-link' : 'tag-staple'}`}>{tipo === 'anillado' ? 'Anillado' : 'Abrochado'}</span>
              <span className="badge bg-ink-100 text-ink-500">{form.paginas} págs · {hojas} hojas</span>
              {combos.map(c => <span key={c.key} className={`badge ${c.color ? 'bg-accent-muted text-accent' : 'bg-brand-muted text-brand-dark'}`}>{c.label}</span>)}
            </div>
            {minPrice > 0 && <div className="font-800 text-lg text-ink-900">Desde {fmt(minPrice)}</div>}
            {combos.length === 0 && <Alert type="warn"><span>Habilitá al menos una combinación con precio &gt; 0 para que el alumno vea este libro.</span></Alert>}
          </div>
        </div>
      </div>
    </div>
  );
}
