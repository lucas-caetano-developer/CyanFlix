import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WorkCard } from './WorkCard';

test('links an unfinished episode directly to playback with context', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkCard work={{
    id: 'work-1', title: 'Obra de teste', contentKind: 'series',
    continueWatching: {
      itemId: 'episode-2', itemType: 'episode', seasonNumber: 1, episodeNumber: 2,
      episodeTitle: 'Retorno', positionSeconds: 120, durationSeconds: 1200,
      progressPercent: 10, updatedAt: '2026-10-14T00:00:00Z',
    },
  }} /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /obra de teste/i })).toHaveAttribute('href', '/watch/episode/episode-2');
  expect(screen.getByText('T1 E2 · Retorno')).toBeInTheDocument();
});

test('keeps untouched works on the details route', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><WorkCard work={{ id: 'movie-1', title: 'Filme', contentKind: 'movie' }} /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /filme/i })).toHaveAttribute('href', '/title/movie-1');
});
