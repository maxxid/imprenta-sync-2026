import { useState, useEffect } from 'react';
import { fmt, getCategorias, calcPdfPaginas, calcPdfPrecio } from '../../lib/utils';
import { saveConfigToSupabase } from '../../lib/supabase';
import { DEFAULT_CALC_CATEGORIAS } from '../../lib/constants';

const nuevoId = () => `pdf_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const pdfVacio = (n) => ({ id: nuevoId(), nombre: `PDF ${n}`, incluir: true, paginas: {} });

/**
 * Tab Calculadora: sub-pestañas = 1 PDF cada una. Por PDF se cargan páginas por
 * categoría (precio por página). El botón **⚙ Ajustes** abre un panel chico para
 * editar sobre la marcha los costos y variables (tarifas por categoría, redondeo a
 * par, anillado y umbral de hojas) — mismo contenido que Ajustes → Calculadora.
 * El presupuesto se guarda en `config.calc_borrador` (DB, sin migración) y puede
 * mandarse al tab "Pedido Nuevo" con el botón "Cargar los ✓ a Pedido Nuevo".
 */
export function AdminCalculadora({ config, setConfig, setPedidoDraft, setTab, calcFromOrder }) {
  const categorias = getCategorias(config);
  const borrador = config?.calc_borrador;

  const [pdfs, setPdfs] = useState(() => (Array.isArray(borrador?.pdfs) && borrador.pdfs.length ? borrador.pdfs : [pdfVacio(1)]));
  const [activoId, setActivoId] = useState(() => borrador?.activo || null);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);
  // Borrador del panel ⚙ de ajustes rápidos (null = panel cerrado).
  const [ajustes, setAjustes] = useState(null);

  useEffect(() => {
    if (!pdfs.some(p => p.id === activoId)) setActivoId(pdfs[0]?.id || null);
  }, [pdfs, activoId]);

  const activo = pdfs.find(p => p.id === activoId) || null;

  function mutarPdf(id, updater) {
    setPdfs(prev => prev.map(p => (p.id === id ? updater({ ...p }) : p)));
  }

  function setPagina(pdfId, catId, valor) {
    mutarPdf(pdfId, p => {
      p.paginas = { ...(p.paginas || {}), [catId]: Math.max(0, Number(valor) || 0) };
      return p;
    });
  }

  function agregarPdf() {
    const p = pdfVacio(pdfs.length + 1);
    setPdfs(prev => [...prev, p]);
    setActivoId(p.id);
  }

  function eliminarPdf(id) {
    setPdfs(prev => prev.filter(p => p.id !== id));
  }

  const precioDe = (p) => calcPdfPrecio(categorias, p.paginas, config);
  const totalPresupuesto = pdfs.reduce((acc, p) => acc + precioDe(p), 0);
  const pdfsOk = pdfs.filter(p => p.incluir && calcPdfPaginas(p.paginas) > 0);

  async function guardar() {
    setGuardando(true);
    setMsg(null);
    const nuevaConfig = { ...config, calc_borrador: { pdfs, activo: activoId } };
    const ok = await saveConfigToSupabase(nuevaConfig, nuevaConfig);
    setConfig(nuevaConfig);
    setGuardando(false);
    setMsg(ok ? 'ok' : 'local');
    setTimeout(() => setMsg(null), 3500);
  }

  // ─── Panel ⚙: ajustes rápidos de costos y variables ─────────────────
  // Se abre/cierra con el botón del header; borrador local que se aplica con
  // "Guardar ajustes" (mismo camino de persistencia que guardar()).
  function abrirAjustes() {
    setAjustes(prev => (prev ? null : {
      categorias: (config?.calculadora?.categorias || DEFAULT_CALC_CATEGORIAS).map(c => ({ ...c })),
      redondear_impar: Boolean(config?.calculadora?.redondear_impar),
      anillado: Number(config?.encuadernacion?.basica) || 0,
      umbral: Number(config?.encuadernacion?.umbral_anillado_hojas) || 40
    }));
  }

  function setCatAjuste(idx, patch) {
    setAjustes(a => ({ ...a, categorias: a.categorias.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  }

  async function guardarAjustes() {
    if (!ajustes) return;
    setGuardando(true);
    setMsg(null);
    const nuevaConfig = {
      ...config,
      calculadora: {
        ...(config?.calculadora || {}),
        categorias: ajustes.categorias,
        redondear_impar: ajustes.redondear_impar
      },
      encuadernacion: {
        ...(config?.encuadernacion || {}),
        basica: ajustes.anillado,
        umbral_anillado_hojas: ajustes.umbral
      }
    };
    const ok = await saveConfigToSupabase(nuevaConfig, nuevaConfig);
    setConfig(nuevaConfig);
    setGuardando(false);
    setAjustes(null);
    setMsg(ok ? 'ok' : 'local');
    setTimeout(() => setMsg(null), 3500);
  }

  function cargarAPedido() {
    if (!pdfsOk.length) {
      alert('Marcá con ✓ al menos un PDF que tenga páginas cargadas.');
      return;
    }
    const items = pdfsOk.map((p, i) => {
      const paginas = calcPdfPaginas(p.paginas);
      const hojas = Math.ceil(paginas / 2);
      const umbral = Number(config?.encuadernacion?.umbral_anillado_hojas || 40);
      return {
        id: `calc_${Date.now().toString(36)}_${i}`,
        titulo: (p.nombre || 'PDF').trim(),
        materia: '',
        carrera: '',
        id_carrera: '',
        paginas,
        hojas,
        formato: 'A4',
        varianteId: '',
        encuadernacion: 'basica',
        color: false,
        express: false,
        precio: precioDe(p),
        tipo: hojas >= umbral ? 'anillado' : 'abrochado',
        imagen_url: '',
        origen: 'calculadora',
        es_unico: true,
        comentario: ''
      };
    });
    setPedidoDraft(prev => ({ ...prev, items: [...(prev?.items || []), ...items] }));
    setTab('pedido-nuevo');
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 flex-wrap">
          {pdfs.map(p => (
            <button
              key={p.id}
              onClick={() => setActivoId(p.id)}
              className={`px-3 py-2 rounded-lg text-sm font-700 transition-colors max-w-[220px] truncate ${activoId === p.id ? 'bg-brand-DEFAULT text-white shadow-md' : 'text-ink-500 hover:text-ink-700 hover:bg-surface-hover'}`}
              title={p.nombre}
            >
              {p.incluir ? '📄' : '📃'} {p.nombre || 'PDF'}
            </button>
          ))}
          <button onClick={agregarPdf} className="px-3 py-2 rounded-lg text-sm font-700 text-brand-DEFAULT hover:bg-surface-hover" title="Agregar otro PDF">+ Nuevo PDF</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-ink-500">
            {pdfs.length} PDF{pdfs.length !== 1 ? 's' : ''} · <span className="font-700 text-ink-700">Total {fmt(totalPresupuesto)}</span>
          </div>
          <button
            type="button"
            onClick={abrirAjustes}
            className={`btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 ${ajustes ? 'text-brand-DEFAULT bg-brand-muted' : ''}`}
            title="Ajustes rápidos: tarifas por página, redondeo y encuadernación"
          >⚙ Ajustes</button>
        </div>
      </div>

      {ajustes && (
        <div className="card p-4 mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="font-700 text-sm text-ink-800">⚙ Ajustes de la calculadora</div>
              <div className="text-xs text-ink-400">Costos y variables que usa esta pestaña (lo mismo que Ajustes → Calculadora).</div>
            </div>
            <button
              type="button"
              onClick={() => setAjustes(null)}
              className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              title="Cerrar sin guardar"
            >✕</button>
          </div>

          <div className="text-[11px] font-700 text-ink-500 uppercase tracking-wide mb-1">Tarifas por página</div>
          <div className="space-y-2 mb-3">
            {ajustes.categorias.map((cat, idx) => (
              <div key={cat.id || idx} className="flex items-center gap-2 flex-wrap">
                <input className="input-field flex-1 min-w-[150px]" type="text" placeholder="Ej: Blanco y negro" value={cat.nombre} onChange={e => setCatAjuste(idx, { nombre: e.target.value })} />
                <input className="input-field w-[110px]" type="number" min="0" value={cat.precio} onChange={e => setCatAjuste(idx, { precio: Number(e.target.value || 0) })} />
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

          <div className="flex items-end gap-x-4 gap-y-3 flex-wrap">
            <button
              type="button"
              onClick={() => setAjustes(a => ({ ...a, categorias: [...a.categorias, { id: `cat_${Date.now().toString(36)}`, nombre: '', precio: 0 }] }))}
              className="btn-secondary text-xs px-3 py-1.5"
            >+ Agregar categoría</button>
            <label className="flex items-center gap-2 text-xs font-700 text-ink-600 cursor-pointer select-none pb-1.5">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT"
                checked={ajustes.redondear_impar}
                onChange={e => setAjustes(a => ({ ...a, redondear_impar: e.target.checked }))}
              />
              Redondear a par
            </label>
            <div>
              <label className="text-[10px] font-700 text-ink-400 uppercase block mb-1">Anillado ($)</label>
              <input className="input-field w-[110px]" type="number" min="0" value={ajustes.anillado} onChange={e => setAjustes(a => ({ ...a, anillado: Number(e.target.value || 0) }))} />
            </div>
            <div>
              <label className="text-[10px] font-700 text-ink-400 uppercase block mb-1">Anillado desde (hojas)</label>
              <input className="input-field w-[110px]" type="number" min="1" value={ajustes.umbral} onChange={e => setAjustes(a => ({ ...a, umbral: Number(e.target.value || 1) }))} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-ink-100">
            <button type="button" onClick={() => setAjustes(null)} className="btn-ghost text-xs px-3 py-1.5">Cancelar</button>
            <button type="button" onClick={guardarAjustes} disabled={guardando} className="btn-primary text-xs px-4 py-1.5">
              {guardando ? '…' : 'Guardar ajustes'}
            </button>
          </div>
        </div>
      )}

      <div className="text-xs text-ink-400 mb-4">
        Cobro <span className="font-700 text-ink-600">por página según contenido</span> (una hoja puede llevar texto de un lado e imagen del otro).
        Editá categorías y precios con <span className="font-700">⚙ Ajustes</span> (arriba) o en <span className="font-700">Ajustes → Calculadora</span>. Dejalo guardado o cargalo al pedido.
      </div>

      {!activo ? (
        <div className="card p-8 text-center text-ink-400 text-sm">No hay PDFs. Tocá "+ Nuevo PDF".</div>
      ) : (
        <div className="card p-5">
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <input
              className="input-field flex-1 min-w-[220px]"
              value={activo.nombre || ''}
              placeholder="Nombre del PDF (ej: Tesis Anatomía)"
              onChange={e => mutarPdf(activo.id, p => { p.nombre = e.target.value; return p; })}
            />
            <label className="flex items-center gap-2 text-xs font-700 text-ink-500 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-ink-300 text-brand-DEFAULT focus:ring-brand-DEFAULT"
                checked={activo.incluir !== false}
                onChange={e => mutarPdf(activo.id, p => { p.incluir = e.target.checked; return p; })}
              />
              ✓ Incluir al pedido
            </label>
            <button
              onClick={() => eliminarPdf(activo.id)}
              className="btn-secondary text-xs px-3 py-1.5 text-danger"
              title="Eliminar este PDF"
            >🗑 Quitar</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-700 text-ink-400 uppercase tracking-wide border-b border-ink-100">
                  <th className="py-2 pr-3">Contenido</th>
                  <th className="py-2 px-3 w-[130px]">Páginas</th>
                  <th className="py-2 px-3 w-[90px] text-right">$/pág</th>
                  <th className="py-2 pl-3 w-[110px] text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map(cat => {
                  const n = Math.max(0, Number(activo.paginas?.[cat.id]) || 0);
                  return (
                    <tr key={cat.id} className="border-b border-ink-50">
                      <td className="py-2 pr-3 text-ink-700">{cat.nombre}</td>
                      <td className="py-2 px-3">
                        <input
                          className="input-field text-xs py-1.5 w-[90px]"
                          type="number"
                          min="0"
                          value={activo.paginas?.[cat.id] ?? ''}
                          placeholder="0"
                          onChange={e => setPagina(activo.id, cat.id, e.target.value)}
                        />
                      </td>
                      <td className="py-2 px-3 text-right text-ink-500">{fmt(Number(cat.precio) || 0)}</td>
                      <td className="py-2 pl-3 text-right font-700 text-ink-700">{fmt(n * (Number(cat.precio) || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 pr-3 text-ink-500 font-600">Total páginas</td>
                  <td className="py-3 px-3 font-700">{calcPdfPaginas(activo.paginas)}</td>
                  <td className="py-3 px-3" />
                  <td className="py-3 pl-3 text-right font-700 text-brand-DEFAULT">{fmt(precioDe(activo))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap mt-5 p-4 card bg-surface">
        <div className="text-sm">
          <span className="text-ink-500">Presupuesto: </span>
          <span className="font-700 text-ink-800">{pdfsOk.length} PDF{pdfsOk.length !== 1 ? 's' : ''} ✓</span>
          <span className="text-ink-400"> · </span>
          <span className="font-700 text-lg text-brand-DEFAULT">{fmt(totalPresupuesto)}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className={`text-xs font-700 ${msg === 'ok' ? 'text-ok-DEFAULT' : 'text-warn-DEFAULT'}`}>{msg === 'ok' ? 'Guardado ✓' : 'Solo local'}</span>}
          <button onClick={guardar} disabled={guardando} className="btn-secondary text-sm px-4 py-2">
            {guardando ? '…' : '💾 Dejar guardado'}
          </button>
          <button onClick={cargarAPedido} className="btn-primary text-sm px-4 py-2">
            {calcFromOrder ? '⬅ Volver y cargar al pedido' : '➡ Cargar los ✓ a Pedido Nuevo'}
          </button>
        </div>
      </div>
    </div>
  );
}
