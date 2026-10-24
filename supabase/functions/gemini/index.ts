// Supabase Edge Function: gemini
// Proxy de Gemini para Imprenta Sync 2026. Reemplaza al Google Apps Script.
// La API key vive como secret en Supabase (nunca llega al navegador).
//
// SECRETOS (supabase secrets set ...):
//   GEMINI_API_KEY            (requerido)  clave de Gemini
//   GEMINI_MODEL              (opcional)   modelo principal   (default: gemini-3.1-flash-lite-preview)
//   GEMINI_MODEL_FALLBACK     (opcional)   modelo de respaldo (default: gemini-3-flash-preview)
//   GEMINI_RATE_MAX           (opcional)   pedidos/IP por minuto (default: 10)
//
// DEPLOY (la web lo llama sin auth → hay que permitir llamadas anónimas):
//   supabase functions deploy gemini --no-verify-jwt
//
// CONTRATO (idéntico al Apps Script que reemplaza, así la web no cambia):
//   POST application/x-www-form-urlencoded { mensaje, prompt }  -> { pedidos, timestamp }
//   GET  ?mode=generate-wa&data=<json>                          -> { msj_ws }
//   GET  ?mode=parse&mensaje=<texto>                            -> { pedidos, timestamp }
//   GET  (default)                                              -> { status, tip }
//   Los errores se devuelven en 200 con { error } (como el script viejo), para que
//   la web muestre el mensaje real en lugar de un "Error <status>" genérico.

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.1-flash-lite-preview';
const MODEL_FALLBACK = Deno.env.get('GEMINI_MODEL_FALLBACK') ?? 'gemini-3-flash-preview';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number(Deno.env.get('GEMINI_RATE_MAX') ?? 10);

// ─── CORS (la web llama desde otro origen) ──────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ─── RATE LIMITING (in-memory, por IP, ventana de 60s) ──────────────
// Es best-effort: el estado vive en una sola instancia cálida del isolate y se
// reinicia en un cold start. Suficiente para frenar abuso, sin dependencias externas.

const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'desconocida';
}

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    hits.set(ip, arr);
    return false;
  }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return true;
}

// ─── GEMINI ─────────────────────────────────────────────────────────

async function callGemini(model: string, prompt: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY no configurada');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(`Gemini: ${data.error.message}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini no devolvió candidatos');
  return text;
}

async function callGeminiConRespaldo(prompt: string): Promise<string> {
  try {
    return await callGemini(MODEL, prompt);
  } catch (err) {
    console.warn(`Modelo principal (${MODEL}) falló, probando respaldo:`, err);
    return await callGemini(MODEL_FALLBACK, prompt);
  }
}

// ─── PARSEO DE LA RESPUESTA (pedidos) ───────────────────────────────

function extraerJson(texto: string): unknown {
  let limpio = texto.trim();
  limpio = limpio.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  try {
    return JSON.parse(limpio);
  } catch {
    // Si el modelo envolvió el JSON en texto, extraemos el primer bloque {...} o [...].
    const arrayStart = limpio.indexOf('[');
    const objStart = limpio.indexOf('{');
    if (arrayStart !== -1 && (objStart === -1 || arrayStart < objStart)) {
      const end = limpio.lastIndexOf(']');
      if (end !== -1) return JSON.parse(limpio.slice(arrayStart, end + 1));
    } else if (objStart !== -1) {
      const end = limpio.lastIndexOf('}');
      if (end !== -1) return JSON.parse(limpio.slice(objStart, end + 1));
    }
    throw new Error('Respuesta de Gemini no es JSON válido');
  }
}

function parsearRespuesta(texto: string) {
  const data = extraerJson(texto);
  const pedidos = Array.isArray(data) ? data : [data];
  return pedidos.map((p) => ({
    alumno: p?.alumno || 'Sin nombre',
    formato: String(p?.formato || 'A4').toUpperCase(),
    libro: p?.libro || '',
    hojas: Number(p?.hojas) || 0,
    paginas: Number(p?.paginas) || 0,
    fecha: p?.fecha || '',
    precio: Number(p?.precio) || 0,
    sena: Number(p?.sena) || 0,
    observaciones: p?.observaciones || '',
    telefono: String(p?.telefono || '').replace(/\D/g, ''),
    msj_ws: p?.msj_ws || '',
  }));
}

// ─── GENERADOR DE MENSAJE DE WHATSAPP (retiro en el local) ──────────
// Reframe: el 100% de los pedidos se retiran en el local físico. El alumno pasa
// a retirarlo; no hay entregas a domicilio ni en la facultad.

function buildWaPrompt(data: Record<string, unknown>): string {
  const hoy = new Date().toLocaleDateString('es-AR');
  const libros = Array.isArray(data?.libros) ? (data.libros as Array<Record<string, unknown>>) : [];
  const contextoLibros = libros
    .map((l) => `- [${l?.titulo ?? ''}] | Hojas: ${l?.hojas ?? 0} | Págs: ${l?.paginas ?? 0} | Precio: $${l?.precio ?? 0}`)
    .join('\n');

  const lugar = String(data?.lugar_entrega ?? '').trim() || 'nuestro local';
  const horaCruda = String(data?.hora ?? '').trim() || String(data?.horario_entrega ?? '').trim();
  // Sin hora pactada NO se inventa un horario: se agenda "a coordinar" y la
  // frase cambia para no dejar un "a las a coordinar" colgando.
  const hayHora = /^\d{1,2}:\d{2}$/.test(horaCruda);
  const hora = hayHora ? horaCruda : 'a coordinar';
  const fraseHora = hayHora ? `a las ${hora}` : '(horario a coordinar)';
  const saldo = Number(data?.saldo) || 0;
  const saldoTexto = saldo > 0
    ? `El saldo pendiente es $${saldo}. Decile el monto total a abonar al retirar.`
    : 'Ya tiene todo pagado, no menciones dinero.';

  return [
    `Hoy es ${hoy}. Redactá un mensaje de WhatsApp para avisarle al alumno que su pedido está LISTO para retirar en ${lugar}, el ${data?.fecha ?? ''} ${fraseHora}.`,
    '',
    'DATOS DEL PEDIDO:',
    `- Alumno: ${data?.nombre ?? ''}`,
    `- Teléfono: ${data?.whatsapp ?? ''}`,
    `- Libros: ${contextoLibros || '—'}`,
    `- Día del retiro: ${data?.fecha ?? 'no especificada'}`,
    `- Hora del retiro: ${hora}`,
    `- Lugar de retiro: ${lugar}`,
    `- ${saldoTexto}`,
    '',
    'REGLAS:',
    `1. El alumno retira su pedido en ${lugar}. NO hacemos entregas a domicilio ni en la facultad: él pasa a retirarlo.`,
    '2. Corto y natural, español rioplatense ("tenés", "¿cómo estás?").',
    `3. Indicale SIEMPRE el día y la hora de retiro (${data?.fecha ?? ''} ${fraseHora}) para que pase a buscarlo cuando esté listo.`,
    '4. Si el saldo es 0, no menciones dinero: solo que ya está listo para retirar.',
    '5. Si tiene saldo, decile el monto total a abonar al retirar.',
    '6. Sin emojis excesivos. Profesional pero cercano. Usá al menos una vez el emoji 😊.',
    '',
    'Respondé ÚNICAMENTE con el mensaje de WhatsApp, sin comillas ni JSON.',
  ].join('\n');
}

function extraerMsj(texto: string): string {
  let limpio = texto.trim();
  limpio = limpio.replace(/^["']|["']$/g, '');
  limpio = limpio.replace(/^```\w*\s*/i, '').replace(/```\s*$/i, '');
  return limpio;
}

// ─── LECTURA DE PARAMS DEL POST ─────────────────────────────────────

async function readParams(req: Request): Promise<Record<string, string>> {
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded')) {
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (ct.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const k in body) out[k] = typeof body[k] === 'string' ? body[k] : JSON.stringify(body[k]);
    return out;
  }
  try {
    const fd = await req.formData();
    const out: Record<string, string> = {};
    fd.forEach((v, k) => { out[k] = String(v); });
    return out;
  } catch {
    return {};
  }
}

// ─── HANDLER PRINCIPAL ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!rateLimit(clientIp(req))) {
    return json({ error: 'Demasiadas solicitudes por IP.', retry_after: 60 });
  }

  try {
    if (req.method === 'POST') {
      const params = await readParams(req);
      const prompt = params.prompt;
      if (!prompt) return json({ error: 'Falta prompt' });

      const resultado = await callGeminiConRespaldo(prompt);
      const pedidos = parsearRespuesta(resultado);
      return json({ pedidos, timestamp: new Date().toISOString() });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('mode') || 'default';

      if (mode === 'generate-wa') {
        const dataJson = url.searchParams.get('data');
        if (!dataJson) return json({ error: 'Falta data' });
        const data = JSON.parse(dataJson);
        // La web manda el prompt ya resuelto (config.prompts.wa_aviso, editable en
        // Ajustes). Si no llega (llamada directa o web vieja), cae al default de acá.
        const custom = (url.searchParams.get('prompt') || '').trim();
        const prompt = custom || buildWaPrompt(data);
        const resultado = await callGeminiConRespaldo(prompt);
        return json({ msj_ws: extraerMsj(resultado) });
      }

      if (mode === 'parse') {
        const mensaje = url.searchParams.get('mensaje');
        if (!mensaje) return json({ error: 'Falta mensaje' });
        const resultado = await callGeminiConRespaldo(mensaje);
        const pedidos = parsearRespuesta(resultado);
        return json({ pedidos, timestamp: new Date().toISOString() });
      }

      return json({ status: 'ok', tip: 'Usá POST para parsear mensajes de WhatsApp' });
    }

    return json({ error: 'Método no soportado' });
  } catch (err) {
    console.error('Error interno en gemini:', err);
    return json({ error: `Error interno: ${err?.message ?? String(err)}` });
  }
});
