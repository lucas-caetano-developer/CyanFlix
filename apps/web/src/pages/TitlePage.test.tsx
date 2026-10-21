import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TitlePage } from './TitlePage';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import { Work } from '../lib/types';

vi.mock('../lib/api', () => ({
  api: {
    getWork: vi.fn(),
    getFavorites: vi.fn(),
    getContinueWatching: vi.fn(),
    getUpNext: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
  },
}));

const series: Work = {
  id: 'series-1',
  title: 'Série de Teste',
  contentKind: 'series',
  year: 2024,
  synopsis: 'Uma equipe investiga mistérios em uma ilha isolada.',
  metadata: {
    genres: ['Drama', 'Mistério'],
    certification: '14',
    production_studios: ['Estúdio Azul'],
    cast: [{ name: 'Ana Lima', role: 'Mara' }],
    original_language: 'pt',
    origin_country: ['BR'],
    status: 'Returning Series',
  },
  assets: [{ id: 'hero-1', type: 'hero', relativePath: 'hero.jpg', publicPath: '/media/hero.jpg' }],
  seasons: [
    {
      id: 'season-1',
      number: 1,
      title: 'Temporada Inicial',
      metadata: { media_availability: 'DUB', audio_languages: ['Português'], subtitle_languages: ['Português'] },
      episodes: [{ id: 'episode-1', number: 1, title: 'Começo', metadata: { duration_minutes: 45 } }],
    },
    {
      id: 'season-2',
      number: 2,
      title: 'Arco Final',
      metadata: { media_availability: 'LEG', audio_languages: ['Japonês'], subtitle_languages: ['Português'] },
      episodes: [
        { id: 'episode-2', number: 2, title: 'Retorno', metadata: { duration_minutes: 45 } },
        { id: 'episode-3', number: 3, title: 'Escolhas', metadata: { duration_minutes: 45 } },
      ],
    },
  ],
};

const movie: Work = {
  id: 'movie-1',
  title: 'Filme de Teste',
  originalTitle: 'Test Movie',
  contentKind: 'movie',
  year: 2023,
  synopsis: 'Uma jornada longa sobre memória, escolhas e consequências que atravessam gerações e mudam o destino de uma família inteira. '.repeat(4),
  metadata: {
    genres: ['Ficção científica'],
    certification: '16',
    certification_agency: 'Brasil',
    content_descriptors: ['Violência', 'Linguagem imprópria'],
    runtime: 120,
    release_date: '2023-05-18',
    original_language: 'en',
    origin_country: ['US'],
    cast: [{ name: 'Bruno Costa', role: 'Elias' }],
    crew: [{ name: 'Clara Nunes', job: 'Director' }],
    awards: [{ award: 'Festival Aurora', category: 'Melhor Filme', year: 2024, won: true }],
  },
  assets: [
    { id: 'trailer-1', type: 'trailer', relativePath: 'trailer.mp4', publicPath: '/media/trailer.mp4' },
  ],
};

function renderPage(entry = '/title/series-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/title/:id" element={<TitlePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useProfileStore.setState({ profileId: 'profile-1' });
  vi.mocked(api.getFavorites).mockResolvedValue([]);
  vi.mocked(api.getContinueWatching).mockResolvedValue([]);
  vi.mocked(api.getUpNext).mockResolvedValue([]);
  vi.mocked(api.addFavorite).mockResolvedValue();
  vi.mocked(api.removeFavorite).mockResolvedValue();
});

test('prioritises the resumed episode and its season without changing the playback route', async () => {
  vi.mocked(api.getWork).mockResolvedValue(series);
  vi.mocked(api.getContinueWatching).mockResolvedValue([{
    id: series.id,
    title: series.title,
    contentKind: series.contentKind,
    continueWatching: {
      itemId: 'episode-3',
      itemType: 'episode',
      seasonNumber: 2,
      episodeNumber: 3,
      episodeTitle: 'Escolhas',
      positionSeconds: 600,
      durationSeconds: 1000,
      progressPercent: 60,
      updatedAt: '2026-10-18T00:00:00Z',
    },
  }]);

  renderPage();

  const playLink = await screen.findByRole('link', { name: /continuar t2 e3/i });
  expect(playLink).toHaveAttribute('href', '/watch/episode/episode-3');
  expect(screen.getByRole('tab', { name: 'Arco Final' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Temporada Inicial' })).toHaveAttribute('aria-selected', 'false');
  expect(screen.getByRole('progressbar', { name: '60% assistido' })).toHaveAttribute('value', '60');
  expect(screen.getByText('2 temporadas')).toBeInTheDocument();
});

test('organises film information, expands long synopses and hides empty episode sections', async () => {
  vi.mocked(api.getWork).mockResolvedValue(movie);

  renderPage('/title/movie-1');

  expect(await screen.findByRole('heading', { name: 'Filme de Teste' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Episódios' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Informações' })).toBeInTheDocument();
  expect(screen.getByText('2h')).toBeInTheDocument();
  expect(screen.getByText('18 de maio de 2023')).toBeInTheDocument();
  expect(screen.getByText('Violência')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Prêmios e indicações' })).toBeInTheDocument();

  const synopsis = document.getElementById('title-synopsis');
  expect(synopsis).toHaveClass('title-page__synopsis--clamped');
  fireEvent.click(screen.getByRole('button', { name: 'Ler sinopse completa' }));
  expect(synopsis).not.toHaveClass('title-page__synopsis--clamped');
  expect(screen.getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true');
});

test('opens the trailer in an accessible dialog and closes it with Escape', async () => {
  vi.mocked(api.getWork).mockResolvedValue(movie);

  renderPage('/title/movie-1');

  fireEvent.click(await screen.findByRole('button', { name: 'Ver trailer' }));
  const dialog = screen.getByRole('dialog', { name: 'Trailer de Filme de Teste' });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Fechar trailer' })).toHaveFocus();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('omits sections that have no real data', async () => {
  const minimalMovie: Work = {
    id: 'movie-2',
    title: 'Filme Minimal',
    contentKind: 'movie',
  };
  vi.mocked(api.getWork).mockResolvedValue(minimalMovie);

  renderPage('/title/movie-2');

  expect(await screen.findByRole('heading', { name: 'Filme Minimal' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Assistir' })).toHaveAttribute('href', '/watch/movie/movie-2');
  expect(screen.queryByRole('heading', { name: 'Episódios' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Informações' })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Elenco e equipe' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Seções do título' })).not.toBeInTheDocument();
});

test('offers the next episode from the existing up-next contract when nothing is in progress', async () => {
  vi.mocked(api.getWork).mockResolvedValue(series);
  vi.mocked(api.getUpNext).mockResolvedValue([{
    id: series.id,
    title: series.title,
    contentKind: series.contentKind,
    continueWatching: {
      itemId: 'episode-2',
      itemType: 'episode',
      seasonNumber: 2,
      episodeNumber: 2,
      episodeTitle: 'Retorno',
      positionSeconds: 0,
      durationSeconds: null,
      progressPercent: 0,
      updatedAt: '2026-10-18T00:00:00Z',
    },
  }]);

  renderPage();

  const playLink = await screen.findByRole('link', { name: /próximo episódio t2 e2/i });
  expect(playLink).toHaveAttribute('href', '/watch/episode/episode-2');
  expect(screen.getByRole('tab', { name: 'Arco Final' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('progressbar', { name: /assistido/i })).not.toBeInTheDocument();
});

test('updates Minha Lista optimistically and reports the saved state', async () => {
  const user = userEvent.setup();
  vi.mocked(api.getWork).mockResolvedValue(movie);
  vi.mocked(api.getFavorites)
    .mockResolvedValueOnce([])
    .mockResolvedValue([movie]);

  renderPage('/title/movie-1');

  const favoriteButton = await screen.findByRole('button', { name: 'Minha Lista' });
  await user.click(favoriteButton);

  expect(api.addFavorite).toHaveBeenCalledWith('profile-1', 'movie-1');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Na Minha Lista' })).toHaveAttribute('aria-pressed', 'true'));
  expect(await screen.findByText(/adicionado à Minha Lista/i)).toBeInTheDocument();
});
