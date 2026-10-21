import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api.login(username, password);
      queryClient.setQueryData(["auth", "session"], session);
      navigate("/profiles", { replace: true });
    } catch {
      setError("Senha inválida.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profiles-page" data-spatial-scope="login">
      <form className="login-form" onSubmit={submit} data-spatial-initial="true">
        <div className="profiles-page__logo">CyanFlix</div>
        <h1 className="profiles-page__heading">Acesso privado</h1>
        <p className="profiles-page__subheading">Entre para acessar sua biblioteca.</p>
        <input
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Usuário"
          className="login-form__input"
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          className="login-form__input"
        />
        {error && <p className="login-form__error">{error}</p>}
        <button className="btn btn--primary login-form__submit" type="submit" disabled={busy || !username || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
