import React, { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { Alert, Spinner } from './UI';
import { STORAGE } from '../lib/constants';
import { getSupabase, saveLocal, isShopAdmin } from '../lib/supabase';
import { getShopId } from '../lib/shop';

export function AdminLogin({ config, onSuccess, showGoogle = true, initialError = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);

  useEffect(() => { if (initialError) setError(initialError); }, [initialError]);

  async function verifyEmail() {
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresá un email válido.');
      return false;
    }
    const shopId = getShopId();
    if (shopId) {
      const allowed = await isShopAdmin(config, shopId, email.trim());
      if (!allowed) {
        setError('Ese email no está autorizado para acceder a este sistema.');
        return false;
      }
    }
    return true;
  }

  async function sendMagicLink() {
    if (!(await verifyEmail())) return;
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase(config);
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo }
      });
      setSent(true);
    } catch (e) {
      setError(e.message || 'Error al enviar. ¿Está habilitado el Magic Link en Supabase?');
    }
    setLoading(false);
  }

  async function loginWithPassword() {
    if (!(await verifyEmail())) return;
    if (!password.trim()) {
      setError('Ingresá tu contraseña.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase(config);
      const { data, error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        if (err.message === 'Invalid login credentials') {
          setError('Email o contraseña incorrectos.');
          setCreatingAccount(true);
        } else {
          setError(err.message);
        }
        setLoading(false);
        return;
      }
      const displayName = data.user.user_metadata?.display_name || email.trim().split('@')[0];
      saveLocal(STORAGE.admin, { email: data.user.email, display_name: displayName });
      onSuccess(true);
    } catch (e) {
      setError(e.message || 'Error al conectar.');
      setLoading(false);
    }
  }

  async function createAccount() {
    if (!(await verifyEmail())) return;
    if (!password.trim() || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const sb = getSupabase(config);
      const { data, error: err } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` }
      });
      if (err) {
        setError(err.message === 'User already registered' ? 'Ese email ya tiene cuenta. Usá el enlace mágico o ingresá tu contraseña.' : err.message);
        setLoading(false);
        return;
      }
      if (data.user) {
        saveLocal(STORAGE.admin, { email: data.user.email, display_name: email.trim().split('@')[0] });
        onSuccess(true);
      }
    } catch (e) {
      setError(e.message || 'Error al crear la cuenta.');
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
        <p className="text-sm text-ink-400 mb-5">
          {showGoogle ? 'Ingresá con tu cuenta de administración.' : 'Ingresá a tu panel de administración.'}
        </p>

        {/* Google (solo global admin) */}
        {showGoogle && (
          <>
            <button onClick={loginWithGoogle} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white dark:bg-ink-800 px-4 py-2.5 text-sm font-700 text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="none" d="M1 1h22v22H1z"/></svg>
              {loading ? <Spinner /> : 'Continuar con Google'}
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-ink-100 dark:bg-ink-700" />
              <span className="text-xs text-ink-400">o con email</span>
              <div className="flex-1 h-px bg-ink-100 dark:bg-ink-700" />
            </div>
          </>
        )}

        {/* Email (siempre) */}
        <div>
          <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">Email</label>
          <input className="input-field" type="email" value={email} onChange={e => { setEmail(e.target.value); setCreatingAccount(false); setSent(false); }} placeholder="ejemplo@mail.com" />
        </div>

        {/* Éxito magic link */}
        {sent ? (
          <div className="rounded-xl bg-ok-muted border border-ok-DEFAULT/30 p-4 mt-3">
            <div className="font-700 text-ok-DEFAULT text-sm mb-1">✓ Enlace enviado</div>
            <div className="text-xs text-ink-500">Revisá <strong>{email}</strong>. Te enviamos un link de acceso. No requiere contraseña.</div>
            <button className="text-xs text-brand-DEFAULT font-700 mt-2 hover:underline" onClick={() => setSent(false)}>Enviar de nuevo</button>
          </div>
        ) : showPassword ? (
          /* Modo contraseña */
          <div className="space-y-3 mt-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-700 text-ink-500 uppercase tracking-wide block mb-1.5">
                  {creatingAccount ? 'Creá tu contraseña' : 'Contraseña'}
                </label>
                {!creatingAccount && (
                  <button className="text-xs text-brand-DEFAULT font-700 hover:underline" onClick={() => sendMagicLink()}>Enlace mágico</button>
                )}
              </div>
              <input type="password" className="input-field" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && (creatingAccount ? createAccount() : loginWithPassword())} placeholder={creatingAccount ? 'Mínimo 6 caracteres' : 'Tu contraseña'} />
            </div>
            {error && <Alert type="danger"><Icon.AlertCircle /><span>{error}</span></Alert>}
            {creatingAccount ? (
              <button className="btn-primary w-full" onClick={createAccount} disabled={loading}>
                {loading ? <><Spinner /> Creando...</> : 'Crear cuenta e ingresar'}
              </button>
            ) : (
              <button className="btn-primary w-full" onClick={loginWithPassword} disabled={loading}>
                {loading ? <><Spinner /> Ingresando...</> : 'Ingresar'}
              </button>
            )}
            <div className="text-center">
              <button className="text-xs text-ink-400 hover:text-ink-600 font-700 pt-1" onClick={() => { setShowPassword(false); setCreatingAccount(false); }}>
                ← Volver al enlace mágico
              </button>
            </div>
          </div>
        ) : (
          /* Modo enlace mágico (default) */
          <div className="space-y-3 mt-3">
            {error && <Alert type="danger"><Icon.AlertCircle /><span>{error}</span></Alert>}
            <button className="btn-primary w-full" onClick={sendMagicLink} disabled={loading}>
              <Icon.Message /> {loading ? <><Spinner />Enviando...</> : 'Enviar enlace de acceso'}
            </button>
            <div className="text-center space-y-1">
              <div className="text-xs text-ink-400">No requiere contraseña. Te enviamos un link al email.</div>
              <button className="text-xs text-brand-DEFAULT font-700 hover:underline" onClick={() => setShowPassword(true)}>
                Ingresar con contraseña
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
