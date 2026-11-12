import React, { useEffect, useRef, useState } from 'react';
import type { Work } from '../../lib/types';
import { getBackdropUrl, getPosterUrl } from '../../lib/utils';

export interface TrendingItem {
  id: string;
  rank: number;
  title: string;
  kind: 'anime' | 'series' | 'movie';
  year?: number;
  badge?: string;
  posterUrl?: string | null;
}

interface TrendingTopListProps {
  works?: Work[];
  isLoading?: boolean;
  onItemClick: () => void;
}

export function TrendingTopList({ works, isLoading = false, onItemClick }: TrendingTopListProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const isPending = isLoading || works === undefined;

  // Real works only from the database - absolutely no mock/Unsplash external covers
  const items: TrendingItem[] = (works ?? []).slice(0, 10).map((work, index) => ({
    id: work.id,
    rank: index + 1,
    title: work.title,
    kind: work.contentKind,
    year: work.year ?? undefined,
    badge: work.contentKind === 'anime' ? 'ANIME' : work.contentKind === 'series' ? 'SÉRIE' : 'FILME',
    posterUrl: getPosterUrl(work) || getBackdropUrl(work),
  }));

  const updateScrollState = () => {
    if (!railRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = railRef.current;
    setCanScrollLeft(scrollLeft > 15);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 15);
  };

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [items, isPending]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const scrollAmount = railRef.current.clientWidth * 0.75;
    const amount = direction === 'left' ? -scrollAmount : scrollAmount;
    railRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const handleImageError = (id: string) => {
    setFailedImages((prev) => new Set(prev).add(id));
  };

  // If loading finished and there are no works, don't display an empty section
  if (!isPending && items.length === 0) {
    return null;
  }

  return (
    <section className="welcome-trending" id="em-alta" aria-label="Títulos em alta no CyanFlix">
      <div className="welcome-trending__header">
        <h2 className="welcome-section-heading">Em alta</h2>
      </div>

      <div className="welcome-trending__carousel-wrapper">
        {/* Left Scroll Arrow */}
        <button
          type="button"
          className={`welcome-trending__arrow welcome-trending__arrow--left ${!canScrollLeft ? 'welcome-trending__arrow--hidden' : ''}`}
          onClick={() => handleScroll('left')}
          aria-label="Rolar títulos anteriores"
          tabIndex={canScrollLeft ? 0 : -1}
        >
          ‹
        </button>

        {/* Continuous Horizontal Row (Strictly 1 line - never wraps) */}
        <div className="welcome-trending__rail" ref={railRef}>
          {isPending ? (
            /* Skeleton Shimmer Loading (Cor de sombra carregando) */
            [1, 2, 3, 4, 5, 6].map((rank) => (
              <div key={`sk-${rank}`} className="welcome-rank-card welcome-rank-card--skeleton">
                <div className="welcome-rank-card__number welcome-rank-card__number--skeleton" aria-hidden="true">
                  {rank}
                </div>
                <div className="welcome-rank-card__poster-box welcome-rank-card__poster-box--skeleton">
                  <div className="welcome-skeleton-shimmer" />
                </div>
              </div>
            ))
          ) : (
            /* Real works only */
            items.map((item) => {
              const hasValidImage = Boolean(item.posterUrl && !failedImages.has(item.id));

              return (
                <div
                  key={item.id}
                  className="welcome-rank-card"
                  onClick={onItemClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onItemClick(); }}
                  aria-label={`Top ${item.rank}: ${item.title}`}
                >
                  {/* Number Glyph */}
                  <div className="welcome-rank-card__number" aria-hidden="true">
                    {item.rank}
                  </div>

                  {/* Poster Card */}
                  <div className="welcome-rank-card__poster-box">
                    {hasValidImage ? (
                      <img
                        src={item.posterUrl!}
                        alt={item.title}
                        className="welcome-rank-card__img"
                        loading="lazy"
                        onError={() => handleImageError(item.id)}
                      />
                    ) : (
                      <div className="welcome-rank-card__placeholder">
                        <div className="welcome-rank-card__placeholder-glow" />
                        <span className="welcome-rank-card__placeholder-kind">{item.kind}</span>
                        <span className="welcome-rank-card__placeholder-title">{item.title}</span>
                        <span className="welcome-rank-card__placeholder-badge">{item.badge}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Scroll Arrow */}
        <button
          type="button"
          className={`welcome-trending__arrow welcome-trending__arrow--right ${!canScrollRight || isPending ? 'welcome-trending__arrow--hidden' : ''}`}
          onClick={() => handleScroll('right')}
          aria-label="Rolar próximos títulos"
          tabIndex={canScrollRight && !isPending ? 0 : -1}
        >
          ›
        </button>
      </div>
    </section>
  );
}
