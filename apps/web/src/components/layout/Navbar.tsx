import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useScrolled } from '../../hooks/useScrolled';
import { useLogout } from '../../hooks/useLogout';
import { useProfileStore } from '../../stores/useProfileStore';
import { api } from '../../lib/api';
import { parseContentKind } from '../../lib/catalog';
import { ProfileAvatar } from '../profile/ProfileAvatar';
import { Icon } from '../ui/Icon';

export function Navbar({ children }: { children?: React.ReactNode }) {
  const isScrolled = useScrolled(20);
  const navigate = useNavigate();
  const location = useLocation();
  const profileId = useProfileStore((state) => state.profileId);
  const { logout, isPending: loggingOut } = useLogout();
  const activeProfile = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: api.getActiveProfile,
    enabled: Boolean(profileId),
    retry: false,
  });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const menuId = useId();
  const menuTitleId = useId();
  const accountMenuId = useId();

  const params = new URLSearchParams(location.search);
  const isBrowse = location.pathname === '/browse';
  const activeKind = isBrowse ? parseContentKind(params.get('kind')) : undefined;
  const hasDiscoveryFilter = isBrowse && Boolean(activeKind || params.get('genre') || params.get('availability'));
  const overHero = isBrowse && !hasDiscoveryFilter;
  const isSearchPage = location.pathname === '/search';
  const isAccountPage = location.pathname === '/account';
  const profileName = activeProfile.data?.name?.trim();

  const navItems = [
    { to: '/browse', label: 'Início', active: isBrowse && !activeKind },
    { to: '/browse?kind=series', label: 'Séries', active: activeKind === 'series' },
    { to: '/browse?kind=movie', label: 'Filmes', active: activeKind === 'movie' },
    { to: '/browse?kind=anime', label: 'Animes', active: activeKind === 'anime' },
    { to: '/my-list', label: 'Minha Lista', active: location.pathname === '/my-list' },
  ];

  useEffect(() => {
    if (location.pathname === '/search') {
      setSearchValue(new URLSearchParams(location.search).get('q') ?? '');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 860px)');
    if (!query) return;
    const onChange = () => {
      if (!query.matches) setMenuOpen(false);
      else setAccountOpen(false);
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [searchOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const frame = requestAnimationFrame(() => {
      accountMenuRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    });
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.classList.add('nav-menu-open');
    const panel = menuPanelRef.current;
    const frame = requestAnimationFrame(() => {
      panel?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        requestAnimationFrame(() => menuToggleRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('nav-menu-open');
    };
  }, [menuOpen]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuToggleRef.current?.focus());
  }, []);

  const closeSearch = useCallback((restoreFocus = false) => {
    setSearchOpen(false);
    if (restoreFocus) requestAnimationFrame(() => searchToggleRef.current?.focus());
  }, []);

  const closeAccount = useCallback((restoreFocus = false) => {
    setAccountOpen(false);
    if (restoreFocus) requestAnimationFrame(() => accountButtonRef.current?.focus());
  }, []);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchValue.trim();
    closeSearch(false);
    closeMenu(false);
    closeAccount(false);
    navigate(term ? `/search?q=${encodeURIComponent(term)}` : '/search');
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearch(true);
    }
  };

  const handleAccountMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAccount(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const focusables = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    if (!focusables.length) return;
    event.preventDefault();
    event.stopPropagation();
    const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? focusables.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + focusables.length) % focusables.length
          : (currentIndex - 1 + focusables.length) % focusables.length;
    focusables[nextIndex]?.focus();
  };

  const handleAccountBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (loggingOut) return;
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountOpen(false);
  };

  const solid = !overHero || isScrolled || menuOpen || searchOpen || accountOpen;

  return (
    <nav className={`navbar ${solid ? 'navbar--scrolled' : ''}`} aria-label="Navegação principal">
      <div className="navbar__left">
        <button
          ref={menuToggleRef}
          type="button"
          className="navbar__icon-button navbar__mobile-toggle"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-haspopup="dialog"
          onClick={() => {
            if (!menuOpen) {
              setSearchOpen(false);
              setAccountOpen(false);
            }
            setMenuOpen(!menuOpen);
          }}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
        <Link to="/browse" className="navbar__logo" aria-label="CyanFlix, início">
          <span className="navbar__logo-text">CyanFlix</span>
        </Link>
        <div className="navbar__links">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`navbar__link${item.active ? ' navbar__link--active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="navbar__right">
        {children}
        <div className="navbar__search" ref={searchContainerRef}>
          {searchOpen ? (
            <form className="navbar__search-form" role="search" aria-label="Busca rápida" onSubmit={submitSearch}>
              <Icon name="search" />
              <label htmlFor={searchId} className="sr-only">Buscar no catálogo</label>
              <input
                ref={searchInputRef}
                id={searchId}
                type="search"
                className="navbar__search-input"
                placeholder="Títulos, gêneros..."
                value={searchValue}
                maxLength={200}
                onChange={(event) => setSearchValue(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                enterKeyHint="search"
                autoComplete="off"
              />
              {searchValue && (
                <button
                  type="button"
                  className="navbar__search-clear"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setSearchValue('');
                    searchInputRef.current?.focus();
                  }}
                >
                  <Icon name="close" />
                </button>
              )}
              <button type="button" className="navbar__search-cancel" onClick={() => closeSearch(true)}>
                Cancelar
              </button>
            </form>
          ) : (
            <button
              ref={searchToggleRef}
              type="button"
              className={`navbar__icon-button${isSearchPage ? ' navbar__icon-button--active' : ''}`}
              aria-label="Abrir busca"
              aria-current={isSearchPage ? 'page' : undefined}
              title="Buscar"
              onClick={() => {
                setMenuOpen(false);
                setAccountOpen(false);
                setSearchOpen(true);
              }}
            >
              <Icon name="search" />
            </button>
          )}
        </div>

        <div className="navbar__account" ref={accountRef}>
          <button
            ref={accountButtonRef}
            type="button"
            className={`navbar__account-button${accountOpen || isAccountPage ? ' navbar__account-button--active' : ''}`}
            aria-label={profileName ? `Conta e perfil de ${profileName}` : 'Conta e perfil'}
            aria-expanded={accountOpen}
            aria-controls={accountMenuId}
            title={profileName ? `Conta e perfil de ${profileName}` : 'Conta e perfil'}
            onClick={() => {
              if (!accountOpen) {
                setSearchOpen(false);
                setMenuOpen(false);
              }
              setAccountOpen(!accountOpen);
            }}
          >
            <ProfileAvatar
              name={profileName}
              avatar={activeProfile.data?.avatar}
              className="navbar__profile-avatar"
            />
            <span className="navbar__account-name">{profileName ?? 'Perfil'}</span>
            <span className="navbar__account-chevron" aria-hidden="true"><Icon name="chevron-right" /></span>
          </button>

          {accountOpen && (
            <div
              ref={accountMenuRef}
              id={accountMenuId}
              className="navbar__account-menu"
              role="group"
              aria-label="Conta e perfil"
              data-spatial-scope="account-menu"
              data-spatial-overlay="true"
              onKeyDown={handleAccountMenuKeyDown}
              onBlur={handleAccountBlur}
            >
              <div className="navbar__account-identity">
                <ProfileAvatar
                  name={profileName}
                  avatar={activeProfile.data?.avatar}
                  className="navbar__account-avatar"
                />
                <div className="navbar__account-identity-copy">
                  <strong>{profileName ?? 'Perfil'}</strong>
                </div>
              </div>

              <div className="navbar__account-links">
                <Link
                  to="/account"
                  className={`navbar__account-link${isAccountPage ? ' navbar__account-link--active' : ''}`}
                  aria-current={isAccountPage ? 'page' : undefined}
                  data-spatial-initial="true"
                  onClick={() => closeAccount(false)}
                >
                  <Icon name="settings" />
                  <span>Conta e preferências</span>
                  <Icon name="chevron-right" />
                </Link>
                <Link
                  to="/profiles"
                  className="navbar__account-link"
                  onClick={() => closeAccount(false)}
                >
                  <Icon name="user" />
                  <span>Trocar perfil</span>
                  <Icon name="chevron-right" />
                </Link>
              </div>

              <button
                type="button"
                className="navbar__account-logout"
                disabled={loggingOut}
                onClick={() => { void logout(); }}
              >
                <Icon name="logout" />
                <span>{loggingOut ? 'Saindo…' : 'Sair da conta'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {menuOpen && createPortal(
        <div
          ref={menuPanelRef}
          id={menuId}
          className="navbar__mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-labelledby={menuTitleId}
          data-spatial-scope="mobile-menu"
          data-spatial-overlay="true"
        >
          <div className="navbar__mobile-menu-head">
            <h2 id={menuTitleId} className="navbar__mobile-title">Navegação</h2>
            <button type="button" className="navbar__icon-button" aria-label="Fechar menu" onClick={() => closeMenu(true)}>
              <Icon name="close" />
            </button>
          </div>
          <nav className="navbar__mobile-links" aria-label="Menu principal">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => closeMenu(false)}
                className={`navbar__mobile-link${item.active ? ' navbar__mobile-link--active' : ''}`}
                aria-current={item.active ? 'page' : undefined}
                data-spatial-initial={item.to === '/browse' ? 'true' : undefined}
              >
                <span>{item.label}</span>
                {item.active && <Icon name="check" />}
              </Link>
            ))}
            <Link
              to="/search"
              onClick={() => closeMenu(false)}
              className={`navbar__mobile-link${isSearchPage ? ' navbar__mobile-link--active' : ''}`}
              aria-current={isSearchPage ? 'page' : undefined}
            >
              <span>Busca</span>
              {isSearchPage && <Icon name="check" />}
            </Link>
          </nav>
          <div className="navbar__mobile-account">
            <div className="navbar__mobile-identity">
              <ProfileAvatar
                name={profileName}
                avatar={activeProfile.data?.avatar}
                className="navbar__mobile-avatar"
              />
              <div>
                <strong>{profileName ?? 'Perfil'}</strong>
              </div>
            </div>
            <Link
              to="/account"
              onClick={() => closeMenu(false)}
              className={`navbar__mobile-link${isAccountPage ? ' navbar__mobile-link--active' : ''}`}
              aria-current={isAccountPage ? 'page' : undefined}
            >
              <span>Conta e preferências</span>
              <Icon name={isAccountPage ? 'check' : 'settings'} />
            </Link>
            <Link to="/profiles" onClick={() => closeMenu(false)} className="navbar__mobile-link">
              <span>Trocar perfil</span>
              <Icon name="user" />
            </Link>
            <button
              type="button"
              className="navbar__mobile-logout"
              disabled={loggingOut}
              onClick={() => { void logout(); }}
            >
              <Icon name="logout" />
              <span>{loggingOut ? 'Saindo…' : 'Sair da conta'}</span>
            </button>
          </div>
        </div>,
        document.body,
      )}
    </nav>
  );
}
