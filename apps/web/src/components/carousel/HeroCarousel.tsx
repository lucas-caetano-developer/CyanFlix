import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getBackdropUrl, getLogoUrl, getGenres, getCertification, getMotionPreviewUrl } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';

export function HeroCarousel({ items }: { items: Work[] }) {
  const carouselItems = items.slice(0, 5);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRotationPaused, setIsRotationPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [showMotion, setShowMotion] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [heroInView, setHeroInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  const heroRef = useRef<HTMLElement>(null);

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
    const element = heroRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isUserInteracting = isHovered || hasFocus;
  const rotationActive = motionAllowed
    && pageVisible
    && heroInView
    && !isRotationPaused
    && !isUserInteracting
    && carouselItems.length > 1;

  useEffect(() => {
    if (!rotationActive) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % carouselItems.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [carouselItems.length, currentIndex, rotationActive]);

  const currentWork = carouselItems[currentIndex];
  const motionPreview = currentWork ? getMotionPreviewUrl(currentWork) : null;

  useEffect(() => {
    setShowMotion(false);
    setMotionReady(false);
    if (!motionAllowed || !motionPreview || !pageVisible || !heroInView) return;
    const timer = window.setTimeout(() => setShowMotion(true), 1_200);
    return () => window.clearTimeout(timer);
  }, [currentWork?.id, heroInView, motionAllowed, motionPreview, pageVisible]);

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

  const changeSlide = (index: number) => {
    if (carouselItems.length === 0) return;
    setCurrentIndex(((index % carouselItems.length) + carouselItems.length) % carouselItems.length);
  };

  return (
    <section
      ref={heroRef}
      className="hero"
      aria-label="Destaques"
      aria-roledescription="carrossel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHasFocus(false);
      }}
    >
      {carouselItems.map((item, index) => {
        const itemBackdrop = getBackdropUrl(item);
        if (!itemBackdrop) return null;
        const active = index === currentIndex;
        return (
          <img
            key={item.id}
            src={itemBackdrop}
            alt={active ? item.title : ''}
            aria-hidden={active ? undefined : 'true'}
            className={`hero__backdrop ${active ? 'hero__backdrop--active' : ''}`}
            decoding="async"
            draggable={false}
          />
        );
      })}

      {showMotion && motionPreview && (
        <video
          key={motionPreview}
          className={`hero__motion ${motionReady ? 'hero__motion--visible' : ''}`}
          src={motionPreview}
          poster={backdrop ?? undefined}
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={() => setMotionReady(true)}
          onLoadedData={() => setMotionReady(true)}
          onPlaying={() => setMotionReady(true)}
          onError={() => setShowMotion(false)}
        />
      )}

      <div className="hero__gradient-overlay" aria-hidden="true" />

      <div className="hero__content" key={currentWork.id}>
        {logo ? (
          <img src={logo} alt={currentWork.title} className="hero__logo" decoding="async" draggable={false} />
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
          <Link to={playUrl} className="btn btn--primary" data-spatial-initial="true">
            <span className="hero__action-icon" aria-hidden="true"><Icon name="play" /></span>
            Assistir
          </Link>
          <Link to={`/title/${currentWork.id}`} className="btn btn--secondary">
            <span className="hero__action-icon" aria-hidden="true"><Icon name="info" /></span>
            Mais informações
          </Link>
        </div>
      </div>

      {carouselItems.length > 1 && (
        <div className="hero__controls" role="group" aria-label="Controles dos destaques">
          <button
            className="hero__arrow"
            type="button"
            onClick={() => changeSlide(currentIndex - 1)}
            aria-label="Destaque anterior"
          >
            <Icon name="chevron-left" />
          </button>

          <div className="hero__dots">
            {carouselItems.map((item, index) => (
              <button
                key={item.id}
                className={`hero__dot ${index === currentIndex ? 'hero__dot--active' : ''}`}
                type="button"
                onClick={() => changeSlide(index)}
                aria-label={`Exibir destaque ${index + 1}: ${item.title}`}
                aria-current={index === currentIndex ? 'true' : undefined}
              />
            ))}
          </div>

          <button
            className="hero__arrow"
            type="button"
            onClick={() => changeSlide(currentIndex + 1)}
            aria-label="Próximo destaque"
          >
            <Icon name="chevron-right" />
          </button>

          {motionAllowed && (
            <button
              className="hero__pause"
              type="button"
              onClick={() => setIsRotationPaused((paused) => !paused)}
              aria-pressed={isRotationPaused}
              aria-label={isRotationPaused ? 'Retomar rotação dos destaques' : 'Pausar rotação dos destaques'}
              title={isRotationPaused ? 'Retomar rotação dos destaques' : 'Pausar rotação dos destaques'}
            >
              <Icon name="rotate" />
              <span className="hero__pause-label">{isRotationPaused ? 'Retomar' : 'Pausar'}</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
