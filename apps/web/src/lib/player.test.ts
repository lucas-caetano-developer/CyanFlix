import {
  applyAudioInitPts,
  audioInitPtsForOffset,
  dedupeSubtitleTracks,
  findActiveMarker,
  isSafariBrowser,
  markerLabel,
  markerTone,
  playbackAudioOffsetSeconds,
  shouldIgnorePlayerShortcut,
  skipLabel,
  splitPlaybackTitle,
  subtitleTrackLabel,
  trackLabel,
} from './player';
import { vi } from 'vitest';
import type { Marker, PlaybackTrack } from './types';

test('labels editorial markers using only known semantics', () => {
  expect(markerLabel('opening')).toBe('Abertura');
  expect(markerLabel('ending')).toBe('Encerramento');
  expect(markerLabel('credits')).toBe('Créditos');
  expect(markerLabel('next_episode')).toBe('Próximo episódio');
  expect(markerLabel('preview')).toBe('Marcador');
  expect(skipLabel('opening')).toBe('Pular abertura');
  expect(skipLabel('ending')).toBe('Pular encerramento');
  expect(skipLabel('credits')).toBe('Pular créditos');
  expect(skipLabel('preview')).toBeNull();
  expect(markerTone('next_episode')).toBe('next');
  expect(markerTone('preview')).toBe('other');
});

test('finds only valid active markers with an exclusive end', () => {
  const markers: Marker[] = [
    { type: 'opening', start_ms: 0, end_ms: 90_000 },
    { type: 'ending', start_ms: 1_000_000, end_ms: 1_100_000 },
  ];
  expect(findActiveMarker(markers, 0)?.type).toBe('opening');
  expect(findActiveMarker(markers, 89_999)?.type).toBe('opening');
  expect(findActiveMarker(markers, 90_000)).toBeUndefined();
  expect(findActiveMarker([{ type: 'broken', start_ms: 10, end_ms: 10 }], 10)).toBeUndefined();
  expect(findActiveMarker([], 10)).toBeUndefined();
});

test('splits the playback title without inventing episode data', () => {
  expect(splitPlaybackTitle('Cyanflix — Episódio 1')).toEqual({ workTitle: 'Cyanflix', episodeTitle: 'Episódio 1' });
  expect(splitPlaybackTitle('Somente o filme')).toEqual({ workTitle: 'Somente o filme', episodeTitle: null });
  expect(splitPlaybackTitle('Título — ')).toEqual({ workTitle: 'Título', episodeTitle: null });
});

test('deduplicates subtitle tracks by URL and ignores empty tracks', () => {
  const tracks: PlaybackTrack[] = [
    { url: 'a.vtt', metadata: { title: 'Português', language: 'pt-BR' } },
    { url: 'a.vtt', metadata: { title: 'Português', language: 'pt-BR' } },
    { url: 'b.vtt', metadata: { title: 'Inglês', language: 'en' } },
    { url: null, metadata: { title: 'Inválida' } },
  ];
  expect(dedupeSubtitleTracks(tracks).map((track) => track.url)).toEqual(['a.vtt', 'b.vtt']);
});

test('builds understandable audio and subtitle labels', () => {
  expect(subtitleTrackLabel({ url: 'a.vtt', metadata: { title: 'Completo', language: 'pt-BR' } }, 0)).toBe('Completo');
  expect(subtitleTrackLabel({ url: 'b.vtt', metadata: { language: 'en' } }, 1)).toBeTruthy();
  expect(subtitleTrackLabel({ url: 'c.vtt', metadata: {} }, 2)).toBe('Legenda 3');
  expect(subtitleTrackLabel({ url: 'd.vtt', metadata: { title: 'sub_pt.vtt', language: 'pt-BR' } }, 0)).not.toBe('sub_pt.vtt');
  expect(subtitleTrackLabel({ url: 'e.vtt', metadata: { title: 'Legenda 1', language: 'en' } }, 1)).not.toBe('Legenda 1');
  expect(trackLabel('Dublado', 'pt-BR', 'Faixa 1')).toBe('Dublado');
  expect(trackLabel('', 'pt-BR', 'Faixa 1')).toBeTruthy();
  expect(trackLabel('pt', 'pt-BR', 'Faixa 1')).toBeTruthy();
  expect(trackLabel('audio_1', 'pt-BR', 'Faixa 1')).not.toBe('audio_1');
  expect(trackLabel(undefined, undefined, 'Faixa 1')).toBe('Faixa 1');
});

test('reads the A/V offset declared by the publication delivery', () => {
  expect(playbackAudioOffsetSeconds(undefined)).toBe(0);
  expect(playbackAudioOffsetSeconds({})).toBe(0);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: [0] })).toBe(0);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: [0.724] })).toBe(0.724);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: 1.585 })).toBe(1.585);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: [-0.5] })).toBe(-0.5);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: ['nope'] })).toBe(0);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: [null] })).toBe(0);
  expect(playbackAudioOffsetSeconds({ av_offset_seconds: 99 })).toBe(10);
});

test('keeps native HLS only for Safari', () => {
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/155.0.0.0 Safari/537.36' });
  expect(isSafariBrowser()).toBe(false);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
  expect(isSafariBrowser()).toBe(true);
  vi.unstubAllGlobals();
});

test('converts the A/V offset to the hls.js initPTS timescale', () => {
  expect(audioInitPtsForOffset(0, 90_000, 2)).toEqual({ baseTime: 0, timescale: 90_000, trackId: 2 });
  expect(audioInitPtsForOffset(1.585, 90_000, 2)).toEqual({ baseTime: 142_650, timescale: 90_000, trackId: 2 });
  expect(audioInitPtsForOffset(0.5, 0, 1)).toEqual({ baseTime: 45_000, timescale: 90_000, trackId: 1 });
  expect(audioInitPtsForOffset(-0.5, 90_000, 1)).toEqual({ baseTime: -45_000, timescale: 90_000, trackId: 1 });
  expect(audioInitPtsForOffset(99, 90_000, 1)).toEqual({ baseTime: 900_000, timescale: 90_000, trackId: 1 });
  expect(audioInitPtsForOffset(Number.NaN, 90_000, 1)).toEqual({ baseTime: 0, timescale: 90_000, trackId: 1 });
});

test('replaces only the main-rendition copy of the audio initPTS', () => {
  const offsets = [{ baseTime: 65_160, timescale: 90_000, trackId: 1 }];
  const hls = { audioStreamController: { initPTS: offsets } };
  expect(applyAudioInitPts(hls, { id: 'audio', frag: { cc: 0 }, timescale: 90_000, trackId: 2 }, 1.585)).toBe(false);
  expect(offsets[0].baseTime).toBe(65_160);
  expect(applyAudioInitPts(hls, { id: 'main', frag: { cc: 0 }, timescale: 90_000, trackId: 2 }, 1.585)).toBe(true);
  expect(offsets[0]).toEqual({ baseTime: 142_650, timescale: 90_000, trackId: 2 });
  expect(applyAudioInitPts({}, { id: 'main', frag: { cc: 0 }, timescale: 90_000, trackId: 2 }, 0)).toBe(false);
  expect(applyAudioInitPts(null, { id: 'main', frag: { cc: 0 }, timescale: 90_000, trackId: 2 }, 0)).toBe(false);
});

test('ignores player shortcuts while the user operates interactive controls', () => {
  const button = document.createElement('button');
  const select = document.createElement('select');
  const slider = document.createElement('div');
  slider.setAttribute('role', 'slider');
  const plain = document.createElement('div');
  expect(shouldIgnorePlayerShortcut(button)).toBe(true);
  expect(shouldIgnorePlayerShortcut(select)).toBe(true);
  expect(shouldIgnorePlayerShortcut(slider)).toBe(true);
  expect(shouldIgnorePlayerShortcut(plain)).toBe(false);
  expect(shouldIgnorePlayerShortcut(null)).toBe(false);
});
