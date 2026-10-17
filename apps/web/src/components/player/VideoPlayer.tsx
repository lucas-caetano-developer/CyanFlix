import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
import { PlayerControls } from './PlayerControls';
import { PlayerOverlay } from './PlayerOverlay';
import { Icon } from '../ui/Icon';

interface VideoPlayerProps {
  src: string;
  title: string;
  markers?: Array<{ type: string; start_ms: number; end_ms: number }>;
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  onBack: () => void;
  onNextEpisode?: () => void;
  startTime?: number; // resume position in seconds
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

export function VideoPlayer({
  src,
  title,
  markers = [],
  nextEpisode,
  onBack,
  onNextEpisode,
  startTime,
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

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [audioTracks, setAudioTracks] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(-1);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState(-1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityLevels, setQualityLevels] = useState<Array<{ id: number; label: string }>>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);

  const availableSubtitles = useMemo(() => subtitles.filter((track) => track.url), [subtitles]);
  const playNextEpisode = useCallback(() => onNextEpisode?.(), [onNextEpisode]);

  const controlsTimeoutRef = useRef<number>();
  const fallbackRequestedRef = useRef(false);
  const resumeTimeRef = useRef(0);

  const hideControls = useCallback(() => setControlsVisible(false), []);
  const resetControlsTimeout = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(hideControls, 3000);
  }, [hideControls]);

  useEffect(() => {
    resetControlsTimeout();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [resetControlsTimeout]);

  useEffect(() => {
    if (!src || !videoRef.current) return;
    const video = videoRef.current;
    fallbackRequestedRef.current = false;
    setAudioTracks([]);
    setSelectedAudioTrack(-1);
    setQualityLevels([]);
    setSelectedQuality(-1);
    const resumeAt = Math.max(resumeTimeRef.current, startTime ?? 0);
    
    let hls: Hls;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
       if (resumeAt) video.currentTime = resumeAt;
      video.play().catch(e => console.warn(e));
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setAudioTracks(hls.audioTracks.map((track, index) => ({
          id: index,
          label: track.name || track.lang || `Faixa ${index + 1}`,
        })));
        setSelectedAudioTrack(hls.audioTrack);
        setQualityLevels(hls.levels.map((level, index) => ({
          id: index,
          label: level.height ? `${level.height}p${level.bitrate ? ` · ${(level.bitrate / 1_000_000).toFixed(1)} Mbps` : ''}` : `Nível ${index + 1}`,
        })));
        if (resumeAt) video.currentTime = resumeAt;
        video.play().catch(e => console.warn(e));
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => setSelectedAudioTrack(data.id));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && !fallbackRequestedRef.current) {
          fallbackRequestedRef.current = true;
          onPlaybackError?.();
        }
      });
    }

    return () => {
      if (hls) hls.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, startTime, onPlaybackError]);

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
  }, [selectedSubtitleTrack, availableSubtitles]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) videoRef.current.pause();
      else videoRef.current.play();
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  const togglePip = async () => {
    if (!videoRef.current) return;
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoRef.current.requestPictureInPicture();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!videoRef.current) return;
      resetControlsTimeout();
      
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          videoRef.current.currentTime -= 10;
          break;
        case 'arrowright':
          e.preventDefault();
          videoRef.current.currentTime += 10;
          break;
        case 'arrowup':
          e.preventDefault();
          videoRef.current.volume = Math.min(1, videoRef.current.volume + 0.1);
          break;
        case 'arrowdown':
          e.preventDefault();
          videoRef.current.volume = Math.max(0, videoRef.current.volume - 0.1);
          break;
        case 'm':
          e.preventDefault();
          setMuted(m => !m);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, resetControlsTimeout]);

  // Video Events
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    resumeTimeRef.current = videoRef.current.currentTime;
    onTimeUpdate?.(videoRef.current.currentTime, videoRef.current.duration || 0);
  };
  
  const onLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  };

  const onProgress = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    if (v.buffered.length > 0) {
      const bufferedEnd = v.buffered.end(v.buffered.length - 1);
      setBuffered(duration > 0 ? bufferedEnd / duration : 0);
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  const isNearEnd = duration > 0 && duration - currentTime <= 30;

  return (
    <div 
      className={`player ${controlsVisible ? '' : 'player--controls-hidden'}`}
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={hideControls}
    >
      <video
        ref={videoRef}
        className={`player__video player__video--subtitles-${subtitleStyle}`}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          if (videoRef.current) onProgressCommit?.(videoRef.current.currentTime, videoRef.current.duration || 0);
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onProgress={onProgress}
        onSeeked={() => {
          if (videoRef.current) onProgressCommit?.(videoRef.current.currentTime, videoRef.current.duration || 0);
        }}
        onEnded={() => {
          setPlaying(false);
          if (videoRef.current) onProgressCommit?.(videoRef.current.duration || videoRef.current.currentTime, videoRef.current.duration || 0);
        }}
        onError={() => {
          if (!fallbackRequestedRef.current) {
            fallbackRequestedRef.current = true;
            onPlaybackError?.();
          }
        }}
        playsInline
      >
        {availableSubtitles.map((track, index) => {
          const language = typeof track.metadata?.language === 'string' ? track.metadata.language : 'und';
          const label = typeof track.metadata?.title === 'string' ? track.metadata.title : language;
          return <track key={`${track.url}-${index}`} kind="subtitles" src={track.url!}
                        srcLang={language} label={label} />;
        })}
      </video>

      <div className={`player__top-bar ${controlsVisible ? '' : 'player__top-bar--hidden'}`}>
        <button className="player__back" onClick={onBack} aria-label="Voltar">
          <Icon name="back" />
        </button>
        <h1 className="player__title-text">{title}</h1>
      </div>

      <PlayerOverlay
        markers={markers}
        currentTimeMs={currentTime * 1000}
        nextEpisode={nextEpisode}
        isNearEnd={isNearEnd}
        onSkip={(toMs) => {
          if (videoRef.current) videoRef.current.currentTime = toMs / 1000;
        }}
        onNextEpisode={playNextEpisode}
        autoPlayNextEpisode={autoPlayNextEpisode}
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
        onPlay={() => videoRef.current?.play()}
        onPause={() => videoRef.current?.pause()}
        onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t; }}
        onVolumeChange={setVolume}
        onMuteToggle={() => setMuted(m => !m)}
        onFullscreenToggle={toggleFullscreen}
        onPipToggle={togglePip}
        audioTracks={audioTracks}
        selectedAudioTrack={selectedAudioTrack}
        onAudioTrackChange={(trackId) => {
          if (hlsRef.current) hlsRef.current.audioTrack = trackId;
          setSelectedAudioTrack(trackId);
        }}
        subtitleTracks={availableSubtitles.map((track, index) => ({
          id: index,
          label: typeof track.metadata?.title === 'string'
            ? track.metadata.title
            : typeof track.metadata?.language === 'string' ? track.metadata.language : `Legenda ${index + 1}`,
        }))}
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
      />
    </div>
  );
}
