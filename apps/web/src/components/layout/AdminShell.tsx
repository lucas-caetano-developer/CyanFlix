import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useProfileStore } from '../../stores/useProfileStore';
import { CyanFlixIcon } from '../ui/CyanFlixLogo';
import '../../styles/admin.css';

const navItems = [
  {
    path: '/admin',
    label: 'Visão geral',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    path: '/admin/publish',
    label: 'Publicação',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    path: '/admin/catalog',
    label: 'Catálogo',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </svg>
    ),
  },
  {
    path: '/admin/home-sections',
    label: 'Seções da Home',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="14" y2="12" />
        <line x1="4" y1="18" x2="18" y2="18" />
      </svg>
    ),
  },
  {
    path: '/admin/packages',
    label: 'Pacotes & Revisões',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m7.5 4.27 9 5.15" />
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.3 7 8.7 5 8.7-5" />
        <path d="M12 22V12" />
      </svg>
    ),
  },
  {
    path: '/admin/voice-actors',
    label: 'Dubladores',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    path: '/admin/characters',
    label: 'Personagens',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    path: '/admin/clients',
    label: 'Clientes',
    role: 'owner',
    icon: (
      <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession });
  const clearProfile = useProfileStore((state) => state.clearProfile);
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const events = new EventSource('/api/admin/events');
    events.onopen = () => setLiveStatus('live');
    events.onerror = () => setLiveStatus('offline');
    events.addEventListener('operations', (event) => {
      setLiveStatus('live');
      const payload = JSON.parse((event as MessageEvent<string>).data) as { changed?: string[] };
      const changed = new Set(payload.changed ?? []);
      if (changed.has('publications')) {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'publications'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'storage'] });
      }
      if (changed.has('transcodes')) void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      if (changed.has('revisions')) void queryClient.invalidateQueries({ queryKey: ['admin', 'revisions'] });
      if (changed.has('accounts')) void queryClient.invalidateQueries({ queryKey: ['admin', 'accounts'] });
      if (changed.has('home_sections')) {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'home-sections'] });
        void queryClient.invalidateQueries({ queryKey: ['home'] });
      }
      if (changed.has('catalog')) {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'catalog'] });
        void queryClient.invalidateQueries({ queryKey: ['home'] });
        void queryClient.invalidateQueries({ queryKey: ['work'] });
        void queryClient.invalidateQueries({ queryKey: ['search'] });
      }
    });
    return () => events.close();
  }, [queryClient]);

  const handleLogout = async () => {
    await api.logout();
    queryClient.clear();
    clearProfile();
    navigate('/profiles', { replace: true });
  };

  return (
    <div className="admin-shell" data-spatial-scope="admin">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`admin-sidebar ${mobileMenuOpen ? 'admin-sidebar--open' : ''}`}>
        <div className="admin-sidebar__top-row">
          <Link to="/admin" className="admin-sidebar__brand">
            <span className="admin-sidebar__brand-mark" aria-hidden="true">
              <CyanFlixIcon size={26} variant="transparent" />
            </span>
            <span>
              <strong>CyanFlix</strong>
              <small>Administração</small>
            </span>
          </Link>
          <button
            type="button"
            className="admin-sidebar__close-mobile"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
          >
            ✕
          </button>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Navegação administrativa">
          {navItems.map((item) => {
            if (item.role && session.data?.role !== item.role) return null;
            const isActive =
              item.path === '/admin'
                ? location.pathname === '/admin'
                : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar__footer">
          <Link to="/browse" className="admin-sidebar__link admin-sidebar__link--streaming">
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Ver streaming</span>
          </Link>

          {session.data && (
            <div className="admin-sidebar__user-info">
              <div className="admin-sidebar__user-avatar">
                {session.data.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="admin-sidebar__user-details">
                <span className="admin-sidebar__username">{session.data.username}</span>
                <span className="admin-sidebar__user-role">{session.data.role}</span>
              </div>
            </div>
          )}

          <button type="button" className="admin-sidebar__link admin-sidebar__link--logout" onClick={handleLogout}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <div className="admin-shell__main">
        <header className="admin-shell__topbar">
          <div className="admin-shell__topbar-left">
            <button
              type="button"
              className="admin-sidebar-toggle-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu de navegação"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="admin-shell__live-indicator">
              <span className={`admin-live-dot admin-live-dot--${liveStatus}`} />
              <span className="admin-live-text">
                {liveStatus === 'live' ? 'Atualização ao vivo' : liveStatus === 'connecting' ? 'Conectando…' : 'Reconectando…'}
              </span>
            </div>
          </div>

          <div className="admin-shell__topbar-actions">
            <Link to="/browse" className="btn btn--secondary btn--sm">
              Abrir Player / Streaming ↗
            </Link>
          </div>
        </header>

        <main className="admin-shell__content">{children}</main>
      </div>
    </div>
  );
}
