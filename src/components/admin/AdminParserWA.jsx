import React, { useState } from 'react';
import { Icon } from '../Icons';
import { Alert, Spinner } from '../UI';
import { fmt, slug, normalizePhone, HOJAS, getBookFormats, getBookCombinations, calcPrecioItem, roundTotal, getCareer, careerAddress, bookCareerId, extractTimeFromMessage, buildParserPrompt, buildParserCatalogForMode } from '../../lib/utils';
import { getSupabase, saveOrderToSupabase } from '../../lib/supabase';
import { ORDER_STATES, STATE_STYLES, DEMO_WHATSAPP } from '../../lib/constants';

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

export function AdminParserWA({ books, config, orders, setOrders }) {
  const [parserInput, setParserInput] = useState(DEMO_WHATSAPP);
  const [parserPreview, setParserPreview] = useState(null);
  const [parserLoading, setParserLoading] = useState(false);
  const [parserError, setParserError] = useState('');
  const [parserImporting, setParserImporting] = useState(false);
  const [parserToast, setParserToast] = useState(null);

  const today = new Date().toISOString().split('T')[0];

  async function parseWithGemini(mensaje) {
    if (!mensaje.trim()) {
      setParserPreview(null);
      setParserInput('');
      return;
    }
    setParserLoading(true);
    setParserError('');
    const catalogo = buildParserCatalogForMode(books, mensaje, config.prompts?.catalogo_modo);
    const fechaHoyStr = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = buildParserPrompt(config.prompts?.parser_wa, {
      fecha: fechaHoyStr,
      mensaje,
      catalogo: catalogo.texto
    });

    const sheetsUrl = config.integraciones?.SHEETS_API_URL;
    if (!sheetsUrl) {
      setParserError('No está configurada la URL del Apps Script en integraciones.SHEETS_API_URL');
      setParserLoading(false);
      return;
    }
    try {
      const url = sheetsUrl.trim();
      const formData = new URLSearchParams();
      formData.append('mensaje', mensaje);
      formData.append('prompt', prompt);
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const pedidos = data.pedidos || [];
      if (!pedidos.length || pedidos.every(p => !p.libro)) {
        setParserError('Gemini no pudo identificar libros en el mensaje. Probá reescribir el mensaje con más detalle.');
        setParserLoading(false);
        return;
      }
      const firstPhone = pedidos[0]?.telefono || '';
      const firstName = pedidos[0]?.alumno || 'Sin nombre';
      const matchedBooks = pedidos.map(p => {
        const book = books.find(b =>
          slug(b.titulo).includes(slug(p.libro)) ||
          slug(p.libro).includes(slug(b.titulo))
        );
        if (book) {
          const combos = getBookCombinations(book);
          const formato = p.formato || 'A4';
          const f = String(formato).toUpperCase();
          const combo = combos.find(c => c.key === `${f.toLowerCase()}_bn`)
            || combos.find(c => slug(c.label).includes(slug(f)))
            || combos[0];
          const pph = combo?.paginas_por_hoja || book.paginas_por_hoja || 2;
          const precio = combo ? combo.precio : (Number(p.precio) || 0);
          return {
            ...book,
            formato: combo?.label || formato,
            varianteId: combo?.key,
            color: combo?.color || false,
            hojas: HOJAS(book.paginas, pph),
            precio,
            combosDisponibles: combos
          };
        }
        const fallbackPaginas = Number(p.paginas) || 100;
        return {
          id: `parser-${Date.now()}-${pedidos.indexOf(p)}`,
          titulo: p.libro, materia: '', carrera: '', id_carrera: '',
          paginas: fallbackPaginas, paginas_por_hoja: 2, pdf_url: '', activo: true,
          variantes: [{ id: 'a4_bn', label: 'A4 B/N', paginas_por_hoja: 2, color: false, precio: Number(p.precio) || 0, habilitado: true, sugerido: 0 }],
          imagen_url: 'https://placehold.co/420x520/E8ECF2/0D1117?text=' + encodeURIComponent(p.libro),
          formato: p.formato || 'A4 B/N', color: false, hojas: HOJAS(fallbackPaginas, 2),
          precio: Number(p.precio) || 0, combosDisponibles: [], _manual: true
        };
      });
      const total = matchedBooks.reduce((acc, b) => acc + (b.precio || 0), 0);
      const totalSena = pedidos.reduce((acc, p) => acc + Number(p.sena), 0);
      const formato = pedidos[0]?.formato || 'A4';
      setParserPreview({
        nombre: firstName,
        whatsapp: firstPhone,
        libros: matchedBooks,
        formato,
        color: false,
        express: false,
        montoPagado: totalSena,
        saldo: Math.max(0, total - totalSena),
        total,
        entrega: pedidos[0]?.fecha ? { fecha: pedidos[0].fecha } : null,
        aiPedidos: pedidos,
        aiMsjWs: pedidos[0]?.msj_ws || ''
      });
    } catch (err) {
      setParserError(`Error al conectar con Gemini: ${err.message}. Verificá que el Apps Script esté deployado y la URL en config.json sea correcta.`);
    }
    setParserLoading(false);
  }

  function updateParserLibro(idx, bookId, newValue) {
    const book = books.find(b => b.id === bookId);
    if (!book || !parserPreview) return;
    const updatedLibros = [...parserPreview.libros];
    const current = parserPreview.libros[idx] || {};
    const combos = getBookCombinations(book);
    const combo = combos.find(c => c.key === newValue)
      || combos.find(c => c.label === newValue)
      || combos.find(c => c.key === current.varianteId)
      || combos[0];
    const precio = combo ? combo.precio : calcPrecioItem(book, 'a4_bn', 'basica', config, false, Boolean(current.express)).total;
    const hojasObj = HOJAS(book.paginas, combo?.paginas_por_hoja || book.paginas_por_hoja || 2);
    updatedLibros[idx] = {
      ...book,
      formato: combo?.label || newValue || 'A4 B/N',
      varianteId: combo?.key,
      color: combo?.color || false,
      hojas: hojasObj,
      precio,
      combosDisponibles: combos
    };
    const updatedAiPedidos = [...(parserPreview.aiPedidos || [])];
    if (updatedAiPedidos[idx]) updatedAiPedidos[idx] = { ...updatedAiPedidos[idx], precio, hojas: hojasObj, paginas: book.paginas };
    const newTotal = updatedLibros.reduce((acc, b) => acc + (b.precio || 0), 0);
    const montoPagado = parserPreview.aiPedidos?.[0]?.sena || parserPreview.montoPagado || 0;
    setParserPreview(prev => ({
      ...prev,
      libros: updatedLibros,
      aiPedidos: updatedAiPedidos,
      total: newTotal,
      saldo: Math.max(0, newTotal - montoPagado)
    }));
  }

  function updateParserLibroManual(idx, field, value) {
    if (!parserPreview) return;
    const updatedLibros = [...parserPreview.libros];
    updatedLibros[idx] = { ...updatedLibros[idx], [field]: value };
    if (field === 'paginas') {
      updatedLibros[idx].hojas = HOJAS(value, updatedLibros[idx].paginas_por_hoja || 2);
    }
    const newTotal = updatedLibros.reduce((acc, b) => acc + (b.precio || 0), 0);
    const montoPagado = parserPreview.aiPedidos?.[0]?.sena || parserPreview.montoPagado || 0;
    setParserPreview(prev => ({ ...prev, libros: updatedLibros, total: newTotal, saldo: Math.max(0, newTotal - montoPagado) }));
  }

  function toggleParserLibroManual(idx) {
    if (!parserPreview) return;
    const updatedLibros = [...parserPreview.libros];
    const book = updatedLibros[idx];
    if (book._manual) {
      const match = books.find(b => slug(b.titulo).includes(slug(book.titulo)) || slug(book.titulo).includes(slug(b.titulo)));
      if (match) {
        const combos = getBookCombinations(match);
        const combo = combos[0];
        updatedLibros[idx] = {
          ...match,
          formato: book.formato || combo?.label || 'A4 B/N',
          varianteId: combo?.key,
          color: combo?.color || false,
          hojas: HOJAS(match.paginas, combo?.paginas_por_hoja || match.paginas_por_hoja || 2),
          precio: combo?.precio || book.precio || 0,
          combosDisponibles: combos,
          _manual: false
        };
      } else {
        updatedLibros[idx] = { ...book, _manual: false };
      }
    } else {
      updatedLibros[idx] = { ...book, _manual: true };
    }
    const newTotal = updatedLibros.reduce((acc, b) => acc + (b.precio || 0), 0);
    const montoPagado = parserPreview.aiPedidos?.[0]?.sena || parserPreview.montoPagado || 0;
    setParserPreview(prev => ({ ...prev, libros: updatedLibros, total: newTotal, saldo: Math.max(0, newTotal - montoPagado) }));
  }

  function addParserLibro() {
    if (!parserPreview) return;
    const firstBook = books.find(b => b.activo !== false);
    if (!firstBook) return;
    const combos = getBookCombinations(firstBook);
    const combo = combos[0];
    const formato = combo ? combo.label : 'A4 B/N';
    const precio = combo ? combo.precio : 0;
    const hojas = HOJAS(firstBook.paginas, combo?.paginas_por_hoja || firstBook.paginas_por_hoja || 2);
    const newBook = { ...firstBook, formato, varianteId: combo?.key, color: combo?.color || false, hojas, precio, combosDisponibles: combos };
    const updatedLibros = [...parserPreview.libros, newBook];
    const updatedAiPedidos = [...(parserPreview.aiPedidos || []), { precio, hojas, paginas: firstBook.paginas }];
    const newTotal = updatedLibros.reduce((acc, b) => acc + (b.precio || 0), 0);
    const montoPagado = parserPreview.aiPedidos?.[0]?.sena || parserPreview.montoPagado || 0;
    setParserPreview(prev => ({
      ...prev,
      libros: updatedLibros,
      aiPedidos: updatedAiPedidos,
      total: newTotal,
      saldo: Math.max(0, newTotal - montoPagado)
    }));
  }

  function addParserLibroManual() {
    if (!parserPreview) return;
    const newBook = {
      id: `parser-manual-${Date.now()}`,
      titulo: '', materia: '', carrera: '', id_carrera: '',
      paginas: 100, paginas_por_hoja: 2, pdf_url: '', activo: true,
      variantes: [{ id: 'a4_bn', label: 'A4 B/N', paginas_por_hoja: 2, color: false, precio: 0, habilitado: true, sugerido: 0 }],
      imagen_url: 'https://placehold.co/420x520/E8ECF2/0D1117?text=Manual',
      formato: parserPreview.formato || 'A4 B/N', color: false, hojas: HOJAS(100, 2),
      precio: 0, combosDisponibles: [], _manual: true
    };
    const updatedLibros = [...parserPreview.libros, newBook];
    const updatedAiPedidos = [...(parserPreview.aiPedidos || []), { precio: 0, hojas: HOJAS(100, 2), paginas: 100 }];
    setParserPreview(prev => ({ ...prev, libros: updatedLibros, aiPedidos: updatedAiPedidos }));
  }

  function updateParserField(field, value) {
    if (!parserPreview) return;
    setParserPreview(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'montoPagado') {
        updated.saldo = Math.max(0, updated.total - value);
      }
      if (field === 'entregaFecha') {
        updated.entrega = { ...prev.entrega, fecha: value };
      }
      return updated;
    });
  }

  async function importParserPreview() {
    if (!parserPreview || !parserPreview.libros.length) return;
    setParserImporting(true);
    try {
      const items = parserPreview.libros.map((book, idx) => {
        const bookFormato = book.formato || parserPreview.formato || 'A4';
        const isManual = book._manual;
        return {
          id: `${book.id}-${Date.now()}-${idx}`,
          libroId: isManual ? null : book.id,
          titulo: book.titulo,
          materia: book.materia || '',
          carrera: isManual ? 'Único' : book.carrera,
          id_carrera: isManual ? '' : bookCareerId(book),
          paginas: book.paginas || 0,
          hojas: book.hojas || HOJAS(book.paginas, book.paginas_por_hoja || 2),
          formato: bookFormato,
          varianteId: book.varianteId || null,
          encuadernacion: 'basica',
          color: book.color || false,
          express: parserPreview.express,
          precio: book.precio || 0,
          tipo: book.hojas >= (config.encuadernacion?.umbral_anillado_hojas || 40) ? 'anillado' : 'abrochado',
          imagen_url: book.imagen_url,
          observaciones: parserPreview.aiPedidos?.[idx]?.observaciones || ''
        };
      });
      const career = getCareer(config, books, items[0]?.id_carrera || '');
      const msgTime = extractTimeFromMessage(parserInput);
      const horarioFinal = msgTime || (parserPreview.entrega?.turno === 'manana' ? '10:00' : '19:00');
      const slot = {
        fecha: parserPreview.entrega?.fecha || today,
        turno: horarioFinal,
        horario: horarioFinal,
        label: msgTime || (parserPreview.entrega?.turno === 'manana' ? 'Mañana' : 'Tarde')
      };
      const total = roundTotal(items.reduce((acc, item) => acc + item.precio, 0), config);
      const orderEstado = parserPreview.montoPagado > 0 ? 'Pendiente de impresión' : 'Pendiente de pago';
      const itemsWithEstado = items.map(item => ({ ...item, estado: orderEstado }));
      const order = {
        id: `WA${String(Date.now()).slice(-6)}`,
        nombre: parserPreview.nombre,
        whatsapp: parserPreview.whatsapp,
        items: itemsWithEstado,
        libro: itemsWithEstado.map(item => item.titulo).join(' + '),
        carrera: [...new Set(itemsWithEstado.map(item => item.carrera))].join(' / '),
        id_carrera: career?.id_carrera || '',
        materia: [...new Set(itemsWithEstado.map(item => item.materia))].join(' / '),
        formato: [...new Set(itemsWithEstado.map(item => `${item.formato || ''}${item.express || parserPreview.express ? ' Express' : ''}`.trim()))].join(' / '),
        paginas: itemsWithEstado.reduce((acc, item) => acc + item.paginas, 0),
        hojas: itemsWithEstado.reduce((acc, item) => acc + item.hojas, 0),
        subtotal: total,
        total,
        monto_pagado: parserPreview.montoPagado,
        saldo_pendiente: Math.max(0, total - parserPreview.montoPagado),
        pago_modalidad: parserPreview.pago,
        estado: orderEstado,
        fecha: slot.fecha,
        turno: slot.turno,
        modalidad_entrega: 'Retiro facultad',
        express: parserPreview.express,
        ventana_retiro: `${slot.fecha} · ${slot.horario}`,
        lugar_entrega: careerAddress(career, config),
        horario_entrega: slot.horario,
        talo_ref: `WA-${String(Date.now()).slice(-6)}`,
        wa_raw: parserInput,
        es_unico: itemsWithEstado.some(item => !item.libroId),
        ts: new Date().toISOString()
      };
      order.wa_message = parserPreview.aiMsjWs || '';
      order.notas_admin = itemsWithEstado[0]?.observaciones || '';
      await saveOrderToSupabase(order, config);
      setOrders(previous => [order, ...previous]);
      try {
        order.wa_message && navigator.clipboard && navigator.clipboard.writeText(order.wa_message);
      } catch (e) { /* ignore */ }
      setParserToast('✅ Pedido guardado correctamente');
      setTimeout(() => setParserToast(null), 3000);
      setParserPreview(null);
    } catch (err) {
      console.error('Error importando parser:', err);
      alert('Error al importar el pedido. Revisá la consola.');
    } finally {
      setParserImporting(false);
    }
  }

  return (
    <div className="grid xl:grid-cols-[1.1fr_.9fr] gap-5">
      <div className="card p-5">
        <div className="font-700 text-sm text-ink-800 mb-1">Parser IA con Gemini</div>
        <div className="text-xs text-ink-400 mb-4">Pegá el mensaje de WhatsApp. La IA extrae nombre, libros, formato, seña y teléfono automáticamente.</div>
        <textarea className="input-field min-h-[200px]" value={parserInput} onChange={event => setParserInput(event.target.value)} placeholder="Ej: Hola! Soy Brenda Borges, quiero 3 libros en A4 B/N. Anatomia 350 pags, Biologia 180 pags y Quimica 220 pags. Dejo seña de $30000. Mi tel 1155667788" />
        {parserError && <Alert type="danger" className="mt-3">{parserError}</Alert>}
        <div className="mt-3">
          <button className="btn-primary w-full" disabled={!parserInput.trim() || parserLoading} onClick={() => parseWithGemini(parserInput)}>
            {parserLoading ? (
              <span className="flex items-center justify-center gap-2"><span className="spinner-sm" /> Procesando con IA...</span>
            ) : (
              <><Icon.Upload /> Parsear con Gemini</>
            )}
          </button>
        </div>
      </div>
      <div className="card p-5">
        <div className="font-700 text-sm text-ink-800 mb-4">Previsualizacion</div>
        {!parserPreview ? (
          <div className="text-center text-ink-400 py-10">
            <Icon.Message />
            <p className="mt-2 text-sm">Parseá un mensaje para ver la previsualización</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center"><span className="text-ink-500">Nombre</span><input className="input-field text-xs py-1.5 w-[180px] text-right font-700" value={parserPreview.nombre || ''} onChange={e => updateParserField('nombre', e.target.value)} /></div>
              <div className="flex justify-between items-center"><span className="text-ink-500">Telefono</span><input className="input-field text-xs py-1.5 w-[160px] text-right font-700" value={parserPreview.whatsapp || ''} onChange={e => updateParserField('whatsapp', e.target.value)} placeholder="Sin +54" /></div>
              <div>
                <span className="text-ink-500 text-xs block mb-2">Libros</span>
                <div className="space-y-2">
                  {parserPreview.libros.map((book, idx) => {
                    const isManual = book._manual;
                    return (
                    <div key={idx} className={`flex items-start gap-1.5 flex-wrap p-2 rounded-lg ${isManual ? 'bg-amber-50 border border-amber-100' : ''}`}>
                      <span className="text-[10px] font-700 text-ink-400 mt-1.5">{idx + 1}.</span>
                      {isManual ? (
                        <div className="flex-1 flex items-center gap-1.5 flex-wrap">
                          <input
                            className="input-field text-xs py-1 flex-1 min-w-[120px]"
                            value={book.titulo || ''}
                            onChange={e => updateParserLibroManual(idx, 'titulo', e.target.value)}
                            placeholder="Título del libro"
                          />
                          <input
                            className="input-field text-xs py-1 w-[55px]"
                            type="number"
                            value={book.paginas || ''}
                            onChange={e => updateParserLibroManual(idx, 'paginas', Number(e.target.value) || 0)}
                            placeholder="Págs"
                            title="Páginas"
                          />
                          <input
                            className="input-field text-xs py-1 w-[55px]"
                            type="number"
                            value={book.hojas || ''}
                            onChange={e => updateParserLibroManual(idx, 'hojas', Number(e.target.value) || 0)}
                            placeholder="Hojas"
                            title="Hojas impresas"
                          />
                          <select
                            className="input-field text-xs py-1 w-[60px]"
                            value={book.formato || 'A4'}
                            onChange={e => updateParserLibroManual(idx, 'formato', e.target.value)}
                          >
                            <option value="A4">A4</option>
                            <option value="A5">A5</option>
                          </select>
                          <input
                            className="input-field text-xs py-1 w-[90px]"
                            type="number"
                            value={book.precio || ''}
                            onChange={e => updateParserLibroManual(idx, 'precio', Number(e.target.value) || 0)}
                            placeholder="$ Precio"
                          />
                          <button
                            className="text-xs font-700 text-brand-DEFAULT hover:text-brand-dark flex items-center gap-0.5"
                            onClick={() => toggleParserLibroManual(idx)}
                            title="Buscar en catálogo"
                          >🔍</button>
                        </div>
                      ) : (
                        <>
                          <select
                            className="input-field text-xs py-1.5 flex-1 min-w-[140px]"
                            value={book.id || ''}
                            onChange={e => updateParserLibro(idx, e.target.value, book.varianteId || book.formato || '')}
                          >
                            {books.filter(b => b.activo !== false).map(b => {
                              const bc = getBookCombinations(b);
                              const lines = bc.map(c => `${c.label}:${fmt(c.precio)}`);
                              const info = lines.join(' | ');
                              return <option key={b.id} value={b.id}>{b.titulo} [{info}]</option>;
                            })}
                          </select>
                          {(book.combosDisponibles || []).length > 1 ? (
                            <select
                              className="input-field text-xs py-1.5 w-[140px]"
                              value={book.varianteId || book.combosDisponibles[0]?.key || ''}
                              onChange={e => updateParserLibro(idx, book.id, e.target.value)}
                            >
                              {(book.combosDisponibles || []).map(c => (
                                <option key={c.key} value={c.key}>
                                  {c.label} ({fmt(c.precio)})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="badge bg-ink-100 text-ink-500 text-xs">{book.formato || 'A4 B/N'}</span>
                          )}
                          <span className="text-xs font-700 text-ink-900 w-[70px] text-right">{book.precio > 0 ? fmt(book.precio) : '—'}</span>
                          <button
                            className="text-[10px] font-700 text-amber-500 hover:text-amber-700 flex-shrink-0"
                            onClick={() => toggleParserLibroManual(idx)}
                            title="Convertir a libro manual"
                          >✎</button>
                        </>
                      )}
                      <button
                        className="text-red-400 hover:text-red-600 font-700 text-sm flex-shrink-0 ml-0.5"
                        title="Quitar libro"
                        onClick={() => {
                          const updatedLibros = parserPreview.libros.filter((_, i) => i !== idx);
                          const updatedAiPedidos = (parserPreview.aiPedidos || []).filter((_, i) => i !== idx);
                          const newTotal = updatedLibros.reduce((acc, b) => acc + (b.precio || 0), 0);
                          const montoPagado = parserPreview.aiPedidos?.[0]?.sena || parserPreview.montoPagado || 0;
                          setParserPreview(prev => ({ ...prev, libros: updatedLibros, aiPedidos: updatedAiPedidos, total: newTotal, saldo: Math.max(0, newTotal - montoPagado) }));
                        }}
                      >✕</button>
                      <div className="flex items-center gap-1 w-full mt-1">
                        <span className="text-[10px] font-700 text-ink-400 flex-shrink-0">OBS:</span>
                        <input
                          className="input-field text-xs py-1 flex-1"
                          value={(parserPreview.aiPedidos || [])[idx]?.observaciones || ''}
                          onChange={e => {
                            const updated = [...(parserPreview.aiPedidos || [])];
                            if (!updated[idx]) updated[idx] = {};
                            updated[idx] = { ...updated[idx], observaciones: e.target.value };
                            setParserPreview(prev => ({ ...prev, aiPedidos: updated }));
                          }}
                          placeholder="ej: 🕒14hs 📍Lavalle"
                        />
                      </div>
                    </div>
                  );})}
                  <div className="flex gap-2 mt-1">
                    <button onClick={addParserLibro} className="text-xs text-brand-DEFAULT hover:text-brand-dark font-700 flex items-center gap-1">+ Agregar del catálogo</button>
                    <button onClick={addParserLibroManual} className="text-xs text-amber-600 hover:text-amber-800 font-700 flex items-center gap-1">+ Agregar libro manual</button>
                  </div>
                </div>
              </div>
              {parserPreview.libros.length > 0 && parserPreview.libros.some(b => b._manual) && (() => {
                const previewId = `WA${String(Date.now()).slice(-6)}`;
                const librosStr = parserPreview.libros.map(b => b.titulo).join(', ');
                const nombrePdf = `${previewId}-${parserPreview.nombre || 'SinNombre'}-${librosStr}`.replace(/[\\/:*?"<>|]/g, '-').slice(0, 200);
                return (
                  <div className="mt-3 p-2 bg-ink-50 rounded-lg">
                    <div className="text-[10px] font-600 text-ink-400 uppercase mb-1">Nombre sugerido para PDF</div>
                    <div className="text-xs text-ink-700 break-all font-mono select-all" title="Click para seleccionar todo">{nombrePdf}.pdf</div>
                  </div>
                );
              })()}
              <div className="flex justify-between items-center"><span className="text-ink-500">Formato</span><select className="input-field text-xs py-1.5 w-[80px] text-right font-700" value={parserPreview.formato} onChange={e => updateParserField('formato', e.target.value)}><option value="A4">A4</option><option value="A5">A5</option></select></div>
              <div className="flex justify-between items-center"><span className="text-ink-500">Seña / pago</span><input className="input-field text-xs py-1.5 w-[130px] text-right font-700" type="number" value={parserPreview.montoPagado || 0} onChange={e => updateParserField('montoPagado', Number(e.target.value) || 0)} /></div>
              <div className="flex justify-between"><span className="text-ink-500">Saldo</span><span className="font-700">{fmt(parserPreview.saldo)}</span></div>
              <div className="flex justify-between"><span className="text-ink-500">Total</span><span className="font-700">{fmt(parserPreview.total)}</span></div>
              <div className="flex justify-between items-center"><span className="text-ink-500">Color</span><label className="switch-sm"><input type="checkbox" checked={parserPreview.color} onChange={e => updateParserField('color', e.target.checked)} /><span /></label></div>
              <div className="flex justify-between items-center"><span className="text-ink-500">Express</span><label className="switch-sm"><input type="checkbox" checked={parserPreview.express} onChange={e => updateParserField('express', e.target.checked)} /><span /></label></div>
              <div className="flex justify-between items-center"><span className="text-ink-500">Fecha entrega</span><input className="input-field text-xs py-1.5 w-[150px] text-right font-700" type="date" value={parserPreview.entrega?.fecha || ''} onChange={e => updateParserField('entregaFecha', e.target.value)} /></div>
            </div>
            {parserPreview.aiMsjWs && (
              <div className="mt-4 p-3 bg-ink-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-700 text-ink-500">Mensaje de WhatsApp:</div>
                  <button
                    className="text-xs font-700 text-brand-DEFAULT hover:text-brand-dark"
                    onClick={async () => {
                      const sheetsUrl = config.integraciones?.SHEETS_API_URL;
                      if (!sheetsUrl) return;
                      try {
                        const librosPayload = parserPreview.libros.map(b => ({
                          titulo: b.titulo, hojas: b.hojas || 0, paginas: b.paginas || 0, precio: b.precio || 0
                        }));
                        const data = {
                          nombre: parserPreview.nombre,
                          whatsapp: parserPreview.whatsapp,
                          libros: librosPayload,
                          fecha: parserPreview.entrega?.fecha || '',
                          lugar_entrega: '',
                          saldo: parserPreview.saldo || 0
                        };
                        const url = `${sheetsUrl}?mode=generate-wa&data=${encodeURIComponent(JSON.stringify(data))}`;
                        const res = await fetch(url);
                        const json = await res.json();
                        if (json.msj_ws) {
                          setParserPreview(prev => ({ ...prev, aiMsjWs: json.msj_ws }));
                        }
                      } catch (e) { console.error('Error regenerando mensaje:', e); }
                    }}
                  >🔄 Regenerar</button>
                </div>
                <textarea
                  className="input-field text-xs w-full min-h-[80px] font-mono whitespace-pre-wrap"
                  value={parserPreview.aiMsjWs}
                  onChange={e => setParserPreview(prev => ({ ...prev, aiMsjWs: e.target.value }))}
                />
              </div>
            )}
            <div className="mt-5">
              <button className="btn-primary w-full" disabled={!parserPreview.libros.length || parserImporting} onClick={importParserPreview}>
                {parserImporting ? (
                  <span className="flex items-center justify-center gap-2"><span className="spinner-sm" /> Generando WA y guardando...</span>
                ) : 'Guardar pedido previsualizado'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
