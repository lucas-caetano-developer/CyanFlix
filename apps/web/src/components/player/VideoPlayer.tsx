import React, { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { PlayerControls } from './PlayerControls';
import { PlayerOverlay } from './PlayerOverlay';

interface VideoPlayerProps {
  src: string;
  title: string;
  markers?: Array<{ type: string; start_ms: number; end_ms: number }>;
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  onBack: () => void;
  onNextEpisode?: () => void;
  startTime?: number; // resume position in seconds
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  subtitles?: Array<{ url?: string | null; metadata?: Record<string, unknown> }>;
  onPlaybackError?: () => void;
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
  subtitles = [],
  onPlaybackError
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const controlsTimeoutRef = useRef<number>();
  const fallbackRequestedRef = useRef(false);

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
    
    let hls: Hls;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      if (startTime) video.currentTime = startTime;
      video.play().catch(e => console.warn(e));
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (startTime) video.currentTime = startTime;
        video.play().catch(e => console.warn(e));
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && !fallbackRequestedRef.current) {
          fallbackRequestedRef.current = true;
          onPlaybackError?.();
        }
      });
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [src, startTime, onPlaybackError]);

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

  const isNearEnd = duration > 0 && duration - currentTime <= 30;

  return (
    <div 
      className="player"
      ref={containerRef}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={hideControls}
      style={{ 
        position: 'fixed', inset: 0, background: '#000', 
        cursor: controlsVisible ? 'default' : 'none',
        display: 'flex', flexDirection: 'column', overflow: 'hidden'
      }}
    >
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onProgress={onProgress}
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (!fallbackRequestedRef.current) {
            fallbackRequestedRef.current = true;
            onPlaybackError?.();
          }
        }}
        playsInline
      >
        {subtitles.filter((track) => track.url).map((track, index) => {
          const language = typeof track.metadata?.language === 'string' ? track.metadata.language : 'und';
          const label = typeof track.metadata?.title === 'string' ? track.metadata.title : language;
          return <track key={`${track.url}-${index}`} kind="subtitles" src={track.url!}
                        srcLang={language} label={label} default={track.metadata?.default === true} />;
        })}
      </video>

      <div 
        className="player__top-bar"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '20px clamp(1rem, 4vw, 4%)',
          background: 'linear-gradient(rgba(0,0,0,0.8), transparent)',
          opacity: controlsVisible ? 1 : 0, transition: 'opacity 0.3s',
          display: 'flex', alignItems: 'center', gap: '20px',
          pointerEvents: controlsVisible ? 'auto' : 'none',
          zIndex: 10
        }}
      >
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '24px' }}>
          ←
        </button>
        <h1 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: 'normal' }}>{title}</h1>
      </div>

      <PlayerOverlay
        markers={markers}
        currentTimeMs={currentTime * 1000}
        nextEpisode={nextEpisode}
        isNearEnd={isNearEnd}
        onSkip={(toMs) => {
          if (videoRef.current) videoRef.current.currentTime = toMs / 1000;
        }}
        onNextEpisode={() => onNextEpisode && onNextEpisode()}
      />

      <PlayerControls
        videoRef={videoRef}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        buffered={buffered}
        volume={volume}
        muted={muted}
        fullscreen={fullscreen}
        title={title}
        visible={controlsVisible}
        onPlay={() => videoRef.current?.play()}
        onPause={() => videoRef.current?.pause()}
        onSeek={(t) => { if (videoRef.current) videoRef.current.currentTime = t; }}
        onVolumeChange={setVolume}
        onMuteToggle={() => setMuted(m => !m)}
        onFullscreenToggle={toggleFullscreen}
        onPipToggle={togglePip}
      />
    </div>
  );
}
