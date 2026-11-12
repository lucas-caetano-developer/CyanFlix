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
  fallbackUrl?: string | null;
}

const FALLBACK_POSTERS = [
  'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80',
];

const FALLBACK_TRENDING: TrendingItem[] = [
  {
    id: 'f-1',
    rank: 1,
    title: 'Ataque dos Titãs',
    kind: 'anime',
    year: 2023,
    badge: 'DUB | LEG',
    posterUrl: FALLBACK_POSTERS[0],
  },
  {
    id: 'f-2',
    rank: 2,
    title: 'Cyberpunk: Mercenários',
    kind: 'anime',
    year: 2022,
    badge: '4K HDR',
    posterUrl: FALLBACK_POSTERS[1],
  },
  {
    id: 'f-3',
    rank: 3,
    title: 'Oppenheimer',
    kind: 'movie',
    year: 2023,
    badge: 'ÁUDIO 5.1',
    posterUrl: FALLBACK_POSTERS[2],
  },
  {
    id: 'f-4',
    rank: 4,
    title: 'Jujutsu Kaisen',
    kind: 'anime',
    year: 2023,
    badge: 'DUB | LEG',
    posterUrl: FALLBACK_POSTERS[3],
  },
  {
    id: 'f-5',
    rank: 5,
    title: 'Interestelar',
    kind: 'movie',
    year: 2014,
    badge: 'ULTRA HD',
    posterUrl: FALLBACK_POSTERS[4],
  },
];

interface TrendingTopListProps {
  works?: Work[];
  onItemClick: () => void;
}

export function TrendingTopList({ works, onItemClick }: TrendingTopListProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Transform real works or use fallback
  const items: TrendingItem[] = works && works.length > 0
    ? works.slice(0, 10).map((work, index) => {
        const primary = getPosterUrl(work);
        const fallback = getBackdropUrl(work) || FALLBACK_POSTERS[index % FALLBACK_POSTERS.length];
        return {
          id: work.id,
          rank: index + 1,
          title: work.title,
          kind: work.contentKind,
          year: work.year ?? undefined,
          badge: work.contentKind === 'anime' ? 'ANIME' : work.contentKind === 'series' ? 'SÉRIE' : 'FILME',
          posterUrl: primary || fallback,
          fallbackUrl: fallback,
        };
      })
    : FALLBACK_TRENDING;

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
  }, [items]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const scrollAmount = railRef.current.clientWidth * 0.75;
    const amount = direction === 'left' ? -scrollAmount : scrollAmount;
    railRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const handleImageError = (item: TrendingItem) => {
    // If the primary image failed and we have a fallback not yet tried, try fallback
    const current = imageOverrides[item.id] ?? item.posterUrl;
    if (item.fallbackUrl && current !== item.fallbackUrl) {
      setImageOverrides((prev) => ({ ...prev, [item.id]: item.fallbackUrl! }));
    } else {
      setFailedImages((prev) => new Set(prev).add(item.id));
    }
  };

  return (
    <section className="welcome-trending" id="em-alta" aria-label="Títulos em alta no CyanFlix">
      <div className="welcome-trending__header">
        <h2 className="welcome-section-heading">Em alta</h2>
      </div>

      <div className="welcome-trending__carousel-wrapper">
        {/* Left Scroll Arrow (Netflix behavior: appears only when scrolled) */}
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
          {items.map((item) => {
            const currentSrc = imageOverrides[item.id] ?? item.posterUrl;
            const hasValidImage = Boolean(currentSrc && !failedImages.has(item.id));

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
                {/* Giant Number Glyph (Netflix signature look: overlapping left edge) */}
                <div className="welcome-rank-card__number" aria-hidden="true">
                  {item.rank}
                </div>

                {/* Poster Card */}
                <div className="welcome-rank-card__poster-box">
                  {hasValidImage ? (
                    <img
                      src={currentSrc!}
                      alt={item.title}
                      className="welcome-rank-card__img"
                      loading="lazy"
                      onError={() => handleImageError(item)}
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
          })}
        </div>

        {/* Right Scroll Arrow */}
        <button
          type="button"
          className={`welcome-trending__arrow welcome-trending__arrow--right ${!canScrollRight ? 'welcome-trending__arrow--hidden' : ''}`}
          onClick={() => handleScroll('right')}
          aria-label="Rolar próximos títulos"
          tabIndex={canScrollRight ? 0 : -1}
        >
          ›
        </button>
      </div>
    </section>
  );
}
