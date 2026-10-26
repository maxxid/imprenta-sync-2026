import { fmt, coverSrc } from '../lib/utils';
import { STATE_STYLES, STATE_LABELS } from '../lib/constants';

export function statusBadge(status) {
  return <span className={`status-chip ${STATE_STYLES[status] || 'bg-ink-100 text-ink-700'}`}>{STATE_LABELS[status] || status}</span>;
}

export function Alert({ type = 'info', className = '', children }) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warn: 'bg-amber-50 border-amber-200 text-amber-800',
    ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    danger: 'bg-red-50 border-red-200 text-red-800'
  };
  return <div className={`flex items-start gap-2.5 border rounded-xl p-3.5 text-sm font-medium ${styles[type]} ${className}`}>{children}</div>;
}

export function Spinner() {
  return <div className="w-5 h-5 border-2 border-brand-DEFAULT border-t-transparent rounded-full animate-spin" />;
}

export function Cover({ src, alt, portada }) {
  return <img className="cover-img" src={coverSrc(src, { titulo: alt, portada })} alt={alt} />;
}

export function fechaLabel(fecha, offset) {
  if (offset === 0) return 'Hoy';
  if (offset === 1) return 'Manana';
  const [year, month, day] = fecha.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' });
}

export function buildWhatsAppMessage(order) {
  if (order.wa_message) return order.wa_message;
  const readyStates = ['Listo', 'Entregado'];
  const intro = readyStates.includes(order.estado)
    ? `Hola ${order.nombre}, tus libros ya estan listos.`
    : `Hola ${order.nombre}, te compartimos el estado de tu pedido ${order.id}.`;
  const saldo = order.saldo_pendiente > 0 ? `Saldo pendiente: ${fmt(order.saldo_pendiente)}.` : 'No tenes saldo pendiente.';
  const esLocal = order.modalidad_entrega !== 'Cadete' && order.modalidad_entrega !== 'Retiro domicilio';
  const ventana = order.ventana_retiro && order.ventana_retiro !== 'Se coordina por WhatsApp' ? ` (${order.ventana_retiro})` : '';
  const entrega = esLocal
    ? `Pasá a retirarlo por ${order.lugar_entrega || 'nuestro local'}${ventana}.`
    : 'Coordinamos por WhatsApp cuando este listo.';
  return [
    intro,
    `Libros: ${order.libro}.`,
    `Estado: ${order.estado}.`,
    entrega,
    saldo
  ].join(' ');
}
