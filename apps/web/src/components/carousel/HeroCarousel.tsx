import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getBackdropUrl, getLogoUrl, getGenres, getCertification } from '../../lib/utils';
import { Badge } from '../ui/Badge';

export function HeroCarousel({ items }: { items: Work[] }) {
  const carouselItems = items.slice(0, 5);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || carouselItems.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % carouselItems.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [carouselItems.length, isPaused]);

  if (carouselItems.length === 0) return null;

  const currentWork = carouselItems[currentIndex];
  const backdrop = getBackdropUrl(currentWork);
  const logo = getLogoUrl(currentWork);
  const genres = getGenres(currentWork.metadata);
  const certification = getCertification(currentWork.metadata);
  
  const firstEpisodeId = currentWork.seasons?.[0]?.episodes?.[0]?.id;
  const playUrl = currentWork.contentKind === 'movie' 
    ? `/watch/movie/${currentWork.id}`
    : (firstEpisodeId ? `/watch/episode/${firstEpisodeId}` : `/title/${currentWork.id}`);

  return (
    <div 
      className="hero" 
      onMouseEnter={() => setIsPaused(true)} 
      onMouseLeave={() => setIsPaused(false)}
    >
      {backdrop && (
        <img src={backdrop} alt={currentWork.title} className="hero__backdrop" />
      )}
      <div className="hero__gradient-overlay"></div>
      
      <div className="hero__content">
        {logo ? (
          <img src={logo} alt={currentWork.title} className="hero__logo" />
        ) : (
          <h1 className="hero__title">{currentWork.title}</h1>
        )}
        
        <div className="hero__meta">
          {currentWork.year && <span className="hero__year">{currentWork.year}</span>}
          {certification && <Badge variant="age" label={certification} />}
          {genres && genres.length > 0 && (
            <span className="hero__genres">{genres.slice(0, 3).join(' • ')}</span>
          )}
        </div>

        {currentWork.synopsis && (
          <p className="hero__synopsis">{currentWork.synopsis}</p>
        )}

        <div className="hero__actions">
          <Link to={playUrl} className="btn btn--primary">▶ Assistir</Link>
          <Link to={`/title/${currentWork.id}`} className="btn btn--secondary">ℹ Mais Informações</Link>
        </div>
      </div>

      <div className="hero__dots">
        {carouselItems.map((_, idx) => (
          <button 
            key={idx} 
            className={`hero__dot ${idx === currentIndex ? 'hero__dot--active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
