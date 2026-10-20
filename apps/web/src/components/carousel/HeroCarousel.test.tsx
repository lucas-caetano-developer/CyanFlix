import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HeroCarousel } from './HeroCarousel';

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

const work = (id: string, title: string) => ({
  id,
  title,
  contentKind: 'movie' as const,
});

test('does not autoplay motion preview when reduced motion is requested', () => {
  render(<MemoryRouter future={routerFuture}><HeroCarousel items={[{
    id: 'work-1', title: 'Título acessível', contentKind: 'movie',
    assets: [{ id: 'preview', type: 'motion_preview', relativePath: '', publicPath: '/media/preview.mp4' }],
  }]} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Título acessível' })).toBeInTheDocument();
  expect(document.querySelector('video')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Assistir' })).toHaveAttribute('href', '/watch/movie/work-1');
});

test('allows manual navigation between highlights', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter future={routerFuture}><HeroCarousel items={[work('work-1', 'Primeira obra'), work('work-2', 'Segunda obra')]} /></MemoryRouter>);

  expect(screen.getByRole('heading', { name: 'Primeira obra' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Próximo destaque' }));
  expect(screen.getByRole('heading', { name: 'Segunda obra' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Destaque anterior' }));
  expect(screen.getByRole('heading', { name: 'Primeira obra' })).toBeInTheDocument();
});

test('hides carousel controls when there is only one highlight', () => {
  render(<MemoryRouter future={routerFuture}><HeroCarousel items={[work('work-1', 'Obra única')]} /></MemoryRouter>);

  expect(screen.queryByRole('button', { name: 'Próximo destaque' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Exibir destaque/ })).not.toBeInTheDocument();
});
