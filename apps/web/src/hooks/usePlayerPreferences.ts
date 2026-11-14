import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfileStore } from '../stores/useProfileStore';

const VOLUME_KEY = 'cyanflix.player.volume';
const MUTED_KEY = 'cyanflix.player.muted';

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function loadVolume(): number {
  const raw = safeGet(VOLUME_KEY);
  if (raw === null) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
}

function loadMuted(): boolean {
  return safeGet(MUTED_KEY) === 'true';
}

function loadPref<T>(profileId: string | null | undefined, key: string, fallback: T, parser?: (raw: string) => T): T {
  if (!profileId) return fallback;
  const raw = safeGet(`cyanflix.player.${profileId}.${key}`);
  if (raw === null) return fallback;
  return parser ? parser(raw) : (raw as unknown as T);
}

export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  audioLang: string | null;
  subtitleLang: string | null;
  autoSkipOpening: boolean;
  autoSkipEnding: boolean;
  playbackRate: number;
  quality: number;
  saveVolume: (value: number) => void;
  saveMuted: (value: boolean) => void;
  saveAudioLang: (lang: string) => void;
  saveSubtitleLang: (lang: string | 'off') => void;
  saveAutoSkipOpening: (enabled: boolean) => void;
  saveAutoSkipEnding: (enabled: boolean) => void;
  savePlaybackRate: (rate: number) => void;
  saveQuality: (quality: number) => void;
}

export function usePlayerPreferences(): PlayerPreferences {
  const profileId = useProfileStore((state) => state.profileId);

  const [volume, setVolume] = useState<number>(() => loadVolume());
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const [audioLang, setAudioLang] = useState<string | null>(() => loadPref(profileId, 'audioLang', null));
  const [subtitleLang, setSubtitleLang] = useState<string | null>(() => loadPref(profileId, 'subtitleLang', null));
  const [autoSkipOpening, setAutoSkipOpening] = useState<boolean>(() =>
    loadPref(profileId, 'autoSkipOpening', false, (v) => v === 'true')
  );
  const [autoSkipEnding, setAutoSkipEnding] = useState<boolean>(() =>
    loadPref(profileId, 'autoSkipEnding', false, (v) => v === 'true')
  );
  const [playbackRate, setPlaybackRate] = useState<number>(() =>
    loadPref(profileId, 'playbackRate', 1, (v) => Number(v) || 1)
  );
  const [quality, setQuality] = useState<number>(() =>
    loadPref(profileId, 'quality', -1, (v) => Number(v) ?? -1)
  );

  const volumeTimerRef = useRef<number>();

  useEffect(() => {
    if (!profileId) return;
    setAudioLang(loadPref(profileId, 'audioLang', null));
    setSubtitleLang(loadPref(profileId, 'subtitleLang', null));
    setAutoSkipOpening(loadPref(profileId, 'autoSkipOpening', false, (v) => v === 'true'));
    setAutoSkipEnding(loadPref(profileId, 'autoSkipEnding', false, (v) => v === 'true'));
    setPlaybackRate(loadPref(profileId, 'playbackRate', 1, (v) => Number(v) || 1));
    setQuality(loadPref(profileId, 'quality', -1, (v) => Number(v) ?? -1));
  }, [profileId]);

  const saveVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolume(clamped);
    if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = window.setTimeout(() => safeSet(VOLUME_KEY, String(clamped)), 200);
  }, []);

  const saveMuted = useCallback((value: boolean) => {
    setMuted(value);
    safeSet(MUTED_KEY, String(value));
  }, []);

  const saveAudioLang = useCallback((lang: string) => {
    setAudioLang(lang);
    if (!profileId) return;
    safeSet(`cyanflix.player.${profileId}.audioLang`, lang);
  }, [profileId]);

  const saveSubtitleLang = useCallback((lang: string | 'off') => {
    setSubtitleLang(lang === 'off' ? 'off' : lang);
    if (!profileId) return;
    safeSet(`cyanflix.player.${profileId}.subtitleLang`, lang);
  }, [profileId]);

  const saveAutoSkipOpening = useCallback((enabled: boolean) => {
    setAutoSkipOpening(enabled);
    if (!profileId) return;
    safeSet(`cyanflix.player.${profileId}.autoSkipOpening`, String(enabled));
  }, [profileId]);

  const saveAutoSkipEnding = useCallback((enabled: boolean) => {
    setAutoSkipEnding(enabled);
    if (!profileId) return;
    safeSet(`cyanflix.player.${profileId}.autoSkipEnding`, String(enabled));
  }, [profileId]);

  const savePlaybackRate = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (!profileId) return;
    safeSet(`cyanflix.player.${profileId}.playbackRate`, String(rate));
  }, [profileId]);

  const saveQuality = useCallback((q: number) => {
    setQuality(q);
    if (!profileId) return;
    safeSet(`cyanflix.player.${profileId}.quality`, String(q));
  }, [profileId]);

  return {
    volume,
    muted,
    audioLang,
    subtitleLang,
    autoSkipOpening,
    autoSkipEnding,
    playbackRate,
    quality,
    saveVolume,
    saveMuted,
    saveAudioLang,
    saveSubtitleLang,
    saveAutoSkipOpening,
    saveAutoSkipEnding,
    savePlaybackRate,
    saveQuality,
  };
}
