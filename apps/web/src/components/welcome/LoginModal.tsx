import { FormEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CyanFlixLogo } from '../ui/CyanFlixLogo';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) return;

    setBusy(true);
    setError('');
    try {
      const session = await api.login(username.trim(), password);
      queryClient.setQueryData(['auth', 'session'], session);
      onClose();
      navigate('/profiles', { replace: true });
    } catch {
      setError('Credenciais inválidas. Verifique seu usuário e senha.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div className="welcome-modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="welcome-modal-close"
          onClick={onClose}
          aria-label="Fechar janela de login"
        >
          ✕
        </button>

        <div className="welcome-modal-header">
          <CyanFlixLogo className="welcome-modal-logo" />
          <h2 id="login-title" className="welcome-modal-title">Acesse sua conta</h2>
          <p className="welcome-modal-subtitle">
            Informe suas credenciais autorizadas para entrar no CyanFlix.
          </p>
        </div>

        <form className="welcome-modal-form" onSubmit={handleSubmit}>
          <div className="welcome-form-group">
            <label htmlFor="login-username" className="welcome-form-label">Usuário</label>
            <input
              ref={inputRef}
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Digite seu usuário"
              className="welcome-form-input"
              required
            />
          </div>

          <div className="welcome-form-group">
            <label htmlFor="login-password" className="welcome-form-label">Senha</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              className="welcome-form-input"
              required
            />
          </div>

          {error && <div className="welcome-form-error" role="alert">{error}</div>}

          <button
            type="submit"
            className="welcome-btn welcome-btn--primary welcome-btn--block"
            disabled={busy || !username.trim() || !password}
          >
            {busy ? 'Entrando…' : 'Entrar no CyanFlix'}
          </button>
        </form>

        <div className="welcome-modal-footer">
          <p>
            Novo por aqui? As contas do CyanFlix são criadas exclusivamente pelos administradores da plataforma.
          </p>
        </div>
      </div>
    </div>
  );
}
