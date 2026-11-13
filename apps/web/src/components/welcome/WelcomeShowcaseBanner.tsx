import { useState, useEffect } from 'react';
import { CyanFlixIcon } from '../ui/CyanFlixLogo';

export interface ShowcaseSlide {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  audioInfo: string;
  quality: string;
  characterTitle?: string;
  // Prepared for the upcoming banner manager
  characterImage?: string | null;
  bannerBg?: string | null;
  accentColor?: string;
}

const DEFAULT_SLIDES: ShowcaseSlide[] = [
  {
    id: 'slide-1',
    category: 'DESTAQUES DO CATÁLOGO',
    title: 'UNIVERSO ANIME & CINEMA',
    subtitle: 'Grandes sagas e produções aclamadas',
    description: 'Acompanhe as maiores jornadas, batalhas épicas e histórias inesquecíveis com áudio original, dublagens em português e fidelidade máxima de reprodução.',
    badge: 'EM ALTA',
    audioInfo: 'DUB | LEG',
    quality: '4K ULTRA HD',
    characterTitle: 'HERÓIS & VILÕES',
    accentColor: '#00d4ff',
  },
  {
    id: 'slide-2',
    category: 'SÉRIES & DRAMAS',
    title: 'NARRATIVAS INTENSAS',
    subtitle: 'Maratone do primeiro ao último minuto',
    description: 'Temporadas completas com reprodução contínua automática, progresso individual sincronizado por perfil e retorno instantâneo exatamente onde você parou.',
    badge: 'EXCLUSIVO',
    audioInfo: 'ÁUDIO ORIGINAL & DUBLADO',
    quality: 'HDR10',
    characterTitle: 'PROTAGONISTAS',
    accentColor: '#38e8ff',
  },
  {
    id: 'slide-3',
    category: 'BIBLIOTECA PRIVADA',
    title: 'MÚLTIPLOS PERFIS EM FAMÍLIA',
    subtitle: 'Cada um com seu próprio espaço',
    description: 'Uma única conta para toda a casa. Perfis individuais com histórico próprio, lista de favoritos personalizada e controle parental para todas as idades.',
    badge: 'MULTITELA',
    audioInfo: 'SOM SURROUND 5.1',
    quality: 'STREAMING ADAPTATIVO',
    characterTitle: 'EXPERIÊNCIA COMPLETA',
    accentColor: '#00b4d8',
  },
];

interface WelcomeShowcaseBannerProps {
  onLoginClick: () => void;
  slides?: ShowcaseSlide[];
}

export function WelcomeShowcaseBanner({
  onLoginClick,
  slides = DEFAULT_SLIDES,
}: WelcomeShowcaseBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Automatic rotation every 6 seconds (pauses on mouse hover)
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isPaused, slides.length]);

  const activeSlide = slides[currentIndex];

  return (
    <section
      className="welcome-showcase"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Destaques do streaming"
    >
      <div className="welcome-showcase__frame">
        {/* Background is deliberately clean / neutral dark glass ("fundo sem nada"), 
            ready for the upcoming dynamic banner manager */}
        <div
          className="welcome-showcase__bg"
          style={activeSlide.bannerBg ? { backgroundImage: `url(${activeSlide.bannerBg})` } : undefined}
        />

        {/* Ambient subtle cyan radial light */}
        <div className="welcome-showcase__ambient-glow" />

        <div className="welcome-showcase__content">
          {/* Left Column: Thematic Typography & Details (Crunchyroll/Netflix style) */}
          <div className="welcome-showcase__info">
            <div className="welcome-showcase__tags">
              <span className="welcome-badge welcome-badge--cyan">
                {activeSlide.category}
              </span>
              <span className="welcome-badge welcome-badge--outline">
                {activeSlide.badge}
              </span>
            </div>

            <h3 className="welcome-showcase__title">{activeSlide.title}</h3>
            <p className="welcome-showcase__subtitle">{activeSlide.subtitle}</p>
            <p className="welcome-showcase__desc">{activeSlide.description}</p>

            <div className="welcome-showcase__meta">
              <span className="welcome-meta-pill">{activeSlide.audioInfo}</span>
              <span className="welcome-meta-pill">{activeSlide.quality}</span>
            </div>

            <div className="welcome-showcase__actions">
              <button
                type="button"
                className="welcome-btn welcome-btn--primary"
                onClick={onLoginClick}
              >
                <span>Assistir com sua conta</span>
                <svg className="welcome-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Right Column: Character Showcase Stage (Clean stage prepared for banner manager) */}
          <div className="welcome-showcase__stage" aria-hidden="true">
            <div className="welcome-showcase__character-slot">
              {activeSlide.characterImage ? (
                <img
                  src={activeSlide.characterImage}
                  alt={activeSlide.characterTitle ?? 'Destaque'}
                  className="welcome-showcase__character-img"
                />
              ) : (
                /* Elegant neutral stage placeholder: clean silhouette & neon pedestal 
                   until the banner manager supplies character cutouts */
                <div className="welcome-showcase__placeholder-stage">
                  <div className="welcome-showcase__pedestal">
                    <CyanFlixIcon size={96} variant="transparent" className="welcome-showcase__pedestal-icon" />
                  </div>
                  <div className="welcome-showcase__stage-label">
                    <span className="welcome-showcase__stage-tag">{activeSlide.characterTitle}</span>
                    <span className="welcome-showcase__stage-sub">CyanFlix Spotlight</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Carousel Slide Indicators & Controls */}
        <div className="welcome-showcase__controls">
          <div className="welcome-showcase__dots" role="tablist" aria-label="Controle de slides de destaque">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={idx === currentIndex}
                aria-label={`Slide ${idx + 1}: ${slide.title}`}
                className={`welcome-showcase__dot ${idx === currentIndex ? 'welcome-showcase__dot--active' : ''}`}
                onClick={() => setCurrentIndex(idx)}
              >
                <span className="welcome-showcase__dot-fill" />
              </button>
            ))}
          </div>

          <div className="welcome-showcase__nav-arrows">
            <button
              type="button"
              className="welcome-showcase__arrow"
              onClick={() => setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length)}
              aria-label="Slide anterior"
            >
              ‹
            </button>
            <button
              type="button"
              className="welcome-showcase__arrow"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % slides.length)}
              aria-label="Próximo slide"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
