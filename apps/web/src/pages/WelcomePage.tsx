import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CyanFlixLogo } from '../components/ui/CyanFlixLogo';
import { WelcomeShowcaseBanner } from '../components/welcome/WelcomeShowcaseBanner';
import { TrendingTopList } from '../components/welcome/TrendingTopList';
import { FaqSection } from '../components/welcome/FaqSection';
import { LoginModal } from '../components/welcome/LoginModal';
import '../styles/welcome.css';

export function WelcomePage() {
  const navigate = useNavigate();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Monitor auth session
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: api.getSession,
    staleTime: 60_000,
  });

  // Query showcase titles if available
  const showcase = useQuery({
    queryKey: ['public', 'showcase'],
    queryFn: api.getPublicShowcase,
    staleTime: 300_000,
    retry: false,
  });

  const isAuthenticated = Boolean(session.data?.authenticated);

  const handleAction = () => {
    if (isAuthenticated) {
      navigate('/profiles');
    } else {
      setLoginModalOpen(true);
    }
  };

  return (
    <div className="welcome-root">
      {/* 1. Header / Navbar */}
      <header className="welcome-header">
        <div className="welcome-header__inner">
          <Link to="/" className="welcome-header__logo" aria-label="CyanFlix Início">
            <CyanFlixLogo className="welcome-header__logo-svg" />
          </Link>

          <nav className="welcome-header__nav" aria-label="Navegação institucional">
            <a href="#destaques" className="welcome-header__nav-link">Destaques</a>
            <a href="#em-alta" className="welcome-header__nav-link">Em alta</a>
            <a href="#recursos" className="welcome-header__nav-link">Vantagens</a>
            <a href="#faq" className="welcome-header__nav-link">Dúvidas</a>
          </nav>

          <div className="welcome-header__actions">
            {isAuthenticated ? (
              <Link to="/profiles" className="welcome-btn welcome-btn--primary">
                Acessar Perfis
              </Link>
            ) : (
              <button
                type="button"
                className="welcome-btn welcome-btn--primary"
                onClick={() => setLoginModalOpen(true)}
              >
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Hero Section (Netflix Cinematic Impact) */}
      <section className="welcome-hero" aria-label="Apresentação do CyanFlix">
        <div className="welcome-hero__backdrop">
          <div className="welcome-hero__grid-overlay" />
          <div className="welcome-hero__radial-glow" />
          <div className="welcome-hero__vignette" />
        </div>

        <div className="welcome-hero__content">
          <div className="welcome-hero__badge">
            <span className="welcome-hero__badge-dot" />
            <span>Streaming Privado e Exclusivo</span>
          </div>

          <h1 className="welcome-hero__title">
            Filmes, séries e animes sem limites
          </h1>

          <p className="welcome-hero__subtitle">
            A sua biblioteca definitiva de entretenimento. Reprodução contínua em alta definição,
            múltiplos perfis para toda a casa e catálogo completo sem anúncios.
          </p>

          <div className="welcome-hero__cta-group">
            <button
              type="button"
              className="welcome-btn welcome-btn--hero"
              onClick={handleAction}
            >
              <span>{isAuthenticated ? 'Continuar Assistindo' : 'Acessar Minha Conta'}</span>
              <svg className="welcome-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <a href="#destaques" className="welcome-btn welcome-btn--ghost">
              Conhecer Catálogo
            </a>
          </div>

          <div className="welcome-hero__info-strip">
            <div className="welcome-info-item">
              <span className="welcome-info-item__val">100%</span>
              <span className="welcome-info-item__lbl">Sem comerciais</span>
            </div>
            <div className="welcome-info-sep" />
            <div className="welcome-info-item">
              <span className="welcome-info-item__val">Multi-Perfis</span>
              <span className="welcome-info-item__lbl">Histórico individual</span>
            </div>
            <div className="welcome-info-sep" />
            <div className="welcome-info-item">
              <span className="welcome-info-item__val">4K & Full HD</span>
              <span className="welcome-info-item__lbl">Transmissão adaptativa</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Showcase Thematic Spotlight Banner (Crunchyroll character banner aesthetic) */}
      <div id="destaques">
        <WelcomeShowcaseBanner onLoginClick={handleAction} />
      </div>

      {/* 4. Trending Rail (Netflix-style numbered cards) */}
      <TrendingTopList
        works={showcase.data?.trending}
        onItemClick={handleAction}
      />

      {/* 5. Features Grid ("Mais motivos para assistir no CyanFlix") */}
      <section className="welcome-features" id="recursos" aria-label="Recursos do CyanFlix">
        <div className="welcome-features__inner">
          <h2 className="welcome-section-heading">Mais motivos para assistir</h2>
          <p className="welcome-section-subheading">
            Criado com foco absoluto na experiência cinematográfica e na facilidade de uso.
          </p>

          <div className="welcome-features__grid">
            <div className="welcome-feature-card">
              <div className="welcome-feature-card__icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="15" rx="2" />
                  <path d="m17 2-5 5-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="welcome-feature-card__title">Aproveite na TV e no Celular</h3>
              <p className="welcome-feature-card__desc">
                Assista em Smart TVs, TV Box (com controle remoto), tablets, celulares e computadores com interface adaptada.
              </p>
            </div>

            <div className="welcome-feature-card">
              <div className="welcome-feature-card__icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="welcome-feature-card__title">Múltiplos Perfis para a Família</h3>
              <p className="welcome-feature-card__desc">
                Crie perfis personalizados com histórico próprio de episódios, lista de favoritos e progresso de onde você parou.
              </p>
            </div>

            <div className="welcome-feature-card">
              <div className="welcome-feature-card__icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="welcome-feature-card__title">Qualidade Máxima & HLS Adaptativo</h3>
              <p className="welcome-feature-card__desc">
                Transmissão inteligente que se molda à velocidade da sua internet, mantendo sempre o vídeo fluido e nítido.
              </p>
            </div>

            <div className="welcome-feature-card">
              <div className="welcome-feature-card__icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
              <h3 className="welcome-feature-card__title">100% Sem Anúncios</h3>
              <p className="welcome-feature-card__desc">
                Sem interrupções, sem propagandas comerciais e com transição direta e automática para o próximo episódio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <FaqSection />

      {/* 7. Final Call to Action Strip (Crunchyroll "Já é membro? Entrar" vibe) */}
      <section className="welcome-cta-strip">
        <div className="welcome-cta-strip__inner">
          <div className="welcome-cta-strip__glow" />
          <h2 className="welcome-cta-strip__title">Pronto para começar a assistir?</h2>
          <p className="welcome-cta-strip__subtitle">
            Acesse agora com seu usuário e senha autorizados e aproveite todo o catálogo.
          </p>
          <button
            type="button"
            className="welcome-btn welcome-btn--hero"
            onClick={handleAction}
          >
            <span>{isAuthenticated ? 'Ir para Perfis' : 'Entrar no CyanFlix'}</span>
            <svg className="welcome-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      {/* 8. Institutional Footer */}
      <footer className="welcome-footer">
        <div className="welcome-footer__inner">
          <div className="welcome-footer__top">
            <CyanFlixLogo className="welcome-footer__logo" />
            <p className="welcome-footer__desc">
              Plataforma independente e privada de streaming de filmes, séries e animes.
              Projetada para desempenho máximo, múltiplos perfis e controle avançado de reprodução.
            </p>
          </div>

          <div className="welcome-footer__bottom">
            <p>© {new Date().getFullYear()} CyanFlix. Todos os direitos reservados. Streaming privado para membros autorizados.</p>
          </div>
        </div>
      </footer>

      {/* Login Modal */}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={() => setLoginModalOpen(false)}
      />
    </div>
  );
}
