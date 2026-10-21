// Chequeo rápido contra Supabase: ¿existe libros.variantes y qué pinta tiene?
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const { url, anon_key } = cfg.supabase;
const H = { apikey: anon_key, Authorization: `Bearer ${anon_key}` };

async function probe(label, path) {
  const res = await fetch(url + path, { headers: H });
  const body = await res.text();
  console.log(`${res.ok ? 'ok  ' : 'FAIL'} ${label} → ${res.status} ${body.slice(0, 300)}`);
  return res.ok ? JSON.parse(body || 'null') : null;
}

await probe('libros sin variantes (select id)', '/rest/v1/libros?select=id&limit=1');
const conColumna = await probe('libros con variantes', '/rest/v1/libros?select=id,titulo,variantes&limit=3');
const total = await probe('count libros', '/rest/v1/libros?select=id&limit=10000');

console.log('\nMuestra:');
for (const b of conColumna || []) {
  console.log(`- ${b.titulo}: variantes=${JSON.stringify(b.variantes)}`);
}
console.log(`Total libros visibles para anon: ${(total || []).length}`);
