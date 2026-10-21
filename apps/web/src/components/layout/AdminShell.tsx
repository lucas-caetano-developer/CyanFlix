import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useProfileStore } from '../../stores/useProfileStore';

const navigation = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin#publications', label: 'Publicações' },
  { href: '/admin#catalog', label: 'Catálogo' },
  { href: '/admin#collections', label: 'Coleções' },
  { href: '/admin#storage', label: 'Armazenamento' },
  { href: '/admin#revision-cleanup', label: 'Limpeza' },
  { href: '/admin#revisions', label: 'Revisões' },
  { href: '/admin#integrity', label: 'Integridade' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession });
  const clearProfile = useProfileStore((state) => state.clearProfile);

  return (
    <div className="admin-shell" data-spatial-scope="admin">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-sidebar__brand">
          <span className="admin-sidebar__brand-mark">C</span>
          <span>
            <strong>CyanFlix</strong>
            <small>Administração</small>
          </span>
        </Link>
        <nav className="admin-sidebar__nav" aria-label="Navegação administrativa">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`admin-sidebar__link ${location.pathname + location.hash === item.href || (item.href === '/admin' && !location.hash) ? 'admin-sidebar__link--active' : ''}`}
            >
              {item.label}
            </a>
          ))}
          {session.data?.role === 'owner' && (
            <a href="/admin#accounts" className={`admin-sidebar__link ${location.hash === '#accounts' ? 'admin-sidebar__link--active' : ''}`}>
              Acessos
            </a>
          )}
        </nav>
        <div className="admin-sidebar__footer">
          <Link to="/browse" className="admin-sidebar__link">Abrir streaming</Link>
          <button className="admin-sidebar__link" onClick={async () => {
            await api.logout();
            queryClient.clear();
            clearProfile();
            navigate('/login', { replace: true });
          }}>Sair</button>
        </div>
      </aside>
      <main className="admin-shell__content">{children}</main>
    </div>
  );
}
