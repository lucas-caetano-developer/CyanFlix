import { fireEvent, render, screen } from '@testing-library/react';
import { EpisodeCard } from './EpisodeCard';

test('presents episode hierarchy and triggers playback on click', () => {
  const onClick = vi.fn();
  render(<EpisodeCard
    workTitle="Série de teste"
    onClick={onClick}
    episode={{
      id: 'episode-3',
      number: 3,
      title: 'Título longo do episódio para testar o truncamento visual',
      synopsis: 'Sinopse curta do episódio.',
      metadata: { duration_minutes: 65 },
    }}
  />);

  const card = screen.getByRole('button', { name: /série de teste\. episódio 3: título longo/i });
  expect(card.getAttribute('aria-label')).toContain('Duração 1h 5min');
  expect(screen.getByText('03')).toBeInTheDocument();
  expect(screen.getByText('1h 5min')).toBeInTheDocument();
  expect(screen.getByTitle('Título longo do episódio para testar o truncamento visual')).toBeInTheDocument();

  fireEvent.click(card);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('shows a real progress indicator only when progress is available', () => {
  const { rerender } = render(<EpisodeCard episode={{ id: 'episode-1', number: 1, title: 'Piloto' }} />);
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

  rerender(<EpisodeCard episode={{ id: 'episode-2', number: 2, title: 'Retorno' }} progressPercent={35} />);
  const progressbar = screen.getByRole('progressbar', { name: '35% assistido' });
  expect(progressbar).toHaveAttribute('value', '35');
});

test('falls back to a neutral placeholder when no thumbnail is available', () => {
  const { container } = render(<EpisodeCard episode={{ id: 'episode-9', number: 9, title: 'Sem arte' }} />);
  expect(container.querySelector('.episode-card__placeholder')).not.toBeNull();
  expect(container.querySelector('.episode-card__thumbnail')).toBeNull();
});
