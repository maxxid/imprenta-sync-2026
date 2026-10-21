export const STORAGE = {
  pedidos: 'imprenta.pedidos.v3',
  config: 'imprenta.config.v3',
  admin: 'imprenta.admin.auth.v3',
  libros: 'imprenta.libros.v3',
  carrito: 'imprenta.carrito.v1',
  checkoutForm: 'imprenta.checkout.v1',
  cliente: 'imprenta.cliente.v1'
};

export const COMBO_KEYS = ['a4_bn', 'a4_color', 'a5_bn', 'a5_color'];
export const COMBO_LABELS = { a4_bn: 'A4 B/N', a4_color: 'A4 Color', a5_bn: 'A5 B/N', a5_color: 'A5 Color' };

export const ORDER_STATES = [
  'Pendiente de pago',
  'Pendiente de impresión',
  'Imprimiendo',
  'Para encuadernar',
  'Listo',
  'Entregado'
];

export const STATE_LABELS = {
  'Listo': 'Terminado'
};

export const STATE_STYLES = {
  'Pendiente de pago': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  'Pendiente de impresión': 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Imprimiendo': 'bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'Para encuadernar': 'bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Listo': 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'Entregado': 'bg-gray-400 text-white dark:bg-gray-600 dark:text-gray-100'
};

export const STATE_ROW_BG = {
  'Pendiente de pago': 'bg-gray-100 dark:bg-gray-800',
  'Pendiente de impresión': 'bg-blue-100 dark:bg-blue-950',
  'Imprimiendo': 'bg-purple-100 dark:bg-purple-950',
  'Para encuadernar': 'bg-orange-100 dark:bg-orange-950',
  'Listo': 'bg-emerald-100 dark:bg-emerald-950',
  'Entregado': 'bg-gray-200 dark:bg-gray-700'
};

export const FALLBACK_CONFIG = {
  precios: {
    A4: { menos_50: 90, mas_50: 70 },
    A5: { unico: 49 }
  },
  encuadernacion: {
    abrochado: 0,
    basica: 600,
    umbral_anillado_hojas: 40,
    espirales: [
      { hasta: 70, size: '9 mm' },
      { hasta: 100, size: '12 mm' },
      { hasta: 120, size: '14 mm' },
      { hasta: 150, size: '17 mm' },
      { hasta: 220, size: '25 mm' },
      { hasta: 999, size: '40 mm' }
    ]
  },
  redondeo: {
    multiplo: 1
  },
  produccion: {
    capacidad_diaria_paginas: 5000,
    capacidad_express_paginas: 300,
    horas_anticipacion: 20,
    horas_anticipacion_express: 2,
    precio_promedio_hoja: 70,
    recargo_express_pct: 20,
    deadline_hora: 20
  },
  entrega: {
    cadete_minimo: 100
  },
  integraciones: {
    SHEETS_API_URL: '',
    API_KEY: '',
    GOOGLE_CLIENT_ID: '',
    ADMIN_EMAIL: 'admin@imprenta.local'
  },
  supabase: {
    url: '',
    anon_key: ''
  },
  pagos: {
    talo_activo: true,
    transferencia_activa: false,
    datos_bancarios: {
      alias: '',
      cbu: '',
      titular: '',
      banco: '',
      notas: ''
    },
    whatsapp_admin: '5493885888949'
  },
  feriados: [],
  carreras: [
    {
      id_carrera: 'abo-unju',
      nombre: 'Abogacia - UNJu',
      universidad: 'UNJu',
      direccion_entrega: 'Aula Magna / Quincho - Facultad de Ciencias Juridicas, UNJu',
      ventanas: [
        { dia: 1, label: 'Lunes tarde', turno: 'tarde', horario: '19:00', activa: true },
        { dia: 2, label: 'Martes tarde', turno: 'tarde', horario: '19:00', activa: true },
        { dia: 3, label: 'Miercoles tarde', turno: 'tarde', horario: '19:00', activa: true },
        { dia: 4, label: 'Jueves tarde', turno: 'tarde', horario: '19:00', activa: true },
        { dia: 5, label: 'Viernes tarde', turno: 'tarde', horario: '19:00', activa: true },
        { dia: 6, label: 'Sabado manana', turno: 'manana', horario: '10:00', activa: true }
      ]
    }
  ]
};

export const DEMO_WHATSAPP = ``;

/**
 * Prompt por defecto del Parser WhatsApp (Gemini vía Apps Script).
 * Es editable por tienda en Ajustes → "Prompt de Gemini (parser WA)".
 *
 * Tokens disponibles (se reemplazan antes de enviar):
 *   {{fecha}}    → fecha larga de hoy (es-AR)
 *   {{mensaje}}  → mensaje crudo del alumno
 *   {{catalogo}} → listado de libros activos (título, hojas, formatos, precio desde)
 */
export const DEFAULT_PARSER_PROMPT = `Hoy es {{fecha}}. Desglosa: "{{mensaje}}".

CATÁLOGO:
{{catalogo}}

REGLAS DE ORO:
1. FORMATO: A4 por defecto. Si el alumno menciona otro ("A5", "A4 vertical", "papel fotográfico"), copiá en "formato" el nombre EXACTO de la variante del catálogo (ej: "A4 vertical (letra grande)").
2. TRABAJO: Usá el nombre EXACTO del catálogo. Si no coincide exacto, usá el más cercano. Si el catálogo trae un ÍNDICE y el alumno se refiere a uno de esos títulos, usá ese título igual.
3. VARIOS: Generá un objeto por cada libro mencionado.
4. OBSERVACIONES (N): Resumí con emojis (🕒hora, 📍lugar, 🚨otro). Solo mencionar lugar si es diferente a la facultad. Si no hay hora, omitir. Estado de pago no es necesario decirlo.
5. SEÑA (REGLA DE ORO): Si el mensaje NO menciona explícitamente un monto de pago, la seña SIEMPRE es 0. Jamás asumas que está pagado. Solo sena > 0 si ves un número junto a palabras como seña, pagué, transferí, pago, pagado. Ejemplos validos: seña 7400, dejo $6000 de seña, pagué 5000, transferí 3000, pago total, pagado completo. Interpreta tres mil como 3000, 5mil como 5000. Si solo dice seña sin numero, sena = 0. Si dice seña del 50%, calcula el 50% del precio del primer libro.
6. FECHA: Calculá la fecha de entrega según el día mencionado. Formato YYYY-MM-DD. Si no hay día específico, dejá vacío.
7. TELÉFONO: Solo números, sin espacios ni guiones ni +54.
8. REDACCIÓN DE MENSAJE (msj_ws): Redactá un mensaje de WhatsApp corto y natural en español rioplatense (usá "tenés", "¿cómo estás? 😊").
   - Tiene que ser redactado para ser enviado el día de entrega: confirmar si podrá ir así llevamos su pedido a la facultad (o el lugar indicado en su defecto) o reagendamos para otro día.
   - Si hay lugar específico (Lavalle, clínica), incluilo, sino por defecto las entregas las hacemos en la facultad.
   - Si el saldo es 0, no menciones dinero, solo que ya está listo.
   - Si tiene saldo, decile el monto total.
   - NO uses emojis excesivos. Profesional pero cercano. El emoji que siempre uso es este, usar al menos una vez 😊

Responde ÚNICAMENTE un Array JSON:
[{"alumno":"NOMBRE","formato":"A4/A5 o variante","libro":"NOMBRE_EXACTO","hojas":0,"paginas":0,"fecha":"YYYY-MM-DD","precio":0,"sena":0,"observaciones":"RESUMEN","telefono":"","msj_ws":""}]`;

/** Salida JSON mínima que consume el parser (se anexa si el prompt editado la borró). */
export const PARSER_OUTPUT_SCHEMA = `Responde ÚNICAMENTE un Array JSON:
[{"alumno":"NOMBRE","formato":"A4/A5 o variante","libro":"NOMBRE_EXACTO","hojas":0,"paginas":0,"fecha":"YYYY-MM-DD","precio":0,"sena":0,"observaciones":"RESUMEN","telefono":"","msj_ws":""}]`;
