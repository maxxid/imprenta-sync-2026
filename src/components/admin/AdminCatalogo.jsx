import React, { useState } from 'react';
import { Icon } from '../Icons';
import { fmt, slug, HOJAS, getBookCombinations, recalcBookSugeridos, migrateBook, bookCareerId, getCareers, careerLabel } from '../../lib/utils';
import { COMBO_KEYS, COMBO_LABELS } from '../../lib/constants';
import { getSupabase, saveBookToSupabase, deleteBookFromSupabase, uploadPdfToStorage, subirPortada, fetchBooksFromSupabase } from '../../lib/supabase';
import { BookFormPanel } from '../BookFormPanel';

export function AdminCatalogo({ books, setBooks, config }) {
  const [editingBook, setEditingBook] = useState(null);
  const [bulkEdit, setBulkEdit] = useState(false);
  const [bulkChanges, setBulkChanges] = useState({});
  const [uploadingPdfId, setUploadingPdfId] = useState(null);
  const [abmSearch, setAbmSearch] = useState('');
  const [abmCareer, setAbmCareer] = useState('');
  const [abmStatus, setAbmStatus] = useState('all');
  const [catSortConfig, setCatSortConfig] = useState({ key: null, direction: 'asc' });
  const [catColumnVisibility, setCatColumnVisibility] = useState({
    libro: true, carrera: true, paginas: true, a4bn: true, a4color: true,
    a5bn: true, a5color: true, estado: true, pdf: true, portada: true, acciones: true
  });
  const [resizing, setResizing] = useState(null);
  const [savingBulk, setSavingBulk] = useState(false);

  function handleCatSort(key) {
    setCatSortConfig(current => {
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

  if (editingBook) {
    return (
      <BookFormPanel
        book={editingBook}
        config={config}
        careers={getCareers(config, books)}
        onSave={async (saved) => {
          const ok = await saveBookToSupabase(saved, config);
          if (!ok) return;
          setBooks(prev => {
            const idx = prev.findIndex(b => b.id === saved.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
            return [...prev, saved];
          });
          setEditingBook(null);
        }}
        onCancel={() => setEditingBook(null)}
      />
    );
  }

  const columns = [
    { key: 'libro', label: 'Libro' },
    { key: 'carrera', label: 'Carrera' },
    { key: 'paginas', label: 'Págs' },
    { key: 'a4bn', label: 'A4 B/N' },
    { key: 'a4color', label: 'A4 Color' },
    { key: 'a5bn', label: 'A5 B/N' },
    { key: 'a5color', label: 'A5 Color' },
    { key: 'estado', label: 'Estado' },
    { key: 'pdf', label: 'PDF' },
    { key: 'portada', label: 'Port' },
    { key: 'acciones', label: 'Acciones' }
  ];

  let list = books.filter(b => {
    const q = slug(abmSearch);
    const matchQ = !q || [b.titulo, b.materia, b.autor].some(f => slug(f).includes(q));
    const matchC = !abmCareer || bookCareerId(b) === abmCareer;
    const matchS = abmStatus === 'all' || (abmStatus === 'active' && b.activo !== false) || (abmStatus === 'inactive' && b.activo === false);
    return matchQ && matchC && matchS;
  });

  if (catSortConfig.key) {
    list = [...list].sort((a, b) => {
      let aVal, bVal;
      if (catSortConfig.key === 'libro') { aVal = a.titulo; bVal = b.titulo; }
      else if (catSortConfig.key === 'carrera') { aVal = a.carrera; bVal = b.carrera; }
      else if (catSortConfig.key === 'paginas') { aVal = a.paginas; bVal = b.paginas; }
      else if (catSortConfig.key === 'a4bn') { aVal = a.a4_bn_final; bVal = b.a4_bn_final; }
      else if (catSortConfig.key === 'a4color') { aVal = a.a4_color_final; bVal = b.a4_color_final; }
      else if (catSortConfig.key === 'a5bn') { aVal = a.a5_bn_final; bVal = b.a5_bn_final; }
      else if (catSortConfig.key === 'a5color') { aVal = a.a5_color_final; bVal = b.a5_color_final; }
      else if (catSortConfig.key === 'estado') { aVal = a.activo !== false ? 1 : 0; bVal = b.activo !== false ? 1 : 0; }
      else if (catSortConfig.key === 'pdf') { aVal = a.pdf_url ? 1 : 0; bVal = b.pdf_url ? 1 : 0; }
      else if (catSortConfig.key === 'portada') { aVal = a.imagen_url && !a.imagen_url.startsWith('https://placehold.co/') ? 1 : 0; bVal = b.imagen_url && !b.imagen_url.startsWith('https://placehold.co/') ? 1 : 0; }
      else { aVal = a[catSortConfig.key]; bVal = b[catSortConfig.key]; }
      if (typeof aVal === 'string') { aVal = slug(aVal); bVal = slug(bVal); }
      if (aVal == null) aVal = ''; if (bVal == null) bVal = '';
      if (aVal < bVal) return catSortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return catSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-700 text-sm text-ink-800">Gestión del catálogo</div>
          <div className="text-xs text-ink-400">{books.length} libros · {books.filter(b => b.activo !== false).length} activos</div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button className={`text-xs px-3 py-2 rounded-lg font-700 transition-colors ${bulkEdit ? 'bg-brand-DEFAULT text-white shadow-md' : 'btn-secondary'}`} disabled={savingBulk} onClick={async () => {
            if (bulkEdit) {
              const entries = Object.entries(bulkChanges);
              if (entries.length > 0) {
                setSavingBulk(true);
                let saved = 0;
                for (const [id, changes] of entries) {
                  const orig = books.find(b => b.id === id);
                  if (!orig) continue;
                  const merged = recalcBookSugeridos({ ...orig, ...changes }, config);
                  const ok = await saveBookToSupabase(merged, config);
                  if (ok) saved++;
                }
                setBooks(prev => prev.map(b => {
                  const changes = bulkChanges[b.id];
                  if (!changes) return b;
                  return recalcBookSugeridos({ ...b, ...changes }, config);
                }));
                setSavingBulk(false);
                if (saved > 0) alert(`✓ ${saved} libro${saved > 1 ? 's' : ''} guardado${saved > 1 ? 's' : ''}`);
              }
              setBulkChanges({});
            }
            setBulkEdit(v => !v);
          }}>
            {savingBulk ? <span className="flex items-center gap-1"><span className="spinner-sm" /> Guardando...</span> : (bulkEdit ? (Object.keys(bulkChanges).length > 0 ? <><Icon.Check /> Guardar ({Object.keys(bulkChanges).length})</> : <><Icon.X /> Cerrar edición</>) : <><Icon.Edit /> Edición rápida</>)}
          </button>
          <button className="btn-primary text-xs px-3 py-2" onClick={() => {
            const newBook = {
              id: `lib-${String(Date.now()).slice(-6)}`, id_libro: `lib-${String(Date.now()).slice(-6)}`,
              titulo: '', materia: '', id_carrera: config.carreras[0]?.id_carrera || '', carrera: config.carreras[0]?.nombre || '',
              autor: '', paginas: 100, paginas_por_hoja: 2, pdf_url: '', activo: true,
              a4_bn_habilitado: true, a4_bn_sugerido: 0, a4_bn_ajuste: 0, a4_bn_final: 0,
              a4_color_habilitado: false, a4_color_final: 0,
              a5_bn_habilitado: false, a5_bn_sugerido: 0, a5_bn_ajuste: 0, a5_bn_final: 0,
              a5_color_habilitado: false, a5_color_final: 0,
              imagen_url: 'https://placehold.co/420x520/E8ECF2/0D1117?text=Nuevo+Libro'
            };
            setEditingBook(recalcBookSugeridos(newBook, config));
          }}><Icon.Book /> Nuevo libro</button>
          <button className="btn-secondary text-xs px-3 py-2" onClick={() => {
            const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'catalogo-export.json'; a.click();
          }}><Icon.Download /> Exportar</button>
          <label className="btn-secondary text-xs px-3 py-2 cursor-pointer"><Icon.Upload /> Importar
            <input type="file" accept=".json" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              const reader = new FileReader();
              reader.onload = async ev => {
                try {
                  const data = JSON.parse(ev.target.result);
                  if (!Array.isArray(data)) { alert('El archivo debe contener un array de libros.'); return; }
                  const migrated = data.map(b => migrateBook(b, config));
                  const sb = getSupabase(config);
                  const { data: upserted, error } = await sb.from('libros').upsert(migrated, { onConflict: 'id' });
                  if (error) { console.error('Supabase upsert error:', error); alert('Error al importar a Supabase:\n' + (error.message || JSON.stringify(error))); return; }
                  const fresh = await fetchBooksFromSupabase(config);
                  if (fresh && fresh.length > 0) setBooks(fresh);
                  else setBooks(migrated);
                } catch (err) { console.error('Import error:', err); alert('Error al leer el archivo JSON:\n' + err.message); }
              };
              reader.readAsText(f);
              e.target.value = '';
            }} />
          </label>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"><Icon.Search /></span>
            <input className="input-field" style={{paddingLeft: '2.75rem'}} placeholder="Buscar libro o materia" value={abmSearch} onChange={e => setAbmSearch(e.target.value)} />
          </div>
          <select className="input-field" value={abmCareer} onChange={e => setAbmCareer(e.target.value)}>
            <option value="">Todas las carreras</option>
            {getCareers(config, books).map(c => <option key={c.id_carrera} value={c.id_carrera}>{careerLabel(c)}</option>)}
          </select>
          <select className="input-field" value={abmStatus} onChange={e => setAbmStatus(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      <div className="table-shell" style={{overflowX: 'auto'}} onMouseMove={handleResizeMove} onMouseUp={handleResizeEnd} onMouseLeave={handleResizeEnd}>
        <table style={{minWidth: bulkEdit ? '1100px' : 'auto'}}>
          <thead>
            <tr>
              {bulkEdit ? (
                <>
                  <th style={{position:'relative'}}>Libro<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 0); }} /></th>
                  <th style={{position:'relative'}}>Págs<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 1); }} /></th>
                  <th style={{position:'relative'}}>pph<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 2); }} /></th>
                  <th style={{position:'relative'}}>PDF<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 3); }} /></th>
                  <th style={{position:'relative'}}>A4 B/N<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 4); }} /></th>
                  <th style={{position:'relative'}}>A4 Color<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 5); }} /></th>
                  <th style={{position:'relative'}}>A5 B/N<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 6); }} /></th>
                  <th style={{position:'relative'}}>A5 Color<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 7); }} /></th>
                  <th style={{position:'relative', width:'80px'}}>Encuad.<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 8); }} /></th>
                  <th style={{position:'relative', width:'60px'}}>Portada<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 9); }} /></th>
                  <th style={{position:'relative'}}>Activo<div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, 10); }} /></th>
                  <th style={{width:'40px'}}></th>
                </>
              ) : (
                columns.map((col, idx) => (
                  <th key={col.key} style={{...(!catColumnVisibility[col.key] ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}), position: 'relative'}}>
                    {catColumnVisibility[col.key] ? (
                      <button className="flex items-center gap-1 w-full text-left hover:text-ink-900 transition-colors" onClick={() => handleCatSort(col.key)}>
                        {col.label}
                        {catSortConfig.key === col.key && (
                          <span className="text-[10px]">{catSortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </button>
                    ) : (
                      <span className="text-xs opacity-50">{col.label.charAt(0)}</span>
                    )}
                    {catColumnVisibility[col.key] && <div className="resize-handle" onMouseDown={e => { e.stopPropagation(); handleResizeStart(e, idx); }} />}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {(() => {
              if (bulkEdit) {
                return list.map(b => {
                  const c = bulkChanges[b.id] || {};
                  const cur = { ...b, ...c };
                  const set = (key, val) => setBulkChanges(prev => ({ ...prev, [b.id]: { ...(prev[b.id] || {}), [key]: val } }));
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <img src={b.imagen_url} alt="" className="w-8 h-10 object-cover rounded border border-ink-100 flex-shrink-0" />
                          <input className="input-field text-sm py-1" value={cur.titulo} onChange={e => set('titulo', e.target.value)} style={{minWidth:'120px'}} />
                        </div>
                      </td>
                      <td><input className="input-field text-sm py-1 w-[70px] text-center" type="number" min="1" value={cur.paginas} onChange={e => {
                        const p = Number(e.target.value) || 1;
                        setBulkChanges(prev => {
                          const existing = prev[b.id] || {};
                          const updated = recalcBookSugeridos({ ...b, ...existing, paginas: p }, config);
                          return { ...prev, [b.id]: { ...existing, paginas: p, a4_bn_sugerido: updated.a4_bn_sugerido, a5_bn_sugerido: updated.a5_bn_sugerido, paginas_por_hoja: existing.paginas_por_hoja || b.paginas_por_hoja } };
                        });
                      }} /></td>
                      <td>
                        <select className="input-field text-sm py-1 w-[58px] text-center" value={cur.paginas_por_hoja || 2} onChange={e => {
                          const pp = Number(e.target.value) || 2;
                          setBulkChanges(prev => {
                            const existing = prev[b.id] || {};
                            const updated = recalcBookSugeridos({ ...b, ...existing, paginas_por_hoja: pp }, config);
                            return { ...prev, [b.id]: { ...existing, paginas_por_hoja: pp, a4_bn_sugerido: updated.a4_bn_sugerido, a5_bn_sugerido: updated.a5_bn_sugerido } };
                          });
                        }}>
                          <option value={2}>2</option>
                          <option value={4}>4</option>
                        </select>
                      </td>
                      <td>
                        <div className="flex items-center gap-1" style={{minWidth:'100px'}}>
                          <input className="input-field text-xs py-1 flex-1" value={cur.pdf_url || ''} onChange={e => set('pdf_url', e.target.value)} placeholder="URL o subir" />
                          <label className="text-xs px-1.5 py-1 rounded border border-ink-200 hover:bg-ink-50 cursor-pointer transition-colors" title="Subir PDF a Supabase Storage">
                            {uploadingPdfId === b.id ? '⏳' : '📎'}
                            <input type="file" accept=".pdf" className="hidden" onChange={async e2 => {
                              const file = e2.target.files?.[0]; if (!file) return;
                              if (file.size > 50 * 1024 * 1024) { alert('El archivo supera los 50MB.'); return; }
                              setUploadingPdfId(b.id);
                              try {
                                const url = await uploadPdfToStorage(file, b.id, config);
                                set('pdf_url', url);
                                const ok = await saveBookToSupabase({ ...cur, pdf_url: url }, config);
                                if (ok) setBooks(prev => prev.map(x => x.id === b.id ? { ...x, pdf_url: url } : x));
                              } catch (err) { console.error(err); alert('Error al subir PDF: ' + err.message); }
                              setUploadingPdfId(null);
                              e2.target.value = '';
                            }} />
                          </label>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-center gap-0.5">
                          <button onClick={() => set('a4_bn_habilitado', !cur.a4_bn_habilitado)} className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${cur.a4_bn_habilitado ? 'bg-emerald-500' : 'bg-ink-200'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cur.a4_bn_habilitado ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                          {cur.a4_bn_habilitado && (
                            <>
                              <input className="input-field text-xs py-0.5 w-[65px] text-center" type="number" value={cur.a4_bn_final || ''} onChange={e => set('a4_bn_final', Number(e.target.value) || 0)} />
                              <span className="text-[10px] text-ink-300">Sug. {fmt(cur.a4_bn_sugerido)}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-center gap-0.5">
                          <button onClick={() => set('a4_color_habilitado', !cur.a4_color_habilitado)} className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${cur.a4_color_habilitado ? 'bg-emerald-500' : 'bg-ink-200'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cur.a4_color_habilitado ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                          {cur.a4_color_habilitado && (
                            <input className="input-field text-xs py-0.5 w-[65px] text-center" type="number" value={cur.a4_color_final || ''} onChange={e => set('a4_color_final', Number(e.target.value) || 0)} />
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-center gap-0.5">
                          <button onClick={() => set('a5_bn_habilitado', !cur.a5_bn_habilitado)} className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${cur.a5_bn_habilitado ? 'bg-emerald-500' : 'bg-ink-200'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cur.a5_bn_habilitado ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                          {cur.a5_bn_habilitado && (
                            <>
                              <input className="input-field text-xs py-0.5 w-[65px] text-center" type="number" value={cur.a5_bn_final || ''} onChange={e => set('a5_bn_final', Number(e.target.value) || 0)} />
                              <span className="text-[10px] text-ink-300">Sug. {fmt(cur.a5_bn_sugerido)}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-center gap-0.5">
                          <button onClick={() => set('a5_color_habilitado', !cur.a5_color_habilitado)} className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${cur.a5_color_habilitado ? 'bg-emerald-500' : 'bg-ink-200'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cur.a5_color_habilitado ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                          {cur.a5_color_habilitado && (
                            <input className="input-field text-xs py-0.5 w-[65px] text-center" type="number" value={cur.a5_color_final || ''} onChange={e => set('a5_color_final', Number(e.target.value) || 0)} />
                          )}
                        </div>
                      </td>
                      <td style={{width:'80px'}}>
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            onClick={() => set('encuadernacion', cur.encuadernacion === 'anillado' ? 'abrochado' : 'anillado')}
                            className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${cur.encuadernacion === 'anillado' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                            title={cur.encuadernacion === 'anillado' ? 'Anillado' : 'Abrochado'}
                          >
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cur.encuadernacion === 'anillado' ? 'right-0.5' : 'left-0.5'}`} />
                          </button>
                          <span className="text-[10px] text-ink-400">{cur.encuadernacion === 'anillado' ? '🪢 Anillado' : cur.encuadernacion === 'abrochado' ? '📎 Abroch.' : 'Auto'}</span>
                        </div>
                      </td>
                      <td style={{width:'60px'}}>
                        <label className="flex items-center justify-center w-10 h-10 mx-auto rounded-lg border-2 border-dashed border-ink-200 hover:border-brand-DEFAULT cursor-pointer transition-colors bg-ink-50 relative overflow-hidden" title="Arrastrá o click para subir portada">
                          {cur.imagen_url && !cur.imagen_url.startsWith('https://placehold.co/') ? (
                            <img src={cur.imagen_url} className="w-full h-full object-cover absolute inset-0" alt="" />
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-300"><rect x="2" y="2" width="20" height="20" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={async e2 => {
                            const file = e2.target.files?.[0]; if (!file) return;
                            if (file.size > 5 * 1024 * 1024) { alert('La imagen no debe superar 5MB.'); return; }
                            setUploadingPdfId(b.id);
                            try {
                              const url = await subirPortada(file, b.id, config);
                              set('imagen_url', url);
                              saveBookToSupabase({ ...cur, imagen_url: url }, config);
                              setBooks(prev => prev.map(x => x.id === b.id ? { ...x, imagen_url: url } : x));
                            } catch (err) { console.error(err); alert('Error al subir portada: ' + err.message); }
                            setUploadingPdfId(null);
                            e2.target.value = '';
                          }} />
                        </label>
                      </td>
                      <td className="text-center">
                        <button onClick={() => set('activo', cur.activo !== false ? false : true)} className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${cur.activo !== false ? 'bg-emerald-500' : 'bg-ink-200'}`}>
                          <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${cur.activo !== false ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                        <span className="text-[10px] block mt-0.5 text-ink-400">{cur.activo !== false ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td>
                        <button className="text-red-500 hover:text-red-700 text-lg font-700 transition-colors" title="Eliminar libro" onClick={async () => {
                          if (!confirm(`¿Eliminar "${b.titulo || 'este libro'}"? Esta acción no se puede deshacer.`)) return;
                          const ok = await deleteBookFromSupabase(b.id, config);
                          if (ok) setBooks(prev => prev.filter(x => x.id !== b.id));
                        }}>×</button>
                      </td>
                    </tr>
                  );
                });
              }
              return list.map(b => (
                <tr key={b.id} className={b.activo === false ? 'opacity-50' : ''}>
                  <td style={!catColumnVisibility.libro ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.libro ? (
                      <div className="flex items-center gap-3">
                        <img src={b.imagen_url} alt="" className="w-10 h-12 object-cover rounded-lg border border-ink-100 flex-shrink-0" />
                        <div>
                          <div className="font-700 text-ink-900 text-sm">{b.titulo || 'Sin título'}</div>
                          <div className="text-xs text-ink-400">{b.materia} · {b.autor}</div>
                        </div>
                      </div>
                    ) : <span className="text-xs opacity-50">📖</span>}
                  </td>
                  <td style={!catColumnVisibility.carrera ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.carrera ? <span className="text-sm">{b.carrera}</span> : <span className="text-xs opacity-50">🎓</span>}
                  </td>
                  <td style={!catColumnVisibility.paginas ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.paginas ? (
                      <div>
                        <span className="text-sm font-600">{b.paginas}</span>
                        <span className="text-[10px] text-ink-400 block">{b.paginas_por_hoja === 4 ? '4' : '2'} pág/hoja</span>
                      </div>
                    ) : <span className="text-xs opacity-50">#</span>}
                  </td>
                  <td style={!catColumnVisibility.a4bn ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.a4bn ? (b.a4_bn_habilitado ? <span className="badge bg-ok-muted text-ok-DEFAULT">{fmt(b.a4_bn_final)}</span> : <span className="text-xs text-ink-300">—</span>) : <span className="text-xs opacity-50">A4</span>}
                  </td>
                  <td style={!catColumnVisibility.a4color ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.a4color ? (b.a4_color_habilitado ? <span className="badge bg-accent-muted text-accent">{fmt(b.a4_color_final)}</span> : <span className="text-xs text-ink-300">—</span>) : <span className="text-xs opacity-50">C</span>}
                  </td>
                  <td style={!catColumnVisibility.a5bn ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.a5bn ? (b.a5_bn_habilitado ? <span className="badge bg-ok-muted text-ok-DEFAULT">{fmt(b.a5_bn_final)}</span> : <span className="text-xs text-ink-300">—</span>) : <span className="text-xs opacity-50">A5</span>}
                  </td>
                  <td style={!catColumnVisibility.a5color ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.a5color ? (b.a5_color_habilitado ? <span className="badge bg-accent-muted text-accent">{fmt(b.a5_color_final)}</span> : <span className="text-xs text-ink-300">—</span>) : <span className="text-xs opacity-50">C</span>}
                  </td>
                  <td style={!catColumnVisibility.estado ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.estado ? (
                      <button onClick={async () => {
                        const updated = { ...b, activo: !b.activo };
                        const ok = await saveBookToSupabase(updated, config);
                        if (!ok) return;
                        setBooks(prev => prev.map(x => x.id === b.id ? updated : x));
                      }}
                        className={`badge cursor-pointer ${b.activo !== false ? 'bg-ok-muted text-ok-DEFAULT' : 'bg-ink-100 text-ink-400'}`}>
                        {b.activo !== false ? 'Activo' : 'Inactivo'}
                      </button>
                    ) : (
                      <button onClick={async () => {
                        const updated = { ...b, activo: !b.activo };
                        const ok = await saveBookToSupabase(updated, config);
                        if (!ok) return;
                        setBooks(prev => prev.map(x => x.id === b.id ? updated : x));
                      }}
                        className="text-xs opacity-50 hover:opacity-100 transition-opacity" title="Toggle activo/inactivo">
                        {b.activo !== false ? '✓' : '✕'}
                      </button>
                    )}
                  </td>
                  <td style={!catColumnVisibility.pdf ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}} className="text-center">
                    {catColumnVisibility.pdf ? (
                      b.pdf_url
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00B67A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto" title="Tiene PDF"><polyline points="20 6 9 17 4 12" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto opacity-40" title="Sin PDF"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    ) : <span className="text-xs opacity-50">{b.pdf_url ? '✓' : '✕'}</span>}
                  </td>
                  <td style={!catColumnVisibility.portada ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}} className="text-center">
                    {catColumnVisibility.portada ? (
                      b.imagen_url && !b.imagen_url.startsWith('https://placehold.co/')
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0066FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto" title="Portada personalizada"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9BAABB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto opacity-40" title="Portada genérica"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>
                    ) : <span className="text-xs opacity-50">{b.imagen_url && !b.imagen_url.startsWith('https://placehold.co/') ? '✓' : '✕'}</span>}
                  </td>
                  <td style={!catColumnVisibility.acciones ? { width: '40px', minWidth: '40px', maxWidth: '40px', overflow: 'hidden', padding: '8px' } : {}}>
                    {catColumnVisibility.acciones ? (
                      <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setEditingBook(b)}>Editar</button>
                    ) : (
                      <button className="text-xs opacity-50 hover:opacity-100 transition-opacity" onClick={() => setEditingBook(b)} title="Editar">✎</button>
                    )}
                  </td>
                </tr>
              ));
            })()}
            {books.length === 0 && (
              <tr><td colSpan={bulkEdit ? 10 : 11} className="text-center text-ink-400 py-10">No hay libros en el catálogo. Creá uno o importá desde JSON.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
