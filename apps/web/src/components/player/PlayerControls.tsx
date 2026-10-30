import React, { memo, useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { formatMs } from '../../lib/utils';
import { markerLabel, markerTone } from '../../lib/player';
import type { Marker } from '../../lib/types';
import { Icon } from '../ui/Icon';

interface PlayerControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSeekBy?: (delta: number) => void;
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
  subtitleStyle: 'small' | 'medium' | 'large';
  onSubtitleStyleChange: (style: 'small' | 'medium' | 'large') => void;
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
  // New props
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  onNextEpisode?: () => void;
  hasOpeningMarker?: boolean;
  autoSkipOpening?: boolean;
  onAutoSkipOpeningChange?: (enabled: boolean) => void;
}

type SettingsPage =
  | null
  | 'audio'
  | 'subtitles'
  | 'subtitleSize'
  | 'quality'
  | 'speed'
  | 'nextEpisode'
  | 'skipOpening'
  | 'episodes';

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SUBTITLE_SIZE_LABELS: Record<string, string> = { small: 'Pequena', medium: 'Média', large: 'Grande' };

function dynamicStyle(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

export const PlayerControls = memo(function PlayerControls({
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
  onSeekBy,
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
  menuOpen: menuOpenProp,
  nextEpisode,
  onNextEpisode,
  hasOpeningMarker = false,
  autoSkipOpening = false,
  onAutoSkipOpeningChange,
}: PlayerControlsProps & { menuOpen?: boolean }) {
  const progressRef = useRef<HTMLDivElement>(null);
  const settingsWrapperRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreviewTime, setDragPreviewTime] = useState<number | null>(null);
  const [internalMenuOpen, setInternalMenuOpen] = useState(false);
  const menuOpen = menuOpenProp !== undefined ? menuOpenProp : internalMenuOpen;
  const setMenuOpen = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setInternalMenuOpen((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      onMenuOpenChange?.(next);
      return next;
    });
  }, [onMenuOpenChange]);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>(null);
  const [preview, setPreview] = useState<{ left: number; time: number } | null>(null);
  const settingsPanelId = useId();
  const settingsTitleId = useId();

  useEffect(() => {
    onInteractionChange?.(menuOpen || isDragging);
    onMenuOpenChange?.(menuOpen);
  }, [isDragging, menuOpen, onInteractionChange, onMenuOpenChange]);

  useEffect(() => () => onInteractionChange?.(false), [onInteractionChange]);

  useEffect(() => {
    if (!menuOpen) {
      setSettingsPage(null);
      return;
    }
    const firstControl = settingsPanelRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"], button');
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
      if (settingsPage !== null) {
        setSettingsPage(null);
      } else {
        setMenuOpen(false);
        settingsButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen, settingsPage]);

  // Progress bar: calculate position from clientX
  const posFromClientX = useCallback((clientX: number): { percentage: number; time: number; left: number } | null => {
    if (!progressRef.current || duration <= 0) return null;
    const rect = progressRef.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    return {
      percentage,
      time: percentage * duration,
      left: Math.min(96, Math.max(4, percentage * 100)),
    };
  }, [duration]);

  // P5 fix: during drag, only update local preview state, NOT call onSeek
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    const pos = posFromClientX(event.clientX);
    if (pos) {
      setDragPreviewTime(pos.time);
      setPreview({ left: pos.left, time: pos.time });
    }
  };

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      const pos = posFromClientX(event.clientX);
      if (pos) {
        setDragPreviewTime(pos.time);
        setPreview({ left: pos.left, time: pos.time });
      }
    } else {
      // Hover preview (no seek)
      const pos = posFromClientX(event.clientX);
      if (pos) setPreview({ left: pos.left, time: pos.time });
    }
  }, [isDragging, posFromClientX]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    (event.currentTarget as HTMLDivElement).releasePointerCapture?.(event.pointerId);
    setIsDragging(false);
    // P5: onSeek called ONCE on pointerup
    const pos = posFromClientX(event.clientX);
    if (pos) onSeek(pos.time);
    setDragPreviewTime(null);
  }, [isDragging, onSeek, posFromClientX]);

  const handlePointerCancel = () => {
    setIsDragging(false);
    setDragPreviewTime(null);
  };

  const progressPercentage = duration > 0
    ? Math.min(100, Math.max(0, ((dragPreviewTime ?? currentTime) / duration) * 100))
    : 0;
  const bufferedPercentage = Math.min(100, Math.max(0, buffered * 100));

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
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (playing) onPause(); else onPlay();
    }
  };

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    setSettingsPage(null);
    if (restoreFocus) settingsButtonRef.current?.focus();
  };

  // Helper: current label for each setting
  const currentAudioLabel = audioTracks.find((t) => t.id === selectedAudioTrack)?.label ?? '—';
  const currentSubtitleLabel = selectedSubtitleTrack < 0
    ? 'Desligadas'
    : subtitleTracks.find((t) => t.id === selectedSubtitleTrack)?.label ?? '—';
  const currentSubtitleSizeLabel = SUBTITLE_SIZE_LABELS[subtitleStyle] ?? subtitleStyle;
  const currentQualityLabel = selectedQuality < 0 ? 'Automática' : qualityLevels.find((l) => l.id === selectedQuality)?.label ?? '—';
  const currentSpeedLabel = playbackRate === 1 ? 'Normal' : `${playbackRate}×`;
  const currentNextEpLabel = autoPlayNextEpisode ? 'Automático' : 'Manual';
  const currentSkipLabel = autoSkipOpening ? 'Automático' : 'Manual';

  const renderSettingsRoot = () => (
    <div role="menu" aria-labelledby={settingsTitleId}>
      {audioTracks.length > 1 && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('audio')}
        >
          <span className="player__settings-row-label">Áudio</span>
          <span className="player__settings-row-value">{currentAudioLabel}</span>
          <Icon name="chevron-right" />
        </button>
      )}
      {subtitleTracks.length > 0 && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('subtitles')}
        >
          <span className="player__settings-row-label">Legendas</span>
          <span className="player__settings-row-value">{currentSubtitleLabel}</span>
          <Icon name="chevron-right" />
        </button>
      )}
      {subtitleTracks.length > 0 && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('subtitleSize')}
        >
          <span className="player__settings-row-label">Tamanho da legenda</span>
          <span className="player__settings-row-value">{currentSubtitleSizeLabel}</span>
          <Icon name="chevron-right" />
        </button>
      )}
      {qualityLevels.length > 0 && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('quality')}
        >
          <span className="player__settings-row-label">Qualidade</span>
          <span className="player__settings-row-value">{currentQualityLabel}</span>
          <Icon name="chevron-right" />
        </button>
      )}
      <button
        className="player__settings-row"
        role="menuitem"
        onClick={() => setSettingsPage('speed')}
      >
        <span className="player__settings-row-label">Velocidade</span>
        <span className="player__settings-row-value">{currentSpeedLabel}</span>
        <Icon name="chevron-right" />
      </button>
      {episodes.length > 1 && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('nextEpisode')}
        >
          <span className="player__settings-row-label">Próximo episódio</span>
          <span className="player__settings-row-value">{currentNextEpLabel}</span>
          <Icon name="chevron-right" />
        </button>
      )}
      {hasOpeningMarker && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('skipOpening')}
        >
          <span className="player__settings-row-label">Pular abertura</span>
          <span className="player__settings-row-value">{currentSkipLabel}</span>
          <Icon name="chevron-right" />
        </button>
      )}
      {episodes.length > 1 && currentEpisodeId && (
        <button
          className="player__settings-row"
          role="menuitem"
          onClick={() => setSettingsPage('episodes')}
        >
          <span className="player__settings-row-label">Episódio</span>
          <span className="player__settings-row-value">
            {episodes.find((e) => e.id === currentEpisodeId)
              ? `E${episodes.find((e) => e.id === currentEpisodeId)!.number}`
              : '—'}
          </span>
          <Icon name="chevron-right" />
        </button>
      )}
    </div>
  );

  const renderSubPage = (
    pageTitle: string,
    options: Array<{ id: number | string; label: string }>,
    selectedId: number | string,
    onSelect: (id: number | string) => void,
    extraOption?: { id: number | string; label: string },
  ) => (
    <div role="menu" aria-label={pageTitle}>
      <button
        className="player__settings-back"
        onClick={() => setSettingsPage(null)}
        aria-label="Voltar para configurações"
      >
        <Icon name="chevron-left" />
        <span>{pageTitle}</span>
      </button>
      <div className="player__settings-options">
        {extraOption && (
          <button
            className="player__settings-option"
            role="menuitemradio"
            aria-checked={extraOption.id === selectedId}
            onClick={() => { onSelect(extraOption.id); setSettingsPage(null); }}
          >
            <span className="player__settings-option-check">
              {extraOption.id === selectedId && <Icon name="check" />}
            </span>
            {extraOption.label}
          </button>
        )}
        {options.map((opt) => (
          <button
            key={String(opt.id)}
            className="player__settings-option"
            role="menuitemradio"
            aria-checked={opt.id === selectedId}
            onClick={() => { onSelect(opt.id); setSettingsPage(null); }}
          >
            <span className="player__settings-option-check">
              {opt.id === selectedId && <Icon name="check" />}
            </span>
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderSettingsContent = () => {
    switch (settingsPage) {
      case 'audio':
        return renderSubPage(
          'Áudio',
          audioTracks,
          selectedAudioTrack,
          (id) => onAudioTrackChange(Number(id)),
        );
      case 'subtitles':
        return renderSubPage(
          'Legendas',
          subtitleTracks,
          selectedSubtitleTrack,
          (id) => onSubtitleTrackChange(Number(id)),
          { id: -1, label: 'Desligadas' },
        );
      case 'subtitleSize':
        return renderSubPage(
          'Tamanho da legenda',
          [{ id: 'small', label: 'Pequena' }, { id: 'medium', label: 'Média' }, { id: 'large', label: 'Grande' }],
          subtitleStyle,
          (id) => onSubtitleStyleChange(id as 'small' | 'medium' | 'large'),
        );
      case 'quality':
        return renderSubPage(
          'Qualidade',
          qualityLevels,
          selectedQuality,
          (id) => onQualityChange(Number(id)),
          { id: -1, label: 'Automática' },
        );
      case 'speed':
        return renderSubPage(
          'Velocidade',
          SPEED_OPTIONS.map((rate) => ({ id: rate, label: rate === 1 ? 'Normal' : `${rate}×` })),
          playbackRate,
          (id) => onPlaybackRateChange(Number(id)),
        );
      case 'nextEpisode':
        return renderSubPage(
          'Próximo episódio',
          [{ id: 'on', label: 'Automático' }, { id: 'off', label: 'Manual' }],
          autoPlayNextEpisode ? 'on' : 'off',
          (id) => onAutoPlayNextEpisodeChange(id === 'on'),
        );
      case 'skipOpening':
        return renderSubPage(
          'Pular abertura',
          [{ id: 'auto', label: 'Automático' }, { id: 'manual', label: 'Manual' }],
          autoSkipOpening ? 'auto' : 'manual',
          (id) => onAutoSkipOpeningChange?.(id === 'auto'),
        );
      case 'episodes':
        return renderSubPage(
          'Episódios',
          episodes.map((ep) => ({ id: ep.id, label: `E${ep.number} · ${ep.title || `Episódio ${ep.number}`}` })),
          currentEpisodeId ?? '',
          (id) => { onEpisodeChange(String(id)); closeMenu(); },
        );
      default:
        return renderSettingsRoot();
    }
  };

  return (
    <div className={`player__controls ${visible ? 'player__controls--visible' : 'player__controls--hidden'}`}>
      <div
        className={`player__progress${isDragging ? ' player__progress--dragging' : ''}`}
        ref={progressRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
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
          {/* Seek back 10s */}
          <button
            className="player__btn"
            aria-label="Voltar 10 segundos"
            onClick={() => onSeekBy ? onSeekBy(-10) : onSeek(Math.max(0, currentTime - 10))}
          >
            <Icon name="replay-10" />
          </button>

          {/* Play/Pause */}
          <button
            className="player__btn player__btn--play"
            onClick={playing ? onPause : onPlay}
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
            data-spatial-initial
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>

          {/* Seek forward 10s */}
          <button
            className="player__btn"
            aria-label="Avançar 10 segundos"
            onClick={() => onSeekBy ? onSeekBy(10) : onSeek(Math.min(duration, currentTime + 10))}
          >
            <Icon name="forward-10" />
          </button>

          <div className="player__volume-wrapper">
            <button className="player__btn" onClick={onMuteToggle} aria-label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'} aria-pressed={muted || volume === 0}>
              <Icon name={muted || volume === 0 ? 'muted' : 'volume'} />
            </button>
            <input
              className="player__volume-slider"
              type="range" min={0} max={1} step={0.01}
              value={muted ? 0 : volume}
              onChange={(event) => onVolumeChange(parseFloat(event.target.value))}
              aria-label="Volume"
            />
          </div>

          <div className="player__time" aria-hidden="true">
            {formatMs(currentTime * 1000)} <span>/</span> {formatMs(duration * 1000)}
          </div>
        </div>

        <div className="player__controls-right">
          {/* Next episode button */}
          {nextEpisode && onNextEpisode && (
            <button className="player__btn" onClick={onNextEpisode} aria-label={`Próximo episódio: ${nextEpisode.title || `Episódio ${nextEpisode.number}`}`}>
              <Icon name="next-episode" />
            </button>
          )}

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
                  <span>{settingsPage === null ? 'Áudio, legendas e reprodução' : ''}</span>
                </div>
                {renderSettingsContent()}
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
});
