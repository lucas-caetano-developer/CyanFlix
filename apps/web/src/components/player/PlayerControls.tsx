import React, { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { formatMs } from '../../lib/utils';
import { markerLabel, markerTone } from '../../lib/player';
import type { Marker } from '../../lib/types';
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
  markers: Marker[];
  subtitleStyle: "small" | "medium" | "large";
  onSubtitleStyleChange: (style: "small" | "medium" | "large") => void;
  autoPlayNextEpisode: boolean;
  onAutoPlayNextEpisodeChange: (enabled: boolean) => void;
  episodes: Array<{ id: string; number: number; title?: string | null }>;
  currentEpisodeId?: string;
  onEpisodeChange: (episodeId: string) => void;
  pipAvailable?: boolean;
  pipActive?: boolean;
  fullscreenAvailable?: boolean;
  onInteractionChange?: (active: boolean) => void;
  onMenuOpenChange?: (open: boolean) => void;
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
  pipAvailable = true,
  pipActive = false,
  fullscreenAvailable = true,
  onInteractionChange,
  onMenuOpenChange,
}: PlayerControlsProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const settingsWrapperRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [preview, setPreview] = useState<{ left: number; time: number } | null>(null);
  const settingsPanelId = useId();
  const settingsTitleId = useId();

  useEffect(() => {
    onInteractionChange?.(menuOpen || isDragging);
    onMenuOpenChange?.(menuOpen);
  }, [isDragging, menuOpen, onInteractionChange, onMenuOpenChange]);

  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const firstControl = settingsPanelRef.current?.querySelector<HTMLElement>('select, button, input');
    firstControl?.focus();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!settingsWrapperRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      settingsButtonRef.current?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  const seekFromClientX = useCallback((clientX: number) => {
    if (!progressRef.current || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const time = percentage * duration;
    setPreview({
      left: Math.min(96, Math.max(4, percentage * 100)),
      time,
    });
    onSeek(time);
  }, [duration, onSeek]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    event.preventDefault();
    setIsDragging(true);
    seekFromClientX(event.clientX);
  };

  const handleHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!progressRef.current || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    setPreview({
      left: Math.min(96, Math.max(4, percentage * 100)),
      time: percentage * duration,
    });
  };

  useEffect(() => {
    if (!isDragging) return;
    const handlePointerMove = (event: PointerEvent) => seekFromClientX(event.clientX);
    const stopDragging = () => setIsDragging(false);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [isDragging, seekFromClientX]);

  const progressPercentage = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const bufferedPercentage = Math.min(100, Math.max(0, buffered * 100));
  const dynamicStyle = (values: Record<string, string | number>) => values as CSSProperties;

  const handleProgressKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      onSeek(Math.max(0, Math.min(duration, currentTime + (event.key === 'ArrowRight' ? 10 : -10))));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      onSeek(event.key === 'End' ? duration : 0);
    }
  };

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) settingsButtonRef.current?.focus();
  };

  return (
    <div className={`player__controls ${visible ? 'player__controls--visible' : 'player__controls--hidden'}`}>
      <div
        className={`player__progress${isDragging ? ' player__progress--dragging' : ''}`}
        ref={progressRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handleHover}
        onPointerLeave={() => { if (!isDragging) setPreview(null); }}
        onKeyDown={handleProgressKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Posição da reprodução"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.max(0, Math.min(Math.round(duration), Math.round(currentTime)))}
        aria-valuetext={`${formatMs(currentTime * 1000)} de ${formatMs(duration * 1000)}`}
      >
        <div className="player__progress-buffered" style={dynamicStyle({ width: `${bufferedPercentage}%` })} />
        <div className="player__progress-current" style={dynamicStyle({ width: `${progressPercentage}%` })} />
        {duration > 0 && markers.map((marker, index) => {
          if (!Number.isFinite(marker.start_ms) || !Number.isFinite(marker.end_ms) || marker.end_ms <= marker.start_ms) return null;
          const start = Math.max(0, Math.min(100, marker.start_ms / 1000 / duration * 100));
          const end = Math.max(start, Math.min(100, marker.end_ms / 1000 / duration * 100));
          return <span
            key={`${marker.type}-${marker.start_ms}-${index}`}
            className={`player__timeline-marker player__timeline-marker--${markerTone(marker.type)}`}
            title={markerLabel(marker.type)}
            style={dynamicStyle({ left: `${start}%`, width: `${Math.max(0.2, end - start)}%` })}
            aria-hidden="true"
          />;
        })}
        <div className={`player__progress-thumb ${isDragging ? 'player__progress-thumb--visible' : ''}`} style={dynamicStyle({ left: `${progressPercentage}%` })} />
        {preview && (
          <div className="player__progress-preview" style={dynamicStyle({ left: `${preview.left}%` })} aria-hidden="true">
            {formatMs(preview.time * 1000)}
          </div>
        )}
      </div>

      <div className="player__controls-bar">
        <div className="player__controls-left">
          <button className="player__btn" onClick={playing ? onPause : onPlay} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>

          <div className="player__volume-wrapper">
            <button className="player__btn" onClick={onMuteToggle} aria-label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'} aria-pressed={muted || volume === 0}>
              <Icon name={muted || volume === 0 ? 'muted' : 'volume'} />
            </button>
            <input
              className="player__volume-slider"
              type="range" min={0} max={1} step={0.01}
              value={muted ? 0 : volume}
              onChange={event => onVolumeChange(parseFloat(event.target.value))}
              aria-label="Volume"
            />
          </div>

          <div className="player__time" aria-hidden="true">
            {formatMs(currentTime * 1000)} <span>/</span> {formatMs(duration * 1000)}
          </div>
        </div>

        <div className="player__controls-right">
          <div
            className="player__settings-anchor"
            ref={settingsWrapperRef}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next && !event.currentTarget.contains(next)) closeMenu();
            }}
          >
            <button
              ref={settingsButtonRef}
              className="player__btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Configurações de reprodução"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls={settingsPanelId}
            >
              <Icon name="settings" />
            </button>

            {menuOpen && (
              <div
                ref={settingsPanelRef}
                id={settingsPanelId}
                className="player__settings"
                role="dialog"
                aria-modal="false"
                aria-labelledby={settingsTitleId}
              >
                <div className="player__settings-heading">
                  <p id={settingsTitleId}>Configurações</p>
                  <span>Áudio, legendas e reprodução</span>
                </div>

                {episodes.length > 1 && currentEpisodeId && (
                  <fieldset className="player__settings-group">
                    <legend>Temporada atual</legend>
                    <label className="player__track-control">
                      <span>Episódio</span>
                      <select aria-label="Selecionar episódio" value={currentEpisodeId} onChange={(event) => onEpisodeChange(event.target.value)}>
                        {episodes.map((episode) => <option key={episode.id} value={episode.id}>E{episode.number} · {episode.title || `Episódio ${episode.number}`}</option>)}
                      </select>
                    </label>
                  </fieldset>
                )}

                {(audioTracks.length > 1 || subtitleTracks.length > 0) && (
                  <fieldset className="player__settings-group">
                    <legend>Áudio e legendas</legend>
                    {audioTracks.length > 1 && (
                      <label className="player__track-control">
                        <span>Áudio</span>
                        <select aria-label="Faixa de áudio" value={selectedAudioTrack >= 0 ? selectedAudioTrack : audioTracks[0]?.id ?? -1} onChange={(event) => onAudioTrackChange(Number(event.target.value))}>
                          {audioTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
                        </select>
                      </label>
                    )}
                    {subtitleTracks.length > 0 && (
                      <>
                        <label className="player__track-control">
                          <span>Legendas</span>
                          <select aria-label="Faixa de legenda" value={selectedSubtitleTrack} onChange={(event) => onSubtitleTrackChange(Number(event.target.value))}>
                            <option value={-1}>Desligadas</option>
                            {subtitleTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
                          </select>
                        </label>
                        <label className="player__track-control">
                          <span>Tamanho</span>
                          <select aria-label="Tamanho da legenda" value={subtitleStyle} onChange={(event) => onSubtitleStyleChange(event.target.value as "small" | "medium" | "large")}>
                            <option value="small">Pequena</option>
                            <option value="medium">Média</option>
                            <option value="large">Grande</option>
                          </select>
                        </label>
                      </>
                    )}
                  </fieldset>
                )}

                <fieldset className="player__settings-group">
                  <legend>Reprodução</legend>
                  <label className="player__track-control">
                    <span>Velocidade</span>
                    <select aria-label="Velocidade de reprodução" value={playbackRate} onChange={(event) => onPlaybackRateChange(Number(event.target.value))}>
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                        <option key={rate} value={rate}>{rate === 1 ? 'Normal' : `${rate}×`}</option>
                      ))}
                    </select>
                  </label>
                  {qualityLevels.length > 0 && (
                    <label className="player__track-control">
                      <span>Qualidade</span>
                      <select aria-label="Qualidade de vídeo" value={selectedQuality} onChange={(event) => onQualityChange(Number(event.target.value))}>
                        <option value={-1}>Automática</option>
                        {qualityLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
                      </select>
                    </label>
                  )}
                  {episodes.length > 1 && (
                    <label className="player__track-control">
                      <span>Próximo episódio</span>
                      <select aria-label="Reprodução automática do próximo episódio" value={autoPlayNextEpisode ? "on" : "off"} onChange={(event) => onAutoPlayNextEpisodeChange(event.target.value === "on")}>
                        <option value="on">Automático</option>
                        <option value="off">Manual</option>
                      </select>
                    </label>
                  )}
                </fieldset>
              </div>
            )}
          </div>

          {pipAvailable && (
            <button className="player__btn" onClick={onPipToggle} aria-label="Picture in Picture" aria-pressed={pipActive}>
              <Icon name="pip" />
            </button>
          )}
          {fullscreenAvailable && (
            <button className="player__btn" onClick={onFullscreenToggle} aria-label={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'} aria-pressed={fullscreen}>
              <Icon name={fullscreen ? 'exit-fullscreen' : 'fullscreen'} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
