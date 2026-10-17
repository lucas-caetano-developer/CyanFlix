import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { ComponentProps } from 'react';
import { PlayerControls } from './PlayerControls';

function renderControls(overrides: Partial<ComponentProps<typeof PlayerControls>> = {}) {
  const props: ComponentProps<typeof PlayerControls> = {
    playing: false, currentTime: 30, duration: 120, buffered: 0.5, volume: 1, muted: false,
    fullscreen: false, onPlay: vi.fn(), onPause: vi.fn(), onSeek: vi.fn(), onVolumeChange: vi.fn(),
    onMuteToggle: vi.fn(), onFullscreenToggle: vi.fn(), onPipToggle: vi.fn(), visible: true,
    audioTracks: [], selectedAudioTrack: -1, onAudioTrackChange: vi.fn(), subtitleTracks: [],
    selectedSubtitleTrack: -1, onSubtitleTrackChange: vi.fn(), playbackRate: 1,
    onPlaybackRateChange: vi.fn(), qualityLevels: [], selectedQuality: -1, onQualityChange: vi.fn(),
    markers: [], subtitleStyle: 'medium', onSubtitleStyleChange: vi.fn(), autoPlayNextEpisode: true,
    onAutoPlayNextEpisodeChange: vi.fn(), episodes: [], onEpisodeChange: vi.fn(),
    ...overrides,
  };
  render(<PlayerControls {...props} />);
  return props;
}

test('exposes named playback controls without relying on symbols', () => {
  renderControls();
  expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Silenciar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Entrar em tela cheia' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Picture in Picture' })).toBeInTheDocument();
});

test('supports keyboard seeking on the timeline', () => {
  const onSeek = vi.fn();
  renderControls({ onSeek });
  const timeline = screen.getByRole('slider', { name: 'Posição da reprodução' });
  fireEvent.keyDown(timeline, { key: 'ArrowRight' });
  fireEvent.keyDown(timeline, { key: 'Home' });
  expect(onSeek).toHaveBeenNthCalledWith(1, 40);
  expect(onSeek).toHaveBeenNthCalledWith(2, 0);
});
