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
  shouldIgnorePlayerShortcutForInput,
  shouldUseTvLikeInput,
  resolveContentRating,
  SEEK_STEP_SECONDS,
  skipLabel,
  splitPlaybackTitle,
  subtitleTrackLabel,
  trackLabel,
} from './player';
import { getContentDescriptors } from './workDetails';
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

test('shouldIgnorePlayerShortcutForInput distinguishes pointer vs keyboard mode', () => {
  const button = document.createElement('button');
  const input = document.createElement('input');
  const slider = document.createElement('div');
  slider.setAttribute('role', 'slider');
  const plain = document.createElement('div');

  // Text inputs & sliders always ignore shortcuts
  expect(shouldIgnorePlayerShortcutForInput(input, 'pointer')).toBe(true);
  expect(shouldIgnorePlayerShortcutForInput(input, 'keyboard')).toBe(true);
  expect(shouldIgnorePlayerShortcutForInput(slider, 'pointer')).toBe(true);

  // In pointer / touch mode, a focused button does NOT capture player shortcuts (P2 fix)
  expect(shouldIgnorePlayerShortcutForInput(button, 'pointer')).toBe(false);
  expect(shouldIgnorePlayerShortcutForInput(button, 'touch')).toBe(false);

  // In keyboard mode, a focused button captures its shortcuts
  expect(shouldIgnorePlayerShortcutForInput(button, 'keyboard')).toBe(true);

  // Plain elements never capture
  expect(shouldIgnorePlayerShortcutForInput(plain, 'keyboard')).toBe(false);
  expect(shouldIgnorePlayerShortcutForInput(plain, 'pointer')).toBe(false);
});

test('resolveContentRating normalizes age certifications and preserves descriptors', () => {
  expect(resolveContentRating(null, [])).toBeNull();
  expect(resolveContentRating('', [])).toBeNull();

  // Livre equivalents
  expect(resolveContentRating('L', ['Violência leve'])).toEqual({
    ageLabel: 'L',
    tone: 'l',
    descriptors: ['Violência leve'],
  });
  expect(resolveContentRating('Livre', [])).toEqual({ ageLabel: 'L', tone: 'l', descriptors: [] });
  expect(resolveContentRating('G', [])).toEqual({ ageLabel: 'L', tone: 'l', descriptors: [] });
  expect(resolveContentRating('TV-G', [])).toEqual({ ageLabel: 'L', tone: 'l', descriptors: [] });
  expect(resolveContentRating('TV-Y', [])).toEqual({ ageLabel: 'L', tone: 'l', descriptors: [] });
  expect(resolveContentRating('TV-Y7', [])).toEqual({ ageLabel: 'L', tone: 'l', descriptors: [] });

  // 10 / PG
  expect(resolveContentRating('10', [])).toEqual({ ageLabel: 'A10', tone: '10', descriptors: [] });
  expect(resolveContentRating('PG', [])).toEqual({ ageLabel: 'A10', tone: '10', descriptors: [] });

  // 12
  expect(resolveContentRating('12', [])).toEqual({ ageLabel: 'A12', tone: '12', descriptors: [] });

  // 14 / PG-13 / TV-14
  expect(resolveContentRating('14', ['Violência'])).toEqual({
    ageLabel: 'A14',
    tone: '14',
    descriptors: ['Violência'],
  });
  expect(resolveContentRating('PG-13', [])).toEqual({ ageLabel: 'A14', tone: '14', descriptors: [] });
  expect(resolveContentRating('TV-14', [])).toEqual({ ageLabel: 'A14', tone: '14', descriptors: [] });

  // 16
  expect(resolveContentRating('16', [])).toEqual({ ageLabel: 'A16', tone: '16', descriptors: [] });

  // 18 / NC-17 / TV-MA
  expect(resolveContentRating('18', ['Drogas'])).toEqual({
    ageLabel: 'A18',
    tone: '18',
    descriptors: ['Drogas'],
  });
  expect(resolveContentRating('NC-17', [])).toEqual({ ageLabel: 'A18', tone: '18', descriptors: [] });
  expect(resolveContentRating('TV-MA', [])).toEqual({ ageLabel: 'A18', tone: '18', descriptors: [] });

  // Unknown / free text rating -> neutral tone, original text
  expect(resolveContentRating('R', ['Violência extrema'])).toEqual({
    ageLabel: 'R',
    tone: 'neutral',
    descriptors: ['Violência extrema'],
  });
  expect(resolveContentRating('Classificação Especial', [])).toEqual({
    ageLabel: 'Classificação Especial',
    tone: 'neutral',
    descriptors: [],
  });
});

test('getContentDescriptors handles arrays and comma/semicolon delimited strings', () => {
  const fromArray = getContentDescriptors({ content_descriptors: ['Violência', 'Drogas'] });
  expect(fromArray).toEqual(['Violência', 'Drogas']);

  const fromString = getContentDescriptors({ content_descriptors: 'Violência, Drogas Lícitas; Linguagem Imprópria' });
  expect(fromString).toEqual(['Violência', 'Drogas Lícitas', 'Linguagem Imprópria']);
});

