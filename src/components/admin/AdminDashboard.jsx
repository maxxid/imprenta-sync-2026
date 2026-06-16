import React, { useState, useMemo } from 'react';
import { Icon } from '../Icons';
import { statusBadge } from '../UI';
import { fmt, orderPagesForCapacity, getCareers, careerLabel } from '../../lib/utils';
import { ORDER_STATES, STATE_LABELS, STATE_STYLES, STATE_ROW_BG } from '../../lib/constants';
import { getDayUsage } from '../../lib/supabase';

export function AdminDashboard({ orders, books, config, setTab, refreshOrders }) {
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrow = useMemo(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().split('T')[0];
  }, []);

  const todayOrders = useMemo(() => orders.filter(o => o.fecha === today), [orders, today]);

  const activePages = useMemo(
    () => orders.filter(o => o.fecha === today).reduce((acc, o) => acc + orderPagesForCapacity(o), 0),
    [orders, today]
  );

  const tomorrowPages = useMemo(
    () => orders.filter(o => o.fecha === tomorrow).reduce((acc, o) => acc + orderPagesForCapacity(o), 0),
    [orders, tomorrow]
  );

  const pct = useMemo(
    () => Math.min(100, Math.round((activePages / config.produccion.capacidad_diaria_paginas) * 100)),
    [activePages, config.produccion.capacidad_diaria_paginas]
  );

  const tomorrowPct = useMemo(
    () => Math.min(100, Math.round((tomorrowPages / config.produccion.capacidad_diaria_paginas) * 100)),
    [tomorrowPages, config.produccion.capacidad_diaria_paginas]
  );

  const pendingCount = useMemo(
    () => orders.filter(o => o.estado === 'Pendiente de pago' || o.estado === 'Pendiente de impresión').length,
    [orders]
  );

  const saldoCount = useMemo(
    () => orders.filter(o => Number(o.saldo_pendiente) > 0).length,
    [orders]
  );

  const cupoDisponible = useMemo(
    () => Math.max(0, (config.produccion.capacidad_diaria_paginas - activePages) * (config.produccion.precio_promedio_hoja || 70)),
    [config.produccion.capacidad_diaria_paginas, config.produccion.precio_promedio_hoja, activePages]
  );

  const tomorrowCupo = useMemo(
    () => Math.max(0, (config.produccion.capacidad_diaria_paginas - tomorrowPages) * (config.produccion.precio_promedio_hoja || 70)),
    [config.produccion.capacidad_diaria_paginas, config.produccion.precio_promedio_hoja, tomorrowPages]
  );

  const todayHojas = useMemo(
    () => todayOrders.reduce((acc, o) => acc + (o.hojas || 0), 0),
    [todayOrders]
  );

  const weekData = useMemo(() => {
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const data = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 86400000);
      const fecha = d.toISOString().split('T')[0];
      const paginas = orders.filter(o => o.fecha === fecha).reduce((acc, o) => acc + orderPagesForCapacity(o), 0);
      const hojas = orders.filter(o => o.fecha === fecha).reduce((acc, o) => acc + (o.hojas || 0), 0);
      const wpct = Math.min(100, Math.round((paginas / config.produccion.capacidad_diaria_paginas) * 100));
      const cupo = Math.max(0, (config.produccion.capacidad_diaria_paginas - paginas) * (config.produccion.precio_promedio_hoja || 70));
      data.push({ fecha, label: weekDays[d.getDay()], paginas, hojas, pct: wpct, cupo, esHoy: i === 0 });
    }
    return data;
  }, [orders, config.produccion.capacidad_diaria_paginas, config.produccion.precio_promedio_hoja]);

  const expressPending = useMemo(
    () => orders.filter(o => o.express && o.estado !== 'Entregado'),
    [orders]
  );

  const stateMeta = useMemo(() =>
    ORDER_STATES.map(state => {
      const itemsInState = orders.flatMap(o =>
        (o.items || []).filter(i => (i.estado || o.estado) === state)
      );
      const count = itemsInState.length;
      const totalPaginas = itemsInState.reduce((acc, i) => acc + (i.paginas || 0), 0);
      const colorMap = {
        'Pendiente de pago': 'bg-gray-200 text-gray-700 border-gray-300',
        'Pendiente de impresión': 'bg-blue-100 text-blue-700 border-blue-200',
        'Imprimiendo': 'bg-purple-100 text-purple-700 border-purple-200',
        'Para encuadernar': 'bg-orange-100 text-orange-700 border-orange-200',
        'Listo': 'bg-emerald-100 text-emerald-700 border-emerald-200',
        'Entregado': 'bg-gray-300 text-gray-600 border-gray-400'
      };
      return { state, count, totalPaginas, color: colorMap[state] || 'bg-ink-100 text-ink-700 border-ink-200' };
    }),
    [orders]
  );

  const universities = useMemo(
    () => [...new Set(config.carreras.map(c => c.universidad).filter(Boolean))],
    [config.carreras]
  );

  function goToOrders() {
    setTab('pedidos');
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <button onClick={() => goToOrders()} className="stat-card text-left hover:shadow-md transition-shadow">
          <div className="text-2xl font-800 text-ink-900">{orders.length}</div>
          <div className="text-xs text-ink-400 mt-0.5">Total pedidos</div>
          <div className="text-[10px] text-ink-300 mt-1">Ver todos →</div>
        </button>
        <button onClick={() => goToOrders()} className="stat-card text-left hover:shadow-md transition-shadow">
          <div className="text-2xl font-800 text-ink-900">{pendingCount}</div>
          <div className="text-xs text-ink-400 mt-0.5">Pendientes</div>
          <div className="text-[10px] text-ink-300 mt-1">No entregados →</div>
        </button>
        <button onClick={() => goToOrders()} className="stat-card text-left hover:shadow-md transition-shadow">
          <div className="text-2xl font-800 text-ink-900">{saldoCount}</div>
          <div className="text-xs text-ink-400 mt-0.5">Con saldo</div>
          <div className="text-[10px] text-ink-300 mt-1">Ver pedidos →</div>
        </button>
        <div className="stat-card">
          <div className="text-2xl font-800 text-ink-900">{activePages.toLocaleString('es-AR')}</div>
          <div className="text-xs text-ink-400 mt-0.5">Hojas hoy</div>
          <div className="text-[10px] text-ink-300 mt-1">{todayOrders.length} pedidos · {todayHojas} hojas</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-700 text-sm text-ink-800">Capacidad hoy</div>
            <span className={`badge ${pct >= 90 ? 'bg-red-50 text-red-600' : pct >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{pct}%</span>
          </div>
          <div className="progress-bar mb-2">
            <div className="progress-fill" style={{ width: `${pct}%`, background: pct >= 90 ? '#EF4444' : pct >= 70 ? '#F59E0B' : '#00B67A' }} />
          </div>
          <div className="text-xs text-ink-400">{activePages.toLocaleString('es-AR')} / {config.produccion.capacidad_diaria_paginas.toLocaleString('es-AR')} hojas · ~{fmt(cupoDisponible)} cupo</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-700 text-sm text-ink-800">Capacidad mañana</div>
            <span className={`badge ${tomorrowPct >= 90 ? 'bg-red-50 text-red-600' : tomorrowPct >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{tomorrowPct}%</span>
          </div>
          <div className="progress-bar mb-2">
            <div className="progress-fill" style={{ width: `${tomorrowPct}%`, background: tomorrowPct >= 90 ? '#EF4444' : tomorrowPct >= 70 ? '#F59E0B' : '#00B67A' }} />
          </div>
          <div className="text-xs text-ink-400">{tomorrowPages.toLocaleString('es-AR')} / {config.produccion.capacidad_diaria_paginas.toLocaleString('es-AR')} hojas · ~{fmt(tomorrowCupo)} cupo</div>
        </div>
        <button onClick={() => goToOrders()} className="card p-5 text-left hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="font-700 text-sm text-ink-800">Express activos</div>
            <span className="badge bg-accent-muted text-accent">{expressPending.length}</span>
          </div>
          <div className="text-xs text-ink-400">Pedidos express no entregados. Click para ver.</div>
        </button>
      </div>

      <div className="card p-5">
        <div className="font-700 text-sm text-ink-800 mb-4">Capacidad semanal <span className="text-xs text-ink-400 font-normal">— hojas y cupo estimado</span></div>
        <div className="space-y-2.5">
          {weekData.map((d, i) => (
            <div key={d.fecha} className="flex items-center gap-3">
              <span className={`text-xs font-700 w-8 flex-shrink-0 ${d.esHoy ? 'text-brand-DEFAULT' : 'text-ink-400'}`}>{d.label}</span>
              <div className="flex-1 min-w-0">
                <div className="progress-bar h-5 rounded-lg">
                  <div
                    className="progress-fill h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${Math.max(d.pct, 3)}%`, background: d.pct >= 90 ? '#EF4444' : d.pct >= 70 ? '#F59E0B' : '#00B67A' }}
                  >
                    {d.pct >= 15 && <span className="text-[10px] font-700 text-white drop-shadow-sm">{d.pct}%</span>}
                  </div>
                </div>
              </div>
              <span className="text-[11px] text-ink-500 w-[100px] flex-shrink-0 text-right">
                {d.paginas.toLocaleString('es-AR')} hojas · <span className="font-600">{fmt(d.cupo)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <div className="font-700 text-sm text-ink-800 mb-4">Estados del flujo <span className="text-xs text-ink-400 font-normal">— clickeá para filtrar</span></div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stateMeta.map(({ state, count, totalPaginas, color }) => (
            <button key={state} onClick={() => goToOrders()} className={`rounded-xl border p-4 text-left hover:shadow-md transition-all ${color}`}>
              <div className="text-sm font-700">{STATE_LABELS[state] || state}</div>
              <div className="text-2xl font-800 mt-1">{count === 0 ? '—' : `${count}u.`}</div>
              {totalPaginas > 0 && <div className="text-xs font-600 mt-0.5 opacity-80">{totalPaginas.toLocaleString('es-AR')} pág.</div>}
            </button>
          ))}
        </div>
      </div>

      {universities.length > 0 && (
        <div className="card p-5">
          <div className="font-700 text-sm text-ink-800 mb-4">Resumen por universidad</div>
          <div className="grid gap-3 md:grid-cols-3">
            {universities.map(uni => {
              const uniOrders = orders.filter(o => config.carreras.some(c => c.universidad === uni && (c.nombre === o.carrera || c.id_carrera === o.id_carrera)));
              const uniPending = uniOrders.filter(o => o.estado !== 'Entregado');
              return (
                <button key={uni} onClick={() => goToOrders()} className="rounded-xl border border-ink-100 bg-ink-50 p-4 text-left hover:shadow-md transition-all">
                  <div className="text-sm font-700 text-ink-900">{uni}</div>
                  <div className="text-2xl font-800 mt-2 text-ink-900">{uniOrders.length}</div>
                  <div className="text-xs text-ink-400 mt-1">{uniPending.length} activos · {uniOrders.filter(o => Number(o.saldo_pendiente) > 0).length} con saldo</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
