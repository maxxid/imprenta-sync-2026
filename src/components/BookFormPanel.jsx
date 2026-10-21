import React, { useState } from 'react';
import { Icon } from './Icons';
import { Alert } from './UI';
import {
  fmt, HOJAS, getBookCombinations, recalcBookSugeridos, careerLabel,
  ensureBookVariantes, mirrorLegacyColumns, prepareBookForSave, newVarianteId, normalizeVariante
} from '../lib/utils';

export function BookFormPanel({ book, config, careers, onSave, onCancel }) {
  const [form, setForm] = useState(() => ensureBookVariantes({ ...book }, config));

  /**
   * Normaliza el form, pero conserva los labels de variantes tal como los está
   * escribiendo el usuario (si no, el trim de normalizeVariante borra los
   * espacios mientras tipea). El trim definitivo ocurre al guardar.
   */
  function setFormBook(next) {
    const labels = new Map((form.variantes || []).map(v => [v.id, v.label]));
    const ensured = ensureBookVariantes(next, config);
    setForm(mirrorLegacyColumns({
      ...ensured,
      variantes: ensured.variantes.map(v => (labels.has(v.id) ? { ...v, label: labels.get(v.id) } : v))
    }));
  }

  function update(key, val) {
    setFormBook({ ...form, [key]: val });
  }

  function handlePagesChange(val) {
    const paginas = Number(val) || 0;
    setFormBook(recalcBookSugeridos({ ...form, paginas }, config));
  }

  function handleCareerChange(id) {
    const career = careers.find(c => c.id_carrera === id);
    setFormBook({ ...form, id_carrera: id, carrera: career?.nombre || '' });
  }

  function updateVariante(id, patch) {
    setFormBook({ ...form, variantes: form.variantes.map(v => (v.id === id ? { ...v, ...patch } : v)) });
  }

  function addVariante() {
    const label = 'Nueva opción';
    const variantes = [
      ...form.variantes,
      normalizeVariante({
        id: newVarianteId(label),
        label,
        paginas_por_hoja: 1,
        color: false,
        precio: 0,
        habilitado: true,
        sugerido: 0
      })
    ];
    setFormBook({ ...form, variantes });
  }

  function removeVariante(id) {
    if (form.variantes.length <= 1) return;
    setFormBook({ ...form, variantes: form.variantes.filter(v => v.id !== id) });
  }

  function recalc() {
    setFormBook(recalcBookSugeridos(form, config));
  }

  const hojasDefault = HOJAS(form.paginas, form.paginas_por_hoja || 2);
  const tipo = hojasDefault >= config.encuadernacion.umbral_anillado_hojas ? 'anillado' : 'abrochado';
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
                <div className="text-xs text-ink-400 mt-1">{hojasDefault} hojas (pph default {form.paginas_por_hoja || 2}) · {tipo}</div>
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Páginas por hoja (default libro)</label>
                <select className="input-field" value={form.paginas_por_hoja || 2} onChange={e => {
                  const pph = Number(e.target.value) || 2;
                  setFormBook(recalcBookSugeridos({ ...form, paginas_por_hoja: pph }, config));
                }}>
                  <option value={2}>2 páginas por hoja (estándar)</option>
                  <option value={1}>1 página por hoja (letra grande)</option>
                  <option value={4}>4 páginas por hoja (compacto)</option>
                </select>
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
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div>
                <div className="font-700 text-sm text-ink-800">Variantes de impresión</div>
                <div className="text-xs text-ink-400">Título libre, papel, pph y precio por opción</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost text-xs" onClick={recalc}><Icon.Zap /> Recalcular A4/A5 B/N</button>
                <button type="button" className="btn-secondary text-xs" onClick={addVariante}>+ Agregar variante</button>
              </div>
            </div>
            <div className="space-y-3">
              {form.variantes.map(v => {
                const hojasV = HOJAS(form.paginas, v.paginas_por_hoja || 2);
                const isClassicBn = v.id === 'a4_bn' || v.id === 'a5_bn';
                return (
                  <div key={v.id} className={`rounded-xl border p-4 ${v.habilitado ? 'border-brand bg-brand-muted/30' : 'border-ink-100 bg-ink-50'}`}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <input
                        className="input-field font-700 text-sm flex-1"
                        value={v.label}
                        onChange={e => updateVariante(v.id, { label: e.target.value })}
                        placeholder="Ej: A4 vertical (letra grande)"
                      />
                      <button
                        type="button"
                        onClick={() => updateVariante(v.id, { habilitado: !v.habilitado })}
                        className={`w-10 h-6 rounded-full transition-colors flex items-center flex-shrink-0 ${v.habilitado ? 'bg-brand-DEFAULT justify-end' : 'bg-ink-200 justify-start'}`}
                        title="Habilitada en tienda"
                      >
                        <span className="w-5 h-5 bg-white rounded-full shadow-sm mx-0.5" />
                      </button>
                      <button
                        type="button"
                        className="text-danger text-lg font-700 px-1 disabled:opacity-30"
                        disabled={form.variantes.length <= 1}
                        onClick={() => removeVariante(v.id)}
                        title="Eliminar variante"
                      >×</button>
                    </div>
                    {v.habilitado && (
                      <div className="grid gap-3 sm:grid-cols-4">
                        <div>
                          <label className="text-xs text-ink-500">Pág. por hoja</label>
                          <select
                            className="input-field mt-1"
                            value={v.paginas_por_hoja || 2}
                            onChange={e => {
                              const pph = Number(e.target.value) || 2;
                              if (isClassicBn) {
                                const next = { ...form, variantes: form.variantes.map(x => x.id === v.id ? { ...x, paginas_por_hoja: pph } : x) };
                                setFormBook(recalcBookSugeridos(next, config));
                              } else {
                                updateVariante(v.id, { paginas_por_hoja: pph });
                              }
                            }}
                          >
                            <option value={1}>1 (letra grande)</option>
                            <option value={2}>2 (estándar)</option>
                            <option value={4}>4 (compacto)</option>
                          </select>
                          <div className="text-[10px] text-ink-400 mt-1">{hojasV} hojas</div>
                        </div>
                        <div>
                          <label className="text-xs text-ink-500">Color</label>
                          <button
                            type="button"
                            className={`mt-1 w-full input-field text-left font-600 ${v.color ? 'text-accent' : 'text-ink-700'}`}
                            onClick={() => updateVariante(v.id, { color: !v.color })}
                          >
                            {v.color ? 'Color' : 'B/N'}
                          </button>
                        </div>
                        <div>
                          <label className="text-xs text-ink-500">{isClassicBn ? 'Sugerido' : 'Ref.'}</label>
                          <div className="input-field mt-1 bg-ink-50 text-ink-500">{fmt(v.sugerido || 0)}</div>
                        </div>
                        <div>
                          <label className="text-xs text-ink-500">Precio final</label>
                          <input
                            className="input-field mt-1"
                            type="number"
                            value={v.precio || 0}
                            onChange={e => updateVariante(v.id, { precio: Number(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary flex-1" disabled={!canSave} onClick={() => onSave(prepareBookForSave(form))}>Guardar libro</button>
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
              <span className="badge bg-ink-100 text-ink-500">{form.paginas} págs</span>
              {combos.map(c => <span key={c.key} className={`badge ${c.color ? 'bg-accent-muted text-accent' : 'bg-brand-muted text-brand-dark'}`}>{c.label}</span>)}
            </div>
            {minPrice > 0 && <div className="font-800 text-lg text-ink-900">Desde {fmt(minPrice)}</div>}
            {combos.length === 0 && <Alert type="warn"><span>Habilitá al menos una variante con precio &gt; 0 para que el alumno vea este libro.</span></Alert>}
          </div>
        </div>
      </div>
    </div>
  );
}
