// Smoke test de la capa de variantes (node scripts/smoke-variantes.mjs)
import {
  ensureBookVariantes, getBookCombinations, calcPrecioItem, recalcBookSugeridos,
  applyClassicColumnPatchesToVariantes, prepareBookForSave, getMinPrice, getBookFormats,
  buildOrder, seedDefaultVariantes, normalizeVariante, newVarianteId
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

console.log(fails ? `\n${fails} FALLAS` : '\nTodos los checks pasaron');
process.exit(fails ? 1 : 0);
