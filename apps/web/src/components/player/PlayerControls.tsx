import React, { useState, useRef, useEffect, useCallback } from 'react';
import { formatMs } from '../../lib/utils';

interface PlayerControlsProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number; // percentage 0-1
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  title: string;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onFullscreenToggle: () => void;
  onPipToggle: () => void;
  visible: boolean;
}

export function PlayerControls({
  playing,
  currentTime,
  duration,
  buffered,
  volume,
  muted,
  fullscreen,
  title,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onFullscreenToggle,
  onPipToggle,
  visible,
}: PlayerControlsProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    onSeek(percentage * duration);
  }, [duration, onSeek]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleProgressClick(e);
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent) => {
      if (isDragging) {
        handleProgressClick(e);
      }
    };
    const handlePointerUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDragging, handleProgressClick]);

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercentage = buffered * 100;

  return (
    <div className={`player__controls ${visible ? 'player__controls--visible' : ''}`} style={{
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.3s',
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
      padding: '20px clamp(1rem, 4vw, 4%)',
      display: 'flex', flexDirection: 'column', gap: '10px',
      pointerEvents: visible ? 'auto' : 'none',
      zIndex: 10
    }}>
      <div 
        className="player__progress-container"
        ref={progressRef}
        onPointerDown={handlePointerDown}
        style={{ height: '5px', background: 'rgba(255,255,255,0.2)', cursor: 'pointer', position: 'relative', borderRadius: '2px' }}
      >
        <div className="player__progress-buffered" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${bufferedPercentage}%`, background: 'rgba(255,255,255,0.4)', borderRadius: '2px' }} />
        <div className="player__progress-current" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${progressPercentage}%`, background: 'var(--red)', borderRadius: '2px' }} />
        <div className="player__progress-thumb" style={{
          position: 'absolute', left: `${progressPercentage}%`, top: '50%', transform: 'translate(-50%, -50%)',
          width: '12px', height: '12px', background: 'var(--red)', borderRadius: '50%', opacity: isDragging ? 1 : 0, transition: 'opacity 0.2s'
        }} />
      </div>

      <div className="player__controls-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="player__controls-left" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button className="player__btn" onClick={playing ? onPause : onPlay} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '24px' }}>
            {playing ? '⏸' : '▶'}
          </button>
          
          <div className="player__volume-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="player__btn" onClick={onMuteToggle} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px' }}>
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔈' : '🔊'}
            </button>
            <input 
              className="player__volume-slider"
              type="range" min={0} max={1} step={0.01} 
              value={muted ? 0 : volume} 
              onChange={e => onVolumeChange(parseFloat(e.target.value))}
              style={{ width: '80px', cursor: 'pointer' }}
            />
          </div>

          <div className="player__time" style={{ color: 'white', fontSize: '14px', fontFamily: 'monospace' }}>
            {formatMs(currentTime * 1000)} / {formatMs(duration * 1000)}
          </div>
        </div>

        <div className="player__controls-right" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button className="player__btn" onClick={onPipToggle} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px' }} title="Picture in Picture">
            ⊡
          </button>
          <button className="player__btn" onClick={onFullscreenToggle} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '20px' }}>
            {fullscreen ? '⛶' : '⛶'}
          </button>
        </div>
      </div>
    </div>
  );
}
