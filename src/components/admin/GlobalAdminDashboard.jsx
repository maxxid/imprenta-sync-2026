import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '../Icons';
import { Spinner } from '../UI';
import { getSupabase, fetchAllShops, fetchShopStats, createShop, updateShopStatus } from '../../lib/supabase';
import { getShopId } from '../../lib/shop';

export function GlobalAdminDashboard({ config, onLogout }) {
  const [shops, setShops] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', adminEmail: '' });
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const data = await fetchAllShops(config);
    setShops(data);
    const statsMap = {};
    for (const shop of data) {
      statsMap[shop.id] = await fetchShopStats(config, shop.id);
    }
    setStats(statsMap);
    setLoading(false);
  }, [config]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate() {
    if (!form.name.trim() || !form.slug.trim()) {
      setCreateError('Completá nombre y slug.');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      setCreateError('Solo minúsculas, números y guiones.');
      return;
    }
    setCreating(true);
    setCreateError('');
    const result = await createShop(config, { name: form.name.trim(), slug: form.slug.trim().toLowerCase(), adminEmail: form.adminEmail.trim() });
    setCreating(false);
    if (result.success) {
      setCreateSuccess(result);
      setForm({ name: '', slug: '', adminEmail: '' });
      setShowCreateModal(false);
      loadData();
    } else {
      setCreateError(result.error || 'Error al crear.');
    }
  }

  async function handleToggleStatus(shopId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const ok = await updateShopStatus(config, shopId, newStatus);
    if (ok) loadData();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="card p-6 flex items-center gap-3"><Spinner /> Cargando shops...</div></div>;
  }

  const totalActiveOrders = Object.values(stats).reduce((sum, s) => sum + (s.activeOrders || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-ink-900 dark:text-white">Panel Global</h1>
          <p className="text-sm text-ink-400">
            {shops.length} fotocopiadoras · {totalActiveOrders} pedidos activos
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary text-sm px-4 py-2" onClick={() => { setCreateError(''); setCreateSuccess(null); setShowCreateModal(true); }}>
            + Nueva fotocopiadora
          </button>
          <button className="btn-secondary text-sm px-4 py-2" onClick={onLogout}>
            Salir
          </button>
        </div>
      </div>

      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Fotocopiadora</th>
              <th>Slug</th>
              <th>Estado</th>
              <th>Admin</th>
              <th className="text-right">Libros</th>
              <th className="text-right">Pedidos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {shops.map(shop => {
              const s = stats[shop.id] || { bookCount: 0, activeOrders: 0 };
              return (
                <tr key={shop.id}>
                  <td>
                    <div className="font-700 text-ink-900">{shop.name}</div>
                    <div className="text-xs text-ink-400">{shop.subdomain}</div>
                  </td>
                  <td><code className="text-xs bg-ink-50 dark:bg-ink-800 rounded px-1.5 py-0.5">{shop.slug}</code></td>
                  <td>
                    <button onClick={() => handleToggleStatus(shop.id, shop.suscripcion_status)}
                      className={`badge cursor-pointer text-xs ${
                        shop.suscripcion_status === 'active' ? 'bg-ok-muted text-ok-DEFAULT'
                        : shop.suscripcion_status === 'trial' ? 'bg-warn-muted text-warn-DEFAULT'
                        : 'bg-ink-100 text-ink-400'
                      }`}
                      title="Clic para activar/suspender"
                    >
                      {shop.suscripcion_status === 'trial' ? 'Prueba'
                        : shop.suscripcion_status === 'active' ? 'Activo'
                        : shop.suscripcion_status}
                    </button>
                  </td>
                  <td>
                    {shop.admin_email ? (
                      <span className="text-xs text-ink-500">{shop.admin_email}</span>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <span className="font-600 text-sm">{s.bookCount}</span>
                  </td>
                  <td className="text-right">
                    <span className="font-600 text-sm">{s.activeOrders}</span>
                  </td>
                  <td>
                    <div className="flex gap-1.5">
                      <a href={`https://${shop.subdomain}`} target="_blank" rel="noreferrer"
                        className="btn-ghost text-xs px-2 py-1" title="Ver tienda">
                        <Icon.Search />
                      </a>
                      <a href={`https://${shop.subdomain}?admin`} target="_blank" rel="noreferrer"
                        className="btn-ghost text-xs px-2 py-1 text-brand-DEFAULT" title="Panel admin del shop">
                        <Icon.Settings />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {shops.length === 0 && (
              <tr><td colSpan={7} className="text-center text-ink-400 py-10">No hay fotocopiadoras. Creá la primera.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal crear shop */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => setShowCreateModal(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative z-10 bg-surface rounded-2xl shadow-2xl p-6 w-full max-w-md border border-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="font-800 text-ink-900 text-lg">Nueva fotocopiadora</div>
              <button onClick={() => setShowCreateModal(false)} className="text-ink-400 hover:text-ink-700"><Icon.X /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Nombre</label>
                <input className="input-field" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Fotocopiadora ABC" />
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Slug (subdominio)</label>
                <input className="input-field" value={form.slug} onChange={e => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="abc" />
                <div className="text-xs text-ink-400 mt-1">{form.slug ? `${form.slug}.imprenta.store` : 'abc.imprenta.store'}</div>
              </div>
              <div>
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Email del admin <span className="text-ink-300 font-normal">(opcional)</span></label>
                <input className="input-field" type="email" value={form.adminEmail} onChange={e => setForm(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@abc.com" />
              </div>
              {createError && <div className="text-xs text-danger font-600">{createError}</div>}
              {createSuccess && (
                <div className="rounded-xl bg-ok-muted border border-ok-DEFAULT/30 p-3">
                  <div className="text-xs font-700 text-ok-DEFAULT mb-1">✓ Creado: {createSuccess.subdomain}</div>
                  <div className="text-xs text-ink-500">DNS: registro <strong>A</strong> para <strong>{form.slug || createSuccess.subdomain?.split('.')[0]}</strong> → <strong>76.76.21.21</strong></div>
                </div>
              )}
              <button className="btn-primary w-full" onClick={handleCreate} disabled={creating}>
                {creating ? <><Spinner /> Creando...</> : 'Crear fotocopiadora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
