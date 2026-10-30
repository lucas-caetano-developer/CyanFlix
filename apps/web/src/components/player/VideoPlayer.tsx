import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";
import { PlayerControls } from "./PlayerControls";
import { PlayerOverlay } from "./PlayerOverlay";
import { PlayerRatingBanner } from "./PlayerRatingBanner";
import { Icon, type IconName } from "../ui/Icon";
import {
  applyAudioInitPts,
  dedupeSubtitleTracks,
  isSafariBrowser,
  shouldIgnorePlayerShortcutForInput,
  splitPlaybackTitle,
  subtitleTrackLabel,
  trackLabel,
  SEEK_STEP_SECONDS,
  shouldUseTvLikeInput,
} from "../../lib/player";
import { usePlayerPreferences } from "../../hooks/usePlayerPreferences";
import { formatMs } from "../../lib/utils";
import type { Marker } from "../../lib/types";

interface VideoPlayerProps {
  src: string;
  title: string;
  itemType?: "movie" | "episode";
  seasonNumber?: number | null;
  markers?: Marker[];
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  onBack: () => void;
  onNextEpisode?: () => void;
  startTime?: number;
  audioOffsetSeconds?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onProgressCommit?: (currentTime: number, duration: number) => void;
  subtitles?: Array<{
    url?: string | null;
    metadata?: Record<string, unknown>;
  }>;
  onPlaybackError?: () => void;
  autoPlayNextEpisode?: boolean;
  subtitleStyle?: "small" | "medium" | "large";
  onSubtitleStyleChange?: (style: "small" | "medium" | "large") => void;
  onAutoPlayNextEpisodeChange?: (enabled: boolean) => void;
  episodes?: Array<{ id: string; number: number; title?: string | null }>;
  currentEpisodeId?: string;
  onEpisodeChange?: (episodeId: string) => void;
  // New optional props
  contentRating?: {
    ageLabel: string;
    tone: string;
    descriptors: string[];
  } | null;
  autoSkipOpening?: boolean;
  onAutoSkipOpeningChange?: (enabled: boolean) => void;
}

type Feedback = { id: number; text: string; label: string; icon?: IconName };
type LoadState = "loading" | "ready" | "error";
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
};
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape" | "portrait") => Promise<void>;
  unlock?: () => void;
};

const CONTROLS_HIDE_DELAY = 3000;
const FEEDBACK_DURATION = 900;
const MAX_NETWORK_RETRIES = 3;
const MAX_MEDIA_RETRIES = 1;
const RETRY_DELAY_MS = 1500;
const SEEK_DEBOUNCE_MS = 250;
const DOUBLE_TAP_MS = 600;
const RESUME_NOTICE_MIN_SECONDS = 30;
const RESUME_NOTICE_DURATION_MS = 5000;
const RATING_BANNER_DELAY_MS = 6000;
const RATING_BANNER_DURATION_MS = 4000;
const UNDO_SKIP_DURATION_MS = 3000;

function isInteractiveTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      'button, a[href], input, select, textarea, [role="slider"], [role="button"], [role="tab"]',
    ),
  );
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
  contentRating,
  autoSkipOpening: autoSkipOpeningProp = false,
  onAutoSkipOpeningChange,
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

  // P7: keep startTime and onPlaybackError in refs so changing them does NOT re-run HLS effect
  const startTimeRef = useRef(startTime);
  const onPlaybackErrorRef = useRef(onPlaybackError);

  // P8: error recovery counters (reset on src change)
  const networkRetryCountRef = useRef(0);
  const mediaRetryCountRef = useRef(0);

  // Seek acceleration
  const seekRepeatCountRef = useRef(0);
  const pendingSeekTargetRef = useRef<number | null>(null);
  const seekDebounceTimerRef = useRef<number>();
  const lastSeekKeyRef = useRef<string | null>(null);

  // Touch/double-tap
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number>();
  const tapSideRef = useRef<"left" | "center" | "right" | null>(null);
  const tapAccumRef = useRef(0);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);

  // Wake lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Auto-skip: track which marker start_ms already auto-skipped this playthrough
  const autoSkippedMarkerRef = useRef<number | null>(null);

  // Last subtitle track index for 'C' toggle
  const lastSubtitleTrackRef = useRef(-1);

  // Rating banner timing
  const ratingShownRef = useRef(false);
  const ratingBannerTimerRef = useRef<number>();
  const ratingHideTimerRef = useRef<number>();

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [canPip, setCanPip] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsInteraction, setControlsInteraction] = useState(false);
  const [focusInteractive, setFocusInteractive] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [ended, setEnded] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [audioTracks, setAudioTracks] = useState<
    Array<{ id: number; label: string; lang?: string }>
  >([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(-1);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<
    Array<{ id: number; label: string }>
  >([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoSkipOpening, setAutoSkipOpening] = useState(autoSkipOpeningProp);
  const [ratingBannerVisible, setRatingBannerVisible] = useState(false);
  const [showResumeNotice, setShowResumeNotice] = useState(false);
  const resumeNoticeTimerRef = useRef<number>();
  const [showUndoSkip, setShowUndoSkip] = useState(false);
  const undoSkipTimerRef = useRef<number>();
  const undoSkipTargetRef = useRef(0);
  const [endScreen, setEndScreen] = useState(false);
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const [doubleTapIndicator, setDoubleTapIndicator] = useState<{
    side: "left" | "right";
    delta: number;
  } | null>(null);
  const doubleTapIndicatorTimerRef = useRef<number>();

  const prefs = usePlayerPreferences();

  // Initialize volume/muted from persistent prefs (lazy init via useState)
  const [volume, setVolume] = useState(() => prefs.volume);
  const [muted, setMuted] = useState(() => prefs.muted);

  const isTvMode = useMemo(() => shouldUseTvLikeInput(), []);

  const availableSubtitles = useMemo(
    () => dedupeSubtitleTracks(subtitles),
    [subtitles],
  );
  const subtitleOptions = useMemo(
    () =>
      availableSubtitles.map((track, index) => ({
        id: index,
        label: subtitleTrackLabel(track, index),
      })),
    [availableSubtitles],
  );
  const subtitlesActive =
    availableSubtitles.length > 0 && selectedSubtitleTrack >= 0;
  const currentEpisode = episodes.find(
    (episode) => episode.id === currentEpisodeId,
  );
  const activeElement =
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null);
  const focusWithinInteractive =
    focusInteractive &&
    Boolean(
      containerRef.current &&
      activeElement &&
      containerRef.current.contains(activeElement) &&
      isInteractiveTarget(activeElement),
    );
  const parsedTitle =
    itemType === "episode"
      ? splitPlaybackTitle(title)
      : { workTitle: title, episodeTitle: null };
  const episodeTitle = currentEpisode?.title || parsedTitle.episodeTitle;
  const contextParts = [
    seasonNumber != null ? `T${seasonNumber}` : null,
    currentEpisode?.number != null ? `E${currentEpisode.number}` : null,
    episodeTitle,
  ].filter(Boolean);
  const contextLabel = contextParts.join(" · ");
  const interactionActive = controlsInteraction || focusWithinInteractive;
  const controlsLocked =
    interactionActive || loadState !== "ready" || playbackError;
  const isNearEnd =
    duration > 0 && currentTime > 0 && duration - currentTime <= 30;
  const countdownReady =
    duration > 0 && currentTime > 0 && duration - currentTime <= 10;
  const hasOpeningMarker = markers.some((m) => m.type === "opening");

  // P7: keep refs in sync - no new HLS instance when these change
  useEffect(() => {
    startTimeRef.current = startTime;
  }, [startTime]);
  useEffect(() => {
    onPlaybackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);
  useEffect(() => {
    audioOffsetSecondsRef.current = audioOffsetSeconds;
  }, [audioOffsetSeconds]);

  const playNextEpisode = useCallback(() => onNextEpisode?.(), [onNextEpisode]);
  const handleControlsInteraction = useCallback(
    (active: boolean) => setControlsInteraction(active),
    [],
  );

  const showFeedback = useCallback(
    (text: string, label: string, icon?: IconName) => {
      if (feedbackTimeoutRef.current)
        window.clearTimeout(feedbackTimeoutRef.current);
      feedbackCounterRef.current += 1;
      setFeedback({ id: feedbackCounterRef.current, text, label, icon });
      feedbackTimeoutRef.current = window.setTimeout(
        () => setFeedback(null),
        FEEDBACK_DURATION,
      );
    },
    [],
  );

  const showControls = useCallback(() => {
    if (controlsTimeoutRef.current)
      window.clearTimeout(controlsTimeoutRef.current);
    setControlsVisible(true);
    if (playing && !controlsLocked) {
      controlsTimeoutRef.current = window.setTimeout(
        () => setControlsVisible(false),
        CONTROLS_HIDE_DELAY,
      );
    }
  }, [controlsLocked, playing]);

  useEffect(() => {
    if (controlsTimeoutRef.current)
      window.clearTimeout(controlsTimeoutRef.current);
    if (!playing || controlsLocked) {
      setControlsVisible(true);
      return;
    }
    controlsTimeoutRef.current = window.setTimeout(
      () => setControlsVisible(false),
      CONTROLS_HIDE_DELAY,
    );
    return () => {
      if (controlsTimeoutRef.current)
        window.clearTimeout(controlsTimeoutRef.current);
    };
  }, [controlsLocked, playing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (controlsTimeoutRef.current)
        window.clearTimeout(controlsTimeoutRef.current);
      if (feedbackTimeoutRef.current)
        window.clearTimeout(feedbackTimeoutRef.current);
      if (seekDebounceTimerRef.current)
        window.clearTimeout(seekDebounceTimerRef.current);
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      if (doubleTapIndicatorTimerRef.current)
        window.clearTimeout(doubleTapIndicatorTimerRef.current);
      if (resumeNoticeTimerRef.current)
        window.clearTimeout(resumeNoticeTimerRef.current);
      if (ratingBannerTimerRef.current)
        window.clearTimeout(ratingBannerTimerRef.current);
      if (ratingHideTimerRef.current)
        window.clearTimeout(ratingHideTimerRef.current);
      if (undoSkipTimerRef.current)
        window.clearTimeout(undoSkipTimerRef.current);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => undefined);
        wakeLockRef.current = null;
      }
    };
  }, []);

  // Wake lock
  const acquireWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      if (wakeLockRef.current) return;
      // @ts-ignore - wakeLock API
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // not supported or denied
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        playing &&
        !wakeLockRef.current
      ) {
        await acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [acquireWakeLock, playing]);

  // Offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      const hls = hlsRef.current;
      if (hls) {
        try {
          hls.startLoad();
        } catch {
          /* ignore */
        }
      }
    };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const limit =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : null;
    const next = Math.max(0, limit == null ? time : Math.min(limit, time));
    video.currentTime = next;
    setCurrentTime(next);
    setEnded(false);
    setEndScreen(false);
    resumeTimeRef.current = next;
  }, []);

  const commitPendingSeek = useCallback(() => {
    const target = pendingSeekTargetRef.current;
    if (target === null) return;
    pendingSeekTargetRef.current = null;
    seekRepeatCountRef.current = 0;
    lastSeekKeyRef.current = null;
    seekTo(target);
  }, [seekTo]);

  // Seek with keyboard acceleration (hold key)
  const seekByAccelerated = useCallback(
    (dir: 1 | -1, keyId: string) => {
      if (lastSeekKeyRef.current !== keyId) {
        seekRepeatCountRef.current = 0;
        lastSeekKeyRef.current = keyId;
        if (pendingSeekTargetRef.current !== null) commitPendingSeek();
      }
      seekRepeatCountRef.current += 1;
      const count = seekRepeatCountRef.current;
      const step = count >= 15 ? 60 : count >= 5 ? 30 : SEEK_STEP_SECONDS;
      const video = videoRef.current;
      if (!video) return;
      const base = pendingSeekTargetRef.current ?? video.currentTime;
      const limit =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : Infinity;
      const newTarget = Math.max(0, Math.min(limit, base + dir * step));
      pendingSeekTargetRef.current = newTarget;
      const totalDelta = newTarget - video.currentTime;
      const sign = totalDelta >= 0 ? "+" : "−";
      showFeedback(
        `${sign}${Math.abs(Math.round(totalDelta))}s`,
        dir > 0
          ? `Avançando para ${formatMs(newTarget * 1000)}`
          : `Retrocedendo para ${formatMs(newTarget * 1000)}`,
      );
      if (seekDebounceTimerRef.current)
        window.clearTimeout(seekDebounceTimerRef.current);
      seekDebounceTimerRef.current = window.setTimeout(
        () => commitPendingSeek(),
        SEEK_DEBOUNCE_MS,
      );
    },
    [commitPendingSeek, showFeedback],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(video.currentTime + delta);
      showFeedback(
        `${delta > 0 ? "+" : "−"}${Math.abs(delta)}s`,
        delta > 0
          ? `Avançado ${Math.abs(delta)} segundos`
          : `Retrocedido ${Math.abs(delta)} segundos`,
      );
    },
    [seekTo, showFeedback],
  );

  const handleVolumeChange = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      setVolume(next);
      if (next > 0 && muted) setMuted(false);
      prefs.saveVolume(next);
    },
    [muted, prefs],
  );

  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      if (volume === 0) {
        setVolume(1);
        prefs.saveVolume(1);
      }
      setMuted(false);
      prefs.saveMuted(false);
      showFeedback("Som ativado", "Som ativado", "volume");
    } else {
      setMuted(true);
      prefs.saveMuted(true);
      showFeedback("Mudo", "Som silenciado", "muted");
    }
  }, [muted, prefs, showFeedback, volume]);

  const adjustVolume = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(1, volume + delta));
      setVolume(next);
      setMuted(false);
      prefs.saveVolume(next);
      prefs.saveMuted(false);
      showFeedback(
        `${Math.round(next * 100)}%`,
        next === 0
          ? "Som silenciado"
          : `Volume ${Math.round(next * 100)} por cento`,
        next === 0 ? "muted" : "volume",
      );
    },
    [prefs, showFeedback, volume],
  );

  const togglePlayback = useCallback(
    (withFeedback = false) => {
      const video = videoRef.current;
      if (!video || loadState !== "ready") return;
      if (video.paused) {
        void video.play().catch(() => undefined);
        if (withFeedback) showFeedback("", "Reprodução iniciada", "play");
      } else {
        video.pause();
        if (withFeedback) showFeedback("", "Reprodução pausada", "pause");
      }
    },
    [loadState, showFeedback],
  );

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        try {
          (screen.orientation as LockableOrientation | undefined)?.unlock?.();
        } catch {
          /* no iOS support */
        }
        return;
      }
      const container = containerRef.current as
        | (HTMLDivElement & {
            webkitRequestFullscreen?: () => Promise<void> | void;
          })
        | null;
      if (container?.requestFullscreen) {
        await container.requestFullscreen();
        try {
          await (screen.orientation as LockableOrientation | undefined)?.lock?.(
            "landscape",
          );
        } catch {
          /* no iOS support */
        }
        return;
      }
      const video = videoRef.current as WebkitVideo | null;
      video?.webkitEnterFullscreen?.();
    } catch {
      // Browser may deny the request; button keeps reflecting real state.
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else if (typeof video.requestPictureInPicture === "function")
        await video.requestPictureInPicture();
    } catch {
      // PiP may be blocked by browser.
    }
  }, []);

  const toggleCaptions = useCallback(() => {
    if (availableSubtitles.length === 0) return;
    if (selectedSubtitleTrack >= 0) {
      lastSubtitleTrackRef.current = selectedSubtitleTrack;
      setSelectedSubtitleTrack(-1);
      prefs.saveSubtitleLang("off");
      showFeedback("CC", "Legendas desligadas", "captions");
    } else {
      const track =
        lastSubtitleTrackRef.current >= 0 ? lastSubtitleTrackRef.current : 0;
      setSelectedSubtitleTrack(track);
      const sub = availableSubtitles[track];
      const lang =
        typeof sub?.metadata?.language === "string"
          ? sub.metadata.language
          : null;
      if (lang) prefs.saveSubtitleLang(lang);
      showFeedback("CC", "Legendas ligadas", "captions");
    }
  }, [availableSubtitles, prefs, selectedSubtitleTrack, showFeedback]);

  // Touch gesture layer handlers
  const handleTouchLayerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") return;
      const target = event.target as HTMLElement;
      if (target.closest('button, [role="slider"], input')) return;
      touchStartXRef.current = event.clientX;
      touchStartYRef.current = event.clientY;
    },
    [],
  );

  const handleTouchLayerPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") return;
      const target = event.target as HTMLElement;
      if (target.closest('button, [role="slider"], input')) return;
      const dx = Math.abs(event.clientX - touchStartXRef.current);
      const dy = Math.abs(event.clientY - touchStartYRef.current);
      if (dx > 15 || dy > 15) return; // swipe, not tap

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const width = rect.width;
      const third = width / 3;
      const side: "left" | "center" | "right" =
        x < third ? "left" : x > third * 2 ? "right" : "center";

      if (
        tapCountRef.current > 0 &&
        tapSideRef.current === side &&
        side !== "center"
      ) {
        // Additional tap on same side - accumulate
        tapCountRef.current += 1;
        tapAccumRef.current += SEEK_STEP_SECONDS;
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        const delta = tapAccumRef.current;
        setDoubleTapIndicator({ side: side as "left" | "right", delta });
        if (doubleTapIndicatorTimerRef.current)
          window.clearTimeout(doubleTapIndicatorTimerRef.current);
        doubleTapIndicatorTimerRef.current = window.setTimeout(
          () => setDoubleTapIndicator(null),
          700,
        );
        tapTimerRef.current = window.setTimeout(() => {
          seekBy(side === "left" ? -delta : delta);
          tapCountRef.current = 0;
          tapSideRef.current = null;
          tapAccumRef.current = 0;
        }, DOUBLE_TAP_MS);
      } else {
        // First tap or center or different side
        tapCountRef.current = 1;
        tapSideRef.current = side;
        tapAccumRef.current = SEEK_STEP_SECONDS;
        if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
        tapTimerRef.current = window.setTimeout(() => {
          if (side === "center") {
            togglePlayback(true);
          } else {
            // Single tap on left/right: show/hide controls
            if (controlsVisible) {
              if (controlsTimeoutRef.current)
                window.clearTimeout(controlsTimeoutRef.current);
              setControlsVisible(false);
            } else {
              showControls();
            }
          }
          tapCountRef.current = 0;
          tapSideRef.current = null;
          tapAccumRef.current = 0;
        }, DOUBLE_TAP_MS);
      }
    },
    [controlsVisible, seekBy, showControls, togglePlayback],
  );

  // MAIN HLS effect - depends ONLY on src (P7 fix)
  useEffect(() => {
    if (!src || !videoRef.current) return;
    const video = videoRef.current;
    fallbackRequestedRef.current = false;
    networkRetryCountRef.current = 0;
    mediaRetryCountRef.current = 0;
    autoSkippedMarkerRef.current = null;

    setAudioTracks([]);
    setSelectedAudioTrack(-1);
    setQualityLevels([]);
    setSelectedQuality(-1);
    setLoadState("loading");
    setPlaybackError(false);
    setBuffering(false);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setEnded(false);
    setEndScreen(false);
    setControlsVisible(true);
    setShowResumeNotice(false);
    setRatingBannerVisible(false);
    ratingShownRef.current = false;

    // Apply saved preferences to video element before first play
    video.volume = prefs.volume;
    video.muted = prefs.muted;

    const resumeAt = Math.max(resumeTimeRef.current, startTimeRef.current ?? 0);

    let hls: Hls | undefined;

    const useHlsJs = Hls.isSupported() && !isSafariBrowser();
    const canPlayNativeHls = Boolean(
      video.canPlayType("application/vnd.apple.mpegurl"),
    );

    if (useHlsJs) {
      const hlsInstance = new Hls({ enableWorker: true });
      hls = hlsInstance;
      hlsRef.current = hlsInstance;

      hlsInstance.on(Hls.Events.INIT_PTS_FOUND, (_event, data) => {
        applyAudioInitPts(hlsInstance, data, audioOffsetSecondsRef.current);
      });

      const syncAudioTracks = () => {
        const seen = new Set<string>();
        const tracks = hlsInstance.audioTracks.flatMap((track, index) => {
          const label = trackLabel(
            track.name,
            track.lang,
            `Faixa ${index + 1}`,
          );
          const key = `${track.lang ?? ""}:${label}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [{ id: index, label, lang: track.lang ?? undefined }];
        });
        setAudioTracks(tracks);
        // Apply saved audio lang preference
        const savedLang = prefs.audioLang;
        if (savedLang) {
          const match = tracks.find((t) => t.lang === savedLang);
          if (match) {
            hlsInstance.audioTrack = match.id;
            setSelectedAudioTrack(match.id);
            return;
          }
        }
        const nextAudioTrack =
          hlsInstance.audioTrack >= 0
            ? hlsInstance.audioTrack
            : (tracks[0]?.id ?? -1);
        setSelectedAudioTrack(nextAudioTrack);
      };

      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        syncAudioTracks();
        setQualityLevels(
          hlsInstance.levels.map((level, index) => ({
            id: index,
            label: level.height
              ? `${level.height}p${level.bitrate ? ` · ${(level.bitrate / 1_000_000).toFixed(1)} Mbps` : ""}`
              : `Nível ${index + 1}`,
          })),
        );
        if (resumeAt) video.currentTime = resumeAt;
        void video.play().catch(() => undefined);
      });

      hlsInstance.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncAudioTracks());
      hlsInstance.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) =>
        setSelectedAudioTrack(data.id),
      );

      // P8: error recovery with retries
      hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        setBuffering(false);

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (networkRetryCountRef.current < MAX_NETWORK_RETRIES) {
            networkRetryCountRef.current += 1;
            window.setTimeout(() => {
              try {
                hlsInstance.startLoad();
              } catch {
                /* ignore */
              }
            }, RETRY_DELAY_MS);
            return;
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          if (mediaRetryCountRef.current < MAX_MEDIA_RETRIES) {
            mediaRetryCountRef.current += 1;
            try {
              hlsInstance.recoverMediaError();
            } catch {
              /* ignore */
            }
            return;
          }
        }

        // All retries exhausted - fall through to error state
        setLoadState("error");
        setPlaybackError(true);
        if (!fallbackRequestedRef.current) {
          fallbackRequestedRef.current = true;
          onPlaybackErrorRef.current?.();
        }
      });
    } else if (canPlayNativeHls) {
      video.src = src;
      if (resumeAt) video.currentTime = resumeAt;
      void video.play().catch(() => undefined);
    } else {
      setLoadState("error");
      setPlaybackError(true);
      if (!fallbackRequestedRef.current) {
        fallbackRequestedRef.current = true;
        onPlaybackErrorRef.current?.();
      }
    }

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
    // P7: Only depends on src - startTime and onPlaybackError are read from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Subtitle track selection
  useEffect(() => {
    const savedLang = prefs.subtitleLang;
    if (savedLang === "off") {
      setSelectedSubtitleTrack(-1);
      return;
    }
    if (savedLang) {
      const langIndex = availableSubtitles.findIndex(
        (t) =>
          typeof t.metadata?.language === "string" &&
          t.metadata.language === savedLang,
      );
      if (langIndex >= 0) {
        setSelectedSubtitleTrack(langIndex);
        return;
      }
    }
    const defaultIndex = availableSubtitles.findIndex(
      (track) => track.metadata?.default === true,
    );
    setSelectedSubtitleTrack(defaultIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableSubtitles]);

  useEffect(() => {
    const textTracks = videoRef.current?.textTracks;
    if (!textTracks) return;
    for (let index = 0; index < textTracks.length; index += 1) {
      textTracks[index].mode =
        index === selectedSubtitleTrack ? "showing" : "disabled";
    }
  }, [availableSubtitles, selectedSubtitleTrack]);

  useEffect(() => {
    const video = videoRef.current;
    setCanFullscreen(
      Boolean(
        document.fullscreenEnabled !== false &&
        (containerRef.current?.requestFullscreen ||
          (video as WebkitVideo | null)?.webkitEnterFullscreen),
      ),
    );
    setCanPip(
      Boolean(
        document.pictureInPictureEnabled &&
        video &&
        typeof video.requestPictureInPicture === "function",
      ),
    );
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const webkitDocument = document as FullscreenDocument;
      setFullscreen(
        Boolean(
          document.fullscreenElement || webkitDocument.webkitFullscreenElement,
        ),
      );
    };
    const video = videoRef.current;
    const handleWebkitBegin = () => setFullscreen(true);
    const handleWebkitEnd = () => setFullscreen(false);
    const handlePipEnter = () => setPipActive(true);
    const handlePipLeave = () => setPipActive(false);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    video?.addEventListener("webkitbeginfullscreen", handleWebkitBegin);
    video?.addEventListener("webkitendfullscreen", handleWebkitEnd);
    video?.addEventListener("enterpictureinpicture", handlePipEnter);
    video?.addEventListener("leavepictureinpicture", handlePipLeave);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      video?.removeEventListener("webkitbeginfullscreen", handleWebkitBegin);
      video?.removeEventListener("webkitendfullscreen", handleWebkitEnd);
      video?.removeEventListener("enterpictureinpicture", handlePipEnter);
      video?.removeEventListener("leavepictureinpicture", handlePipLeave);
    };
  }, []);

  // Sync volume/muted/rate to video element
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Media Session API
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episodeTitle || parsedTitle.workTitle,
      artist: episodeTitle ? parsedTitle.workTitle : undefined,
    });
    const handlers: Array<
      [MediaSessionAction, MediaSessionActionHandler | null]
    > = [
      [
        "play",
        () => {
          void videoRef.current?.play().catch(() => undefined);
        },
      ],
      [
        "pause",
        () => {
          videoRef.current?.pause();
        },
      ],
      ["seekbackward", () => seekBy(-SEEK_STEP_SECONDS)],
      ["seekforward", () => seekBy(SEEK_STEP_SECONDS)],
      [
        "seekto",
        (details) => {
          if (details.seekTime != null) seekTo(details.seekTime);
        },
      ],
    ];
    if (nextEpisode) {
      handlers.push(["nexttrack", () => playNextEpisode()]);
    } else {
      try {
        navigator.mediaSession.setActionHandler("nexttrack", null);
      } catch {
        /* ignore */
      }
    }
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* ignore */
      }
    }
    return () => {
      const actions: MediaSessionAction[] = [
        "play",
        "pause",
        "seekbackward",
        "seekforward",
        "seekto",
        "nexttrack",
      ];
      for (const action of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [
    episodeTitle,
    nextEpisode,
    parsedTitle.workTitle,
    playNextEpisode,
    seekBy,
    seekTo,
  ]);

  // Keyboard shortcuts (P2 fix, TV support, media keys, back key, seek acceleration)
  useEffect(() => {
    const BACK_KEYS = new Set(["escape", "goback", "browserback", "xf86back"]);
    const BACK_KEYCODES = new Set([4, 10009, 461]);
    const MEDIA_PLAY_PAUSE_KEYCODES = new Set([415, 19, 10252]);
    const MEDIA_REWIND_KEYCODES = new Set([412]);
    const MEDIA_FORWARD_KEYCODES = new Set([417]);
    const MEDIA_STOP_KEYCODES = new Set([413]);
    const MEDIA_NEXT_KEYCODES = new Set([418]);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!videoRef.current || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const keyLower = event.key.toLowerCase();
      const keyCode = event.keyCode;
      const inputMode = document.body.dataset.input as string | undefined;

      // Media keys (TV remotes)
      if (
        (keyCode && MEDIA_PLAY_PAUSE_KEYCODES.has(keyCode)) ||
        ["mediaplaypause", "mediaplay", "mediapause"].includes(keyLower)
      ) {
        event.preventDefault();
        togglePlayback(true);
        showControls();
        return;
      }
      if (
        (keyCode && MEDIA_REWIND_KEYCODES.has(keyCode)) ||
        keyLower === "mediarewind"
      ) {
        event.preventDefault();
        seekBy(-SEEK_STEP_SECONDS);
        showControls();
        return;
      }
      if (
        (keyCode && MEDIA_FORWARD_KEYCODES.has(keyCode)) ||
        keyLower === "mediafastforward"
      ) {
        event.preventDefault();
        seekBy(SEEK_STEP_SECONDS);
        showControls();
        return;
      }
      if (
        (keyCode && MEDIA_NEXT_KEYCODES.has(keyCode)) ||
        keyLower === "mediatracknext"
      ) {
        if (nextEpisode) {
          event.preventDefault();
          playNextEpisode();
        }
        return;
      }
      if (
        (keyCode && MEDIA_STOP_KEYCODES.has(keyCode)) ||
        keyLower === "mediastop"
      ) {
        event.preventDefault();
        onBack();
        return;
      }

      // Back key - layered dismissal (P4 fix)
      const isBackKey =
        BACK_KEYS.has(keyLower) ||
        (keyCode != null && BACK_KEYCODES.has(keyCode));
      if (isBackKey) {
        event.preventDefault();
        event.stopPropagation();
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (controlsVisible && playing) {
          setControlsVisible(false);
          return;
        }
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
          try {
            (screen.orientation as LockableOrientation | undefined)?.unlock?.();
          } catch {
            /* ignore */
          }
          return;
        }
        onBack();
        return;
      }

      // 0-9 seek by percentage
      if (/^[0-9]$/.test(event.key) && !event.repeat) {
        if (shouldIgnorePlayerShortcutForInput(event.target, inputMode)) return;
        const percent = Number(event.key) / 10;
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          seekTo(percent * video.duration);
          showControls();
        }
        return;
      }

      const isSeekKey =
        keyLower === "arrowleft" ||
        keyLower === "arrowright" ||
        keyLower === "j" ||
        keyLower === "l";
      const isVolumeKey = keyLower === "arrowup" || keyLower === "arrowdown";
      const isPlayPause = keyLower === " " || keyLower === "k";
      const isEnter = keyLower === "enter";
      const isHandled =
        isSeekKey ||
        isVolumeKey ||
        isPlayPause ||
        isEnter ||
        keyLower === "m" ||
        keyLower === "f" ||
        keyLower === "c";
      if (!isHandled) return;

      // P2 fix: in pointer/touch mode, player always owns arrow keys regardless of button focus
      if (!isSeekKey) {
        if (shouldIgnorePlayerShortcutForInput(event.target, inputMode)) return;
      } else {
        // Seek keys: in keyboard mode respect focused buttons; in pointer/touch mode always handle
        if (
          inputMode === "keyboard" &&
          shouldIgnorePlayerShortcutForInput(event.target, inputMode)
        )
          return;
      }

      // P12: Space and up/down only captured if player is active context
      if (isPlayPause || isVolumeKey) {
        const isPlayerActive =
          fullscreen ||
          isTvMode ||
          Boolean(containerRef.current?.matches(":hover")) ||
          Boolean(
            containerRef.current &&
            document.activeElement &&
            containerRef.current.contains(document.activeElement),
          );
        if (!isPlayerActive) return;
      }

      if (event.repeat && !isSeekKey && !isVolumeKey) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      showControls();

      if (isSeekKey) {
        const dir: 1 | -1 =
          keyLower === "arrowright" || keyLower === "l" ? 1 : -1;
        const keyId = dir > 0 ? "right" : "left";
        if (event.repeat) {
          seekByAccelerated(dir, keyId);
        } else {
          seekBy(dir * SEEK_STEP_SECONDS);
        }
        return;
      }

      switch (keyLower) {
        case " ":
        case "k":
          togglePlayback(true);
          break;
        case "enter":
          // TV OK button: toggle play when no button focused or in TV mode
          if (
            isTvMode ||
            !document.activeElement ||
            document.activeElement === document.body ||
            document.activeElement === videoRef.current
          ) {
            togglePlayback(true);
          }
          break;
        case "arrowup":
          if (!isTvMode) adjustVolume(0.1);
          else showControls(); // TV: show controls, spatial nav will focus a button
          break;
        case "arrowdown":
          if (!isTvMode) adjustVolume(-0.1);
          else showControls();
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "c":
          toggleCaptions();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    adjustVolume,
    controlsVisible,
    fullscreen,
    isTvMode,
    nextEpisode,
    onBack,
    playing,
    playNextEpisode,
    seekBy,
    seekByAccelerated,
    seekTo,
    settingsOpen,
    showControls,
    toggleCaptions,
    toggleFullscreen,
    toggleMute,
    togglePlayback,
  ]);

  // Auto-skip opening
  useEffect(() => {
    if (!autoSkipOpening || !hasOpeningMarker) return;
    const openingMarker = markers.find((m) => m.type === "opening");
    if (!openingMarker) return;
    const currentTimeMs = currentTime * 1000;
    if (
      currentTimeMs >= openingMarker.start_ms &&
      currentTimeMs < openingMarker.end_ms &&
      autoSkippedMarkerRef.current !== openingMarker.start_ms
    ) {
      autoSkippedMarkerRef.current = openingMarker.start_ms;
      undoSkipTargetRef.current = openingMarker.start_ms / 1000;
      seekTo(openingMarker.end_ms / 1000);
      setShowUndoSkip(true);
      if (undoSkipTimerRef.current)
        window.clearTimeout(undoSkipTimerRef.current);
      undoSkipTimerRef.current = window.setTimeout(
        () => setShowUndoSkip(false),
        UNDO_SKIP_DURATION_MS,
      );
    }
  }, [autoSkipOpening, currentTime, hasOpeningMarker, markers, seekTo]);

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
    if (mountedRef.current) setLoadState("ready");
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
    if (video && !video.currentSrc && !video.getAttribute("src")) return;
    setLoadState("error");
    setPlaybackError(true);
    setBuffering(false);
    if (!fallbackRequestedRef.current) {
      fallbackRequestedRef.current = true;
      onPlaybackErrorRef.current?.();
    }
  };

  const handlePointerActivity = () => {
    const now = Date.now();
    if (now - lastPointerActivityRef.current < 100 && controlsVisible) return;
    lastPointerActivityRef.current = now;
    showControls();
  };

  const handlePlaying = () => {
    setPlaying(true);
    setBuffering(false);
    setEnded(false);
    void acquireWakeLock();
    // Rating banner: show after delay on first playing event
    if (!ratingShownRef.current && contentRating) {
      ratingShownRef.current = true;
      if (ratingBannerTimerRef.current)
        window.clearTimeout(ratingBannerTimerRef.current);
      ratingBannerTimerRef.current = window.setTimeout(() => {
        setRatingBannerVisible(true);
        ratingHideTimerRef.current = window.setTimeout(
          () => setRatingBannerVisible(false),
          RATING_BANNER_DURATION_MS,
        );
      }, RATING_BANNER_DELAY_MS);
    }
  };

  const handleEnded = () => {
    setPlaying(false);
    setBuffering(false);
    setEnded(true);
    setControlsVisible(true);
    void releaseWakeLock();
    if (videoRef.current)
      onProgressCommit?.(
        videoRef.current.duration || videoRef.current.currentTime,
        videoRef.current.duration || 0,
      );
    if (!nextEpisode) setEndScreen(true);
  };

  // Resume notice
  useEffect(() => {
    if (loadState !== "ready") return;
    const resumeAt = startTimeRef.current ?? 0;
    if (resumeAt > RESUME_NOTICE_MIN_SECONDS) {
      setShowResumeNotice(true);
      resumeNoticeTimerRef.current = window.setTimeout(
        () => setShowResumeNotice(false),
        RESUME_NOTICE_DURATION_MS,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState]);

  const handleVideoClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    const pointerType = (
      event.nativeEvent as PointerEvent & { pointerType?: string }
    ).pointerType;
    if (pointerType === "touch") return; // handled by touch layer
    const activeEl = document.activeElement;
    if (
      activeEl instanceof HTMLElement &&
      activeEl !== videoRef.current &&
      containerRef.current?.contains(activeEl)
    ) {
      activeEl.blur();
    }
    togglePlayback(true);
  };

  return (
    <div
      className={`player ${controlsVisible ? "" : "player--controls-hidden"}${settingsOpen ? " player--settings-open" : ""}${subtitlesActive ? " player--subtitles-on" : ""}`}
      ref={containerRef}
      role="region"
      aria-label={`Reprodutor: ${parsedTitle.workTitle}`}
      data-spatial-scope="player"
      data-spatial-player="true"
      onPointerMove={handlePointerActivity}
      onMouseLeave={() => {
        if (playing && !controlsLocked) {
          if (controlsTimeoutRef.current)
            window.clearTimeout(controlsTimeoutRef.current);
          setControlsVisible(false);
        }
      }}
      onFocusCapture={(event) =>
        setFocusInteractive(isInteractiveTarget(event.target as HTMLElement))
      }
      onBlurCapture={(event) =>
        setFocusInteractive(
          isInteractiveTarget(event.relatedTarget as HTMLElement | null),
        )
      }
    >
      <video
        ref={videoRef}
        className={`player__video player__video--subtitles-${subtitleStyle}`}
        onClick={handleVideoClick}
        onDoubleClick={(event) => {
          // Only toggle fullscreen on mouse double-click, not touch (P3 fix)
          const pointerType = (
            event.nativeEvent as PointerEvent & { pointerType?: string }
          ).pointerType;
          if (pointerType !== "touch") void toggleFullscreen();
        }}
        onPlay={() => {
          setPlaying(true);
          setEnded(false);
        }}
        onPause={() => {
          setPlaying(false);
          setBuffering(false);
          void releaseWakeLock();
          if (videoRef.current)
            onProgressCommit?.(
              videoRef.current.currentTime,
              videoRef.current.duration || 0,
            );
        }}
        onPlaying={handlePlaying}
        onWaiting={() => {
          if (videoRef.current && !videoRef.current.paused) setBuffering(true);
        }}
        onCanPlay={() => {
          setBuffering(false);
          if (mountedRef.current)
            setLoadState((state) => (state === "error" ? state : "ready"));
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onSeeked={() => {
          setBuffering(false);
          if (videoRef.current)
            onProgressCommit?.(
              videoRef.current.currentTime,
              videoRef.current.duration || 0,
            );
        }}
        onEnded={handleEnded}
        onError={handleMediaError}
        playsInline
      >
        {availableSubtitles.map((track, index) => {
          const language =
            typeof track.metadata?.language === "string"
              ? track.metadata.language
              : "und";
          const label = subtitleOptions[index]?.label ?? language;
          return (
            <track
              key={`${track.url}-${index}`}
              kind="subtitles"
              src={track.url!}
              srcLang={language}
              label={label}
            />
          );
        })}
      </video>

      {/* Touch gesture layer - transparent overlay for mobile gestures */}
      <div
        className="player__touch-layer"
        onPointerDown={handleTouchLayerPointerDown}
        onPointerUp={handleTouchLayerPointerUp}
        aria-hidden="true"
      />

      {/* Double-tap indicator */}
      {doubleTapIndicator && (
        <div
          className={`player__double-tap player__double-tap--${doubleTapIndicator.side}`}
          aria-hidden="true"
        >
          <span className="player__double-tap-icon">
            {doubleTapIndicator.side === "left" ? "«" : "»"}
          </span>
          <span className="player__double-tap-label">
            {doubleTapIndicator.delta}s
          </span>
        </div>
      )}

      <div
        className={`player__top-bar ${controlsVisible ? "" : "player__top-bar--hidden"}`}
      >
        <button className="player__back" onClick={onBack} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <div className="player__title-block">
          <h1 className="player__title-text" title={parsedTitle.workTitle}>
            {parsedTitle.workTitle}
          </h1>
          {contextLabel && (
            <p className="player__title-context">{contextLabel}</p>
          )}
        </div>
      </div>

      {/* Content rating banner */}
      {contentRating && (
        <PlayerRatingBanner
          rating={contentRating}
          visible={ratingBannerVisible}
        />
      )}

      {/* Resume notice */}
      {showResumeNotice &&
        (startTimeRef.current ?? 0) > RESUME_NOTICE_MIN_SECONDS && (
          <div className="player__resume-notice" role="status">
            <span>
              Retomando de {formatMs((startTimeRef.current ?? 0) * 1000)}
            </span>
            <button
              className="player__resume-restart"
              onClick={() => {
                seekTo(0);
                setShowResumeNotice(false);
              }}
            >
              Começar do início
            </button>
          </div>
        )}

      {/* Offline notice */}
      {isOffline && (
        <div className="player__offline" role="alert">
          Sem conexão — aguardando rede…
        </div>
      )}

      {loadState === "loading" && !playbackError && (
        <div className="player__loading" role="status">
          <span className="player__spinner" aria-hidden="true" />
          <p>Preparando reprodução…</p>
        </div>
      )}

      {buffering && loadState === "ready" && !playbackError && (
        <div className="player__buffering" role="status">
          <span className="player__spinner" aria-hidden="true" />
          <span className="sr-only">Carregando vídeo</span>
        </div>
      )}

      {playbackError && (
        <div className="player__error" role="alert">
          <p className="player__error-title">
            Não foi possível reproduzir este vídeo.
          </p>
          <p className="player__error-text">
            {isOffline
              ? "Sem conexão com a internet."
              : "Volte e tente novamente."}
          </p>
          <div className="player__error-actions">
            <button
              className="player__error-action"
              onClick={() => {
                networkRetryCountRef.current = 0;
                mediaRetryCountRef.current = 0;
                const hls = hlsRef.current;
                if (hls) {
                  setPlaybackError(false);
                  setLoadState("loading");
                  try {
                    hls.recoverMediaError();
                  } catch {
                    /* ignore */
                  }
                  try {
                    hls.startLoad();
                  } catch {
                    /* ignore */
                  }
                } else if (videoRef.current) {
                  setPlaybackError(false);
                  setLoadState("loading");
                  void videoRef.current.load();
                  void videoRef.current.play().catch(() => undefined);
                }
              }}
            >
              Tentar novamente
            </button>
            <button
              className="player__error-action player__error-action--secondary"
              onClick={onBack}
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {loadState === "ready" && !playbackError && (
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

          {/* End screen for movies or last episode */}
          {endScreen && !nextEpisode && (
            <div
              className="player__end-screen"
              role="dialog"
              aria-label="Fim da reprodução"
            >
              <p className="player__end-title">{parsedTitle.workTitle}</p>
              <div className="player__end-actions">
                <button
                  className="player__end-btn player__end-btn--primary"
                  onClick={() => {
                    seekTo(0);
                    setEndScreen(false);
                    void videoRef.current?.play().catch(() => undefined);
                  }}
                >
                  Assistir novamente
                </button>
                <button
                  className="player__end-btn player__end-btn--secondary"
                  onClick={onBack}
                >
                  Voltar
                </button>
              </div>
            </div>
          )}

          {/* Undo auto-skip banner */}
          {showUndoSkip && (
            <div className="player__undo-skip" role="status">
              <span>Abertura pulada</span>
              <button
                className="player__undo-skip-btn"
                onClick={() => {
                  seekTo(undoSkipTargetRef.current);
                  setShowUndoSkip(false);
                  autoSkippedMarkerRef.current = null;
                }}
              >
                Desfazer
              </button>
            </div>
          )}

          <PlayerControls
            playing={playing}
            currentTime={currentTime}
            duration={duration}
            buffered={buffered}
            volume={volume}
            muted={muted}
            fullscreen={fullscreen}
            visible={controlsVisible}
            onPlay={() => {
              void videoRef.current?.play().catch(() => undefined);
            }}
            onPause={() => videoRef.current?.pause()}
            onSeek={seekTo}
            onSeekBy={seekBy}
            onVolumeChange={handleVolumeChange}
            onMuteToggle={toggleMute}
            onFullscreenToggle={() => {
              void toggleFullscreen();
            }}
            onPipToggle={() => {
              void togglePip();
            }}
            audioTracks={audioTracks}
            selectedAudioTrack={selectedAudioTrack}
            onAudioTrackChange={(trackId) => {
              if (hlsRef.current) hlsRef.current.audioTrack = trackId;
              setSelectedAudioTrack(trackId);
              const track = audioTracks.find((t) => t.id === trackId);
              if (track?.lang) prefs.saveAudioLang(track.lang);
            }}
            subtitleTracks={subtitleOptions}
            selectedSubtitleTrack={selectedSubtitleTrack}
            onSubtitleTrackChange={(trackId) => {
              setSelectedSubtitleTrack(trackId);
              if (trackId < 0) {
                prefs.saveSubtitleLang("off");
              } else {
                const track = availableSubtitles[trackId];
                const lang =
                  typeof track?.metadata?.language === "string"
                    ? track.metadata.language
                    : null;
                if (lang) prefs.saveSubtitleLang(lang);
              }
            }}
            playbackRate={playbackRate}
            onPlaybackRateChange={setPlaybackRate}
            qualityLevels={qualityLevels}
            selectedQuality={selectedQuality}
            onQualityChange={(levelId) => {
              setSelectedQuality(levelId);
              if (!hlsRef.current) return;

              const hls = hlsRef.current;
              const levels = hls.levels;

              // 0 = Maior disponível (Automático, usa máxima banda possível)
              if (levelId === 0) {
                hls.autoLevelCapping = -1;
                hls.currentLevel = -1;
              }
              // 1 = Moderada (Limita o automático no meio termo, aprox. 720p)
              else if (levelId === 1) {
                const moderateIndex = levels.findIndex(
                  (l) => l.height && l.height >= 720,
                );
                hls.currentLevel = -1;
                hls.autoLevelCapping =
                  moderateIndex >= 0
                    ? moderateIndex
                    : Math.floor(levels.length / 2);
              }
              // 2 = Economia de dados (Fixa na menor resolução/taxa de transmissão disponível, índice 0)
              else if (levelId === 2) {
                hls.autoLevelCapping = -1;
                hls.currentLevel = 0;
              }
            }}
            markers={markers}
            subtitleStyle={subtitleStyle}
            onSubtitleStyleChange={(style) => onSubtitleStyleChange?.(style)}
            autoPlayNextEpisode={autoPlayNextEpisode}
            onAutoPlayNextEpisodeChange={(enabled) =>
              onAutoPlayNextEpisodeChange?.(enabled)
            }
            episodes={episodes}
            currentEpisodeId={currentEpisodeId}
            onEpisodeChange={(episodeId) => onEpisodeChange?.(episodeId)}
            pipAvailable={canPip}
            pipActive={pipActive}
            fullscreenAvailable={canFullscreen}
            onInteractionChange={handleControlsInteraction}
            menuOpen={settingsOpen}
            onMenuOpenChange={setSettingsOpen}
            nextEpisode={nextEpisode}
            onNextEpisode={nextEpisode ? playNextEpisode : undefined}
            hasOpeningMarker={hasOpeningMarker}
            autoSkipOpening={autoSkipOpening}
            onAutoSkipOpeningChange={(enabled) => {
              setAutoSkipOpening(enabled);
              onAutoSkipOpeningChange?.(enabled);
            }}
          />
        </>
      )}

      {feedback && (
        <div
          key={feedback.id}
          className="player__feedback"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback.icon && <Icon name={feedback.icon} />}
          {feedback.text && <span aria-hidden="true">{feedback.text}</span>}
          <span className="sr-only">{feedback.label}</span>
        </div>
      )}

      {pipActive && (
        <span className="sr-only" aria-live="polite">
          Picture in Picture ativado
        </span>
      )}
    </div>
  );
}
