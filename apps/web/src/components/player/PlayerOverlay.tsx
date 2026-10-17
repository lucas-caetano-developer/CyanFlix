import React, { useEffect, useState } from 'react';

interface PlayerOverlayProps {
  markers: Array<{ type: string; start_ms: number; end_ms: number }>;
  currentTimeMs: number;
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  isNearEnd: boolean; // true when within last 30 seconds
  onSkip: (toMs: number) => void;
  onNextEpisode: () => void;
  autoPlayNextEpisode: boolean;
}

export function PlayerOverlay({
  markers,
  currentTimeMs,
  nextEpisode,
  isNearEnd,
  onSkip,
  onNextEpisode,
  autoPlayNextEpisode,
}: PlayerOverlayProps) {
  const [countdown, setCountdown] = useState(10);
  const [autoPlayCancelled, setAutoPlayCancelled] = useState(false);

  // Find active marker
  const activeMarker = markers?.find(m => currentTimeMs >= m.start_ms && currentTimeMs < m.end_ms);
  const showNextEpisode = isNearEnd || activeMarker?.type === 'next_episode';
  const skippableMarker = activeMarker && activeMarker.type !== 'next_episode' ? activeMarker : null;

  useEffect(() => {
    let interval: number;
    if (showNextEpisode && nextEpisode && autoPlayNextEpisode && !autoPlayCancelled) {
      if (countdown > 0) {
        interval = window.setInterval(() => {
          setCountdown(c => Math.max(0, c - 1));
        }, 1000);
      } else if (countdown === 0) {
        onNextEpisode();
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showNextEpisode, nextEpisode, autoPlayNextEpisode, autoPlayCancelled, countdown, onNextEpisode]);

  // Reset countdown if near end status changes
  useEffect(() => {
    if (!showNextEpisode) {
      setCountdown(10);
      setAutoPlayCancelled(false);
    }
  }, [showNextEpisode]);

  return (
    <div className="player__overlay">
      
      {skippableMarker && (
        <div className={`player__skip ${showNextEpisode ? 'player__skip--left' : 'player__skip--right'}`}>
          <button 
            className="player__skip-btn"
            onClick={() => onSkip(skippableMarker.end_ms)}
          >
            {skippableMarker.type === 'opening' ? 'Pular abertura' : skippableMarker.type === 'ending' ? 'Pular encerramento' : 'Pular créditos'}
          </button>
        </div>
      )}

      {showNextEpisode && nextEpisode && (
        <div className="player__next-episode">
          <div className="player__next-kicker" aria-live="polite">
            {autoPlayNextEpisode && !autoPlayCancelled ? `Próximo episódio em ${countdown}s` : 'Próximo episódio'}
          </div>
          <div className="player__next-title">
            Ep {nextEpisode.number} {nextEpisode.title ? `- ${nextEpisode.title}` : ''}
          </div>
          <div className="player__next-actions">
            <button 
              onClick={onNextEpisode}
              className="player__next-play"
            >
              Reproduzir Agora
            </button>
            {autoPlayNextEpisode && !autoPlayCancelled && <button 
              onClick={() => setAutoPlayCancelled(true)}
              className="player__next-cancel"
            >
              Cancelar
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}
