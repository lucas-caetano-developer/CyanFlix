import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useProfileStore } from "../stores/useProfileStore";
import { Spinner } from "../components/ui/Spinner";
import type { Profile } from "../lib/types";

export function ProfilesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setProfile = useProfileStore((state) => state.setProfile);
  const { data: session } = useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.getProfiles });
  const [lockedProfile, setLockedProfile] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [removePin, setRemovePin] = useState(false);
  const [maxAgeRating, setMaxAgeRating] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (profiles.isLoading) return <Spinner fullScreen />;

  const enterProfile = async (profile: Profile, candidatePin?: string) => {
    if (profile.pinProtected && candidatePin === undefined) {
      setPin("");
      setError("");
      setLockedProfile(profile);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const unlocked = await api.unlockProfile(profile.id, candidatePin);
      queryClient.setQueryData(["profiles", "active"], unlocked);
      setProfile(unlocked.id);
      setLockedProfile(null);
      navigate(unlocked.role === "admin" && (session?.role === "owner" || session?.role === "admin") ? "/admin" : "/browse");
    } catch {
      setError("PIN inválido ou perfil indisponível.");
    } finally {
      setBusy(false);
    }
  };

  const openSettings = (profile: Profile) => {
    setEditingProfile(profile);
    setNewPin("");
    setRemovePin(false);
    setMaxAgeRating(profile.maxAgeRating == null ? "" : String(profile.maxAgeRating));
    setError("");
  };

  const saveSettings = async () => {
    if (!editingProfile) return;
    setBusy(true);
    setError("");
    try {
      await api.updateProfile(editingProfile.id, {
        name: editingProfile.name,
        ...(removePin ? { pin: null } : newPin ? { pin: newPin } : {}),
        maxAgeRating: maxAgeRating === "" ? null : Number(maxAgeRating),
      });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      setEditingProfile(null);
    } catch {
      setError("Não foi possível salvar. Use um PIN de 4 a 8 dígitos.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profiles-page">
      <div className="profiles-page__logo">CyanFlix</div>
      <h1 className="profiles-page__heading">Quem está assistindo?</h1>
      <p className="profiles-page__subheading">Selecione seu perfil para continuar</p>

      <div className="profiles-page__grid">
        {profiles.data?.map((profile) => (
          <div key={profile.id} className="profile-card">
            <button className="profile-card__select" type="button" onClick={() => void enterProfile(profile)}>
              <span className={`profile-card__avatar ${profile.role === "admin" ? "profile-card__avatar--admin" : "profile-card__avatar--viewer"}`}>
                <span className="profile-card__avatar-inner" aria-hidden="true">{profile.name.slice(0, 1).toUpperCase()}</span>
                {profile.pinProtected && <span className="profile-card__lock">PIN</span>}
              </span>
              <span className="profile-card__name">{profile.name}</span>
              {profile.maxAgeRating != null && <span className="profile-card__rating">Até {profile.maxAgeRating} anos</span>}
            </button>
            <button className="profile-card__manage" type="button" onClick={() => openSettings(profile)}>Configurar</button>
          </div>
        ))}
      </div>

      {lockedProfile && (
        <div className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-pin-title">
          <form className="profile-dialog__card" onSubmit={(event) => { event.preventDefault(); void enterProfile(lockedProfile, pin); }}>
            <h2 id="profile-pin-title">PIN de {lockedProfile.name}</h2>
            <label>PIN<input autoFocus inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} minLength={4} maxLength={8} type="password" /></label>
            {error && <p className="profile-dialog__error" role="alert">{error}</p>}
            <div className="profile-dialog__actions"><button className="btn btn--primary" disabled={busy || pin.length < 4}>Desbloquear</button><button className="btn btn--secondary" type="button" onClick={() => setLockedProfile(null)}>Cancelar</button></div>
          </form>
        </div>
      )}

      {editingProfile && (
        <div className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
          <form className="profile-dialog__card" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
            <h2 id="profile-settings-title">Proteção de {editingProfile.name}</h2>
            <label>Novo PIN opcional<input inputMode="numeric" autoComplete="new-password" value={newPin} disabled={removePin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={editingProfile.pinProtected ? "Manter PIN atual" : "4 a 8 dígitos"} type="password" /></label>
            {editingProfile.pinProtected && <label className="profile-dialog__check"><input type="checkbox" checked={removePin} onChange={(event) => setRemovePin(event.target.checked)} /> Remover PIN atual</label>}
            <label>Classificação etária máxima<select value={maxAgeRating} onChange={(event) => setMaxAgeRating(event.target.value)}><option value="">Sem limite</option><option value="0">Livre</option><option value="10">10 anos</option><option value="12">12 anos</option><option value="14">14 anos</option><option value="16">16 anos</option><option value="18">18 anos</option></select></label>
            {error && <p className="profile-dialog__error" role="alert">{error}</p>}
            <div className="profile-dialog__actions"><button className="btn btn--primary" disabled={busy}>Salvar</button><button className="btn btn--secondary" type="button" onClick={() => setEditingProfile(null)}>Cancelar</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
