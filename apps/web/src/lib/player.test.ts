import {
  dedupeSubtitleTracks,
  findActiveMarker,
  markerLabel,
  markerTone,
  shouldIgnorePlayerShortcut,
  skipLabel,
  splitPlaybackTitle,
  subtitleTrackLabel,
  trackLabel,
} from './player';
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
