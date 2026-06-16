import React, { useState } from 'react';
import { Icon } from './Icons';
import { Alert, Spinner } from './UI';
import { AdminDashboard } from './admin/AdminDashboard';
import { AdminPedidos } from './admin/AdminPedidos';
import { AdminCatalogo } from './admin/AdminCatalogo';
import { AdminConfig } from './admin/AdminConfig';
import { AdminParserWA } from './admin/AdminParserWA';

export function AdminPanel({ orders, setOrders, books, setBooks, config, setConfig, theme, setTheme, onLogout }) {
  const [tab, setTab] = useState('dashboard');

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1 flex-shrink-0">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <Icon.Home /> },
            { id: 'pedidos', label: 'Pedidos', icon: <Icon.Cart /> },
            { id: 'catalogo', label: 'Catálogo', icon: <Icon.Book /> },
            { id: 'config', label: 'Config', icon: <Icon.Settings /> },
            { id: 'parser', label: 'Parser WA', icon: <Icon.Message /> }
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-700 transition-colors ${tab === t.id ? 'bg-brand-DEFAULT text-white shadow-md' : 'text-ink-500 hover:text-ink-700 hover:bg-surface-hover'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={onLogout} className="text-sm text-ink-400 hover:text-danger transition-colors font-600">Cerrar sesión</button>
        </div>
      </div>

      {tab === 'dashboard' && <AdminDashboard orders={orders} books={books} config={config} setTab={setTab} />}
      {tab === 'pedidos' && <AdminPedidos orders={orders} setOrders={setOrders} books={books} config={config} setTab={setTab} />}
      {tab === 'catalogo' && <AdminCatalogo books={books} setBooks={setBooks} config={config} />}
      {tab === 'config' && <AdminConfig config={config} setConfig={setConfig} />}
      {tab === 'parser' && <AdminParserWA books={books} config={config} orders={orders} setOrders={setOrders} />}
    </div>
  );
}
