import React, { useEffect, useState } from 'react';

interface PlayerOverlayProps {
  markers: Array<{ type: string; start_ms: number; end_ms: number }>;
  currentTimeMs: number;
  nextEpisode?: { id: string; title?: string | null; number: number } | null;
  isNearEnd: boolean; // true when within last 30 seconds
  onSkip: (toMs: number) => void;
  onNextEpisode: () => void;
}

export function PlayerOverlay({
  markers,
  currentTimeMs,
  nextEpisode,
  isNearEnd,
  onSkip,
  onNextEpisode
}: PlayerOverlayProps) {
  const [countdown, setCountdown] = useState(10);
  const [autoPlayCancelled, setAutoPlayCancelled] = useState(false);

  // Find active marker
  const activeMarker = markers?.find(m => currentTimeMs >= m.start_ms && currentTimeMs < m.end_ms);

  useEffect(() => {
    let interval: number;
    if (isNearEnd && nextEpisode && !autoPlayCancelled) {
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
  }, [isNearEnd, nextEpisode, autoPlayCancelled, countdown, onNextEpisode]);

  // Reset countdown if near end status changes
  useEffect(() => {
    if (!isNearEnd) {
      setCountdown(10);
      setAutoPlayCancelled(false);
    }
  }, [isNearEnd]);

  return (
    <div className="player__overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
      
      {activeMarker && (
        <div style={{ position: 'absolute', bottom: '100px', right: '4%' }}>
          <button 
            className="player__skip-btn"
            onClick={() => onSkip(activeMarker.end_ms)}
            style={{ 
              pointerEvents: 'auto', background: 'rgba(0,0,0,0.6)', color: 'white', 
              border: '1px solid rgba(255,255,255,0.4)', padding: '10px 20px', 
              borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' 
            }}
          >
            {activeMarker.type === 'opening' ? 'Pular Intro' : 'Pular Créditos'}
          </button>
        </div>
      )}

      {isNearEnd && nextEpisode && !autoPlayCancelled && (
        <div className="player__next-episode" style={{
          position: 'absolute', bottom: '100px', right: '4%',
          background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '8px',
          pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '10px',
          border: '1px solid var(--border)', maxWidth: '300px'
        }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px', textTransform: 'uppercase', fontWeight: 'bold' }}>
            Próximo Episódio em {countdown}s
          </div>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
            Ep {nextEpisode.number} {nextEpisode.title ? `- ${nextEpisode.title}` : ''}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              onClick={onNextEpisode}
              style={{ flex: 1, padding: '10px', background: 'white', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              Reproduzir Agora
            </button>
            <button 
              onClick={() => setAutoPlayCancelled(true)}
              style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
