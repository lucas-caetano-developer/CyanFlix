import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { ComponentProps } from 'react';
import { PlayerControls } from './PlayerControls';

function createProps(overrides: Partial<ComponentProps<typeof PlayerControls>> = {}) {
  return {
    playing: false, currentTime: 30, duration: 120, buffered: 0.5, volume: 1, muted: false,
    fullscreen: false, onPlay: vi.fn(), onPause: vi.fn(), onSeek: vi.fn(), onVolumeChange: vi.fn(),
    onMuteToggle: vi.fn(), onFullscreenToggle: vi.fn(), onPipToggle: vi.fn(), visible: true,
    audioTracks: [], selectedAudioTrack: -1, onAudioTrackChange: vi.fn(), subtitleTracks: [],
    selectedSubtitleTrack: -1, onSubtitleTrackChange: vi.fn(), playbackRate: 1,
    onPlaybackRateChange: vi.fn(), qualityLevels: [], selectedQuality: -1, onQualityChange: vi.fn(),
    markers: [], subtitleStyle: 'medium' as const, onSubtitleStyleChange: vi.fn(), autoPlayNextEpisode: true,
    onAutoPlayNextEpisodeChange: vi.fn(), episodes: [], onEpisodeChange: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof PlayerControls>;
}

function renderControls(overrides: Partial<ComponentProps<typeof PlayerControls>> = {}) {
  const props = createProps(overrides);
  render(<PlayerControls {...props} />);
  return props;
}

test('exposes named playback controls without relying on symbols', () => {
  renderControls();
  expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Silenciar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Configurações de reprodução' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Picture in Picture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Entrar em tela cheia' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Voltar 10 segundos' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Avançar 10 segundos' })).toBeInTheDocument();
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

test('stops timeline keyboard events from reaching the player shortcuts', () => {
  const parentKeyDown = vi.fn();
  const props = createProps();
  render(
    <div onKeyDown={parentKeyDown}>
      <PlayerControls {...props} />
    </div>,
  );
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Posição da reprodução' }), { key: 'ArrowRight', bubbles: true });
  expect(props.onSeek).toHaveBeenCalledWith(40);
  expect(parentKeyDown).not.toHaveBeenCalled();
});

test('drag does not call onSeek during pointermove and calls onSeek once on pointerup', () => {
  const onSeek = vi.fn();
  renderControls({ onSeek, duration: 100 });
  const timeline = screen.getByRole('slider', { name: 'Posição da reprodução' });
  
  // Mock bounding rect
  timeline.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 200,
    bottom: 10,
    width: 200,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  fireEvent.pointerDown(timeline, { clientX: 50, pointerId: 1 });
  expect(onSeek).not.toHaveBeenCalled();

  fireEvent.pointerMove(timeline, { clientX: 100, pointerId: 1 });
  expect(onSeek).not.toHaveBeenCalled();

  fireEvent.pointerUp(timeline, { clientX: 150, pointerId: 1 });
  expect(onSeek).toHaveBeenCalledTimes(1);
  expect(onSeek).toHaveBeenCalledWith(75);
});

test('opens an organised playback settings panel with two levels and no select elements', () => {
  const onAudioTrackChange = vi.fn();
  const onSubtitleTrackChange = vi.fn();
  const onSubtitleStyleChange = vi.fn();
  const onEpisodeChange = vi.fn();
  renderControls({
    audioTracks: [{ id: 0, label: 'Português' }, { id: 1, label: 'Inglês' }],
    selectedAudioTrack: 0,
    onAudioTrackChange,
    subtitleTracks: [{ id: 0, label: 'Português' }],
    selectedSubtitleTrack: -1,
    onSubtitleTrackChange,
    subtitleStyle: 'medium',
    onSubtitleStyleChange,
    episodes: [{ id: 'ep-1', number: 1, title: 'Piloto' }, { id: 'ep-2', number: 2, title: 'O retorno' }],
    currentEpisodeId: 'ep-1',
    onEpisodeChange,
  });

  fireEvent.click(screen.getByRole('button', { name: 'Configurações de reprodução' }));
  const panel = screen.getByRole('dialog', { name: /Configurações/ });
  expect(panel).toBeInTheDocument();
  // Ensure no native selects
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

  // Level 1: menu items
  expect(screen.getByRole('menuitem', { name: /Áudio/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Legendas/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Tamanho da legenda/ })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Episódio/ })).toBeInTheDocument();

  // Navigate to Level 2: Audio
  fireEvent.click(screen.getByRole('menuitem', { name: /Áudio/ }));
  const audioOption = screen.getByRole('menuitemradio', { name: /Inglês/ });
  expect(audioOption).toBeInTheDocument();
  fireEvent.click(audioOption);
  expect(onAudioTrackChange).toHaveBeenCalledWith(1);

  // Navigate to Level 2: Subtitles
  fireEvent.click(screen.getByRole('menuitem', { name: /Legendas/ }));
  const subOption = screen.getByRole('menuitemradio', { name: /Português/ });
  expect(subOption).toBeInTheDocument();
  fireEvent.click(subOption);
  expect(onSubtitleTrackChange).toHaveBeenCalledWith(0);

  // Navigate to Level 2: Subtitle Size
  fireEvent.click(screen.getByRole('menuitem', { name: /Tamanho da legenda/ }));
  const sizeOption = screen.getByRole('menuitemradio', { name: /Grande/ });
  expect(sizeOption).toBeInTheDocument();
  fireEvent.click(sizeOption);
  expect(onSubtitleStyleChange).toHaveBeenCalledWith('large');

  // Navigate to Level 2: Episodes
  fireEvent.click(screen.getByRole('menuitem', { name: /Episódio/ }));
  const epOption = screen.getByRole('menuitemradio', { name: /E2 · O retorno/ });
  expect(epOption).toBeInTheDocument();
  fireEvent.click(epOption);
  expect(onEpisodeChange).toHaveBeenCalledWith('ep-2');
});

test('notifies the player when playback settings open and close', () => {
  const onMenuOpenChange = vi.fn();
  renderControls({ onMenuOpenChange });
  expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);

  fireEvent.click(screen.getByRole('button', { name: 'Configurações de reprodução' }));
  expect(onMenuOpenChange).toHaveBeenLastCalledWith(true);

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onMenuOpenChange).toHaveBeenLastCalledWith(false);
});

test('closes playback settings with Escape and restores focus to its trigger', () => {
  renderControls({
    audioTracks: [{ id: 0, label: 'Português' }, { id: 1, label: 'Japonês' }],
    selectedAudioTrack: 0,
  });

  const trigger = screen.getByRole('button', { name: 'Configurações de reprodução' });
  fireEvent.click(trigger);
  const panel = screen.getByRole('dialog', { name: /Configurações/ });
  expect(panel).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Áudio/ })).toHaveFocus();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Configurações/ })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
