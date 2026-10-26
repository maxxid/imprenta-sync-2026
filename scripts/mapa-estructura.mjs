import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['src', 'scripts', 'supabase/functions'];
const EXTS = new Set(['.js', '.jsx', '.mjs', '.ts']);
const DOC = join(ROOT, 'ESTRUCTURA.md');
const START = '<!-- AUTO:DEPS:START -->';
const END = '<!-- AUTO:DEPS:END -->';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.temp', '.git']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(p))) out.push(p);
  }
  return out;
}

const IMPORT_FROM = /import\s+([^'";]*?)\s+from\s*['"]([^'"]+)['"]/g;
const IMPORT_BARE = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
const DYNAMIC = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
const DEF_RE = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
const LIST_RE = /^export\s*(?:default\s*)?\{([^}]+)\}/gm;

const rel = (p) => relative(ROOT, p).split('\\').join('/');

function resolveLocal(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = join(fromFile, '..', spec);
  for (const cand of [base, base + '.js', base + '.jsx', base + '.mjs', base + '.ts',
    join(base, 'index.js'), join(base, 'index.jsx')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return rel(cand);
  }
  return null;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function parseNames(clause) {
  if (!clause) return [];
  return clause
    .replace(/[{}]/g, ' ')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('*'))
    .map((s) => s.split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

const files = TARGETS.flatMap((t) => {
  const abs = join(ROOT, t);
  return existsSync(abs) ? walk(abs) : [];
}).sort();

const nodes = files.map((abs) => {
  const src = readFileSync(abs, 'utf8');
  const file = rel(abs);
  const imports = new Map();
  const external = new Set();
  const dynamic = new Set();

  for (const m of src.matchAll(IMPORT_FROM)) {
    const local = resolveLocal(abs, m[2]);
    if (!local) { external.add(m[2]); continue; }
    const acc = imports.get(local) || [];
    imports.set(local, acc.concat(parseNames(m[1])));
  }
  for (const m of src.matchAll(IMPORT_BARE)) {
    const local = resolveLocal(abs, m[1]);
    if (local) imports.set(local, imports.get(local) || []);
    else external.add(m[1]);
  }
  for (const m of src.matchAll(DYNAMIC)) {
    const local = resolveLocal(abs, m[1]);
    if (local) dynamic.add(local);
    else external.add(m[1]);
  }

  const exportsList = [];
  for (const m of src.matchAll(DEF_RE)) {
    exportsList.push({ name: m[1], line: lineOf(src, m.index) });
  }
  for (const m of src.matchAll(LIST_RE)) {
    const line = lineOf(src, m.index);
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) exportsList.push({ name, line });
    }
  }
  if (/^export\s+default\s+(?!function|class|const|let|var)/m.test(src)) {
    exportsList.push({ name: 'default', line: lineOf(src, src.search(/^export\s+default/m)) });
  }

  return {
    file,
    loc: src.split('\n').length,
    imports: [...imports.entries()].sort(([a], [b]) => a.localeCompare(b)),
    dynamic: [...dynamic].sort(),
    external: [...external].sort(),
    exports: exportsList.sort((a, b) => a.line - b.line),
  };
});

const byFile = new Map(nodes.map((n) => [n.file, n]));
const reverse = new Map(nodes.map((n) => [n.file, []]));
for (const n of nodes) {
  for (const [to] of n.imports) reverse.get(to)?.push(n.file);
  for (const to of n.dynamic) {
    const list = reverse.get(to);
    if (list) list.push(`${n.file} (lazy)`);
  }
}
for (const list of reverse.values()) list.sort();

const short = (p) => p.replace(/^src\//, '').replace(/^components\//, 'comp/');
const link = (p, anchor) => `[\`${short(p)}\`](./${p}${anchor ? `#L${anchor}` : ''})`;

const lines = [];
lines.push('<!-- Generado por `npm run mapa` — no editar a mano dentro de este bloque. -->');
lines.push('');
lines.push('### Dependencias entre módulos');
lines.push('');
lines.push('| Archivo | Líneas | Importa a | Es importado por |');
lines.push('| --- | --: | --- | --- |');
for (const n of nodes) {
  const outDeps = n.imports.map(([to]) => short(to));
  for (const d of n.dynamic) outDeps.push(`${short(d)} (lazy)`);
  const inDeps = reverse.get(n.file) || [];
  lines.push(`| ${link(n.file)} | ${n.loc} | ${outDeps.length ? outDeps.map((d) => `\`${d}\``).join(' · ') : '—'} | ${inDeps.length ? inDeps.map((d) => `\`${short(d.replace(' (lazy)', ''))}\`${d.includes('(lazy)') ? ' (lazy)' : ''}`).join(' · ') : '—'} |`);
}
lines.push('');

const withExports = nodes.filter((n) => n.exports.length).sort((a, b) => b.exports.length - a.exports.length);
lines.push('### Índice de exports');
lines.push('');
lines.push('Ir directo a la definición: `archivo#Línea`.');
lines.push('');
for (const n of withExports) {
  lines.push(`**${link(n.file)}** · ${n.exports.length} exports`);
  for (const e of n.exports) {
    lines.push(`- \`${e.name}\` — ${link(n.file, e.line)}`);
  }
  lines.push('');
}

const entries = nodes.filter((n) => !n.exports.length);
if (entries.length) {
  lines.push('### Entradas y scripts (sin exports)');
  lines.push('');
  for (const n of entries) {
    const ext = n.external.length ? ` · externos: ${n.external.map((e) => `\`${e}\``).join(', ')}` : '';
    lines.push(`- ${link(n.file)} · ${n.loc} líneas${ext}`);
  }
  lines.push('');
}

const block = lines.join('\n');
const doc = readFileSync(DOC, 'utf8');
const start = doc.indexOf(START);
const end = doc.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  console.error(`Faltan los marcadores ${START} / ${END} en ESTRUCTURA.md`);
  process.exit(1);
}
const next = doc.slice(0, start + START.length) + '\n' + block + doc.slice(end);
writeFileSync(DOC, next, 'utf8');

const totalEdges = nodes.reduce((acc, n) => acc + n.imports.length + n.dynamic.length, 0);
console.log(`ESTRUCTURA.md actualizado: ${nodes.length} archivos, ${totalEdges} dependencias internas, ${nodes.reduce((a, n) => a + n.exports.length, 0)} exports.`);

if (!byFile.size) console.error('No se encontraron archivos para analizar.');
