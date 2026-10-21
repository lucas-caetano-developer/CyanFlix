import React, { useEffect, useRef, useState } from 'react';
import { findActiveMarker, skipLabel } from '../../lib/player';
import type { Marker } from '../../lib/types';

interface PlayerOverlayProps {
  markers: Marker[];
  currentTimeMs: number;
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  isNearEnd: boolean;
  countdownReady: boolean;
  ended: boolean;
  onSkip: (toMs: number) => void;
  onNextEpisode: () => void;
  autoPlayNextEpisode: boolean;
  playing: boolean;
  interactionPaused: boolean;
  workTitle?: string;
}

const COUNTDOWN_SECONDS = 10;

export function PlayerOverlay({
  markers,
  currentTimeMs,
  nextEpisode,
  isNearEnd,
  countdownReady,
  ended,
  onSkip,
  onNextEpisode,
  autoPlayNextEpisode,
  playing,
  interactionPaused,
  workTitle,
}: PlayerOverlayProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [autoPlayCancelled, setAutoPlayCancelled] = useState(false);
  const dispatchedRef = useRef(false);

  const activeMarker = findActiveMarker(markers, currentTimeMs);
  const activeSkipLabel = activeMarker ? skipLabel(activeMarker.type) : null;
  const skippableMarker = activeSkipLabel ? activeMarker : null;
  const showNextEpisode = Boolean(nextEpisode) && (isNearEnd || activeMarker?.type === 'next_episode');
  const countdownRunning = Boolean(
    showNextEpisode
    && autoPlayNextEpisode
    && !autoPlayCancelled
    && (playing || ended)
    && !interactionPaused
    && countdownReady,
  );

  useEffect(() => {
    setCountdown(COUNTDOWN_SECONDS);
    setAutoPlayCancelled(false);
    dispatchedRef.current = false;
  }, [nextEpisode?.id, showNextEpisode, countdownReady]);

  useEffect(() => {
    if (!autoPlayNextEpisode) return;
    setAutoPlayCancelled(false);
    setCountdown(COUNTDOWN_SECONDS);
    dispatchedRef.current = false;
  }, [autoPlayNextEpisode]);

  useEffect(() => {
    if (!countdownRunning || countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, countdownRunning]);

  useEffect(() => {
    if (!countdownRunning || countdown > 0 || dispatchedRef.current) return;
    dispatchedRef.current = true;
    onNextEpisode();
  }, [countdown, countdownRunning, onNextEpisode]);

  if (!skippableMarker && !showNextEpisode) return null;

  const countdownPaused = (!playing && !ended) || interactionPaused;
  const showCountdown = autoPlayNextEpisode && !autoPlayCancelled && countdownReady;
  const kicker = showCountdown
    ? `Próximo episódio em ${countdown}s${countdownPaused ? ' · pausado' : ''}`
    : 'Próximo episódio';

  return (
    <div className="player__overlay">
      <span className="sr-only" aria-live="polite">
        {showNextEpisode
          ? showCountdown
            ? 'Próximo episódio disponível. Reprodução automática em 10 segundos.'
            : 'Próximo episódio disponível.'
          : ''}
      </span>

      {skippableMarker && activeSkipLabel && (
        <button
          className={`player__skip-btn${showNextEpisode ? ' player__skip-btn--with-next' : ''}`}
          onClick={(event) => {
            event.currentTarget.blur();
            onSkip(skippableMarker.end_ms);
          }}
        >
          {activeSkipLabel}
        </button>
      )}

      {showNextEpisode && nextEpisode && (
        <section className="player__next-episode" aria-label="Próximo episódio">
          {workTitle && <p className="player__next-work">{workTitle}</p>}
          <p className="player__next-kicker">{kicker}</p>
          <p className="player__next-title">{nextEpisode.title || `Episódio ${nextEpisode.number}`}</p>
          <p className="player__next-meta">Episódio {nextEpisode.number}</p>
          <div className="player__next-actions">
            <button
              className="player__next-play"
              onClick={(event) => {
                event.currentTarget.blur();
                dispatchedRef.current = true;
                onNextEpisode();
              }}
            >
              Reproduzir agora
            </button>
            {autoPlayNextEpisode && !autoPlayCancelled && (
              <button
                className="player__next-cancel"
                onClick={(event) => {
                  event.currentTarget.blur();
                  setAutoPlayCancelled(true);
                }}
              >
                Cancelar
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
