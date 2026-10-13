import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useScrolled } from '../../hooks/useScrolled';
import { useProfileStore } from '../../stores/useProfileStore';
import { api } from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export function Navbar({ children }: { children?: React.ReactNode }) {
  const isScrolled = useScrolled(20);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { profileId, clearProfile } = useProfileStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <nav className={`navbar ${isScrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__left">
        <Link to="/browse" className="navbar__logo">
          <span className="navbar__logo-text">CyanFlix</span>
        </Link>
        <div className="navbar__links">
          <Link to="/browse" className={`navbar__link ${location.pathname === '/browse' && !location.search ? 'navbar__link--active' : ''}`}>Início</Link>
          <Link to="/browse?kind=series" className={`navbar__link ${location.search.includes('kind=series') ? 'navbar__link--active' : ''}`}>Séries</Link>
          <Link to="/browse?kind=movie" className={`navbar__link ${location.search.includes('kind=movie') ? 'navbar__link--active' : ''}`}>Filmes</Link>
          <Link to="/browse?kind=anime" className={`navbar__link ${location.search.includes('kind=anime') ? 'navbar__link--active' : ''}`}>Animes</Link>
          <Link to="/my-list" className={`navbar__link ${location.pathname === '/my-list' ? 'navbar__link--active' : ''}`}>Minha Lista</Link>
        </div>
      </div>
      <div className="navbar__right">
        {children}
        <div className={`navbar__search ${searchOpen ? 'navbar__search--open' : ''}`}>
          <button className="navbar__search-icon" onClick={() => setSearchOpen(!searchOpen)}>🔍</button>
          {searchOpen && (
            <input
              type="text"
              className="navbar__search-input"
              placeholder="Títulos, gente e gêneros"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={handleSearch}
              autoFocus
            />
          )}
        </div>
        <Link to="/profiles" className="navbar__profile">
          <div className="navbar__profile-avatar">P</div>
        </Link>
        <button className="navbar__search-icon" title="Sair" onClick={async () => {
          await api.logout();
          queryClient.removeQueries({ queryKey: ['auth'] });
          clearProfile();
          navigate('/login', { replace: true });
        }}>↪</button>
      </div>
    </nav>
  );
}
