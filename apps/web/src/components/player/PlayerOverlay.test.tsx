import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { PlayerOverlay } from './PlayerOverlay';

function renderOverlay(overrides: Partial<ComponentProps<typeof PlayerOverlay>> = {}) {
  const props: ComponentProps<typeof PlayerOverlay> = {
    markers: [],
    currentTimeMs: 0,
    nextEpisode: { id: 'ep-2', number: 2, title: 'O retorno' },
    isNearEnd: true,
    countdownReady: true,
    ended: false,
    onSkip: vi.fn(),
    onNextEpisode: vi.fn(),
    autoPlayNextEpisode: true,
    playing: true,
    interactionPaused: false,
    workTitle: 'Cyanflix',
    ...overrides,
  };
  const view = render(<PlayerOverlay {...props} />);
  return { ...view, props };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function advanceSeconds(seconds: number) {
  for (let index = 0; index < seconds; index += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

test('describes the next episode with real data only', () => {
  renderOverlay();
  expect(screen.getByText('Cyanflix')).toBeInTheDocument();
  expect(screen.getByText('O retorno')).toBeInTheDocument();
  expect(screen.getByText('Episódio 2')).toBeInTheDocument();
  expect(screen.getByText(/Próximo episódio em 10s/)).toBeInTheDocument();
});

test('advances to the next episode once after the countdown', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ onNextEpisode });
  advanceSeconds(10);
  expect(onNextEpisode).toHaveBeenCalledTimes(1);
});

test('does not start the countdown before the final seconds', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ countdownReady: false, onNextEpisode });
  expect(screen.getByText('Próximo episódio')).toBeInTheDocument();
  advanceSeconds(12);
  expect(onNextEpisode).not.toHaveBeenCalled();
});

test('finishes the countdown after the video ends', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ playing: false, ended: true, onNextEpisode });
  advanceSeconds(10);
  expect(onNextEpisode).toHaveBeenCalledTimes(1);
});

test('does not start the countdown while the video is paused', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ playing: false, onNextEpisode });
  expect(screen.getByText(/pausado/)).toBeInTheDocument();
  advanceSeconds(12);
  expect(onNextEpisode).not.toHaveBeenCalled();
});

test('does not start the countdown while the user interacts with menus or controls', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ interactionPaused: true, onNextEpisode });
  advanceSeconds(12);
  expect(onNextEpisode).not.toHaveBeenCalled();
});

test('lets the viewer cancel automatic playback', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ onNextEpisode });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  advanceSeconds(12);
  expect(onNextEpisode).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  expect(screen.getByText('Próximo episódio')).toBeInTheDocument();
});

test('keeps manual playback when automatic next episode is disabled', () => {
  const onNextEpisode = vi.fn();
  renderOverlay({ autoPlayNextEpisode: false, onNextEpisode });
  advanceSeconds(12);
  expect(onNextEpisode).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reproduzir agora' })).toBeInTheDocument();
});

test('offers skip actions only for known editorial markers', () => {
  const onSkip = vi.fn();
  renderOverlay({
    markers: [{ type: 'opening', start_ms: 0, end_ms: 90_000 }],
    currentTimeMs: 5_000,
    nextEpisode: null,
    isNearEnd: false,
    onSkip,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Pular abertura' }));
  expect(onSkip).toHaveBeenCalledWith(90_000);
});

test('does not invent a skip action for unknown markers without a next episode', () => {
  const { container } = renderOverlay({
    markers: [{ type: 'preview', start_ms: 0, end_ms: 5_000 }],
    currentTimeMs: 1_000,
    nextEpisode: null,
    isNearEnd: false,
  });
  expect(container).toBeEmptyDOMElement();
});
