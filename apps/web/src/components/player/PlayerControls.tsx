import React, { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { formatMs } from '../../lib/utils';
import { Icon } from '../ui/Icon';

interface PlayerControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number; // percentage 0-1
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onMuteToggle: () => void;
  onFullscreenToggle: () => void;
  onPipToggle: () => void;
  visible: boolean;
  audioTracks: Array<{ id: number; label: string }>;
  selectedAudioTrack: number;
  onAudioTrackChange: (trackId: number) => void;
  subtitleTracks: Array<{ id: number; label: string }>;
  selectedSubtitleTrack: number;
  onSubtitleTrackChange: (trackId: number) => void;
  playbackRate: number;
  onPlaybackRateChange: (rate: number) => void;
  qualityLevels: Array<{ id: number; label: string }>;
  selectedQuality: number;
  onQualityChange: (levelId: number) => void;
  markers: Array<{ type: string; start_ms: number; end_ms: number }>;
  subtitleStyle: "small" | "medium" | "large";
  onSubtitleStyleChange: (style: "small" | "medium" | "large") => void;
  autoPlayNextEpisode: boolean;
  onAutoPlayNextEpisodeChange: (enabled: boolean) => void;
  episodes: Array<{ id: string; number: number; title?: string | null }>;
  currentEpisodeId?: string;
  onEpisodeChange: (episodeId: string) => void;
}

export function PlayerControls({
  playing,
  currentTime,
  duration,
  buffered,
  volume,
  muted,
  fullscreen,
  onPlay,
  onPause,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onFullscreenToggle,
  onPipToggle,
  visible,
  audioTracks,
  selectedAudioTrack,
  onAudioTrackChange,
  subtitleTracks,
  selectedSubtitleTrack,
  onSubtitleTrackChange,
  playbackRate,
  onPlaybackRateChange,
  qualityLevels,
  selectedQuality,
  onQualityChange,
  markers,
  subtitleStyle,
  onSubtitleStyleChange,
  autoPlayNextEpisode,
  onAutoPlayNextEpisodeChange,
  episodes,
  currentEpisodeId,
  onEpisodeChange,
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
  const dynamicStyle = (values: Record<string, string | number>) => values as CSSProperties;

  const handleProgressKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      onSeek(Math.max(0, Math.min(duration, currentTime + (event.key === 'ArrowRight' ? 10 : -10))));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      onSeek(event.key === 'End' ? duration : 0);
    }
  };

  return (
    <div className={`player__controls ${visible ? 'player__controls--visible' : 'player__controls--hidden'}`}>
      <div 
        className="player__progress"
        ref={progressRef}
        onPointerDown={handlePointerDown}
        onKeyDown={handleProgressKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Posição da reprodução"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.max(0, Math.round(currentTime))}
        aria-valuetext={`${formatMs(currentTime * 1000)} de ${formatMs(duration * 1000)}`}
      >
        <div className="player__progress-buffered" style={dynamicStyle({ width: `${bufferedPercentage}%` })} />
        <div className="player__progress-current" style={dynamicStyle({ width: `${progressPercentage}%` })} />
        {duration > 0 && markers.map((marker, index) => {
          const start = Math.max(0, Math.min(100, marker.start_ms / 1000 / duration * 100));
          const end = Math.max(start, Math.min(100, marker.end_ms / 1000 / duration * 100));
          return <span key={`${marker.type}-${marker.start_ms}-${index}`} className={`player__timeline-marker player__timeline-marker--${marker.type}`}
                       title={markerLabel(marker.type)} style={dynamicStyle({ left: `${start}%`, width: `${Math.max(0.2, end - start)}%` })} />;
        })}
        <div className={`player__progress-thumb ${isDragging ? 'player__progress-thumb--visible' : ''}`} style={dynamicStyle({ left: `${progressPercentage}%` })} />
      </div>

      <div className="player__controls-bar">
        <div className="player__controls-left">
          <button className="player__btn" onClick={playing ? onPause : onPlay} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          
          <div className="player__volume-wrapper">
            <button className="player__btn" onClick={onMuteToggle} aria-label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'}>
              <Icon name={muted || volume === 0 ? 'muted' : 'volume'} />
            </button>
            <input 
              className="player__volume-slider"
              type="range" min={0} max={1} step={0.01} 
              value={muted ? 0 : volume} 
              onChange={e => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Volume"
            />
          </div>

          <div className="player__time">
            {formatMs(currentTime * 1000)} / {formatMs(duration * 1000)}
          </div>
        </div>

        <div className="player__controls-right">
          {episodes.length > 1 && currentEpisodeId && (
            <label className="player__track-control">
              <span>Episódio</span>
              <select aria-label="Selecionar episódio" value={currentEpisodeId} onChange={(event) => onEpisodeChange(event.target.value)}>
                {episodes.map((episode) => <option key={episode.id} value={episode.id}>E{episode.number} · {episode.title || `Episódio ${episode.number}`}</option>)}
              </select>
            </label>
          )}
          {audioTracks.length > 1 && (
            <label className="player__track-control">
              <span>Áudio</span>
              <select aria-label="Faixa de áudio" value={selectedAudioTrack}
                      onChange={(event) => onAudioTrackChange(Number(event.target.value))}>
                {audioTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
              </select>
            </label>
          )}
          {subtitleTracks.length > 0 && (
            <>
              <label className="player__track-control">
                <span>Legendas</span>
                <select aria-label="Faixa de legenda" value={selectedSubtitleTrack}
                        onChange={(event) => onSubtitleTrackChange(Number(event.target.value))}>
                  <option value={-1}>Desligadas</option>
                  {subtitleTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
                </select>
              </label>
              <label className="player__track-control">
                <span>Tamanho</span>
                <select aria-label="Tamanho da legenda" value={subtitleStyle}
                        onChange={(event) => onSubtitleStyleChange(event.target.value as "small" | "medium" | "large")}>
                  <option value="small">Pequena</option>
                  <option value="medium">Média</option>
                  <option value="large">Grande</option>
                </select>
              </label>
            </>
          )}
          <label className="player__track-control">
            <span>Velocidade</span>
            <select aria-label="Velocidade de reprodução" value={playbackRate}
                    onChange={(event) => onPlaybackRateChange(Number(event.target.value))}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <option key={rate} value={rate}>{rate === 1 ? 'Normal' : `${rate}×`}</option>
              ))}
            </select>
          </label>
          {qualityLevels.length > 0 && (
            <label className="player__track-control">
              <span>Qualidade</span>
              <select aria-label="Qualidade de vídeo" value={selectedQuality}
                      onChange={(event) => onQualityChange(Number(event.target.value))}>
                <option value={-1}>Automática</option>
                {qualityLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
              </select>
            </label>
          )}
          <label className="player__track-control">
            <span>Próximo</span>
            <select aria-label="Reprodução automática do próximo episódio" value={autoPlayNextEpisode ? "on" : "off"}
                    onChange={(event) => onAutoPlayNextEpisodeChange(event.target.value === "on")}>
              <option value="on">Automático</option>
              <option value="off">Manual</option>
            </select>
          </label>
          <button className="player__btn" onClick={onPipToggle} aria-label="Picture in Picture">
            <Icon name="pip" />
          </button>
          <button className="player__btn" onClick={onFullscreenToggle} aria-label={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}>
            <Icon name={fullscreen ? 'exit-fullscreen' : 'fullscreen'} />
          </button>
        </div>
      </div>
    </div>
  );
}

function markerLabel(type: string): string {
  if (type === 'opening') return 'Abertura';
  if (type === 'ending') return 'Encerramento';
  if (type === 'credits') return 'Créditos';
  if (type === 'next_episode') return 'Próximo episódio';
  return type;
}
