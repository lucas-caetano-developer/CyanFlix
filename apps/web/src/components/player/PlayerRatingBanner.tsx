import React, { useEffect, useState } from 'react';

interface PlayerRatingBannerProps {
  rating: { ageLabel: string; tone: string; descriptors: string[] } | null | undefined;
  visible: boolean;
}

export function PlayerRatingBanner({ rating, visible }: PlayerRatingBannerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible && rating) {
      setShow(true);
      const timer = window.setTimeout(() => setShow(false), 4000);
      return () => clearTimeout(timer);
    }
    setShow(false);
    return undefined;
  }, [visible, rating]);

  if (!rating || !show) return null;

  const ariaText = `Classificacao indicativa: ${rating.ageLabel === 'L' ? 'Livre' : `${rating.ageLabel} anos`}${rating.descriptors.length > 0 ? `. ${rating.descriptors.join(', ')}` : ''}`;

  return (
    <div
      className={`player__rating-banner player__rating-banner--${rating.tone}`}
      role="status"
      aria-label={ariaText}
      aria-live="polite"
    >
      <div className="player__rating-tile" aria-hidden="true">
        {rating.ageLabel}
      </div>
      {rating.descriptors.length > 0 && (
        <p className="player__rating-descriptors" aria-hidden="true">
          {rating.descriptors.join(', ')}
        </p>
      )}
      <span className="sr-only">{ariaText}</span>
    </div>
  );
}
