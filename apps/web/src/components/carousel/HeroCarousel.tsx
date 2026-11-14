import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getBackdropUrl, getLogoUrl, getGenres, getCertification, getMotionPreviewUrl } from '../../lib/utils';
import { Badge } from '../ui/Badge';

export function HeroCarousel({
  items,
  continueItems = [],
}: {
  items: Work[];
  continueItems?: Work[];
}) {
  const carouselItems = items.slice(0, 8);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [showMotion, setShowMotion] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [heroInView, setHeroInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
  const [progress, setProgress] = useState(0);

  const heroRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const changeSlide = useCallback((index: number) => {
    if (carouselItems.length === 0) return;
    setProgress(0);
    setCurrentIndex(((index % carouselItems.length) + carouselItems.length) % carouselItems.length);
  }, [carouselItems.length]);

  const currentWork = carouselItems[currentIndex];
  const motionPreview = currentWork ? getMotionPreviewUrl(currentWork) : null;

  // Video presentation playback
  useEffect(() => {
    setShowMotion(false);
    setMotionReady(false);
    if (!motionAllowed || !motionPreview || !pageVisible || !heroInView) return;
    const timer = window.setTimeout(() => setShowMotion(true), 800);
    return () => window.clearTimeout(timer);
  }, [currentWork?.id, heroInView, motionAllowed, motionPreview, pageVisible]);

  // Fallback timer when motion preview is not driving progress
  useEffect(() => {
    setProgress(0);
    // If motion video is active and ready, video timeupdate drives progress and onEnded advances slide
    if (showMotion && motionPreview && motionReady) {
      return;
    }

    const duration = 8000;
    const intervalMs = 60;
    const step = (intervalMs / duration) * 100;

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          changeSlide(currentIndex + 1);
          return 0;
        }
        return Math.min(100, prev + step);
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [currentIndex, showMotion, motionPreview, motionReady, changeSlide]);

  useEffect(() => {
    if (currentIndex >= carouselItems.length && carouselItems.length > 0) setCurrentIndex(0);
  }, [carouselItems.length, currentIndex]);

  if (!currentWork) return null;

  const backdrop = getBackdropUrl(currentWork);
  const logo = getLogoUrl(currentWork);
  const genres = getGenres(currentWork.metadata);
  const certification = getCertification(currentWork.metadata);

  // Check viewing progress for the active work
  const continueItem = continueItems.find((item) => item.id === currentWork.id);
  const hasProgress = Boolean(continueItem && continueItem.continueWatching);
  const episodeNumber = continueItem?.continueWatching?.episodeNumber;

  let playUrl: string;
  if (continueItem?.continueWatching) {
    const cw = continueItem.continueWatching;
    playUrl = cw.itemType === 'movie' ? `/watch/movie/${currentWork.id}` : `/watch/episode/${cw.itemId}`;
  } else if (currentWork.contentKind === 'movie') {
    playUrl = `/watch/movie/${currentWork.id}`;
  } else {
    const firstEpId = currentWork.seasons?.[0]?.episodes?.[0]?.id;
    playUrl = firstEpId ? `/watch/episode/${firstEpId}` : `/title/${currentWork.id}`;
  }

  let buttonLabel: string;
  if (currentWork.contentKind === 'movie') {
    buttonLabel = hasProgress ? 'CONTINUAR ASSISTINDO' : 'COMEÇAR A ASSISTIR';
  } else {
    const epNum = episodeNumber ?? 1;
    buttonLabel = hasProgress ? `CONTINUAR ASSISTINDO E${epNum}` : 'COMEÇAR A ASSISTIR E1';
  }

  return (
    <section
      ref={heroRef}
      className="hero"
      aria-label="Animes em Destaque"
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
          ref={videoRef}
          key={motionPreview}
          className={`hero__motion ${motionReady ? 'hero__motion--visible' : ''}`}
          src={motionPreview}
          poster={backdrop ?? undefined}
          muted
          autoPlay
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={() => setMotionReady(true)}
          onLoadedMetadata={() => setMotionReady(true)}
          onPlaying={() => setMotionReady(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration && !isNaN(v.duration) && v.duration > 0) {
              setProgress(Math.min(100, (v.currentTime / v.duration) * 100));
            }
          }}
          onEnded={() => {
            changeSlide(currentIndex + 1);
          }}
          onError={() => setShowMotion(false)}
        />
      )}

      <div className="hero__gradient-overlay" aria-hidden="true" />

      {/* Subtle Navigation Chevrons (Print 2) */}
      {carouselItems.length > 1 && (
        <>
          <button
            type="button"
            className="hero__arrow hero__arrow--prev"
            onClick={() => changeSlide(currentIndex - 1)}
            aria-label="Destaque anterior"
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="hero__arrow hero__arrow--next"
            onClick={() => changeSlide(currentIndex + 1)}
            aria-label="Próximo destaque"
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      <div className="hero__content">
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

        {/* Action Buttons: Continuar/Começar a assistir + Minha Lista */}
        <div className="hero__actions">
          <Link to={playUrl} className="hero__btn-watch" data-spatial-initial="true">
            <span className="hero__play-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </span>
            {buttonLabel}
          </Link>

          <Link
            to="/my-list"
            className="hero__btn-watchlist"
            title="Abrir Minha Lista"
            aria-label="Abrir Minha Lista"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </Link>
        </div>

        {/* Timeline Pills directly under watch action buttons (Image 3) */}
        {carouselItems.length > 1 && (
          <div className="hero__timeline" role="tablist" aria-label="Navegação dos animes em destaque">
            {carouselItems.map((item, index) => {
              const isActive = index === currentIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`hero__timebar ${isActive ? 'hero__timebar--active' : ''}`}
                  onClick={() => changeSlide(index)}
                  title={item.title}
                  aria-label={`Ver destaque ${index + 1}: ${item.title}`}
                >
                  {isActive && (
                    <div
                      className="hero__timebar-fill"
                      style={{ width: `${progress}%` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
