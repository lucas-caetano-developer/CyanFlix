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

export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  audioLang: string | null;
  subtitleLang: string | null;
  autoSkipOpening: boolean;
  saveVolume: (value: number) => void;
  saveMuted: (value: boolean) => void;
  saveAudioLang: (lang: string) => void;
  saveSubtitleLang: (lang: string | 'off') => void;
  saveAutoSkipOpening: (enabled: boolean) => void;
}

export function usePlayerPreferences(): PlayerPreferences {
  const profileId = useProfileStore((state) => state.profileId);

  const [volume, setVolume] = useState<number>(() => loadVolume());
  const [muted, setMuted] = useState<boolean>(() => loadMuted());
  const [audioLang, setAudioLang] = useState<string | null>(null);
  const [subtitleLang, setSubtitleLang] = useState<string | null>(null);
  const [autoSkipOpening, setAutoSkipOpening] = useState<boolean>(false);

  const volumeTimerRef = useRef<number>();

  useEffect(() => {
    if (!profileId) return;
    setAudioLang(safeGet(`cyanflix.player.${profileId}.audioLang`));
    setSubtitleLang(safeGet(`cyanflix.player.${profileId}.subtitleLang`));
    setAutoSkipOpening(safeGet(`cyanflix.player.${profileId}.autoSkipOpening`) === 'true');
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

  return { volume, muted, audioLang, subtitleLang, autoSkipOpening, saveVolume, saveMuted, saveAudioLang, saveSubtitleLang, saveAutoSkipOpening };
}
