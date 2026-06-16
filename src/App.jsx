import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from './components/Icons';
import { Spinner } from './components/UI';
import { Store } from './components/Store';
import { AdminLogin } from './components/AdminLogin';
import { AdminPanel } from './components/AdminPanel';
import { FALLBACK_CONFIG, STORAGE } from './lib/constants';
import { migrateBook } from './lib/utils';
import { getSupabase, fetchBooksFromSupabase, fetchOrdersFromSupabase, fetchConfigFromSupabase, saveConfigToSupabase, saveLocal, loadLocal, loadJson, deepMerge, normalizeConfig } from './lib/supabase';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [bookSel, setBookSel] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [books, setBooks] = useState([]);
  const [config, setConfig] = useState(FALLBACK_CONFIG);
  const [orders, setOrders] = useState([]);
  const [catalogFilters, setCatalogFilters] = useState({ career: '', query: '', materia: '' });
  const [checkoutForm, setCheckoutForm] = useState({ nombre: '', whatsapp: '', pago: 'total', modalidad: 'Retiro facultad' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminAuthed, setAdminAuthed] = useState(loadLocal(STORAGE.admin, false));
  const [sessionExpired, setSessionExpired] = useState(false);
  const [theme, setTheme] = useState(loadLocal('imprenta.theme', 'light'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    async function init() {
      const savedConfig = loadLocal(STORAGE.config, null);
      const loadedConfig = await loadJson('./config.json', FALLBACK_CONFIG);
      const supabaseConfig = await fetchConfigFromSupabase(loadedConfig);
      const baseConfig = supabaseConfig ? deepMerge(loadedConfig, supabaseConfig) : loadedConfig;
      const mergedConfig = normalizeConfig(savedConfig ? deepMerge(baseConfig, savedConfig) : baseConfig);
      const savedCarrito = loadLocal(STORAGE.carrito, []);
      const savedForm = loadLocal(STORAGE.checkoutForm, null);
      const savedCliente = loadLocal(STORAGE.cliente, null);
      setConfig(mergedConfig);

      const savedAdmin = loadLocal(STORAGE.admin, null);
      if (savedAdmin?.email) {
        try {
          const sb = getSupabase(mergedConfig);
          const { data: { session }, error } = await sb.auth.getSession();
          if (error || !session) {
            console.warn('Sesión admin expirada, requiriendo login');
            saveLocal(STORAGE.admin, false);
            setAdminAuthed(false);
            setSessionExpired(true);
          }
        } catch (e) {
          console.warn('Error restaurando sesión admin:', e.message);
          saveLocal(STORAGE.admin, false);
          setSessionExpired(true);
        }
      }

      let booksData = await fetchBooksFromSupabase(mergedConfig);
      if (!booksData || booksData.length === 0) {
        booksData = await loadJson('./libros.json', []);
      }
      const migratedBooks = booksData.map(b => migrateBook(b, mergedConfig));
      setBooks(migratedBooks);

      if (savedCarrito && savedCarrito.length > 0) setCarrito(savedCarrito);
      if (savedForm) setCheckoutForm(savedForm);
      if (savedCliente && !savedForm) setCheckoutForm(current => ({ ...current, ...savedCliente }));

      let ordersData = await fetchOrdersFromSupabase(mergedConfig);
      if (!ordersData || ordersData.length === 0) ordersData = [];
      setOrders(ordersData);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    saveLocal('imprenta.theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!adminAuthed) return;
    const interval = setInterval(async () => {
      try {
        const sb = getSupabase(config);
        const { error } = await sb.auth.getSession();
        if (error) {
          console.warn('Sesión admin expirada durante uso');
          saveLocal(STORAGE.admin, false);
          setAdminAuthed(false);
          setSessionExpired(true);
        }
      } catch (e) {
        console.warn('Error verificando sesión:', e.message);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [adminAuthed, config]);

  useEffect(() => {
    if (!loading) {
      saveLocal(STORAGE.checkoutForm, checkoutForm);
      saveLocal(STORAGE.cliente, { nombre: checkoutForm.nombre, whatsapp: checkoutForm.whatsapp });
    }
  }, [checkoutForm, loading]);

  const navItems = [
    { id: 'home', label: 'Catalogo', icon: <Icon.Book /> },
    { id: 'checkout', label: 'Mi pedido', icon: <Icon.Cart />, badge: carrito.length },
    { id: 'tracking', label: 'Segui tu pedido', icon: <Icon.Bell /> },
    { id: 'ayuda', label: 'Ayuda', icon: <Icon.Help /> },
    { id: 'admin', label: 'Administracion', icon: <Icon.Settings /> }
  ];
  const isAdmin = screen === 'admin';

  if (loading) {
    return <div className="page-loader"><div className="card p-6 flex items-center gap-3"><Spinner /> Cargando catalogo y configuracion...</div></div>;
  }

  return (
    <div className="min-h-screen bg-ink-50 font-sans">
      <nav className="bg-surface border-b border-ink-100 sticky top-0 z-50">
        <div className={`mx-auto px-4 h-14 flex items-center justify-between ${isAdmin ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
          <button onClick={() => setScreen('home')} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-ink-900 flex items-center justify-center text-white text-sm">IS</div>
            <span className="font-800 text-ink-900 dark:text-white text-base leading-none">Imprenta<br /><span className="text-brand-DEFAULT text-xs font-700">Sync 2026</span></span>
          </button>
          <div className="hidden sm:flex items-center gap-1">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors" title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            {navItems.map(item => (
              <button key={item.id} onClick={() => setScreen(item.id)} className={`relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-700 transition-all ${screen === item.id || (screen === 'ficha' && item.id === 'home') ? 'bg-ink-900 text-white dark:bg-ink-900 dark:text-black' : 'text-ink-500 hover:bg-ink-100'}`}>
                {item.icon}{item.label}
                {item.badge > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white rounded-full text-xs flex items-center justify-center font-800">{item.badge}</span>}
              </button>
            ))}
          </div>
          <div className="flex sm:hidden items-center gap-2">
            {carrito.length > 0 && (
              <button onClick={() => setScreen('checkout')} className="relative">
                <Icon.Cart />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white rounded-full text-xs flex items-center justify-center font-800">{carrito.length}</span>
              </button>
            )}
            <button onClick={() => setSidebarOpen(true)} className="p-1"><Icon.Menu /></button>
          </div>
        </div>
      </nav>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="absolute right-0 top-0 bottom-0 w-64 bg-surface shadow-xl p-4" onClick={event => event.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <span className="font-800 text-ink-900">Menu</span>
              <button onClick={() => setSidebarOpen(false)}><Icon.X /></button>
            </div>
            {navItems.map(item => (
              <button key={item.id} onClick={() => { setScreen(item.id); setSidebarOpen(false); }} className={`sidebar-link w-full ${screen === item.id ? 'active' : ''}`}>
                {item.icon}{item.label}
                {item.badge > 0 && <span className="ml-auto badge bg-accent text-white">{item.badge}</span>}
              </button>
            ))}
            <div className="border-t border-ink-100 my-2" />
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="sidebar-link w-full">
              {theme === 'dark' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
              {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            </button>
          </div>
        </div>
      )}

      <main className={`mx-auto py-6 pb-24 ${isAdmin ? 'max-w-full px-8' : 'max-w-6xl px-4'}`}>
        {screen === 'home' && <Store screen="home" books={books} config={config} carrito={carrito} setCarrito={setCarrito} setBookSel={setBookSel} setScreen={setScreen} orders={orders} setOrders={setOrders} catalogFilters={catalogFilters} setCatalogFilters={setCatalogFilters} />}
        {screen === 'ficha' && bookSel && (
          <Store
            screen="ficha"
            bookSel={bookSel} setBookSel={setBookSel}
            books={books} config={config} carrito={carrito} setCarrito={setCarrito} setScreen={setScreen}
            orders={orders}
          />
        )}
        {screen === 'checkout' && <Store screen="checkout" carrito={carrito} setCarrito={setCarrito} setScreen={setScreen} orders={orders} setOrders={setOrders} config={config} checkoutForm={checkoutForm} setCheckoutForm={setCheckoutForm} />}
        {screen === 'tracking' && <Store screen="tracking" orders={orders} books={books} config={config} setScreen={setScreen} />}
        {screen === 'ayuda' && <Store screen="ayuda" config={config} setScreen={setScreen} />}
        {screen === 'admin' && (
          <>
            {sessionExpired && !adminAuthed && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4 flex items-center gap-3">
                <span className="text-2xl">⏰</span>
                <div className="flex-1 min-w-0">
                  <div className="font-700 text-sm text-amber-800">Tu sesión expiró</div>
                  <div className="text-xs text-amber-600">Por seguridad, las sesiones de administrador caducan. Iniciá sesión nuevamente para seguir gestionando.</div>
                </div>
                <button className="text-xs text-amber-500 hover:text-amber-700 font-700 flex-shrink-0" onClick={() => setSessionExpired(false)}>✕</button>
              </div>
            )}
            {adminAuthed
              ? <AdminPanel orders={orders} setOrders={setOrders} books={books} setBooks={setBooks} config={config} setConfig={setConfig} theme={theme} setTheme={setTheme} onLogout={async () => { try { const sb = getSupabase(config); await sb.auth.signOut(); } catch (e) { console.error('Error en signOut:', e); } saveLocal(STORAGE.admin, false); setAdminAuthed(false); }} />
              : <AdminLogin config={config} onSuccess={v => { setAdminAuthed(v); setSessionExpired(false); }} />
            }
          </>
        )}
      </main>

      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-ink-100 flex z-40">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setScreen(item.id)} className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-700 transition-colors relative ${screen === item.id || (screen === 'ficha' && item.id === 'home') ? 'text-brand-DEFAULT' : 'text-ink-400'}`}>
            {item.icon}
            <span>{item.label}</span>
            {item.badge > 0 && <span className="absolute top-2 right-1/4 w-4 h-4 bg-accent text-white rounded-full text-xs flex items-center justify-center font-800">{item.badge}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
