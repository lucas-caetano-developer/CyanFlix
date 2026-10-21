import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { WorkCard } from '../cards/WorkCard';
import { Icon } from '../ui/Icon';

export function ContentRow({ title, items, seeAllLink }: { title: string; items: Work[]; seeAllLink?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const rowKind = contentKindForRow(title);
  const safeItems = Array.isArray(items) ? items : [];
  const itemsKey = safeItems.map((item) => `${item.id}:${item.continueWatching ? 'continue' : 'poster'}`).join('|');

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    const next = {
      canScrollLeft: rail.scrollLeft > 2,
      canScrollRight: maxScroll > 10 && rail.scrollLeft < maxScroll - 2,
    };
    setScrollState((current) => (
      current.canScrollLeft === next.canScrollLeft && current.canScrollRight === next.canScrollRight ? current : next
    ));
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(rail);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [itemsKey, measure]);

  if (safeItems.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = Math.max(rail.clientWidth * 0.82, 240);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const isScrollable = scrollState.canScrollLeft || scrollState.canScrollRight;

  return (
    <div className="content-row">
      <div className="content-row__header">
        <h2 className="content-row__title">{title}</h2>
        {seeAllLink && (
          <Link to={seeAllLink} className="content-row__see-all" aria-label={`Ver todos: ${title}`}>Ver todos</Link>
        )}
      </div>
      <div className="content-row__container">
        {isScrollable && (
          <button
            className="content-row__arrow content-row__arrow--left"
            type="button"
            onClick={() => scroll('left')}
            disabled={!scrollState.canScrollLeft}
            aria-label={`Voltar em ${title}`}
            data-spatial-skip="true"
          >
            <Icon name="chevron-left" />
          </button>
        )}

        <div className="content-row__rail" ref={railRef} onScroll={measure} data-spatial-row="true">
          {safeItems.map((item) => {
            const landscape = Boolean(item.continueWatching);
            return (
              <div key={item.id} className={`content-row__item${landscape ? ' content-row__item--landscape' : ''}`}>
                <WorkCard work={item} showKindBadge={rowKind !== item.contentKind} />
              </div>
            );
          })}
        </div>

        {isScrollable && (
          <button
            className="content-row__arrow content-row__arrow--right"
            type="button"
            onClick={() => scroll('right')}
            disabled={!scrollState.canScrollRight}
            aria-label={`Avançar em ${title}`}
            data-spatial-skip="true"
          >
            <Icon name="chevron-right" />
          </button>
        )}
      </div>
    </div>
  );
}

function contentKindForRow(title: string): Work['contentKind'] | null {
  const normalized = title.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized === 'filme' || normalized === 'filmes') return 'movie';
  if (normalized === 'serie' || normalized === 'series') return 'series';
  if (normalized === 'anime' || normalized === 'animes') return 'anime';
  return null;
}
