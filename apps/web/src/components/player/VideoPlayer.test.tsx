import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, test, expect, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const hlsMock = vi.hoisted(() => {
  type Listener = (event: string, data: unknown) => void;
  type Offset = { baseTime: number; timescale: number; trackId: number };

  const instances: Array<{
    audioStreamController: { initPTS: Offset[] };
    listeners: Map<string, Listener>;
    loadSource: ReturnType<typeof vi.fn>;
    attachMedia: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    startLoad: ReturnType<typeof vi.fn>;
    recoverMediaError: ReturnType<typeof vi.fn>;
  }> = [];

  class MockHls {
    static Events = {
      INIT_PTS_FOUND: 'hlsInitPtsFound',
      MANIFEST_PARSED: 'hlsManifestParsed',
      AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
      AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched',
      ERROR: 'hlsError',
    };
    static ErrorTypes = {
      NETWORK_ERROR: 'networkError',
      MEDIA_ERROR: 'mediaError',
      OTHER_ERROR: 'otherError',
    };

    static isSupported = () => true;

    audioTracks: unknown[] = [];
    audioTrack = -1;
    levels: unknown[] = [];
    listeners = new Map<string, Listener>();
    audioStreamController = { initPTS: [] as Offset[] };

    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();

    constructor() {
      instances.push(this);
    }

    on(event: string, listener: Listener) {
      this.listeners.set(event, listener);
    }
  }

  return { instances, MockHls };
});

vi.mock('hls.js', () => ({ default: hlsMock.MockHls }));

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn(() => Promise.resolve()),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: vi.fn(),
});

beforeEach(() => {
  hlsMock.instances.length = 0;
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test('applies the publication A/V offset to the hls.js audio timeline', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36');
  const canPlayType = vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
  render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
      audioOffsetSeconds={1.585}
    />,
  );

  expect(canPlayType).toHaveBeenCalledWith('application/vnd.apple.mpegurl');
  const instance = hlsMock.instances[0];
  expect(instance).toBeDefined();
  const listener = instance?.listeners.get(hlsMock.MockHls.Events.INIT_PTS_FOUND);
  expect(listener).toBeTypeOf('function');

  instance.audioStreamController.initPTS = [{ baseTime: 65_160, timescale: 90_000, trackId: 1 }];
  listener?.('hlsInitPtsFound', { id: 'main', frag: { cc: 0 }, timescale: 90_000, trackId: 2 });

  expect(instance.audioStreamController.initPTS[0]).toEqual({
    baseTime: 142_650,
    timescale: 90_000,
    trackId: 2,
  });
});

test('changing startTime or onPlaybackError does NOT recreate Hls instance (P7 fix)', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36');
  const onPlaybackError1 = vi.fn();
  const { rerender } = render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
      startTime={10}
      onPlaybackError={onPlaybackError1}
    />,
  );

  expect(hlsMock.instances.length).toBe(1);

  // Rerender with different startTime and onPlaybackError identity
  const onPlaybackError2 = vi.fn();
  rerender(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
      startTime={25}
      onPlaybackError={onPlaybackError2}
    />,
  );

  expect(hlsMock.instances.length).toBe(1);
});

test('left/right arrows seek even after clicking button with mouse (P2 fix)', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36');
  document.body.dataset.input = 'pointer';

  render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
    />,
  );

  // Ready state
  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 30 });
  fireEvent.loadedMetadata(video);

  // Click on a button with pointer
  const muteBtn = screen.getByRole('button', { name: 'Silenciar' });
  fireEvent.click(muteBtn);
  muteBtn.focus();

  // Arrow right should still seek because input mode is pointer
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(video.currentTime).toBe(40);
});

test('Enter toggles playback when video is focused, and media keys work (P4 TV fix)', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36');
  const onBack = vi.fn();
  render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={onBack}
    />,
  );

  const video = document.querySelector('video')!;
  fireEvent.loadedMetadata(video);

  const playSpy = vi.spyOn(video, 'play');
  const pauseSpy = vi.spyOn(video, 'pause');

  // MediaPlayPause key
  fireEvent.keyDown(window, { key: 'MediaPlayPause' });
  expect(playSpy).toHaveBeenCalled();

  // MediaRewind & MediaFastForward
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 50 });
  fireEvent.keyDown(window, { key: 'MediaFastForward' });
  expect(video.currentTime).toBe(60);

  fireEvent.keyDown(window, { key: 'MediaRewind' });
  expect(video.currentTime).toBe(50);
});

test('Back/Escape dismisses layers in order: settings -> controls -> fullscreen -> onBack', () => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36');
  const onBack = vi.fn();
  render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={onBack}
    />,
  );

  const video = document.querySelector('video')!;
  fireEvent.loadedMetadata(video);

  // 1. Open settings
  fireEvent.click(screen.getByRole('button', { name: 'Configurações de reprodução' }));
  expect(screen.getByRole('dialog', { name: /Configurações/ })).toBeInTheDocument();

  // Escape closes settings
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Configurações/ })).not.toBeInTheDocument();
  expect(onBack).not.toHaveBeenCalled();

  // 2. Next Escape when not fullscreen calls onBack
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('holding arrow key accumulates seek target and applies single seek after debounce', async () => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36');
  render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
    />,
  );

  const video = document.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 300 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
  fireEvent.loadedMetadata(video);

  // First press
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: false });
  expect(video.currentTime).toBe(10);

  // Hold key (repeated events)
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true });
  fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true }); // step increases to 30s

  // Fast forward debounce timer
  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(video.currentTime).toBeGreaterThan(10);
  vi.useRealTimers();
});

test('persists volume and muted to localStorage on user change and loads them lazily', () => {
  localStorage.setItem('cyanflix.player.volume', '0.45');
  localStorage.setItem('cyanflix.player.muted', 'true');

  render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
    />,
  );

  const video = document.querySelector('video')!;
  expect(video.volume).toBe(0.45);
  expect(video.muted).toBe(true);
});

test('shows resume notice only when startTime > 30s', () => {
  const { rerender } = render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
      startTime={15}
    />,
  );

  const video = document.querySelector('video')!;
  fireEvent.loadedMetadata(video);

  // Under 30s: no notice
  expect(screen.queryByText(/Retomando de/)).not.toBeInTheDocument();

  // Over 30s: shows notice
  rerender(
    <VideoPlayer
      src="https://example.com/other.m3u8"
      title="Episódio"
      onBack={() => undefined}
      startTime={75}
    />,
  );
  const video2 = document.querySelector('video')!;
  fireEvent.loadedMetadata(video2);
  expect(screen.getByText(/Retomando de 1:15/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Começar do início' })).toBeInTheDocument();
});

test('content rating banner appears with tone and descriptors and does not render if null', () => {
  const { rerender } = render(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
      contentRating={null}
    />,
  );

  expect(document.querySelector('.player__rating-banner')).not.toBeInTheDocument();

  rerender(
    <VideoPlayer
      src="https://example.com/master.m3u8"
      title="Episódio"
      onBack={() => undefined}
      contentRating={{ ageLabel: 'A14', tone: '14', descriptors: ['Violência', 'Drogas'] }}
    />,
  );

  // Before playing event, banner is not yet shown
  expect(screen.queryByText('A14')).not.toBeInTheDocument();
});
