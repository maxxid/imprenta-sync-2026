import React from 'react';
import { Icon } from './Icons';
import { slug, fmt, normalizePhone, careerLabel } from '../lib/utils';
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
  return <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />;
}

export function Cover({ src, alt }) {
  return <img className="cover-img" src={src} alt={alt} />;
}

export function CareerCombobox({ careers, value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const selected = careers.find(item => item.id_carrera === value);
  const [query, setQuery] = React.useState(selected ? careerLabel(selected) : '');
  const ref = React.useRef(null);

  React.useEffect(() => {
    const current = careers.find(item => item.id_carrera === value);
    setQuery(current ? careerLabel(current) : '');
  }, [value, careers]);

  React.useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = careers.filter(item => slug(`${careerLabel(item)} ${item.direccion_entrega || ''}`).includes(slug(query)));

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"><Icon.Search /></span>
        <input
          className="input-field pl-10 pr-10"
          value={query}
          placeholder="Buscar carrera"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setOpen(true);
          }}
        />
        {query && (
          <button className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" onClick={() => { setQuery(''); onChange(''); }}>
            <Icon.X />
          </button>
        )}
      </div>
      {open && (
        <div className="combo-panel">
          <button className="combo-option w-full text-left text-sm font-700 text-ink-900 border-b border-ink-50" onClick={() => { onChange(''); setQuery(''); setOpen(false); }}>
            Todas las carreras
          </button>
          {filtered.length === 0 && <div className="combo-option text-sm text-ink-400">No hay coincidencias</div>}
          {filtered.map(item => (
            <button key={item.id_carrera} className="combo-option w-full text-left" onClick={() => { onChange(item.id_carrera); setQuery(careerLabel(item)); setOpen(false); }}>
              <div className="text-sm font-700 text-ink-900">{careerLabel(item)}</div>
              <div className="text-xs text-ink-400 mt-0.5">{item.direccion_entrega}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const entrega = (order.modalidad_entrega === 'Cadete' || order.modalidad_entrega === 'Retiro domicilio')
    ? 'Coordinamos por WhatsApp cuando este listo.'
    : `Te espero en ${order.lugar_entrega} a las ${order.horario_entrega}.`;
  return [
    intro,
    `Libros: ${order.libro}.`,
    `Estado: ${order.estado}.`,
    entrega,
    saldo
  ].join(' ');
}
