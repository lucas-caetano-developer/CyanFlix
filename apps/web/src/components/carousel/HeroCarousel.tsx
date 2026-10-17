import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getBackdropUrl, getLogoUrl, getGenres, getCertification, getMotionPreviewUrl } from '../../lib/utils';
import { Badge } from '../ui/Badge';

export function HeroCarousel({ items }: { items: Work[] }) {
  const carouselItems = items.slice(0, 5);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [showMotion, setShowMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const precisePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const refresh = () => setMotionAllowed(!reducedMotion.matches && precisePointer.matches && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? ''));
    refresh();
    reducedMotion.addEventListener('change', refresh);
    precisePointer.addEventListener('change', refresh);
    return () => {
      reducedMotion.removeEventListener('change', refresh);
      precisePointer.removeEventListener('change', refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  useEffect(() => {
    if (isPaused || !pageVisible || !motionAllowed || carouselItems.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % carouselItems.length);
    }, 8000);
    return () => clearInterval(timer);
  }, [carouselItems.length, isPaused, motionAllowed, pageVisible]);

  const currentWork = carouselItems[currentIndex];
  const motionPreview = currentWork ? getMotionPreviewUrl(currentWork) : null;

  useEffect(() => {
    setShowMotion(false);
    if (!motionAllowed || !motionPreview || !pageVisible) return;
    const timer = window.setTimeout(() => setShowMotion(true), 1_200);
    return () => window.clearTimeout(timer);
  }, [currentWork?.id, motionAllowed, motionPreview, pageVisible]);

  useEffect(() => {
    if (currentIndex >= carouselItems.length && carouselItems.length > 0) setCurrentIndex(0);
  }, [carouselItems.length, currentIndex]);

  if (!currentWork) return null;

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
      {showMotion && motionPreview && <video key={motionPreview} className="hero__motion" src={motionPreview} muted autoPlay loop playsInline preload="metadata" aria-hidden="true" onError={() => setShowMotion(false)} />}
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
          <Link to={playUrl} className="btn btn--primary">Assistir</Link>
          <Link to={`/title/${currentWork.id}`} className="btn btn--secondary">Mais informações</Link>
        </div>
      </div>

      <div className="hero__dots">
        {motionAllowed && carouselItems.length > 1 && (
          <button className="hero__pause" type="button" onClick={() => setIsPaused((paused) => !paused)} aria-pressed={isPaused}>
            {isPaused ? 'Retomar destaques' : 'Pausar destaques'}
          </button>
        )}
        {carouselItems.map((_, idx) => (
          <button 
            key={idx} 
            className={`hero__dot ${idx === currentIndex ? 'hero__dot--active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Exibir destaque ${idx + 1}`}
            aria-current={idx === currentIndex ? 'true' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
