import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from './components/Icons';
import { Spinner } from './components/UI';
import { Store } from './components/Store';
import { AdminLogin } from './components/AdminLogin';
import { AdminPanel } from './components/AdminPanel';
import { GlobalAdminDashboard } from './components/admin/GlobalAdminDashboard';
import { PasswordSetup } from './components/admin/PasswordSetup';
import { FALLBACK_CONFIG, STORAGE } from './lib/constants';
import { migrateBook } from './lib/utils';
import { getSupabase, fetchBooksFromSupabase, fetchOrdersFromSupabase, fetchConfigFromSupabase, saveConfigToSupabase, saveLocal, loadLocal, loadJson, deepMerge, normalizeConfig, isShopAdmin, checkPasswordChanged, markPasswordChanged } from './lib/supabase';
import { setShop as setGlobalShop, getShopId } from './lib/shop';

function getSubdomainSlug() {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');
  if (parts[0] === 'www') parts.shift();
  if (parts.length <= 2) return null;
  return parts[0];
}

export default function App() {
  const [screen, setScreen] = useState(() => window.location.pathname === '/admin' ? 'admin' : 'home');
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
  const [currentShop, setCurrentShop] = useState(null);
  const [isRootDomain, setIsRootDomain] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [allShops, setAllShops] = useState([]);
  const [loginError, setLoginError] = useState('');
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    async function init() {
      const slug = getSubdomainSlug();
      if (!slug) {
        // Si viene de reset password (type=recovery en hash), redirigir al shop
        if (window.location.hash.includes('type=recovery')) {
          const loadedConfig = await loadJson('./config.json', FALLBACK_CONFIG);
          const mergedConfig = normalizeConfig(loadedConfig);
          setConfig(mergedConfig);
          const sb = getSupabase(mergedConfig);
          const { data: { session } } = await sb.auth.getSession();
          if (session?.user?.email) {
            const { data: adminRows } = await sb.from('shop_admins').select('shop_id').eq('email', session.user.email.toLowerCase()).limit(1);
            if (adminRows?.length > 0) {
              const { data: shop } = await sb.from('shops').select('subdomain').eq('id', adminRows[0].shop_id).single();
              if (shop?.subdomain) {
                window.location.href = `https://${shop.subdomain}/admin`;
                return;
              }
            }
          }
        }
        setIsRootDomain(true);
        setLoading(false);
        return;
      }

      // Admin global → sin filtro shop_id, ve todos los shops
      if (slug === 'admin') {
        setIsGlobalAdmin(true);
        const loadedConfig = await loadJson('./config.json', FALLBACK_CONFIG);
        const mergedConfig = normalizeConfig(loadedConfig);
        setConfig(mergedConfig);

        const sb = getSupabase(mergedConfig);

        // Detectar sesión post OAuth redirect (hash token)
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user?.email) {
          const allowedEmail = import.meta.env.VITE_ADMIN_EMAIL;
          if (allowedEmail && session.user.email !== allowedEmail) {
            await sb.auth.signOut();
            saveLocal(STORAGE.admin, false);
            setAdminAuthed(false);
            setLoginError(`Acceso denegado. ${session.user.email} no es el admin global.`);
          } else {
            saveLocal(STORAGE.admin, { email: session.user.email, display_name: session.user.user_metadata?.full_name || session.user.email.split('@')[0] });
            setAdminAuthed(true);
          }
        } else {
          const savedAdmin = loadLocal(STORAGE.admin, null);
          if (savedAdmin?.email) {
            try {
              const { data: { session: storedSession }, error } = await sb.auth.getSession();
              if (!error && storedSession) {
                const allowedEmail = import.meta.env.VITE_ADMIN_EMAIL;
                if (!allowedEmail || storedSession?.user?.email === allowedEmail) {
                  setAdminAuthed(true);
                } else {
                  await sb.auth.signOut().catch(() => {});
                  saveLocal(STORAGE.admin, false);
                  setAdminAuthed(false);
                  setLoginError('Acceso denegado. No sos el admin global.');
                }
              } else {
                saveLocal(STORAGE.admin, false);
                setAdminAuthed(false);
              }
            } catch (e) { saveLocal(STORAGE.admin, false); setAdminAuthed(false); }
          } else {
            saveLocal(STORAGE.admin, false);
            setAdminAuthed(false);
          }
        }

        const { data: shops } = await sb.from('shops').select('*').order('name');
        setAllShops(shops || []);
        setLoading(false);
        return;
      }

      // Cargar config primero para tener credenciales Supabase
      const loadedConfig = await loadJson('./config.json', FALLBACK_CONFIG);
      const supabaseConfig = await fetchConfigFromSupabase(loadedConfig);
      const baseConfig = supabaseConfig ? deepMerge(loadedConfig, supabaseConfig) : loadedConfig;

      // Buscar el shop por slug
      const sb = getSupabase(baseConfig);
      const { data: shop } = await sb.from('shops').select('*').eq('slug', slug).single();
      if (!shop) {
        setIsRootDomain(true);
        setLoading(false);
        return;
      }
      setCurrentShop(shop);
      setGlobalShop(shop);

      const savedConfig = loadLocal(STORAGE.config, null);
      const mergedConfig = normalizeConfig(savedConfig ? deepMerge(baseConfig, savedConfig) : baseConfig);
      const savedCarrito = loadLocal(STORAGE.carrito, []);
      const savedForm = loadLocal(STORAGE.checkoutForm, null);
      const savedCliente = loadLocal(STORAGE.cliente, null);
      setConfig(mergedConfig);

      const savedAdmin = loadLocal(STORAGE.admin, null);
      if (savedAdmin?.email) {
        try {
          const sb2 = getSupabase(mergedConfig);
          const { data: { session }, error } = await sb2.auth.getSession();
          if (error || !session) {
            console.warn('Sesión admin expirada, requiriendo login');
            saveLocal(STORAGE.admin, false);
            setAdminAuthed(false);
            setSessionExpired(true);
          } else {
            // Verificar que el admin pertenece a este shop
            const allowed = await isShopAdmin(mergedConfig, currentShop?.id || shop.id, savedAdmin.email?.toLowerCase());
            if (!allowed) {
              await sb2.auth.signOut().catch(() => {});
              saveLocal(STORAGE.admin, false);
              setAdminAuthed(false);
              setSessionExpired(true);
            } else {
              // Forzar cambio de contraseña si es primer login
              const changed = await checkPasswordChanged(mergedConfig, currentShop?.id || shop.id, savedAdmin.email);
              if (!changed) {
                setNeedsPasswordSetup(true);
              }
            }
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
    return <div className="page-loader"><div className="card p-6 flex items-center gap-3 text-ink-900 dark:text-white"><Spinner /> Cargando catalogo y configuracion...</div></div>;
  }

  if (isGlobalAdmin) {
    if (!adminAuthed) {
      return (
        <div className="min-h-screen bg-ink-50 font-sans text-ink">
          <AdminLogin config={config} initialError={loginError} onSuccess={v => {
            setLoginError('');
            const saved = loadLocal(STORAGE.admin, null);
            const allowedEmail = import.meta.env.VITE_ADMIN_EMAIL;
            if (allowedEmail && saved?.email !== allowedEmail) {
              setLoginError('Acceso denegado. Solo el admin global puede ingresar aquí.');
              saveLocal(STORAGE.admin, false);
              return;
            }
            setAdminAuthed(v);
            setSessionExpired(false);
          }} />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-ink-50 font-sans text-ink">
        <GlobalAdminDashboard
          config={config}
          onLogout={async () => {
            try { const sb = getSupabase(config); await sb.auth.signOut(); } catch (e) {}
            saveLocal(STORAGE.admin, false);
            setAdminAuthed(false);
          }}
        />
      </div>
    );
  }

  if (isRootDomain) {
    return (
      <div className="min-h-screen bg-ink-50 font-sans text-ink">
        {loginError && (
          <div className="bg-red-50 border-b border-red-200 text-red-700 text-sm text-center py-3 px-4">
            {loginError}
          </div>
        )}
        {/* Nav */}
        <nav className="bg-surface border-b border-ink-100 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-ink-900 flex items-center justify-center text-white text-sm dark:bg-white dark:text-black">IS</div>
              <span className="font-800 text-ink-900 dark:text-white text-base">Imprenta <span className="text-brand-DEFAULT">Sync 2026</span></span>
            </div>
            <div className="flex items-center gap-3">
              <a href="https://demo.imprenta.store" className="btn-secondary text-sm font-700 px-4 py-2" target="_blank" rel="noreferrer">
                <Icon.Book /> Ver demo
              </a>
              <a href={`https://wa.me/${config?.pagos?.whatsapp_admin || '5493885888949'}`} target="_blank" rel="noreferrer" className="btn-primary text-sm px-4 py-2">
                <Icon.Message /> Contactar
              </a>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <div className="hero-glow max-w-4xl mx-4 sm:mx-auto mt-12 relative z-10">
          <div className="relative z-10 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-sky-300 mb-2">Plataforma de gestión</div>
            <h1 className="text-3xl sm:text-4xl font-black mb-3">Digitalizá tu fotocopiadora universitaria</h1>
            <p className="text-sky-100/70 text-base mb-6 max-w-xl mx-auto">Catálogo online, pedidos automatizados, pagos integrados. Tus alumnos compran sin necesidad de WhatsApp.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <a href="https://demo.imprenta.store" target="_blank" rel="noreferrer" className="btn-primary text-base px-6 py-3 bg-brand-DEFAULT hover:bg-brand-dark">
                <Icon.Search /> Probar demo
              </a>
              <a href={`https://wa.me/${config?.pagos?.whatsapp_admin || '5493885888949'}`} target="_blank" rel="noreferrer" className="btn-secondary text-base px-6 py-3 border-white/20 text-white hover:bg-white/10 hover:text-white">
                <Icon.Message /> Hablar por WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="max-w-5xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">¿Por qué Imprenta Sync?</div>
            <h2 className="text-2xl font-black text-ink-900 dark:text-white">Todo lo que necesitás en un solo lugar</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <Icon.Book />, title: 'Catálogo online', desc: 'Cargá tus apuntes con vista previa de PDF. Los alumnos buscan por carrera y materia.' },
              { icon: <Icon.Cart />, title: 'Pedidos 24/7', desc: 'Recibí pedidos automáticos sin atender WhatsApp. El alumno paga y elige ventana de entrega.' },
              { icon: <Icon.Bell />, title: 'Seguimiento', desc: 'El alumno sigue su pedido en tiempo real. Estados: pago, impresión, listo, entregado.' },
              { icon: <Icon.Settings />, title: 'Panel de control', desc: 'Dashboard con capacidad diaria, gestión de catálogo, precios por formato y más.' }
            ].map((f, i) => (
              <div key={i} className="card p-5 text-center hover:bg-surface-hover hover:border-brand hover:shadow-lg hover:shadow-brand-DEFAULT/20 transition-all">
                <div className="w-10 h-10 rounded-xl bg-brand-muted flex items-center justify-center text-brand-DEFAULT mx-auto mb-3">
                  {f.icon}
                </div>
                <div className="font-700 text-ink-900 mb-1">{f.title}</div>
                <div className="text-xs text-ink-400 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-surface border-y border-border py-16">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-black text-ink-900 dark:text-white">Así de fácil es empezar</h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                { step: '1', title: 'Creá tu tienda', desc: 'Te damos un subdominio. Cargás tus libros, precios y horarios de entrega.' },
                { step: '2', title: 'Compartí el link', desc: 'Los alumnos entran, eligen sus apuntes y pagan desde el celular.' },
                { step: '3', title: 'Entregá en facultad', desc: 'Dashboard te muestra qué imprimir y cuándo. El alumno retira en la ventana pactada.' }
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="w-12 h-12 rounded-full bg-brand-DEFAULT text-white flex items-center justify-center text-xl font-800 mx-auto mb-4">{s.step}</div>
                  <div className="font-700 text-ink-900 mb-1">{s.title}</div>
                  <div className="text-sm text-ink-400">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pricing / CTA final */}
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-black text-ink-900 dark:text-white mb-4">Probá gratis, crecé cuando quieras</h2>
          <p className="text-ink-500 mb-8 max-w-lg mx-auto">Arrancá con 14 días de prueba sin costo. Cargá tu catálogo, probá el sistema y cuando estés listo pasás al plan mensual.</p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="https://demo.imprenta.store" target="_blank" rel="noreferrer" className="btn-primary text-base px-8 py-3">
              <Icon.Book /> Entrar a la demo
            </a>
            <a href={`https://wa.me/${config?.pagos?.whatsapp_admin || '5493885888949'}`} target="_blank" rel="noreferrer" className="btn-secondary text-base px-8 py-3">
              <Icon.Message /> Crear mi tienda
            </a>
          </div>
          <div className="mt-12 text-xs text-ink-300">
            ¿Ya tenés tu tienda? Entrá desde tu subdominio. Ej: <strong>unju.imprenta.store</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 font-sans text-ink">
      <nav className="bg-surface border-b border-ink-100 sticky top-0 z-50">
        <div className={`mx-auto px-4 h-14 flex items-center justify-between ${isAdmin ? 'max-w-[1440px]' : 'max-w-6xl'}`}>
          <button onClick={() => setScreen('home')} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-ink-900 flex items-center justify-center text-white text-sm dark:bg-white dark:text-black">IS</div>
            <span className="font-800 text-ink-900 dark:text-white text-base leading-none">{currentShop?.name || 'Imprenta'}<br /><span className="text-brand-DEFAULT text-xs font-700">Sync 2026</span></span>
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
        {screen === 'tracking' && <Store screen="tracking" orders={orders} setOrders={setOrders} books={books} config={config} setScreen={setScreen} />}
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
              ? (needsPasswordSetup
                ? <PasswordSetup config={config} onDone={() => setNeedsPasswordSetup(false)} />
                : <AdminPanel orders={orders} setOrders={setOrders} books={books} setBooks={setBooks} config={config} setConfig={setConfig} theme={theme} setTheme={setTheme} onLogout={async () => { try { const sb = getSupabase(config); await sb.auth.signOut(); } catch (e) { console.error('Error en signOut:', e); } saveLocal(STORAGE.admin, false); setAdminAuthed(false); setNeedsPasswordSetup(false); }} />
              )
              : <AdminLogin config={config} showGoogle={false} onSuccess={async v => {
                const saved = loadLocal(STORAGE.admin, null);
                if (saved?.email) {
                  const changed = await checkPasswordChanged(config, currentShop?.id, saved.email?.toLowerCase());
                  if (!changed) {
                    setNeedsPasswordSetup(true);
                  }
                }
                setAdminAuthed(v);
                setSessionExpired(false);
              }} />
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
