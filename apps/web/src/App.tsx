import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from './components/layout/Shell';
import { ProfilesPage } from './pages/ProfilesPage';
import { BrowsePage } from './pages/BrowsePage';
import { SearchPage } from './pages/SearchPage';
import { TitlePage } from './pages/TitlePage';
import { WatchPage } from './pages/WatchPage';
import { MyListPage } from './pages/MyListPage';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { api } from './lib/api';
import { Spinner } from './components/ui/Spinner';
import './styles/index.css';

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
          <Route path="/watch/:kind/:id" element={<WatchPage />} />
          <Route path="/my-list" element={<Shell><MyListPage /></Shell>} />
          <Route path="/admin" element={<Shell><AdminPage /></Shell>} />
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
