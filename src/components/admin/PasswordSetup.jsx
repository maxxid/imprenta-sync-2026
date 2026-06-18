import React, { useState } from 'react';
import { Icon } from '../Icons';
import { Alert, Spinner } from '../UI';
import { getSupabase, markPasswordChanged, saveLocal } from '../../lib/supabase';
import { getShopId } from '../../lib/shop';
import { loadLocal } from '../../lib/supabase';
import { STORAGE } from '../../lib/constants';

export function PasswordSetup({ config, onDone }) {
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!displayName.trim()) {
      setError('Ingresá tu nombre.');
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase(config);
      await sb.auth.updateUser({
        password,
        data: { display_name: displayName.trim(), full_name: displayName.trim() }
      });
      const saved = loadLocal(STORAGE.admin, null);
      if (saved?.email) {
        saveLocal(STORAGE.admin, { ...saved, display_name: displayName.trim() });
        await markPasswordChanged(config, getShopId(), saved.email);
      }
      onDone();
    } catch (e) {
      setError(e.message || 'Error al guardar.');
    }
    setLoading(false);
  }

  return (
    <div className="fade-in max-w-md mx-auto pt-10 px-4">
      <div className="card p-6">
        <div className="w-12 h-12 rounded-2xl bg-ink-900 dark:bg-white text-white dark:text-black flex items-center justify-center mb-4"><Icon.User /></div>
        <h2 className="text-2xl font-800 text-ink-900 mb-1">Completá tu perfil</h2>
        <p className="text-sm text-ink-400 mb-5">Primer acceso. Configurá tu nombre y una contraseña propia.</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Tu nombre</label>
            <input className="input-field" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Juan Pérez" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Nueva contraseña</label>
            <input type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          {error && <Alert type="danger"><Icon.AlertCircle /><span>{error}</span></Alert>}
          <button className="btn-primary w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? <><Spinner /> Guardando...</> : 'Guardar y continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}
