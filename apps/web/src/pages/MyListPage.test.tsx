import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MyListPage } from './MyListPage';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import type { Work } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getFavorites: vi.fn(),
    getActiveProfile: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));

const movie: Work = {
  id: 'movie-1',
  title: 'Ação Final',
  contentKind: 'movie',
  metadata: { genres: ['Ação'] },
};

const series: Work = {
  id: 'series-1',
  title: 'Série de Teste',
  contentKind: 'series',
  metadata: { genres: ['Drama'] },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(entry = '/my-list') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/my-list" element={<MyListPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.getFavorites).mockResolvedValue([series, movie]);
  vi.mocked(api.getActiveProfile).mockResolvedValue({ id: 'profile-1', name: 'Ana', role: 'viewer', pinProtected: false });
  vi.mocked(api.removeFavorite).mockResolvedValue();
});

test('shows the saved titles and filters them by type without changing persistence', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Minha Lista' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /Ação Final/i })).toBeInTheDocument();
  expect(screen.getByText('2 títulos salvos')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Série de Teste/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Filmes, 1 título' }));

  await waitFor(() => expect(screen.queryByRole('link', { name: /Série de Teste/i })).not.toBeInTheDocument());
  expect(screen.getByRole('link', { name: /Ação Final/i })).toBeInTheDocument();
  expect(screen.getByText('1 de 2 títulos salvos')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/my-list?kind=movie');
});

test('sorts the complete saved list alphabetically', async () => {
  const user = userEvent.setup();
  renderPage();

  await screen.findByRole('link', { name: /Ação Final/i });
  await user.selectOptions(screen.getByRole('combobox', { name: /ordenar/i }), 'az');

  const links = screen.getAllByRole('link', { name: /Ação Final|Série de Teste/i });
  expect(links[0]).toHaveTextContent('Ação Final');
  expect(screen.getByTestId('location')).toHaveTextContent('sort=az');
});

test('distinguishes an empty list from a load failure', async () => {
  vi.mocked(api.getFavorites).mockResolvedValue([]);
  const { unmount } = renderPage();
  expect(await screen.findByRole('heading', { name: 'Sua lista está vazia' })).toBeInTheDocument();
  unmount();

  vi.mocked(api.getFavorites).mockRejectedValue(new Error('offline'));
  renderPage();
  expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent('Não foi possível carregar sua lista');
});

test('removes a saved title with an optimistic update and confirms the action', async () => {
  const user = userEvent.setup();
  vi.mocked(api.getFavorites)
    .mockResolvedValueOnce([series, movie])
    .mockResolvedValue([series]);
  renderPage();

  await screen.findByRole('link', { name: /Ação Final/i });
  await user.click(screen.getByRole('button', { name: 'Remover Ação Final da Minha Lista' }));

  expect(api.removeFavorite).toHaveBeenCalledWith('profile-1', 'movie-1');
  await waitFor(() => expect(screen.queryByRole('link', { name: /Ação Final/i })).not.toBeInTheDocument());
  expect(screen.getByText(/removido da Minha Lista/i)).toBeInTheDocument();
  expect(screen.getByText('1 título salvo')).toBeInTheDocument();
});
