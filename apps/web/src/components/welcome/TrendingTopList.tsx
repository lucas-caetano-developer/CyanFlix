import React from 'react';
import type { Work } from '../../lib/types';
import { getPosterUrl } from '../../lib/utils';

export interface TrendingItem {
  id: string;
  rank: number;
  title: string;
  kind: 'anime' | 'series' | 'movie';
  year?: number;
  badge?: string;
  posterUrl?: string | null;
}

// Fallback high-impact items if database is freshly initialized or empty
const FALLBACK_TRENDING: TrendingItem[] = [
  {
    id: 'f-1',
    rank: 1,
    title: 'Ataque dos Titãs',
    kind: 'anime',
    year: 2023,
    badge: 'DUB | LEG',
    posterUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'f-2',
    rank: 2,
    title: 'Cyberpunk: Mercenários',
    kind: 'anime',
    year: 2022,
    badge: '4K HDR',
    posterUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'f-3',
    rank: 3,
    title: 'Oppenheimer',
    kind: 'movie',
    year: 2023,
    badge: 'ÁUDIO 5.1',
    posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'f-4',
    rank: 4,
    title: 'Jujutsu Kaisen',
    kind: 'anime',
    year: 2023,
    badge: 'DUB | LEG',
    posterUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'f-5',
    rank: 5,
    title: 'Interestelar',
    kind: 'movie',
    year: 2014,
    badge: 'ULTRA HD',
    posterUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  },
];

interface TrendingTopListProps {
  works?: Work[];
  onItemClick: () => void;
}

export function TrendingTopList({ works, onItemClick }: TrendingTopListProps) {
  // Transform real works or use fallback
  const items: TrendingItem[] = works && works.length > 0
    ? works.slice(0, 10).map((work, index) => ({
        id: work.id,
        rank: index + 1,
        title: work.title,
        kind: work.contentKind,
        year: work.year ?? undefined,
        badge: work.contentKind === 'anime' ? 'ANIME • DUB' : work.contentKind === 'series' ? 'SÉRIE' : 'FILME',
        posterUrl: getPosterUrl(work),
      }))
    : FALLBACK_TRENDING;

  return (
    <section className="welcome-trending" id="em-alta" aria-label="Títulos em alta no CyanFlix">
      <div className="welcome-trending__header">
        <h2 className="welcome-section-heading">Em alta no CyanFlix</h2>
        <p className="welcome-section-subheading">
          Os títulos mais assistidos e aclamados pelos membros da plataforma.
        </p>
      </div>

      <div className="welcome-trending__rail">
        {items.map((item) => (
          <div
            key={item.id}
            className="welcome-rank-card"
            onClick={onItemClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onItemClick(); }}
            aria-label={`Top ${item.rank}: ${item.title}`}
          >
            {/* Giant Number Glyph (Netflix signature Top 10 typography) */}
            <div className="welcome-rank-card__number" aria-hidden="true">
              {item.rank}
            </div>

            {/* Poster Card */}
            <div className="welcome-rank-card__poster-box">
              {item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="welcome-rank-card__img"
                  loading="lazy"
                />
              ) : (
                <div className="welcome-rank-card__placeholder">
                  <span className="welcome-rank-card__placeholder-kind">{item.kind}</span>
                  <span className="welcome-rank-card__placeholder-title">{item.title}</span>
                </div>
              )}

              <div className="welcome-rank-card__overlay">
                <span className="welcome-rank-card__badge">{item.badge ?? item.kind.toUpperCase()}</span>
                <p className="welcome-rank-card__title">{item.title}</p>
                <span className="welcome-rank-card__cta">Entrar para assistir ▸</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
