import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { WorkCard } from '../cards/WorkCard';

export function ContentRow({ title, items, seeAllLink }: { title: string; items: Work[]; seeAllLink?: string }) {
  const railRef = useRef<HTMLDivElement>(null);

  if (!items || items.length === 0) return null;

  const scroll = (direction: 'left' | 'right') => {
    if (railRef.current) {
      const { scrollLeft, clientWidth } = railRef.current;
      const scrollAmount = direction === 'left' ? -clientWidth + 100 : clientWidth - 100;
      railRef.current.scrollTo({ left: scrollLeft + scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="content-row">
      <div className="content-row__header">
        <h2 className="content-row__title">{title}</h2>
        {seeAllLink && (
          <Link to={seeAllLink} className="content-row__see-all">Ver todos</Link>
        )}
      </div>
      <div className="content-row__container">
        <button className="content-row__arrow content-row__arrow--left" onClick={() => scroll('left')} aria-label={`Voltar em ${title}`}><span aria-hidden="true">❮</span></button>
        <div className="content-row__rail" ref={railRef}>
          {items.map((item) => (
            <div key={item.id} className="content-row__item">
              <WorkCard work={item} />
            </div>
          ))}
        </div>
        <button className="content-row__arrow content-row__arrow--right" onClick={() => scroll('right')} aria-label={`Avançar em ${title}`}><span aria-hidden="true">❯</span></button>
      </div>
    </div>
  );
}
