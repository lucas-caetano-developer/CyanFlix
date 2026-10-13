import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useQueryClient } from "@tanstack/react-query";

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api.login(password);
      queryClient.setQueryData(["auth", "session"], session);
      navigate("/profiles", { replace: true });
    } catch {
      setError("Senha inválida.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profiles-page">
      <form onSubmit={submit} style={{ width: "min(420px, 90vw)", textAlign: "center" }}>
        <div className="profiles-page__logo">CyanFlix</div>
        <h1 className="profiles-page__heading">Acesso privado</h1>
        <p className="profiles-page__subheading">Entre para acessar sua biblioteca.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Senha"
          style={{ width: "100%", boxSizing: "border-box", padding: "14px", borderRadius: "6px", border: "1px solid #555", background: "#181818", color: "white", fontSize: "1rem" }}
        />
        {error && <p style={{ color: "#ff6b6b" }}>{error}</p>}
        <button type="submit" disabled={busy || !password} style={{ width: "100%", marginTop: "16px", padding: "14px", border: 0, borderRadius: "6px", background: "#00bcd4", color: "#071014", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
