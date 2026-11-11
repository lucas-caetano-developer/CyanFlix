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
import { AccountPage } from './pages/AccountPage';
import { api } from './lib/api';
import { Spinner } from './components/ui/Spinner';
import { ProfileGate } from './components/layout/ProfileGate';
import { SpatialNavigation } from './components/layout/SpatialNavigation';
import './styles/index.css';

const WatchPage = lazy(() => import('./pages/WatchPage').then((module) => ({ default: module.WatchPage })));
const AdminOverviewPage = lazy(() => import('./pages/admin/AdminOverviewPage').then((module) => ({ default: module.AdminOverviewPage })));
const AdminPublishPage = lazy(() => import('./pages/admin/AdminPublishPage').then((module) => ({ default: module.AdminPublishPage })));
const AdminCatalogPage = lazy(() => import('./pages/admin/AdminCatalogPage').then((module) => ({ default: module.AdminCatalogPage })));
const AdminHomeSectionsPage = lazy(() => import('./pages/admin/AdminHomeSectionsPage').then((module) => ({ default: module.AdminHomeSectionsPage })));
const AdminPackagesPage = lazy(() => import('./pages/admin/AdminPackagesPage').then((module) => ({ default: module.AdminPackagesPage })));
const AdminClientsPage = lazy(() => import('./pages/admin/AdminClientsPage').then((module) => ({ default: module.AdminClientsPage })));

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
        <SpatialNavigation />
        <Routes>
          <Route element={<AuthenticatedRoutes />}>
            <Route path="/" element={<Navigate to="/profiles" replace />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/browse" element={<Shell><BrowsePage /></Shell>} />
            <Route path="/search" element={<Shell><SearchPage /></Shell>} />
            <Route path="/title/:id" element={<Shell><TitlePage /></Shell>} />
            <Route path="/watch/:kind/:id" element={<ProfileGate><Suspense fallback={<Spinner fullScreen />}><WatchPage /></Suspense></ProfileGate>} />
            <Route path="/my-list" element={<Shell><MyListPage /></Shell>} />
            <Route path="/account" element={<Shell><AccountPage /></Shell>} />

            {/* Admin Dedicated Routes */}
            <Route path="/admin" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminOverviewPage /></Suspense></AdminShell></AdminRoute>} />
            <Route path="/admin/publish" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminPublishPage /></Suspense></AdminShell></AdminRoute>} />
            <Route path="/admin/catalog" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminCatalogPage /></Suspense></AdminShell></AdminRoute>} />
            <Route path="/admin/home-sections" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminHomeSectionsPage /></Suspense></AdminShell></AdminRoute>} />
            <Route path="/admin/packages" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminPackagesPage /></Suspense></AdminShell></AdminRoute>} />
            <Route path="/admin/clients" element={<AdminRoute><AdminShell><Suspense fallback={<Spinner fullScreen />}><AdminClientsPage /></Suspense></AdminShell></AdminRoute>} />
          </Route>
          <Route path="/login" element={<Navigate to="/profiles" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AuthenticatedRoutes() {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession, retry: false });
  if (session.isLoading) return <Spinner fullScreen />;
  if (session.isError || !session.data?.authenticated) return <Navigate to="/profiles" replace />;
  return <Outlet />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: api.getSession, retry: false });
  if (session.isLoading) return <Spinner fullScreen />;
  if (session.data?.role !== 'owner' && session.data?.role !== 'admin') return <Navigate to="/browse" replace />;
  return children;
}
