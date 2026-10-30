import { Link } from 'react-router-dom';

const exploreLinks = [
  { to: '/browse', label: 'Início' },
  { to: '/browse?kind=movie', label: 'Filmes' },
  { to: '/browse?kind=series', label: 'Séries' },
  { to: '/browse?kind=anime', label: 'Animes' },
];

const resourceLinks = [
  { to: '/search', label: 'Busca' },
  { to: '/my-list', label: 'Minha Lista' },
  { to: '/browse', label: 'Catálogo completo' },
];

const accountLinks = [
  { to: '/account', label: 'Conta e preferências' },
  { to: '/profiles', label: 'Trocar perfil' },
];

export function Footer({ className = '' }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`site-footer${className ? ` ${className}` : ''}`} aria-label="Rodapé institucional">
      <div className="site-footer__inner">
        <div className="site-footer__identity">
          <Link to="/browse" className="site-footer__logo" aria-label="CyanFlix, início">
            CyanFlix
          </Link>
          <p className="site-footer__description">
            Sua biblioteca de filmes, séries e animes em um só lugar, com reprodução contínua e
            progresso individual por perfil.
          </p>
          <p className="site-footer__credits">
            Plataforma de streaming independente. Catálogo e identidade visual CyanFlix.
          </p>
        </div>

        <nav className="site-footer__columns" aria-label="Navegação do rodapé">
          <FooterColumn title="Explorar" links={exploreLinks} />
          <FooterColumn title="Recursos" links={resourceLinks} />
          <FooterColumn title="Conta" links={accountLinks} />
        </nav>
      </div>

      <div className="site-footer__bottom">
        <p className="site-footer__copyright">
          © {currentYear} CyanFlix. Todos os direitos reservados.
        </p>
        <div className="site-footer__legal" aria-label="Informações legais">
          <span>Termos de uso</span>
          <span aria-hidden="true">·</span>
          <span>Política de privacidade</span>
          <span aria-hidden="true">·</span>
          <span>Conteúdo conforme disponibilidade no catálogo</span>
        </div>
      </div>

      <div className="site-footer__accent" aria-hidden="true" />
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ to: string; label: string }> }) {
  return (
    <div className="site-footer__column">
      <h2 className="site-footer__column-title">{title}</h2>
      <ul className="site-footer__links">
        {links.map((link) => (
          <li key={`${link.to}-${link.label}`}>
            <Link to={link.to} className="site-footer__link">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
