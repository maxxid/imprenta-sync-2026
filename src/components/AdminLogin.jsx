import React, { useState } from 'react';
import { Icon } from './Icons';
import { Alert, Spinner } from './UI';
import { STORAGE } from '../lib/constants';
import { getSupabase, saveLocal } from '../lib/supabase';

export function AdminLogin({ config, onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim() || !password.trim()) {
      setError('Completá todos los campos.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase(config);
      const { data, error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError(err.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : err.message);
        setLoading(false);
        return;
      }
      const displayName = data.user.user_metadata?.display_name || email.trim().split('@')[0];
      saveLocal(STORAGE.admin, { email: data.user.email, display_name: displayName });
      onSuccess(true);
    } catch (e) {
      setError(e.message || 'Error al conectar con Supabase.');
      setLoading(false);
    }
  }

  return (
    <div className="fade-in max-w-md mx-auto pt-10">
      <div className="card p-6">
        <div className="w-12 h-12 rounded-2xl bg-ink-900 dark:bg-white text-white dark:text-black flex items-center justify-center mb-4"><Icon.Lock /></div>
        <h2 className="text-2xl font-800 text-ink-900 mb-1">Acceso protegido</h2>
        <p className="text-sm text-ink-400 mb-5">Ingresá con tu cuenta de administración.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Email</label>
            <input className="input-field" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="ejemplo@mail.com" onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          <div>
            <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Contraseña</label>
            <input type="password" className="input-field" value={password} onChange={event => setPassword(event.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          {error && <Alert type="danger"><Icon.AlertCircle /><span>{error}</span></Alert>}
          <button className="btn-primary w-full" onClick={submit} disabled={loading}>
            {loading ? <><Spinner /> Conectando...</> : 'Ingresar'}
          </button>
        </div>
      </div>
    </div>
  );
}
