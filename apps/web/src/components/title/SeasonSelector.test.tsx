import { fireEvent, render, screen } from '@testing-library/react';
import { Season } from '../../lib/types';
import { SeasonSelector, seasonLabel } from './SeasonSelector';

const seasons: Season[] = [
  { id: 'season-0', number: 0, title: 'Especiais' },
  { id: 'season-1', number: 1, title: 'Arco da Ilha' },
  { id: 'season-2', number: 2, title: null },
];

test('uses custom season names, specials and conventional numbering', () => {
  expect(seasonLabel(seasons[0])).toBe('Especiais');
  expect(seasonLabel(seasons[1])).toBe('Arco da Ilha');
  expect(seasonLabel(seasons[2])).toBe('Temporada 2');
});

test('exposes the selected season as an accessible tab and moves with the keyboard', () => {
  const onSelect = vi.fn();
  render(<SeasonSelector seasons={seasons} currentSeason={seasons[1]} onSelect={onSelect} />);

  const customSeason = screen.getByRole('tab', { name: 'Arco da Ilha' });
  expect(customSeason).toHaveAttribute('aria-selected', 'true');
  expect(customSeason).toHaveAttribute('tabindex', '0');
  expect(screen.getByRole('tab', { name: 'Temporada 2' })).toHaveAttribute('tabindex', '-1');

  fireEvent.keyDown(customSeason, { key: 'ArrowRight' });
  expect(onSelect).toHaveBeenCalledWith(seasons[2]);
});

test('keeps arrow-key navigation local to the season tabs', () => {
  const onSelect = vi.fn();
  const bubble = vi.fn();
  render(
    <div onKeyDown={bubble}>
      <SeasonSelector seasons={seasons} currentSeason={seasons[1]} onSelect={onSelect} />
    </div>,
  );

  fireEvent.keyDown(screen.getByRole('tab', { name: 'Arco da Ilha' }), { key: 'ArrowLeft' });

  expect(onSelect).toHaveBeenCalledWith(seasons[0]);
  expect(bubble).not.toHaveBeenCalled();
});
