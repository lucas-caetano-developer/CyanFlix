import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { PlayerControls } from './PlayerControls';
import { PlayerOverlay } from './PlayerOverlay';
import { Icon, type IconName } from '../ui/Icon';
import { applyAudioInitPts, dedupeSubtitleTracks, isSafariBrowser, shouldIgnorePlayerShortcut, splitPlaybackTitle, subtitleTrackLabel, trackLabel } from '../../lib/player';
import type { Marker } from '../../lib/types';

interface VideoPlayerProps {
  src: string;
  title: string;
  itemType?: 'movie' | 'episode';
  seasonNumber?: number | null;
  markers?: Marker[];
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  onBack: () => void;
  onNextEpisode?: () => void;
  startTime?: number; // resume position in seconds
  audioOffsetSeconds?: number; // declared A/V offset used to realign the audio rendition
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onProgressCommit?: (currentTime: number, duration: number) => void;
  subtitles?: Array<{ url?: string | null; metadata?: Record<string, unknown> }>;
  onPlaybackError?: () => void;
  autoPlayNextEpisode?: boolean;
  subtitleStyle?: "small" | "medium" | "large";
  onSubtitleStyleChange?: (style: "small" | "medium" | "large") => void;
  onAutoPlayNextEpisodeChange?: (enabled: boolean) => void;
  episodes?: Array<{ id: string; number: number; title?: string | null }>;
  currentEpisodeId?: string;
  onEpisodeChange?: (episodeId: string) => void;
}

type Feedback = { id: number; text: string; label: string; icon?: IconName };
type LoadState = 'loading' | 'ready' | 'error';
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null };

const CONTROLS_HIDE_DELAY = 3000;
const FEEDBACK_DURATION = 900;

function isInteractiveTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('button, a[href], input, select, textarea, [role="slider"], [role="button"], [role="tab"]'));
}

export function VideoPlayer({
  src,
  title,
  itemType,
  seasonNumber,
  markers = [],
  nextEpisode,
  onBack,
  onNextEpisode,
  startTime,
  audioOffsetSeconds = 0,
  onTimeUpdate,
  onProgressCommit,
  subtitles = [],
  onPlaybackError,
  autoPlayNextEpisode = true,
  subtitleStyle = "medium",
  onSubtitleStyleChange,
  onAutoPlayNextEpisodeChange,
  episodes = [],
  currentEpisodeId,
  onEpisodeChange,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<number>();
  const feedbackTimeoutRef = useRef<number>();
  const feedbackCounterRef = useRef(0);
  const lastPointerActivityRef = useRef(0);
  const fallbackRequestedRef = useRef(false);
  const resumeTimeRef = useRef(0);
  const mountedRef = useRef(true);
  const audioOffsetSecondsRef = useRef(audioOffsetSeconds);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [canPip, setCanPip] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsInteraction, setControlsInteraction] = useState(false);
  const [focusInteractive, setFocusInteractive] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(-1);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const availableSubtitles = useMemo(() => dedupeSubtitleTracks(subtitles), [subtitles]);
  const subtitleOptions = useMemo(
    () => availableSubtitles.map((track, index) => ({ id: index, label: subtitleTrackLabel(track, index) })),
    [availableSubtitles],
  );
  const subtitlesActive = availableSubtitles.length > 0 && selectedSubtitleTrack >= 0;
  const currentEpisode = episodes.find((episode) => episode.id === currentEpisodeId);
  const activeElement = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
  const focusWithinInteractive = focusInteractive
    && Boolean(containerRef.current && activeElement && containerRef.current.contains(activeElement) && isInteractiveTarget(activeElement));
  const parsedTitle = itemType === 'episode'
    ? splitPlaybackTitle(title)
    : { workTitle: title, episodeTitle: null };
  const episodeTitle = currentEpisode?.title || parsedTitle.episodeTitle;
  const contextParts = [
    seasonNumber != null ? `T${seasonNumber}` : null,
    currentEpisode?.number != null ? `E${currentEpisode.number}` : null,
    episodeTitle,
  ].filter(Boolean);
  const contextLabel = contextParts.join(' · ');
  const interactionActive = controlsInteraction || focusWithinInteractive;
  const controlsLocked = interactionActive || loadState !== 'ready' || playbackError;
  const isNearEnd = duration > 0 && currentTime > 0 && duration - currentTime <= 30;
  const countdownReady = duration > 0 && currentTime > 0 && duration - currentTime <= 10;

  const playNextEpisode = useCallback(() => onNextEpisode?.(), [onNextEpisode]);
  const handleControlsInteraction = useCallback((active: boolean) => setControlsInteraction(active), []);

  const showFeedback = useCallback((text: string, label: string, icon?: IconName) => {
    if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
    feedbackCounterRef.current += 1;
    setFeedback({ id: feedbackCounterRef.current, text, label, icon });
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedback(null), FEEDBACK_DURATION);
  }, []);

  const showControls = useCallback(() => {
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    setControlsVisible(true);
    if (playing && !controlsLocked) {
      controlsTimeoutRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    }
  }, [controlsLocked, playing]);

  useEffect(() => {
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    if (!playing || controlsLocked) {
      setControlsVisible(true);
      return;
    }
    controlsTimeoutRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY);
    return () => {
      if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    };
  }, [controlsLocked, playing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
      if (feedbackTimeoutRef.current) window.clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    audioOffsetSecondsRef.current = audioOffsetSeconds;
  }, [audioOffsetSeconds]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const limit = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const next = Math.max(0, limit == null ? time : Math.min(limit, time));
    video.currentTime = next;
    setCurrentTime(next);
    setEnded(false);
    resumeTimeRef.current = next;
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    seekTo(video.currentTime + delta);
    showFeedback(
      `${delta > 0 ? '+' : '−'}${Math.abs(delta)}s`,
      delta > 0 ? `Avançado ${Math.abs(delta)} segundos` : `Retrocedido ${Math.abs(delta)} segundos`,
    );
  }, [seekTo, showFeedback]);

  const handleVolumeChange = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolume(next);
    if (next > 0 && muted) setMuted(false);
  }, [muted]);

  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      if (volume === 0) setVolume(1);
      setMuted(false);
      showFeedback('Som ativado', 'Som ativado', 'volume');
    } else {
      setMuted(true);
      showFeedback('Mudo', 'Som silenciado', 'muted');
    }
  }, [muted, showFeedback, volume]);

  const adjustVolume = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(1, volume + delta));
    setVolume(next);
    setMuted(false);
    showFeedback(
      `${Math.round(next * 100)}%`,
      next === 0 ? 'Som silenciado' : `Volume ${Math.round(next * 100)} por cento`,
      next === 0 ? 'muted' : 'volume',
    );
  }, [showFeedback, volume]);

  const togglePlayback = useCallback((withFeedback = false) => {
    const video = videoRef.current;
    if (!video || loadState !== 'ready') return;
    if (video.paused) {
      void video.play().catch(() => undefined);
      if (withFeedback) showFeedback('', 'Reprodução iniciada', 'play');
    } else {
      video.pause();
      if (withFeedback) showFeedback('', 'Reprodução pausada', 'pause');
    }
  }, [loadState, showFeedback]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      const container = containerRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
        return;
      }
      const video = videoRef.current as WebkitVideo | null;
      video?.webkitEnterFullscreen?.();
    } catch {
      // O navegador pode negar a solicitação; o botão continua refletindo o estado real.
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (typeof video.requestPictureInPicture === 'function') await video.requestPictureInPicture();
    } catch {
      // Picture in Picture pode ser bloqueado pelo navegador.
    }
  }, []);

  const handleVideoClick = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement
      && activeElement !== videoRef.current
      && containerRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
    togglePlayback(true);
  };

  useEffect(() => {
    if (!src || !videoRef.current) return;
    const video = videoRef.current;
    fallbackRequestedRef.current = false;
    setAudioTracks([]);
    setSelectedAudioTrack(-1);
    setQualityLevels([]);
    setSelectedQuality(-1);
    setLoadState('loading');
    setPlaybackError(false);
    setBuffering(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setEnded(false);
    setControlsVisible(true);
    const resumeAt = Math.max(resumeTimeRef.current, startTime ?? 0);

    let hls: Hls | undefined;

    // Chromium also answers "maybe" for native HLS, but native playback gives
    // no control over the audio SourceBuffer timeline. Prefer hls.js there so
    // the packager's A/V offset can be compensated; Safari keeps native HLS.
    const useHlsJs = Hls.isSupported() && !isSafariBrowser();
    const canPlayNativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));

    if (useHlsJs) {
      const hlsInstance = new Hls({ enableWorker: true });
      hls = hlsInstance;
      hlsRef.current = hlsInstance;
      // Publications record how far the video track starts after the audio.
      // hls.js loses that offset when it aligns both renditions to the first
      // fragment timestamp, so speech arrives late. Replace the audio initPTS
      // with the declared offset: hls.js turns it into a negative SourceBuffer
      // timestampOffset and moves the audio back onto the video timeline.
      hlsInstance.on(Hls.Events.INIT_PTS_FOUND, (_event, data) => {
        applyAudioInitPts(hlsInstance, data, audioOffsetSecondsRef.current);
      });
      const syncAudioTracks = () => {
        const seen = new Set<string>();
        const tracks = hlsInstance.audioTracks.flatMap((track, index) => {
          const label = trackLabel(track.name, track.lang, `Faixa ${index + 1}`);
          const key = `${track.lang ?? ''}:${label}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [{ id: index, label }];
        });
        setAudioTracks(tracks);
        const nextAudioTrack = hlsInstance.audioTrack >= 0 ? hlsInstance.audioTrack : tracks[0]?.id ?? -1;
        setSelectedAudioTrack(nextAudioTrack);
      };
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        syncAudioTracks();
        setQualityLevels(hlsInstance.levels.map((level, index) => ({
          id: index,
          label: level.height ? `${level.height}p${level.bitrate ? ` · ${(level.bitrate / 1_000_000).toFixed(1)} Mbps` : ''}` : `Nível ${index + 1}`,
        })));
        if (resumeAt) video.currentTime = resumeAt;
        void video.play().catch(() => undefined);
      });
      hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncAudioTracks());
      hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => setSelectedAudioTrack(data.id));
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setBuffering(false);
        setLoadState('error');
        setPlaybackError(true);
        if (!fallbackRequestedRef.current) {
          fallbackRequestedRef.current = true;
          onPlaybackError?.();
        }
      });
    } else if (canPlayNativeHls) {
      video.src = src;
      if (resumeAt) video.currentTime = resumeAt;
      void video.play().catch(() => undefined);
    } else {
      setLoadState('error');
      setPlaybackError(true);
      if (!fallbackRequestedRef.current) {
        fallbackRequestedRef.current = true;
        onPlaybackError?.();
      }
    }

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [onPlaybackError, src, startTime]);

  useEffect(() => {
    const defaultIndex = availableSubtitles.findIndex((track) => track.metadata?.default === true);
    setSelectedSubtitleTrack(defaultIndex);
  }, [availableSubtitles]);

  useEffect(() => {
    const textTracks = videoRef.current?.textTracks;
    if (!textTracks) return;
    for (let index = 0; index < textTracks.length; index += 1) {
      textTracks[index].mode = index === selectedSubtitleTrack ? 'showing' : 'disabled';
    }
  }, [availableSubtitles, selectedSubtitleTrack]);

  useEffect(() => {
    const video = videoRef.current;
    setCanFullscreen(Boolean(
      document.fullscreenEnabled !== false
      && (containerRef.current?.requestFullscreen || (video as WebkitVideo | null)?.webkitEnterFullscreen),
    ));
    setCanPip(Boolean(document.pictureInPictureEnabled && video && typeof video.requestPictureInPicture === 'function'));
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const webkitDocument = document as FullscreenDocument;
      setFullscreen(Boolean(document.fullscreenElement || webkitDocument.webkitFullscreenElement));
    };
    const video = videoRef.current;
    const handleWebkitBegin = () => setFullscreen(true);
    const handleWebkitEnd = () => setFullscreen(false);
    const handlePipEnter = () => setPipActive(true);
    const handlePipLeave = () => setPipActive(false);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    video?.addEventListener('webkitbeginfullscreen', handleWebkitBegin);
    video?.addEventListener('webkitendfullscreen', handleWebkitEnd);
    video?.addEventListener('enterpictureinpicture', handlePipEnter);
    video?.addEventListener('leavepictureinpicture', handlePipLeave);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      video?.removeEventListener('webkitbeginfullscreen', handleWebkitBegin);
      video?.removeEventListener('webkitendfullscreen', handleWebkitEnd);
      video?.removeEventListener('enterpictureinpicture', handlePipEnter);
      video?.removeEventListener('leavepictureinpicture', handlePipLeave);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!videoRef.current || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      // Interactive controls own Space, Enter and arrow keys. Escape still
      // reaches the player when a control has focus so the viewer can leave.
      if (key !== 'escape' && shouldIgnorePlayerShortcut(event.target)) return;
      const isSeekKey = key === 'arrowleft' || key === 'arrowright';
      const isVolumeKey = key === 'arrowup' || key === 'arrowdown';
      const isHandled = isSeekKey || isVolumeKey || key === ' ' || key === 'k' || key === 'm' || key === 'f' || key === 'escape';
      if (!isHandled) return;
      if (event.repeat && !isSeekKey && !isVolumeKey) {
        event.preventDefault();
        return;
      }
      if (key === 'escape') {
        if (document.fullscreenElement) {
          event.preventDefault();
          void document.exitFullscreen().catch(() => undefined);
        } else {
          event.preventDefault();
          onBack();
        }
        return;
      }
      event.preventDefault();
      showControls();
      switch (key) {
        case ' ':
        case 'k':
          togglePlayback(true);
          break;
        case 'arrowleft':
          seekBy(-10);
          break;
        case 'arrowright':
          seekBy(10);
          break;
        case 'arrowup':
          adjustVolume(0.1);
          break;
        case 'arrowdown':
          adjustVolume(-0.1);
          break;
        case 'm':
          toggleMute();
          break;
        case 'f':
          void toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [adjustVolume, onBack, seekBy, showControls, toggleFullscreen, toggleMute, togglePlayback]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);
    if (time < (videoRef.current.duration || 0) - 1) setEnded(false);
    resumeTimeRef.current = time;
    onTimeUpdate?.(time, videoRef.current.duration || 0);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
    setEnded(false);
    if (mountedRef.current) setLoadState('ready');
    showControls();
  };

  const handleProgress = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBuffered(video.duration > 0 ? bufferedEnd / video.duration : 0);
    }
  };

  const handleMediaError = () => {
    if (!mountedRef.current) return;
    const video = videoRef.current;
    if (video && !video.currentSrc && !video.getAttribute('src')) return;
    setLoadState('error');
    setPlaybackError(true);
    setBuffering(false);
    if (!fallbackRequestedRef.current) {
      fallbackRequestedRef.current = true;
      onPlaybackError?.();
    }
  };

  const handlePointerActivity = () => {
    const now = Date.now();
    if (now - lastPointerActivityRef.current < 100 && controlsVisible) return;
    lastPointerActivityRef.current = now;
    showControls();
  };

  return (
    <div
      className={`player ${controlsVisible ? '' : 'player--controls-hidden'}${settingsOpen ? ' player--settings-open' : ''}${subtitlesActive ? ' player--subtitles-on' : ''}`}
      ref={containerRef}
      role="region"
      aria-label={`Reprodutor: ${parsedTitle.workTitle}`}
      data-spatial-scope="player"
      data-spatial-player="true"
      onPointerMove={handlePointerActivity}
      onMouseLeave={() => {
        if (playing && !controlsLocked) {
          if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
          setControlsVisible(false);
        }
      }}
      onFocusCapture={(event) => setFocusInteractive(isInteractiveTarget(event.target as HTMLElement))}
      onBlurCapture={(event) => setFocusInteractive(isInteractiveTarget(event.relatedTarget as HTMLElement | null))}
    >
      <video
        ref={videoRef}
        className={`player__video player__video--subtitles-${subtitleStyle}`}
        onClick={handleVideoClick}
        onDoubleClick={() => void toggleFullscreen()}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
        }}
        onPause={() => {
          setPlaying(false);
          setBuffering(false);
          if (videoRef.current) onProgressCommit?.(videoRef.current.currentTime, videoRef.current.duration || 0);
        }}
        onPlaying={() => {
          setPlaying(true);
          setBuffering(false);
          setEnded(false);
        }}
        onWaiting={() => {
          if (videoRef.current && !videoRef.current.paused) setBuffering(true);
        }}
        onCanPlay={() => {
          setBuffering(false);
          if (mountedRef.current) setLoadState((state) => state === 'error' ? state : 'ready');
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onSeeked={() => {
          setBuffering(false);
          if (videoRef.current) onProgressCommit?.(videoRef.current.currentTime, videoRef.current.duration || 0);
        }}
        onEnded={() => {
          setPlaying(false);
          setBuffering(false);
          setEnded(true);
          setControlsVisible(true);
          if (videoRef.current) onProgressCommit?.(videoRef.current.duration || videoRef.current.currentTime, videoRef.current.duration || 0);
        }}
        onError={handleMediaError}
        playsInline
      >
        {availableSubtitles.map((track, index) => {
          const language = typeof track.metadata?.language === 'string' ? track.metadata.language : 'und';
          const label = subtitleOptions[index]?.label ?? language;
          return <track key={`${track.url}-${index}`} kind="subtitles" src={track.url!}
                        srcLang={language} label={label} />;
        })}
      </video>

      <div className={`player__top-bar ${controlsVisible ? '' : 'player__top-bar--hidden'}`}>
        <button className="player__back" onClick={onBack} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <div className="player__title-block">
          <h1 className="player__title-text" title={parsedTitle.workTitle}>{parsedTitle.workTitle}</h1>
          {contextLabel && <p className="player__title-context">{contextLabel}</p>}
        </div>
      </div>

      {loadState === 'loading' && !playbackError && (
        <div className="player__loading" role="status">
          <span className="player__spinner" aria-hidden="true" />
          <p>Preparando reprodução…</p>
        </div>
      )}

      {buffering && loadState === 'ready' && !playbackError && (
        <div className="player__buffering" role="status">
          <span className="player__spinner" aria-hidden="true" />
          <span className="sr-only">Carregando vídeo</span>
        </div>
      )}

      {playbackError && (
        <div className="player__error" role="alert">
          <p className="player__error-title">Não foi possível reproduzir este vídeo.</p>
          <p className="player__error-text">Volte e tente novamente.</p>
          <button className="player__error-action" onClick={onBack}>Voltar</button>
        </div>
      )}

      {loadState === 'ready' && !playbackError && (
        <>
          <PlayerOverlay
            markers={markers}
            currentTimeMs={currentTime * 1000}
            nextEpisode={nextEpisode}
            isNearEnd={isNearEnd}
            countdownReady={countdownReady}
            ended={ended}
            onSkip={(toMs) => seekTo(toMs / 1000)}
            onNextEpisode={playNextEpisode}
            autoPlayNextEpisode={autoPlayNextEpisode}
            playing={playing}
            interactionPaused={interactionActive || buffering}
            workTitle={parsedTitle.workTitle}
          />

          <PlayerControls
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            volume={volume}
            muted={muted}
            fullscreen={fullscreen}
            visible={controlsVisible}
            onPlay={() => { void videoRef.current?.play().catch(() => undefined); }}
            onPause={() => videoRef.current?.pause()}
            onSeek={seekTo}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={toggleMute}
            onFullscreenToggle={() => { void toggleFullscreen(); }}
            onPipToggle={() => { void togglePip(); }}
            audioTracks={audioTracks}
            selectedAudioTrack={selectedAudioTrack}
            onAudioTrackChange={(trackId) => {
              if (hlsRef.current) hlsRef.current.audioTrack = trackId;
              setSelectedAudioTrack(trackId);
            }}
            subtitleTracks={subtitleOptions}
            selectedSubtitleTrack={selectedSubtitleTrack}
            onSubtitleTrackChange={setSelectedSubtitleTrack}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
            qualityLevels={qualityLevels}
            selectedQuality={selectedQuality}
            onQualityChange={(levelId) => {
              if (hlsRef.current) hlsRef.current.currentLevel = levelId;
              setSelectedQuality(levelId);
            }}
            markers={markers}
            subtitleStyle={subtitleStyle}
            onSubtitleStyleChange={(style) => onSubtitleStyleChange?.(style)}
            autoPlayNextEpisode={autoPlayNextEpisode}
            onAutoPlayNextEpisodeChange={(enabled) => onAutoPlayNextEpisodeChange?.(enabled)}
            episodes={episodes}
            currentEpisodeId={currentEpisodeId}
            onEpisodeChange={(episodeId) => onEpisodeChange?.(episodeId)}
            pipAvailable={canPip}
            pipActive={pipActive}
            fullscreenAvailable={canFullscreen}
            onInteractionChange={handleControlsInteraction}
            onMenuOpenChange={setSettingsOpen}
          />
        </>
      )}

      {feedback && (
        <div key={feedback.id} className="player__feedback" role="status" aria-live="polite" aria-atomic="true">
          {feedback.icon && <Icon name={feedback.icon} />}
          {feedback.text && <span aria-hidden="true">{feedback.text}</span>}
          <span className="sr-only">{feedback.label}</span>
        </div>
      )}

      {pipActive && <span className="sr-only" aria-live="polite">Picture in Picture ativado</span>}
    </div>
  );
}
