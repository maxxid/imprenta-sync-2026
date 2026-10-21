// Prueba de buildParserCatalog con mensajes reales de WhatsApp (uso: node scripts/test-msgs-reales.mjs)
import { readFileSync } from 'node:fs';
import { buildParserCatalog, slug } from '../src/lib/utils.js';

const libros = JSON.parse(readFileSync(new URL('../libros.json', import.meta.url), 'utf8'));

const mensajes = [
  'Daniela Puca. CCC A4 vertical. Miercoles 18hs. pagado.',
  'Eugenia Guerrero. CCC A5. Seña 5mil. Viernes 16:30. +54 9 388 586-4133',
  'Nicolás Arias. CCC A4, Leticia Barrera. Seña 8mil. Viernes 16:30. +54 9 388 581-1006',
  'Carmen Gomez. Administracion de Recursos Humanos - Chivenato $9.600 Direccion Estrategica de Recursos Humanos - Alles $4.500. PAGADO. hoy 18hs.+54 9 3886 51-7246'
];

const titulo = b => `${b.titulo} [${b.materia}]`;

for (const mensaje of mensajes) {
  const c = buildParserCatalog(libros, mensaje);
  console.log(`\nMENSAJE: ${mensaje}`);
  console.log(`  FICHAS (${c.conFicha}):`);
  for (const b of c.seleccionados) console.log(`    · ${titulo(b)}`);
}

// ¿Hay algo que "CCC" pueda ser en el catálogo?
console.log('\nBúsqueda de "CCC" en títulos/materias:');
const hits = libros.filter(b => slug(`${b.titulo} ${b.materia}`).includes('ccc'));
console.log(hits.length ? hits.map(titulo) : '  (ninguna coincidencia — es una sigla que solo Gemini puede resolver)');

console.log('\nCoincidencias por palabras del mensaje de Carmen:');
for (const w of ['administracion', 'recursos', 'humanos', 'chivenato', 'direccion', 'estrategica', 'alles']) {
  const n = libros.filter(b => slug(`${b.titulo} ${b.materia}`).includes(w)).length;
  console.log(`  ${w}: ${n} libros`);
}
