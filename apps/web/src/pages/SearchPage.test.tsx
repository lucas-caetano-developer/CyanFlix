import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SearchPage } from './SearchPage';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import type { Work } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    searchWorks: vi.fn(),
  },
}));

const movie: Work = {
  id: 'movie-1',
  title: 'Ação Final',
  contentKind: 'movie',
  year: 2024,
  metadata: { genres: ['Ação'] },
};

const series: Work = {
  id: 'series-1',
  title: 'Série de Teste',
  contentKind: 'series',
  year: 2023,
  metadata: { genres: ['Drama'] },
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(entry = '/search') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.searchWorks).mockResolvedValue({ items: [movie, series], nextCursor: null });
});

test('shows real results with an honest loaded count and search context', async () => {
  renderPage('/search?q=Ação');

  expect(await screen.findByRole('link', { name: /Ação Final/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Série de Teste/i })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('2 títulos carregados em todo o catálogo');
  expect(api.searchWorks).toHaveBeenCalledWith('Ação', undefined, undefined);
});

test('applies the type filter without losing the search term', async () => {
  const user = userEvent.setup();
  renderPage('/search?q=teste');

  await user.click(screen.getByRole('button', { name: 'Filmes' }));

  await waitFor(() => expect(api.searchWorks).toHaveBeenCalledWith('teste', undefined, 'movie'));
  expect(screen.getByTestId('location')).toHaveTextContent('/search?q=teste&kind=movie');
});

test('trims extra spaces before querying and keeps the typed value visible', async () => {
  renderPage('/search?q=%20%20Ação%20%20');

  await waitFor(() => expect(api.searchWorks).toHaveBeenCalledWith('Ação', undefined, undefined));
  expect(screen.getByRole('searchbox', { name: 'Buscar no catálogo' })).toHaveValue('  Ação  ');
});

test('distinguishes an empty search from a search without results', async () => {
  const { unmount } = renderPage('/search');
  expect(screen.getByRole('heading', { name: 'Encontre algo para assistir' })).toBeInTheDocument();
  expect(api.searchWorks).not.toHaveBeenCalled();
  unmount();

  vi.mocked(api.searchWorks).mockResolvedValue({ items: [], nextCursor: null });
  renderPage('/search?q=inexistente');
  expect(await screen.findByRole('heading', { name: 'Nenhum resultado para “inexistente”' })).toBeInTheDocument();
});

test('clears the search term and restores the empty state', async () => {
  const user = userEvent.setup();
  renderPage('/search?q=Ação');
  await screen.findByRole('link', { name: /Ação Final/i });

  await user.click(screen.getByRole('button', { name: 'Limpar busca' }));

  expect(screen.getByRole('searchbox', { name: 'Buscar no catálogo' })).toHaveValue('');
  expect(screen.getByRole('heading', { name: 'Encontre algo para assistir' })).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('/search');
});

test('moves from the search field to the first result with ArrowDown', async () => {
  renderPage('/search?q=Ação');
  const firstResult = await screen.findByRole('link', { name: /Ação Final/i });
  const input = screen.getByRole('searchbox', { name: 'Buscar no catálogo' });

  input.focus();
  fireEvent.keyDown(input, { key: 'ArrowDown' });

  expect(firstResult).toHaveFocus();
  expect(input).toHaveValue('Ação');
});

test('shows a recoverable error instead of an empty catalog message', async () => {
  vi.mocked(api.searchWorks).mockRejectedValue(new Error('offline'));
  renderPage('/search?q=Ação');

  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível concluir a busca');
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(api.searchWorks).toHaveBeenCalledTimes(2));
});
