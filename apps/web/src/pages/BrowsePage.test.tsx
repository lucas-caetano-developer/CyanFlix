import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BrowsePage } from './BrowsePage';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import type { HomeData, Work } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getHome: vi.fn(),
    getContinueWatching: vi.fn(),
    getUpNext: vi.fn(),
  },
}));

const drama: Work = {
  id: 'series-drama',
  title: 'Drama Dublado',
  contentKind: 'series',
  metadata: { genres: ['Drama'] },
  seasons: [{ id: 'season-1', number: 1, metadata: { media_availability: 'DUB' } }],
};

const action: Work = {
  id: 'series-action',
  title: 'Ação Legendada',
  contentKind: 'series',
  metadata: { genres: ['Ação'] },
  seasons: [{ id: 'season-2', number: 1, metadata: { media_availability: 'LEG' } }],
};

const homeData: HomeData = {
  hero: null,
  rows: [
    { id: 'recent', title: 'Adicionados recentemente', items: [drama, action] },
    { id: 'series', title: 'Séries', items: [drama, action] },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(entry = '/browse?kind=series') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/browse" element={<BrowsePage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.getHome).mockResolvedValue(homeData);
  vi.mocked(api.getContinueWatching).mockResolvedValue([]);
  vi.mocked(api.getUpNext).mockResolvedValue([]);
});

test('turns a category route into a filterable catalog view with real counts', async () => {
  const user = userEvent.setup();
  renderPage();

  expect(await screen.findByRole('heading', { name: 'Séries' })).toBeInTheDocument();
  await screen.findByRole('link', { name: /Drama Dublado/i });
  expect(screen.getByText('2 títulos nesta visão')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Drama, 1 título' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dublado, 1 título' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Drama Dublado/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Ação Legendada/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Drama, 1 título' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/browse?kind=series&genre=Drama');
  expect(screen.getByText('1 de 2 títulos nesta visão')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Dublado, 1 título' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/browse?kind=series&genre=Drama&availability=DUB');
  await waitFor(() => expect(screen.queryByRole('link', { name: /Ação Legendada/i })).not.toBeInTheDocument());
  expect(screen.getByRole('link', { name: /Drama Dublado/i })).toBeInTheDocument();
});

test('shows a clear empty state and removes filters without leaving the category', async () => {
  const user = userEvent.setup();
  renderPage('/browse?kind=series&genre=Comédia');

  const heading = await screen.findByRole('heading', { name: 'Nenhum título com esses filtros' });
  const message = heading.closest('.catalog-message');
  expect(message).not.toBeNull();
  await user.click(within(message as HTMLElement).getByRole('button', { name: 'Limpar filtros' }));

  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/browse?kind=series'));
  expect(screen.getByRole('link', { name: /Drama Dublado/i })).toBeInTheDocument();
});

test('adds see-all links only to rows with an existing destination', async () => {
  renderPage('/browse');

  const links = await screen.findAllByRole('link', { name: /^Ver todos:/ });
  expect(links).toHaveLength(1);
  expect(links[0]).toHaveAttribute('href', '/browse?kind=series');
});
