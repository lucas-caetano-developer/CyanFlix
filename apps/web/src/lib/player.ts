import type { Marker, PlaybackTrack } from './types';

const MARKER_LABELS: Record<string, string> = {
  opening: 'Abertura',
  ending: 'Encerramento',
  credits: 'Créditos',
  next_episode: 'Próximo episódio',
};

const SKIP_LABELS: Record<string, string> = {
  opening: 'Pular abertura',
  ending: 'Pular encerramento',
  credits: 'Pular créditos',
};

let languageNames: Intl.DisplayNames | null | undefined;

export function markerLabel(type: string): string {
  return MARKER_LABELS[type] ?? 'Marcador';
}

export function markerTone(type: string): 'opening' | 'ending' | 'credits' | 'next' | 'other' {
  if (type === 'opening') return 'opening';
  if (type === 'ending') return 'ending';
  if (type === 'credits') return 'credits';
  if (type === 'next_episode') return 'next';
  return 'other';
}

export type AudioInitPts = { baseTime: number; timescale: number; trackId: number };

const MAX_AUDIO_OFFSET_SECONDS = 10;

export function isSafariBrowser(): boolean {
  return typeof navigator !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

/**
 * Publications record how far the video track starts after the audio track.
 * hls.js normalises both renditions to the first fragment timestamp, which
 * drops that offset and makes speech arrive late. Reading the declared offset
 * lets the player move the audio rendition back onto the video timeline.
 */
export function playbackAudioOffsetSeconds(delivery?: Record<string, unknown>): number {
  const offsets = delivery?.av_offset_seconds;
  const first = Array.isArray(offsets) ? offsets[0] : offsets;
  const value = Number(first);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_AUDIO_OFFSET_SECONDS, Math.min(MAX_AUDIO_OFFSET_SECONDS, value));
}

/**
 * hls.js derives the audio SourceBuffer timestampOffset as
 * `-baseTime / timescale`. A positive baseTime therefore moves audio earlier,
 * compensating a video track that starts later than the audio.
 */
export function audioInitPtsForOffset(offsetSeconds: number, timescale: number, trackId: number): AudioInitPts {
  const scale = Number.isFinite(timescale) && timescale > 0 ? timescale : 90_000;
  const offset = Number.isFinite(offsetSeconds)
    ? Math.max(-MAX_AUDIO_OFFSET_SECONDS, Math.min(MAX_AUDIO_OFFSET_SECONDS, offsetSeconds))
    : 0;
  return { baseTime: Math.round(offset * scale), timescale: scale, trackId };
}

/**
 * hls.js copies the main-rendition initPTS into the audio controller. Replace
 * only the audio entry with the declared A/V offset so the audio SourceBuffer
 * is shifted back onto the video timeline. Returns true when it was replaced.
 */
export function applyAudioInitPts(
  hls: unknown,
  data: { id: string; frag: { cc: number }; timescale: number; trackId: number },
  offsetSeconds: number,
): boolean {
  if (data.id !== 'main') return false;
  const controller = (hls as { audioStreamController?: { initPTS?: AudioInitPts[] } } | null | undefined)?.audioStreamController;
  const offsets = controller?.initPTS;
  if (!offsets) return false;
  offsets[data.frag.cc] = audioInitPtsForOffset(offsetSeconds, data.timescale, data.trackId);
  return true;
}

export function skipLabel(type: string): string | null {
  return SKIP_LABELS[type] ?? null;
}

export function findActiveMarker(markers: Marker[], currentTimeMs: number): Marker | undefined {
  return markers.find((marker) =>
    Number.isFinite(marker.start_ms)
    && Number.isFinite(marker.end_ms)
    && marker.end_ms > marker.start_ms
    && currentTimeMs >= marker.start_ms
    && currentTimeMs < marker.end_ms,
  );
}

export function splitPlaybackTitle(title: string): { workTitle: string; episodeTitle: string | null } {
  const separator = ' — ';
  const index = title.indexOf(separator);
  if (index < 0) return { workTitle: title, episodeTitle: null };
  return {
    workTitle: title.slice(0, index),
    episodeTitle: title.slice(index + separator.length) || null,
  };
}

export function languageName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const tag = value.trim();
  try {
    if (languageNames === undefined) {
      languageNames = typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['pt-BR'], { type: 'language' })
        : null;
    }
    const name = languageNames?.of(tag) || tag;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }
}

const TECHNICAL_TRACK_NAME = /^(audio|track|faixa|stream|rendition|default|dub|legend[a]?)[\s_.-]*\d*$/i;
const TECHNICAL_SUBTITLE_TITLE = /^(sub|subs|subtitle|subtitles|legenda|legendas|caption|captions|faixa)[\s_.-]*\d*$/i;
const SUBTITLE_FILE_EXTENSION = /\.(vtt|srt|ass|ssa)$/i;

function usableTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) return '';
  if (TECHNICAL_SUBTITLE_TITLE.test(title) || SUBTITLE_FILE_EXTENSION.test(title)) return '';
  return title;
}

export function trackLabel(name: unknown, language: unknown, fallback: string): string {
  const title = typeof name === 'string' ? name.trim() : '';
  const languageLabel = languageName(language);
  if (title && !TECHNICAL_TRACK_NAME.test(title) && title.toLowerCase() !== String(language ?? '').trim().toLowerCase()) {
    return title;
  }
  return languageLabel || title || fallback;
}

export function dedupeSubtitleTracks(tracks: PlaybackTrack[]): PlaybackTrack[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (!track.url) return false;
    if (seen.has(track.url)) return false;
    seen.add(track.url);
    return true;
  });
}

export function subtitleTrackLabel(track: PlaybackTrack, index: number): string {
  const metadata = track.metadata ?? {};
  return usableTitle(metadata.title) || languageName(metadata.language) || `Legenda ${index + 1}`;
}

export function shouldIgnorePlayerShortcut(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(target.tagName)) return true;
  return Boolean(target.closest('[role="slider"], [role="dialog"], [role="button"], [role="tab"]'));
}
