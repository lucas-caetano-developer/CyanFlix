import { render } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const hlsMock = vi.hoisted(() => {
  type Listener = (event: string, data: unknown) => void;
  type Offset = { baseTime: number; timescale: number; trackId: number };

  const instances: Array<{
    audioStreamController: { initPTS: Offset[] };
    listeners: Map<string, Listener>;
  }> = [];

  class MockHls {
    static Events = {
      INIT_PTS_FOUND: 'hlsInitPtsFound',
      MANIFEST_PARSED: 'hlsManifestParsed',
      AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
      AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched',
      ERROR: 'hlsError',
    };

    static isSupported = () => true;

    audioTracks: unknown[] = [];
    audioTrack = -1;
    levels: unknown[] = [];
    listeners = new Map<string, Listener>();
    audioStreamController = { initPTS: [] as Offset[] };

    constructor() {
      instances.push(this);
    }

    on(event: string, listener: Listener) {
      this.listeners.set(event, listener);
    }

    loadSource() {}

    attachMedia() {}

    destroy() {}
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
