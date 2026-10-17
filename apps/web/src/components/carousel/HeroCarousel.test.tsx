import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeroCarousel } from './HeroCarousel';

test('does not autoplay motion preview when reduced motion is requested', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HeroCarousel items={[{
    id: 'work-1', title: 'Título acessível', contentKind: 'movie',
    assets: [{ id: 'preview', type: 'motion_preview', relativePath: '', publicPath: '/media/preview.mp4' }],
  }]} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Título acessível' })).toBeInTheDocument();
  expect(document.querySelector('video')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Assistir' })).toHaveAttribute('href', '/watch/movie/work-1');
});
