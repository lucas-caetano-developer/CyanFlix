import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { lazy, Suspense, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from './components/layout/Shell';
import { AdminShell } from './components/layout/AdminShell';
import { ProfilesPage } from './pages/ProfilesPage';
import { BrowsePage } from './pages/BrowsePage';
import { SearchPage } from './pages/SearchPage';
import { TitlePage } from './pages/TitlePage';
import { MyListPage } from './pages/MyListPage';
import { LoginPage } from './pages/LoginPage';
import { api } from './lib/api';
import { Spinner } from './components/ui/Spinner';
import { ProfileGate } from './components/layout/ProfileGate';
import './styles/index.css';

const WatchPage = lazy(() => import('./pages/WatchPage').then((module) => ({ default: module.WatchPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AuthenticatedRoutes />}>
          <Route path="/" element={<Navigate to="/profiles" replace />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/browse" element={<Shell><BrowsePage /></Shell>} />
          <Route path="/search" element={<Shell><SearchPage /></Shell>} />
          <Route path="/title/:id" element={<Shell><TitlePage /></Shell>} />
          <Route path="/watch/:kind/:id" element={<ProfileGate><Suspense fallback={<Spinner fullScreen />}><WatchPage /></Suspense></ProfileGate>} />
          <Route path="/my-list" element={<Shell><MyListPage /></Shell>} />
          <Route path="/admin" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminPage /></Suspense></AdminShell></AdminRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AuthenticatedRoutes() {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession, retry: false });
  if (session.isLoading) return <Spinner fullScreen />;
  if (session.isError || !session.data?.authenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession, retry: false });
  if (session.isLoading) return <Spinner fullScreen />;
  if (session.data?.role !== 'owner' && session.data?.role !== 'admin') return <Navigate to="/browse" replace />;
  return children;
}
