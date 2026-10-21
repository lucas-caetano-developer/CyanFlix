import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { useProfileStore } from '../stores/useProfileStore';

export function WatchPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.profileId);

  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);
  const [fallbackStatus, setFallbackStatus] = useState<"idle" | "requesting" | "transcoding" | "using" | "failed">("idle");
  const [forceOriginal, setForceOriginal] = useState(false);
  const fallbackRequestRef = useRef(false);
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState<"small" | "medium" | "large">("medium");

  const { data, isLoading, error } = useQuery({
    queryKey: ['playback', profileId, id],
    queryFn: () => api.getPlayback(id!),
    enabled: Boolean(profileId && id),
  });
  const progress = useQuery({
    queryKey: ['progress', profileId, id],
    queryFn: () => api.getProgress(profileId!, id!),
    enabled: Boolean(profileId && id),
  });
  const preferences = useQuery({
    queryKey: ['profile-preferences', profileId],
    queryFn: () => api.getProfilePreferences(profileId!),
    enabled: Boolean(profileId),
  });
  const lastSavedSecondRef = useRef(0);
  const latestProgressRef = useRef({ positionSeconds: 0, durationSeconds: 0 });
  const hasPlaybackSnapshotRef = useRef(false);

  useEffect(() => {
    setFallbackUrl(null);
    setPollingJobId(null);
    setFallbackStatus("idle");
    setForceOriginal(false);
    fallbackRequestRef.current = false;
    hasPlaybackSnapshotRef.current = false;
  }, [id]);

  const persistProgress = useCallback((force = false) => {
    if (!profileId || !id || !hasPlaybackSnapshotRef.current) return;
    const positionSeconds = Math.max(0, Math.floor(latestProgressRef.current.positionSeconds));
    const durationSeconds = Math.max(0, Math.floor(latestProgressRef.current.durationSeconds));
    if (!force && Math.abs(positionSeconds - lastSavedSecondRef.current) < 15) return;
    lastSavedSecondRef.current = positionSeconds;
    void api.updateProgress(profileId, id, { positionSeconds, durationSeconds }, force);
  }, [profileId, id]);

  useEffect(() => {
    if (!progress.data) return;
    const positionSeconds = progress.data.completed ? 0 : progress.data.positionSeconds;
    lastSavedSecondRef.current = positionSeconds;
    latestProgressRef.current = {
      positionSeconds,
      durationSeconds: progress.data.durationSeconds ?? 0,
    };
  }, [progress.data]);

  useEffect(() => {
    if (!preferences.data) return;
    setAutoPlayNextEpisode(preferences.data.autoplayNextEpisode);
    setSubtitleStyle(preferences.data.subtitleStyle);
  }, [preferences.data]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistProgress(true);
    };
    window.addEventListener('pagehide', flushWhenHidden);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flushWhenHidden);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      persistProgress(true);
    };
  }, [persistProgress]);

  // Polling for fallback job if needed
  useEffect(() => {
    let interval: number;
    if (pollingJobId) {
      interval = window.setInterval(async () => {
        try {
          const job = await api.getFallbackJob(pollingJobId);
          if ((job.status === 'completed' || job.status === 'finished') && job.url) {
            setFallbackUrl(job.url);
            setPollingJobId(null);
            setFallbackStatus("using");
          } else if (job.status === 'failed') {
            setPollingJobId(null);
            fallbackRequestRef.current = false;
            setFallbackStatus("failed");
            console.error('Fallback job failed');
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [pollingJobId]);

  const requestFallback = useCallback(async () => {
    if (!id || fallbackRequestRef.current) return;
    fallbackRequestRef.current = true;
    setFallbackStatus("requesting");
    try {
      const job = await api.requestFallback(id);
      if ((job.status === 'completed' || job.status === 'finished') && job.url) {
        setFallbackUrl(job.url);
        setPollingJobId(null);
        setFallbackStatus("using");
      } else if (job.jobId) {
        setPollingJobId(job.jobId);
        setFallbackStatus("transcoding");
      }
    } catch (e) {
      fallbackRequestRef.current = false;
      setFallbackStatus("failed");
      console.error(e);
    }
  }, [id]);

  const compatibilityFallbackRequired = Boolean(data && !forceOriginal && requiresCompatibilityFallback(data.delivery));

  useEffect(() => {
    if (compatibilityFallbackRequired && data?.fallback?.available && !fallbackUrl && !data.fallback.url) void requestFallback();
  }, [compatibilityFallbackRequired, data?.fallback?.available, data?.fallback?.url, fallbackUrl, requestFallback]);

  if (isLoading || (profileId && (progress.isLoading || preferences.isLoading))) {
    return (
      <div className="watch-state" aria-busy="true">
        <div className="watch-state__card">
          <span className="watch-state__spinner" aria-hidden="true" />
          <div className="watch-state__loading" role="status">Preparando reprodução…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="watch-state watch-state--error">
        <div className="watch-state__card" role="alert">
          <div className="watch-state__error">Não foi possível carregar o vídeo.</div>
          <p className="watch-state__hint">Volte ao catálogo e tente novamente.</p>
          <button className="btn btn--primary" onClick={() => navigate(-1)}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const handleNextEpisode = () => {
    if (data.nextEpisode) {
      navigate(`/watch/episode/${data.nextEpisode.id}`);
    }
  };

  const src = fallbackUrl || data.fallback?.url || data.originalUrl;

  if (compatibilityFallbackRequired && !fallbackUrl && !data.fallback?.url) {
    return (
      <div className="watch-fallback">
        <div className="watch-fallback__spinner" />
        <h1>Preparando reprodução compatível</h1>
        <p>{fallbackStatus === "failed" ? "Não foi possível preparar o vídeo H.264." : "Este dispositivo não anunciou suporte ao HEVC original. O CyanFlix está preparando qualidades adaptativas temporárias em H.264."}</p>
        {fallbackStatus === "failed" && <div className="watch-fallback__actions">
          <button className="btn btn--primary" onClick={() => { fallbackRequestRef.current = false; void requestFallback(); }}>Tentar novamente</button>
          <button className="btn btn--secondary" onClick={() => setForceOriginal(true)}>Tentar mídia original</button>
        </div>}
        <button className="watch-fallback__back" onClick={() => navigate(-1)}>Voltar</button>
      </div>
    );
  }

  return (
    <div className="watch-page">
      <VideoPlayer
        key={id}
        src={src}
        title={data.title}
        itemType={data.itemType}
        seasonNumber={data.seasonNumber}
        markers={data.markers}
        subtitles={data.subtitles}
        nextEpisode={data.nextEpisode}
        episodes={data.episodes}
        currentEpisodeId={data.itemId}
        onEpisodeChange={(episodeId) => navigate(`/watch/episode/${episodeId}`)}
        onBack={() => navigate(-1)}
        onNextEpisode={handleNextEpisode}
        startTime={progress.data?.completed ? 0 : progress.data?.positionSeconds}
        onTimeUpdate={(positionSeconds, durationSeconds) => {
          hasPlaybackSnapshotRef.current = true;
          latestProgressRef.current = { positionSeconds, durationSeconds };
          persistProgress();
        }}
        onProgressCommit={(positionSeconds, durationSeconds) => {
          hasPlaybackSnapshotRef.current = true;
          latestProgressRef.current = { positionSeconds, durationSeconds };
          persistProgress(true);
        }}
        onPlaybackError={fallbackUrl || pollingJobId ? undefined : requestFallback}
        autoPlayNextEpisode={autoPlayNextEpisode}
        subtitleStyle={subtitleStyle}
        onSubtitleStyleChange={(style) => {
          setSubtitleStyle(style);
          if (profileId) void api.updateProfilePreferences(profileId, { subtitleStyle: style, autoplayNextEpisode: autoPlayNextEpisode });
        }}
        onAutoPlayNextEpisodeChange={(enabled) => {
          setAutoPlayNextEpisode(enabled);
          if (profileId) void api.updateProfilePreferences(profileId, { autoplayNextEpisode: enabled, subtitleStyle });
        }}
      />
      {/* Optionally render fallback request button here if src fails or data.fallback.available */}
      {!fallbackUrl && !data.fallback?.url && data.fallback?.available && !pollingJobId && fallbackStatus !== "requesting" && (
        <button className="watch-page__fallback-action" onClick={requestFallback}>
          Usar modo adaptativo H.264
        </button>
      )}
      {(pollingJobId || fallbackStatus === "requesting") && (
        <div className="watch-page__fallback-status" role="status">
          {fallbackStatus === "requesting" ? "Solicitando fallback…" : "Preparando H.264 adaptativo…"}
        </div>
      )}
    </div>
  );
}

function requiresCompatibilityFallback(delivery: Record<string, unknown> | undefined): boolean {
  if (!delivery) return false;
  const declared = [
    ...(Array.isArray(delivery.video_codecs) ? delivery.video_codecs : []),
    delivery.video_codec,
    delivery.codec,
  ].filter((value): value is string => typeof value === "string").map((value) => value.toLowerCase());
  if (!declared.some((codec) => codec.includes("hevc") || codec.includes("h265") || codec.includes("hvc1") || codec.includes("hev1"))) return false;

  const video = document.createElement("video");
  if (video.canPlayType("application/vnd.apple.mpegurl")) return false;
  if (typeof MediaSource === "undefined") return true;
  return ![
    'video/mp4; codecs="hvc1.1.6.L120.B0"',
    'video/mp4; codecs="hev1.1.6.L120.B0"',
    'video/mp4; codecs="hvc1"',
  ].some((codec) => MediaSource.isTypeSupported(codec));
}
