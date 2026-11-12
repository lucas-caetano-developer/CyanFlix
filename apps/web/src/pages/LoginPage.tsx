import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CyanFlixLogo } from "../components/ui/CyanFlixLogo";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If already authenticated, redirect to /profiles
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: api.getSession,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (session.data?.authenticated) {
      navigate('/profiles', { replace: true });
    }
  }, [session.data?.authenticated, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) return;

    setBusy(true);
    setError("");
    try {
      const authSession = await api.login(username.trim(), password);
      queryClient.setQueryData(["auth", "session"], authSession);
      navigate("/profiles", { replace: true });
    } catch {
      setError("Credenciais inválidas. Verifique seu usuário e senha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profiles-page" data-spatial-scope="login">
      <form className="login-form" onSubmit={submit} data-spatial-initial="true">
        <div className="profiles-page__logo">
          <CyanFlixLogo className="profiles-page__logo-svg" />
          <span className="sr-only">CyanFlix</span>
        </div>
        <h1 className="profiles-page__heading">Acesso privado</h1>
        <p className="profiles-page__subheading">Entre com sua conta autorizada para acessar seus perfis.</p>
        
        <input
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Usuário"
          className="login-form__input"
          required
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          className="login-form__input"
          required
        />
        {error && <p className="login-form__error" role="alert">{error}</p>}
        
        <button className="btn btn--primary login-form__submit" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.88rem' }}>
          <Link to="/" style={{ color: '#00d4ff', textDecoration: 'none' }}>
            ← Voltar para a página inicial
          </Link>
        </div>
      </form>
    </div>
  );
}
