// Smoke test de la capa de variantes (node scripts/smoke-variantes.mjs)
import {
  ensureBookVariantes, getBookCombinations, calcPrecioItem, recalcBookSugeridos,
  applyClassicColumnPatchesToVariantes, prepareBookForSave, getMinPrice, getBookFormats,
  buildOrder, seedDefaultVariantes, normalizeVariante, newVarianteId, slug,
  RETIRO_LOCAL, isRetiroLocal, localPlace, deliveryPlaceFor, normalizeOrder, geminiEndpoint,
  DIAS_ORDER, turnoFromHorario, buildVentana, normalizeVentanas, nextHorario
} from '../src/lib/utils.js';
import { FALLBACK_CONFIG } from '../src/lib/constants.js';

const config = FALLBACK_CONFIG;
const legacy = {
  id: 'lib-1', titulo: 'Álgebra', paginas: 120, paginas_por_hoja: 2,
  a4_bn_habilitado: true, a4_bn_sugerido: 3000, a4_bn_ajuste: 500, a4_bn_final: 3500,
  a4_color_habilitado: true, a4_color_final: 9000,
  a5_bn_habilitado: true, a5_bn_sugerido: 2000, a5_bn_ajuste: 0, a5_bn_final: 2000,
  a5_color_habilitado: false, a5_color_final: 0
};

let fails = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: got=${JSON.stringify(got)}${ok ? '' : ` want=${JSON.stringify(want)}`}`);
}

// 1. Derivación desde columnas legacy
const b1 = ensureBookVariantes(legacy);
check('variantes desde legacy (ids)', b1.variantes.map(v => v.id), ['a4_bn', 'a4_color', 'a5_bn', 'a5_color']);
check('combinaciones habilitadas', getBookCombinations(legacy).map(c => c.key), ['a4_bn', 'a4_color', 'a5_bn']);

// 2. Precios legacy (5 args = color en 5ta posición)
check('legacy A4 B/N', calcPrecioItem(legacy, 'A4', 'basica', config, false).total, 3500);
check('legacy A4 Color', calcPrecioItem(legacy, 'A4', 'basica', config, true).total, 9000);
check('legacy A5 B/N', calcPrecioItem(legacy, 'A5', 'basica', config, false).total, 2000);
check('legacy A4 hojas', calcPrecioItem(legacy, 'A4', 'basica', config, false).hojas, 60);

// 3. Firma legacy con express (6 args)
const conExpress = calcPrecioItem(legacy, 'A4', 'basica', config, false, true);
check('legacy A4 express', conExpress.total, Math.round(3500 * 1.2));
check('legacy A4 sin express (5 args)', calcPrecioItem(legacy, 'A4', 'basica', config, false).total, 3500);

// 4. Nueva firma: varianteId / objeto variante
check('por varianteId', calcPrecioItem(legacy, 'a5_bn', 'basica', config).total, 2000);
const objVar = getBookCombinations(legacy).find(c => c.key === 'a4_color').variante;
check('por objeto variante', calcPrecioItem(legacy, objVar, 'basica', config).total, 9000);
check('por objeto variante + express', calcPrecioItem(legacy, objVar, 'basica', config, true).total, Math.round(9000 * 1.2));

// 5. Resolución por label libre
check('por label "A4 B/N"', calcPrecioItem(legacy, 'A4 B/N', 'basica', config, false).total, 3500);
check('por label "A5"', calcPrecioItem(legacy, 'A5', 'basica', config, false).total, 2000);

// 6. Libro con variantes libres (A4 vertical / papel fotográfico)
const libre = prepareBookForSave({
  id: 'lib-2', titulo: 'Apuntes', paginas: 80, paginas_por_hoja: 2,
  variantes: [
    { id: 'a4_vert', label: 'A4 vertical (letra grande)', paginas_por_hoja: 1, color: false, precio: 6200, habilitado: true },
    { id: 'foto', label: 'Papel fotográfico', paginas_por_hoja: 1, color: true, precio: 12000, habilitado: true },
    { id: 'off', label: 'Desactivada', paginas_por_hoja: 2, color: false, precio: 100, habilitado: false }
  ]
});
check('variantes libres habilitadas', getBookCombinations(libre).map(c => c.key), ['a4_vert', 'foto']);
check('precio variante libre', calcPrecioItem(libre, 'a4_vert', 'basica', config).total, 6200);
check('hojas con pph=1', calcPrecioItem(libre, 'foto', 'basica', config).hojas, 80);
check('minPrice', getMinPrice(libre), 6200);
check('formats', getBookFormats(libre), ['A4 vertical (letra grande)', 'Papel fotográfico']);
check('label por variante en calc', calcPrecioItem(libre, 'Papel fotográfico', 'basica', config, true).total, 12000);

// 7. Mirror legacy al guardar
check('mirror a4_bn_final (sin clásicas → 0)', libre.a4_bn_final ?? null, 0);
check('mirror off deshabilitada', libre.off_final ?? null, null);
const conClasicas = prepareBookForSave({ ...legacy });
check('mirror legacy final', [conClasicas.a4_bn_final, conClasicas.a4_bn_ajuste, conClasicas.a5_color_habilitado], [3500, 500, false]);

// 8. recalcBookSugeridos preserva ajuste
const recalced = recalcBookSugeridos(legacy, config);
const a4 = recalced.variantes.find(v => v.id === 'a4_bn');
check('recalc conserva ajuste', a4.precio - a4.sugerido, 500);

// 9. Parche de edición rápida (columnas clásicas → variantes)
const parcheado = applyClassicColumnPatchesToVariantes(legacy, { a4_color_final: 9999, a4_color_habilitado: true });
check('parche a4_color', parcheado.variantes.find(v => v.id === 'a4_color').precio, 9999);
check('parche no toca a4_bn', parcheado.variantes.find(v => v.id === 'a4_bn').precio, 3500);

// 10. buildOrder usa label de variante
const item = {
  id: 'x', libroId: 'lib-1', titulo: 'Álgebra', materia: 'Análisis', carrera: 'Lic. Química', id_carrera: 'q',
  paginas: 120, hojas: 60, formato: 'A4 vertical (letra grande)', varianteId: 'a4_vert',
  encuadernacion: 'basica', color: false, express: false, precio: 6200, tipo: 'anillado'
};
const order = buildOrder([item], { nombre: 'Ana', whatsapp: '3811234567', modalidad: 'colegio' }, null, config, { id_carrera: 'q', nombre: 'Lic. Química' });
check('buildOrder formato', order.formato, 'A4 vertical (letra grande)');

// 11. Labels: espacios internos se conservan; trim recién al guardar
const conEspacios = prepareBookForSave({
  id: 'lib-3', titulo: 'X', paginas: 10, paginas_por_hoja: 2,
  variantes: [
    { id: 'v1', label: 'A4 vertical (letra grande)', paginas_por_hoja: 1, color: false, precio: 5000, habilitado: true },
    { id: 'v2', label: '   ', paginas_por_hoja: 2, color: false, precio: 1000, habilitado: true }
  ]
});
check('label con espacios internos', conEspacios.variantes.find(v => v.id === 'v1').label, 'A4 vertical (letra grande)');
check('label vacío al guardar → id', conEspacios.variantes.find(v => v.id === 'v2').label, 'v2');

// 12. Helpers
check('seedDefaultVariantes ids', seedDefaultVariantes(100, config, 2).map(v => v.id), ['a4_bn', 'a4_color', 'a5_bn', 'a5_color']);
check('normalizeVariante default', normalizeVariante({ label: 'Nueva opción' }).id, 'nueva opcion');
check('varianteId string + express (6 args)', calcPrecioItem(libre, 'a4_vert', 'basica', config, false, true).total, Math.round(6200 * 1.2));
check('newVarianteId prefijo', /^nueva-opcion/.test(newVarianteId('Nueva opción')), true);

// 13. buildParserPrompt (template editable del parser WA)
import { buildParserPrompt } from '../src/lib/utils.js';
import { DEFAULT_PARSER_PROMPT, PARSER_OUTPUT_SCHEMA } from '../src/lib/constants.js';

const ctx = { fecha: 'lunes 20 de octubre de 2026', mensaje: 'hola, 2 copias de Algebra porfa', catalogo: '- [Algebra] | Hojas: 60' };
const def = buildParserPrompt(undefined, ctx);
check('prompt default contiene reglas', def.includes('REGLAS DE ORO'), true);
check('prompt default con tokens reemplazados', def.includes(ctx.mensaje) && def.includes(ctx.catalogo) && def.includes(ctx.fecha), true);
check('prompt default sin tokens sin reemplazar', def.includes('{{'), false);

const custom = 'Regla propia. Alumno: {{mensaje}}. Hoy: {{fecha}}.\nLibros:\n{{catalogo}}\nRespuesta: [{"libro":"..."}]';
const out = buildParserPrompt(custom, ctx);
check('prompt custom respeta al admin', out.startsWith('Regla propia.'), true);
check('prompt custom sin tokens sobrantes', out.includes('{{'), false);

const sinTokens = 'Solo decime qué libro es y redactá el msj_ws.';
const out2 = buildParserPrompt(sinTokens, ctx);
check('sin tokens → se anexa mensaje/catálogo/fecha', out2.includes(ctx.mensaje) && out2.includes(ctx.catalogo) && out2.includes('HOY ES'), true);

const sinJson = 'Desglosa {{mensaje}}\n{{catalogo}}';
const out3 = buildParserPrompt(sinJson, ctx);
check('sin bloque JSON → se re-anexa el schema', out3.includes(PARSER_OUTPUT_SCHEMA), true);
check('default trae el schema integrado', DEFAULT_PARSER_PROMPT.includes('"libro"'), true);
check('regla de formato pide variante exacta', DEFAULT_PARSER_PROMPT.includes('A4 vertical'), true);

// 16. "A4 vertical" en el mensaje → variante exacta (misma lógica que AdminParserWA)
const libroConVariante = {
  id: 'l1', titulo: 'CCC', paginas: 100, paginas_por_hoja: 2, activo: true,
  variantes: [
    { id: 'a4_bn', label: 'A4 B/N', paginas_por_hoja: 2, color: false, precio: 3000, habilitado: true },
    { id: 'a4_vert', label: 'A4 vertical (letra grande)', paginas_por_hoja: 1, color: false, precio: 6200, habilitado: true }
  ]
};
const combosVar = getBookCombinations(libroConVariante);
const elegido = combosVar.find(c => slug(c.label).includes(slug('A4 VERTICAL')));
check('formato "A4 vertical" → variante exacta', elegido?.id, 'a4_vert');
check('formato "A4" → sigue cayendo en A4 B/N', combosVar.find(c => slug(c.label).includes(slug('A4')))?.id, 'a4_bn');

// 14. buildParserCatalog (catálogo compacto para Gemini)
import { buildParserCatalog, buildParserCatalogForMode, buildParserCatalogFull, mensajeSinRuidoParaScore } from '../src/lib/utils.js';
import { readFileSync } from 'node:fs';

const fakeBooks = Array.from({ length: 76 }, (_, i) => ({
  id: `lib-${i}`, titulo: `Libro ${i} de Materia ${i % 7}`, materia: `Materia ${i % 7}`,
  autor: '', carrera: 'Lic. Química', activo: i !== 5, paginas: 100, paginas_por_hoja: 2,
  a4_bn_habilitado: true, a4_bn_final: 3000, a5_bn_habilitado: false, a5_bn_final: 0
}));

const cat = buildParserCatalog(fakeBooks, 'hola, necesito Libro 42 de Materia 0 porfa');
check('catálogo: fichas acotadas (<=10)', cat.conFicha <= 10 && cat.conFicha > 0, true);
check('catálogo: el mencionado tiene ficha', cat.seleccionados.some(b => b.titulo.includes('Libro 42')), true);
check('catálogo: inactivos fuera de fichas y índice', /(^|\n)- Libro 5 de Materia 5/m.test(cat.texto), false);
check('catálogo: activos = fichas + índice', cat.conFicha + cat.enIndice, 75);
check('catálogo: "Hojas:" solo en fichas', (cat.texto.match(/Hojas:/g) || []).length, cat.conFicha);
check('catálogo: sin mensaje → fichas de reserva', buildParserCatalog(fakeBooks, '').conFicha, 10);
check('catálogo: genéricos ("libro", "materia") no deciden solos', buildParserCatalog(fakeBooks, 'necesito los libros de la materia').conFicha + buildParserCatalog(fakeBooks, 'necesito los libros de la materia').enIndice, 75);
check('catálogo: título completo manda', buildParserCatalog(fakeBooks, 'quiero Libro 63 de Materia 0').seleccionados[0].titulo, 'Libro 63 de Materia 0');
check('catálogo: libros inactivos no cuentan', buildParserCatalog(fakeBooks, '').conFicha + buildParserCatalog(fakeBooks, '').enIndice, 75);

// 15. Modo de catálogo (toggle de Ajustes): 'compacto' vs 'completo'
const modoCompleto = buildParserCatalogForMode(fakeBooks, 'hola, necesito Libro 42', 'completo');
check('modo completo → todas las fichas', (modoCompleto.texto.match(/Hojas:/g) || []).length, 75);
check('modo completo → todos los títulos activos', fakeBooks.filter(b => b.activo !== false).every(b => modoCompleto.texto.includes(b.titulo)), true);
check('modo completo → inactivos fuera', modoCompleto.texto.includes('Libro 5 de Materia 5'), false);
check('modo completo → formato de ficha original', modoCompleto.texto.startsWith('- [Libro 0 de Materia 0] | Hojas:'), true);

const modoCompacto = buildParserCatalogForMode(fakeBooks, 'hola, necesito Libro 42', 'compacto');
check('modo compacto → acotado', modoCompacto.conFicha <= 10, true);
check('modo por defecto = compacto', buildParserCatalogForMode(fakeBooks, 'Libro 42').modo, 'compacto');
check('modo basura → cae a compacto', buildParserCatalogForMode(fakeBooks, 'Libro 42', 'otra-cosa').modo, 'compacto');
check('buildParserCatalogFull = versión anterior', buildParserCatalogFull(fakeBooks).split('\n').length, 75);

// Medición real contra libros.json + regresión con mensajes reales de WhatsApp
let reales = null;
try { reales = JSON.parse(readFileSync(new URL('../libros.json', import.meta.url), 'utf8')); } catch { /* noop */ }

if (reales) {
  const activos = reales.filter(b => b.activo !== false);
  const viejo = buildParserCatalogFull(reales);
  const catReal = buildParserCatalog(reales, 'hola, quiero los apuntes de Constitucional Bidart');
  check('bench: catálogo nuevo < 50% del viejo', catReal.texto.length < viejo.length * 0.5, true);
  console.log(`\n  [bench] catálogo real: ${activos.length} libros · viejo ${viejo.length} chars → nuevo ${catReal.texto.length} chars (-${Math.round((1 - catReal.texto.length / viejo.length) * 100)}%)`);

  // Mensajes reales (los formatos que manda la fotocopiadora)
  const ccc = buildParserCatalog(reales, 'Daniela Puca. CCC A4 vertical. Miercoles 18hs. pagado.');
  check('msg real CCC → las3 fichas tienen CCC', ccc.seleccionados.every(b => /CCC/i.test(b.titulo)), true);
  check('msg real CCC → no arrastra otras materias', ccc.conFicha >= 1 && ccc.conFicha <= 3, true);

  const nicolas = buildParserCatalog(reales, 'Nicolás Arias. CCC A4, Leticia Barrera. Seña 8mil. Viernes 16:30. +54 9 388 581-1006');
  check('msg real → sin "Fallos" por números de teléfono', nicolas.seleccionados.some(b => /Fallos/i.test(b.titulo)), false);
  check('msg real → incluye el libro de Leticia Barrera', nicolas.seleccionados.some(b => /Leticia Barrera/i.test(b.titulo)), true);
  check('msg real → sigue incluyendo CCC', nicolas.seleccionados.some(b => /CCC/i.test(b.titulo)), true);

  const carmen = buildParserCatalog(reales, 'Carmen Gomez. Administracion de Recursos Humanos - Chivenato $9.600 Direccion Estrategica de Recursos Humanos - Alles $4.500. PAGADO. hoy 18hs.+54 9 3886 51-7246');
  check('msg real → montos/teléfono no arrastran Medicina', carmen.seleccionados.some(b => /Medicina/i.test(b.titulo)), false);

  const limpio = mensajeSinRuidoParaScore('Seña 5mil. Viernes 16:30. +54 9 388 586-4133 pagado');
  check('limpieza: quedan solo palabras', /388|4133|16:30|5mil|pagado/i.test(limpio), false);
} else {
  console.log('\n  [bench] libros.json no disponible, se omite');
}

// 17. Modelo de retiro en local (reemplaza "entrega en facultad")
const cfgLocal = { ...FALLBACK_CONFIG, local: { nombre: 'Fotocopiadora UNJu', direccion: 'Rivadavia 1234' } };
check('isRetiroLocal(RETiro_LOCAL)', isRetiroLocal(RETIRO_LOCAL), true);
check('isRetiroLocal legacy "Retiro facultad"', isRetiroLocal('Retiro facultad'), true);
check('isRetiroLocal vacío (default)', isRetiroLocal(''), true);
check('isRetiroLocal(Cadete) = false', isRetiroLocal('Cadete'), false);
check('localPlace nombre+dirección', localPlace(cfgLocal), 'Fotocopiadora UNJu — Rivadavia 1234');
check('localPlace vacío → placeholder', localPlace({ local: {} }), '');
check('deliveryPlaceFor(RETiro_LOCAL) → local', deliveryPlaceFor(RETIRO_LOCAL, null, cfgLocal), 'Fotocopiadora UNJu — Rivadavia 1234');
check('deliveryPlaceFor legacy → local', deliveryPlaceFor('Retiro facultad', null, cfgLocal), 'Fotocopiadora UNJu — Rivadavia 1234');
check('deliveryPlaceFor(Cadete)', deliveryPlaceFor('Cadete', null, cfgLocal), 'Se coordina por WhatsApp');
check('deliveryPlaceFor sin local → cae a facultad', deliveryPlaceFor(RETIRO_LOCAL, { direccion_entrega: 'Aula Magna' }, { local: {} }), 'Aula Magna');

const normLegacy = normalizeOrder({ modalidad_entrega: 'Retiro facultad', items: [] }, { local: { nombre: 'F X', direccion: 'Y 1' }, carreras: [] });
check('normalizeOrder legacy → Retiro en local', normLegacy.modalidad_entrega, RETIRO_LOCAL);

const pedidoRetiro = buildOrder(
  [{ id: 'l1', titulo: 'Libro', paginas: 100, paginas_por_hoja: 2, precio: 1000, carrera: 'abo', id_carrera: 'abo-unju', materia: 'M', formato: 'A4 B/N' }],
  { nombre: 'Alumna', whatsapp: '3881234567', pago: 'total', modalidad: RETIRO_LOCAL },
  null, cfgLocal, null, 'talo'
);
check('buildOrder → modalidad Retiro en local', pedidoRetiro.modalidad_entrega, RETIRO_LOCAL);
check('buildOrder lugar = local', pedidoRetiro.lugar_entrega, 'Fotocopiadora UNJu — Rivadavia 1234');

// 18. Endpoint de Gemini (proxy vía Edge Function; fallback a clave legacy)
check('geminiEndpoint usa GEMINI_ENDPOINT (trim)', geminiEndpoint({ integraciones: { GEMINI_ENDPOINT: ' https://x.supabase.co/functions/v1/gemini ' } }), 'https://x.supabase.co/functions/v1/gemini');
check('geminiEndpoint fallback a SHEETS_API_URL', geminiEndpoint({ integraciones: { SHEETS_API_URL: 'https://script.google.com/exec' } }), 'https://script.google.com/exec');
check('geminiEndpoint prioriza GEMINI_ENDPOINT', geminiEndpoint({ integraciones: { GEMINI_ENDPOINT: 'https://nuevo', SHEETS_API_URL: 'https://viejo' } }), 'https://nuevo');
check('geminiEndpoint sin config → vacío', geminiEndpoint({}), '');
check('geminiEndpoint integraciones vacías → vacío', geminiEndpoint({ integraciones: {} }), '');

// 19. Agenda de turnos de retiro (ventanas)
check('turnoFromHorario 10:00 → manana', turnoFromHorario('10:00'), 'manana');
check('turnoFromHorario 12:59 → manana', turnoFromHorario('12:59'), 'manana');
check('turnoFromHorario 13:00 → tarde', turnoFromHorario('13:00'), 'tarde');
check('turnoFromHorario 19:00 → tarde', turnoFromHorario('19:00'), 'tarde');
check('buildVentana deriva label/turno', buildVentana(6, '10:00'), { dia: 6, horario: '10:00', turno: 'manana', label: 'Sábado', activa: true });
check('buildVentana inactiva', buildVentana(1, '19:00', false).activa, false);

const desordenadas = [
  { dia: 5, horario: '19:00', activa: true },
  { dia: 1, horario: '19:00', activa: true },
  { dia: 1, horario: '19:00', activa: false }, // duplicado → colapsa en la 1ª ocurrencia
  { dia: 1, horario: '10:00', activa: true },
  { dia: 9, horario: '10:00' },                // día inválido → se cae
  { dia: 2, horario: 'x' },                    // hora inválida → se cae
  null                                         // basura → se cae
];
const norm = normalizeVentanas(desordenadas);
check('normalize: descarta inválidos y duplicados', norm.length, 3);
check('normalize: orden día/hora', norm.map(v => `${v.dia}:${v.horario}`), ['1:10:00', '1:19:00', '5:19:00']);
check('normalize: deriva label', norm[0].label, 'Lunes');
check('normalize: deriva turno', norm.map(v => v.turno), ['manana', 'tarde', 'tarde']);
check('normalize: conserva activa (1ª ocurrencia)', norm[1].activa, true);
check('normalize: array vacío', normalizeVentanas([]), []);
check('nextHorario 19:00 → 20:00', nextHorario('19:00'), '20:00');
check('nextHorario 23:00 → 00:00', nextHorario('23:00'), '00:00');
check('DIAS_ORDER lunes..domingo', DIAS_ORDER, [1, 2, 3, 4, 5, 6, 0]);

// 20. buildWaPrompt (recordatorio día del retiro, editable en Ajustes)
import { buildWaPrompt } from '../src/lib/utils.js';
import { DEFAULT_WA_PROMPT } from '../src/lib/constants.js';

const pedidoWA = {
  nombre: 'Lucía Gómez',
  whatsapp: '3885111222',
  libros: [{ titulo: 'Apuntes de Anatomía', hojas: 100, paginas: 200, precio: 8000 }],
  fecha: '2026-10-25',
  hora: '10:30',
  lugar_entrega: 'Fotocopiadora UNJu — Rivadavia 1234',
  saldo: 5000
};
const aviso = buildWaPrompt(undefined, pedidoWA);
check('aviso: sin tokens sin reemplazar', aviso.includes('{{'), false);
check('aviso: nombra al alumno', aviso.includes('Lucía Gómez'), true);
check('aviso: incluye el libro', aviso.includes('Apuntes de Anatomía'), true);
check('aviso: fecha de hoy inyectada', /\d{1,2}\/\d{1,2}\/\d{4}/.test(aviso), true);
check('aviso: día del pedido', aviso.includes('2026-10-25'), true);
check('aviso: hora pactada inyectada', aviso.includes('10:30'), true);
check('aviso: día + hora juntos (ej. "el 2026-10-25 a las 10:30")', aviso.includes('2026-10-25 a las 10:30'), true);
check('aviso: lugar de retiro', aviso.includes('Rivadavia 1234'), true);
check('aviso: saldo pendiente → monto', aviso.includes('saldo pendiente es $5000'), true);
check('aviso: aclara retiro en local (no domicilio)', aviso.includes('NO hacemos entregas'), true);
check('aviso: pide el emoji 😊', aviso.includes('😊'), true);

const sinSaldo = buildWaPrompt(undefined, { ...pedidoWA, saldo: 0 });
check('aviso saldo 0 → no menciona dinero', sinSaldo.includes('Ya tiene todo pagado') && !sinSaldo.includes('pendiente'), true);

const sinLugar = buildWaPrompt(undefined, { ...pedidoWA, lugar_entrega: '' });
check('aviso sin lugar → "nuestro local"', sinLugar.includes('en nuestro local'), true);

const sinHora = buildWaPrompt(undefined, { ...pedidoWA, hora: '' });
check('aviso sin hora → "a coordinar"', sinHora.includes('a coordinar') && !sinHora.includes('{{'), true);

check('aviso template vacío → DEFAULT_WA_PROMPT', buildWaPrompt('', pedidoWA).includes('LISTO para retirar'), true);
check('aviso default trae todos los tokens', DEFAULT_WA_PROMPT.includes('{{saldo}}') && DEFAULT_WA_PROMPT.includes('{{fecha_pedido}}'), true);
check('aviso default incluye {{hora}}', DEFAULT_WA_PROMPT.includes('{{hora}}'), true);
check('aviso default cierra pidiendo solo el mensaje', DEFAULT_WA_PROMPT.includes('Respondé ÚNICAMENTE con el mensaje de WhatsApp'), true);

const avisoCustom = 'Hola {{nombre}}, tu pedido de {{libros}} está listo. Pasá por {{lugar}}.';
const avisoOut = buildWaPrompt(avisoCustom, pedidoWA);
check('aviso custom: respeta al admin', avisoOut.startsWith('Hola Lucía Gómez'), true);
check('aviso custom: tokens resueltos', avisoOut.includes('Apuntes de Anatomía') && avisoOut.includes('Rivadavia 1234') && !avisoOut.includes('{{'), true);

// 21. buildConfirmationMessage (confirmación de carga, plantilla fija SIN IA)
import { buildConfirmationMessage } from '../src/lib/utils.js';
import { CONFIRMATION_TEMPLATE } from '../src/lib/constants.js';

const pedidoConf = {
  nombre: 'Lucía Gómez',
  fecha: '2026-10-25',
  horario_entrega: '10:30',
  lugar_entrega: 'Fotocopiadora UNJu — Rivadavia 1234'
};
const confirmacion = buildConfirmationMessage(pedidoConf);
check('confirmación: sin tokens sin reemplazar', confirmacion.includes('{{'), false);
check('confirmación: nombra al alumno', confirmacion.includes('Lucía Gómez'), true);
check('confirmación: fecha larga con día de la semana', /Domingo 25\/10/i.test(confirmacion), true);
check('confirmación: hora pactada', confirmacion.includes('10:30'), true);
check('confirmación: lugar de retiro', confirmacion.includes('Rivadavia 1234'), true);

const confSinHora = buildConfirmationMessage({ ...pedidoConf, horario_entrega: '' });
check('confirmación sin hora → "a coordinar"', confSinHora.includes('a coordinar') && !confSinHora.includes('{{'), true);

const confSinFecha = buildConfirmationMessage({ ...pedidoConf, fecha: '' });
check('confirmación sin fecha → "a coordinar"', confSinFecha.includes('a coordinar') && !confSinFecha.includes('{{'), true);

check('confirmación default = CONFIRMATION_TEMPLATE', CONFIRMATION_TEMPLATE.includes('{{fecha_larga}}') && buildConfirmationMessage(pedidoConf).length > 0, true);

// 22. Calculadora (precio por página según contenido + encuadernación del pedido)
import { getCategorias, calcPdfPaginas, calcPdfPrecio, calcEncuadernacion } from '../src/lib/utils.js';
import { DEFAULT_CALC_CATEGORIAS } from '../src/lib/constants.js';

// Categorías: semilla por defecto y config propia
check('calc: categorías default = semilla', getCategorias(config).map(c => c.id), ['bn', 'poco_color', 'color']);
check('calc: semilla de precios', DEFAULT_CALC_CATEGORIAS.map(c => c.precio), [35, 40, 60]);
check('calc: categorías vacías → cae a semilla', getCategorias({ calculadora: { categorias: [] } }).length, 3);
check('calc: categorías custom', getCategorias({ calculadora: { categorias: [{ id: 'x', nombre: 'X', precio: 10 }] } }).map(c => c.id), ['x']);

// Páginas
check('calc: suma de páginas', calcPdfPaginas({ bn: 3, color: 2 }), 5);
check('calc: sin páginas → 0', calcPdfPaginas(), 0);
check('calc: negativas/texto ignoradas', calcPdfPaginas({ bn: -5, color: 'x', poco_color: 4 }), 4);

// Precio por página
check('calc: 3 bn + 2 color', calcPdfPrecio(getCategorias(config), { bn: 3, color: 2 }, config), 225);
check('calc: PDF vacío → 0', calcPdfPrecio(getCategorias(config), {}, config), 0);
check('calc: por página no por hoja (1 pág cuesta 1 tarifa)', calcPdfPrecio(getCategorias(config), { bn: 1 }, config), 35);
check('calc: precio fraccional redondea a entero', calcPdfPrecio([{ id: 'f', nombre: 'F', precio: 33.3 }], { f: 3 }, {}), 100);

// Redondeo a par (toggle, default apagado → NO se cobra la página en blanco)
check('calc: impar sin toggle → sin recargo', calcPdfPrecio(getCategorias(config), { bn: 1 }, config), 35);
check('calc: par con toggle → igual', calcPdfPrecio(getCategorias(config), { bn: 2 }, { calculadora: { redondear_impar: true } }), 70);
check('calc: impar con toggle → +tarifa más barata', calcPdfPrecio(getCategorias(config), { color: 1 }, { calculadora: { redondear_impar: true } }), 95);
check('calc: par sin toggle → igual', calcPdfPrecio(getCategorias(config), { color: 2 }, config), 120);

// Encuadernación del pedido (solo ítems de la calculadora; los del catálogo ya la traen)
const itemCalc = hojas => ({ origen: 'calculadora', hojas });
const itemCat = hojas => ({ origen: 'catalogo', hojas });
check('enc: modo ninguna → 0', calcEncuadernacion([itemCalc(100)], 'ninguna', config).costo, 0);
check('enc: todos juntos sobre umbral → 1 anillado', calcEncuadernacion([itemCalc(60), itemCalc(50)], 'todos', config).costo, 600);
check('enc: todos juntos bajo umbral → 0', calcEncuadernacion([itemCalc(30)], 'todos', config).costo, 0);
check('enc: cada uno → cobra solo los que llegan al umbral', calcEncuadernacion([itemCalc(60), itemCalc(20)], 'cada', config).costo, 600);
check('enc: cada uno → varios anillados', calcEncuadernacion([itemCalc(60), itemCalc(45)], 'cada', config).costo, 1200);
check('enc: catálogo no suma (ya tiene precio final)', calcEncuadernacion([itemCat(200)], 'todos', config).costo, 0);
check('enc: hojas = solo ítems de calculadora', calcEncuadernacion([itemCalc(30), itemCat(999)], 'todos', config).hojas, 30);
check('enc: espiral según hojas totales', calcEncuadernacion([itemCalc(60)], 'todos', config).size, '9 mm');
check('enc: sin costo → sin tamaño', calcEncuadernacion([itemCalc(10)], 'todos', config).size, null);

// 23. Lugar de retiro en los mensajes (se resuelve AL GENERAR, no el guardado al crear)
import { lugarRetiro } from '../src/lib/utils.js';

const configConLocal = { local: { nombre: 'Fotocopiadora UNJu', direccion: 'Rivadavia 1234' } };
const configSinLocal = { local: { nombre: '', direccion: '' } };
const FACULTAD_VIEJA = 'Aula Magna / Quincho de la Facultad de Ciencias Jurídicas (UNJu)';
const pedidoViejo = { modalidad: 'Retiro en local', lugar_entrega: FACULTAD_VIEJA };
const esFacultad = texto => /aula magna|quincho|ciencias jur/i.test(String(texto));

check('lugar: config vigente pisa el lugar guardado', lugarRetiro(pedidoViejo, configConLocal), 'Fotocopiadora UNJu — Rivadavia 1234');
check('lugar: local sin cargar → frase fija "nuestro local"', lugarRetiro(pedidoViejo, configSinLocal), 'nuestro local');
check('lugar: sin config → se conserva lo guardado', lugarRetiro(pedidoViejo), FACULTAD_VIEJA);
check('lugar: sin config ni lugar → nunca vacío', lugarRetiro({}, undefined), 'nuestro local');
check('lugar: legacy "Retiro facultad" también va al local', lugarRetiro({ modalidad: 'Retiro facultad', lugar_entrega: 'Aula Magna' }, configConLocal), 'Fotocopiadora UNJu — Rivadavia 1234');
check('lugar: modalidad vacía = local', lugarRetiro({ lugar_entrega: 'Aula Magna' }, configConLocal), 'Fotocopiadora UNJu — Rivadavia 1234');
check('lugar: Cadete conserva su texto', lugarRetiro({ modalidad: 'Cadete', lugar_entrega: 'Se coordina por WhatsApp' }, configConLocal), 'Se coordina por WhatsApp');

const confConLocal = buildConfirmationMessage(pedidoViejo, configConLocal);
check('confirmación con config → nombra el local', confConLocal.includes('Rivadavia 1234'), true);
check('confirmación con config → nunca la facultad', esFacultad(confConLocal), false);
const confSinLocalCfg = buildConfirmationMessage(pedidoViejo, configSinLocal);
check('confirmación sin local cargado → "nuestro local"', confSinLocalCfg.includes('nuestro local') && !esFacultad(confSinLocalCfg), true);

const promptRecordatorio = buildWaPrompt(undefined, {
  nombre: 'Jose', fecha: '2026-10-21', hora: '19:00', saldo: 39500,
  libros: [], lugar_entrega: lugarRetiro(pedidoViejo, configConLocal)
});
check('recordatorio: el lugar resuelto es el local', promptRecordatorio.includes('Rivadavia 1234'), true);
check('recordatorio: jamás la dirección de la facultad', esFacultad(promptRecordatorio), false);

// Sin local cargado: frase fija resuelta en el prompt (nunca '' ni token a criterio de la IA)
const promptSinLocal = buildWaPrompt(undefined, {
  nombre: 'Jose', fecha: '2026-10-21', hora: '19:00', saldo: 0,
  libros: [], lugar_entrega: lugarRetiro(pedidoViejo, configSinLocal)
});
check('recordatorio sin local → "en nuestro local" resuelto', promptSinLocal.includes('en nuestro local'), true);
check('recordatorio sin local → sin token sin reemplazar', promptSinLocal.includes('{{lugar}}'), false);
check('recordatorio sin local → nunca la facultad', esFacultad(promptSinLocal), false);

// 24. Agenda con/sin hora (parse → Pedido Nuevo → edición en Pedidos)
// (buildOrder / normalizeOrder / turnoFromHorario ya se importan arriba)
import { tieneHora, extractTimeFromMessage, observacionesSinHora } from '../src/lib/utils.js';

// ¿Es hora pactada? Es la única puerta: todo lo que no pase = sin hora.
check('hora: "14:30" es hora válida', tieneHora('14:30'), true);
check('hora: "9:05" es hora válida', tieneHora('9:05'), true);
check('hora: vacío = sin hora', tieneHora(''), false);
check('hora: "A coordinar" = sin hora', tieneHora('A coordinar'), false);
check('hora: "manana" no se cuela como hora', tieneHora('manana'), false);
check('hora: "24:99" inválido', tieneHora('24:99'), false);
check('hora: null = sin hora', tieneHora(null), false);

// Parse: detecta hora si el mensaje la trae; si no, NO inventa
check('parse: "a las 18 hs" → 18:00', extractTimeFromMessage('lo retiro a las 18 hs'), '18:00');
check('parse: mensaje sin hora → null (nunca inventa)', extractTimeFromMessage('hola quería imprimir el libro'), null);

// buildOrder (Pedido Nuevo)
const cfg24 = { local: { nombre: '', direccion: '' } };
const form24 = { nombre: 'Ana', whatsapp: '3885111222', pago: 'total', modalidad: 'Retiro en local' };
const slotConHora = { fecha: '2026-10-27', horario: '14:30', turno: turnoFromHorario('14:30'), label: '' };
const slotSinHora = { fecha: '2026-10-27', horario: '', turno: '', label: '' };

const pedidoConHora = buildOrder([], form24, slotConHora, cfg24, null);
check('agenda: con hora → horario 14:30', pedidoConHora.horario_entrega, '14:30');
check('agenda: con hora → turno derivado (tarde)', pedidoConHora.turno, 'tarde');
check('agenda: con hora → ventana termina en la hora', /· 14:30$/.test(pedidoConHora.ventana_retiro), true);
check('agenda: con hora → la ventana no repite la hora', pedidoConHora.ventana_retiro.includes('14:30 · 14:30'), false);

const pedidoSinHora = buildOrder([], form24, slotSinHora, cfg24, null);
check('agenda: sin hora → horario_entrega vacío', pedidoSinHora.horario_entrega, '');
check('agenda: sin hora → turno vacío', pedidoSinHora.turno, '');
check('agenda: sin hora → ventana dice "A coordinar"', /A coordinar$/.test(pedidoSinHora.ventana_retiro), true);
check('agenda: sin slot → sin hora', buildOrder([], form24, null, cfg24, null).horario_entrega, '');

// normalizeOrder (se ejecuta en cada guardado): NUNCA inventa un horario
check('normalize: sin hora NO inventa 10:00', normalizeOrder({ fecha: '2026-10-27', horario_entrega: '', turno: '' }, cfg24).horario_entrega, '');
check('normalize: legacy "A coordinar" → vacío', normalizeOrder({ horario_entrega: 'A coordinar' }, cfg24).horario_entrega, '');
check('normalize: conserva la hora válida', normalizeOrder({ horario_entrega: '14:30' }, cfg24).horario_entrega, '14:30');
check('normalize: rescata turno legacy con hora (parser viejo)', normalizeOrder({ horario_entrega: '', turno: '19:00' }, cfg24).horario_entrega, '19:00');
check('normalize: turno categoría no se cuela como hora', normalizeOrder({ horario_entrega: '', turno: 'manana' }, cfg24).horario_entrega, '');
check('normalize: ventana sin hora → "… · A coordinar"', /A coordinar$/.test(normalizeOrder({ fecha: '2026-10-27' }, cfg24).ventana_retiro), true);
check('normalize: ventana legacy "14:30 · 14:30" → se rearmа con la fecha', normalizeOrder({ fecha: '2026-10-27', horario_entrega: '14:30', ventana_retiro: '14:30 · 14:30' }, cfg24).ventana_retiro, '2026-10-27 · 14:30');
check('normalize: ventana legacy "A coordinar · A coordinar" → se rearmа', normalizeOrder({ fecha: '2026-10-27', horario_entrega: '', ventana_retiro: 'A coordinar · A coordinar' }, cfg24).ventana_retiro, '2026-10-27 · A coordinar');
check('normalize: ventana normal se conserva tal cual', normalizeOrder({ fecha: '2026-10-27', horario_entrega: '14:30', ventana_retiro: 'lunes, 27 de oct. · 14:30' }, cfg24).ventana_retiro, 'lunes, 27 de oct. · 14:30');

// Mensajes: sin hora no queda un "a las …" colgando
const confSinHora24 = buildConfirmationMessage({ nombre: 'Ana', fecha: '2026-10-27', horario_entrega: '' }, cfg24);
check('confirmación sin hora → "(horario a coordinar)"', confSinHora24.includes('(horario a coordinar)'), true);
check('confirmación sin hora → sin "a las a coordinar"', /a las a coordinar/i.test(confSinHora24), false);
const confConHora24 = buildConfirmationMessage({ nombre: 'Ana', fecha: '2026-10-27', horario_entrega: '14:30' }, cfg24);
check('confirmación con hora → "a las 14:30"', confConHora24.includes('a las 14:30'), true);
check('confirmación con hora → sin el cierre por defecto', confConHora24.includes('(horario a coordinar)'), false);

const promptSinHora24 = buildWaPrompt(undefined, { nombre: 'Ana', fecha: '2026-10-27', hora: '', saldo: 0, libros: [], lugar_entrega: 'nuestro local' });
check('recordatorio sin hora → sin "a las a coordinar"', /a las a coordinar/i.test(promptSinHora24), false);
check('recordatorio con hora → usa la hora pactada', buildWaPrompt(undefined, { nombre: 'Ana', fecha: '2026-10-27', hora: '14:30', saldo: 0, libros: [], lugar_entrega: 'nuestro local' }).includes('a las 14:30'), true);

// La hora NO se agenda en observaciones/notas: vive en horario_entrega
check('obs: saca el patrón legacy "🕒18hs"', observacionesSinHora('🕒18hs 📍Lavalle'), '📍Lavalle');
check('obs: saca "a las 18 hs"', observacionesSinHora('retira a las 18 hs, avisa'), 'retira, avisa');
check('obs: saca "14hs" suelto', observacionesSinHora('14hs'), '');
check('obs: deja el resto intacto', observacionesSinHora('📍Lavalle · 🚨espiral'), '📍Lavalle · 🚨espiral');
check('obs: vacío sigue vacío', observacionesSinHora(''), '');
check('obs: idempotente (2 pasadas = 1)', observacionesSinHora(observacionesSinHora('🕒18hs 📍Lavalle')), '📍Lavalle');

console.log(fails ? `\n${fails} FALLAS` : '\nTodos los checks pasaron');
process.exit(fails ? 1 : 0);
