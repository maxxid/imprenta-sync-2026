import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { Alert, Spinner } from './UI';
import { STORAGE } from '../lib/constants';
import { getSupabase, saveLocal } from '../lib/supabase';

export function AdminLogin({ config, onSuccess, showGoogle = true, initialError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);

  useEffect(() => { if (initialError) setError(initialError); }, [initialError]);
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

  async function loginWithGoogle() {
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase(config);
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    } catch (e) {
      setError(e.message || 'Error al conectar con Google.');
      setLoading(false);
    }
  }

  return (
    <div className="fade-in max-w-md mx-auto pt-10">
      <div className="card p-6">
        <div className="w-12 h-12 rounded-2xl bg-ink-900 dark:bg-white text-white dark:text-black flex items-center justify-center mb-4"><Icon.Lock /></div>
        <h2 className="text-2xl font-800 text-ink-900 mb-1">Acceso protegido</h2>
        <p className="text-sm text-ink-400 mb-5">Ingresá con tu cuenta de administración.</p>
        <div className="space-y-3">
          {showGoogle && (
            <>
              <button onClick={loginWithGoogle} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white dark:bg-ink-800 px-4 py-2.5 text-sm font-700 text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="none" d="M1 1h22v22H1z"/></svg>
                {loading ? <Spinner /> : 'Continuar con Google'}
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-ink-100 dark:bg-ink-700" />
                <span className="text-xs text-ink-400">o con email</span>
                <div className="flex-1 h-px bg-ink-100 dark:bg-ink-700" />
              </div>
            </>
          )}
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
