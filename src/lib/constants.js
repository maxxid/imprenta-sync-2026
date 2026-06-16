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
    anon_key: '',
    admin_email: ''
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
