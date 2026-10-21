import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useProfileStore } from "../stores/useProfileStore";
import { useLogout } from "../hooks/useLogout";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { clearScrollRestoration } from "../hooks/useScrollRestoration";
import { CatalogMessage } from "../components/catalog/CatalogMessage";
import { ProfileAvatar } from "../components/profile/ProfileAvatar";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import type { Profile } from "../lib/types";

const personalQueryPrefixes = [
  "home",
  "work",
  "search",
  "playback",
  "favorites",
  "continue-watching",
  "up-next",
  "progress",
  "profile-preferences",
] as const;

export function ProfilesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profileId = useProfileStore((state) => state.profileId);
  const setProfile = useProfileStore((state) => state.setProfile);
  const { logout, isPending: loggingOut } = useLogout();
  const { data: session, isLoading: sessionLoading } = useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.getProfiles });
  const activeProfile = useQuery({
    queryKey: ["profiles", "active"],
    queryFn: api.getActiveProfile,
    enabled: Boolean(profileId),
    retry: false,
  });
  const [lockedProfile, setLockedProfile] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [removePin, setRemovePin] = useState(false);
  const [maxAgeRating, setMaxAgeRating] = useState("");
  const [profileName, setProfileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clearPersonalCaches = () => {
    for (const prefix of personalQueryPrefixes) {
      queryClient.removeQueries({ queryKey: [prefix] });
    }
    clearScrollRestoration();
  };

  const destinationFor = (profile: Profile) => (
    profile.role === "admin" && (session?.role === "owner" || session?.role === "admin")
      ? "/admin"
      : "/browse"
  );

  const enterProfile = async (profile: Profile, candidatePin?: string) => {
    if (busy) return;

    if (activeProfile.data?.id === profile.id) {
      setProfile(profile.id);
      navigate(destinationFor(profile));
      return;
    }

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
      clearPersonalCaches();
      setLockedProfile(null);
      navigate(destinationFor(unlocked));
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "";
      setError(/Muitas tentativas/i.test(detail)
        ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
        : "PIN inválido ou perfil indisponível.");
    } finally {
      setBusy(false);
    }
  };

  const openSettings = (profile: Profile) => {
    setEditingProfile(profile);
    setProfileName(profile.name);
    setNewPin("");
    setRemovePin(false);
    setMaxAgeRating(profile.maxAgeRating == null ? "" : String(profile.maxAgeRating));
    setError("");
  };

  const closeSettings = () => {
    setEditingProfile(null);
    setError("");
  };

  const closePinDialog = () => {
    setLockedProfile(null);
    setError("");
  };

  const pinDialogRef = useDialogFocus<HTMLFormElement>(Boolean(lockedProfile), closePinDialog);
  const settingsDialogRef = useDialogFocus<HTMLFormElement>(Boolean(editingProfile), closeSettings);

  const saveSettings = async () => {
    if (!editingProfile || !profileName.trim()) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateProfile(editingProfile.id, {
        name: profileName.trim(),
        ...(removePin ? { pin: null } : newPin ? { pin: newPin } : {}),
        maxAgeRating: maxAgeRating === "" ? null : Number(maxAgeRating),
      });
      queryClient.setQueryData<Profile[]>(["profiles"], (current) => (
        current ? current.map((profile) => profile.id === updated.id ? updated : profile) : current
      ));
      if (activeProfile.data?.id === updated.id) {
        queryClient.setQueryData(["profiles", "active"], updated);
      }
      setEditingProfile(null);
    } catch {
      setError("Não foi possível salvar. Use um nome e um PIN de 4 a 8 dígitos.");
    } finally {
      setBusy(false);
    }
  };

  if (profiles.isLoading) return <Spinner fullScreen />;

  const accountLabel = session?.username
    ? `Conta de ${session.username}`
    : sessionLoading ? "Carregando conta…" : "Dados da conta indisponíveis";
  const newPinInvalid = !removePin && newPin.length > 0 && newPin.length < 4;

  return (
    <div className="profiles-page" aria-busy={busy} data-spatial-scope="profiles">
      <div className="profiles-page__logo">CyanFlix</div>
      <h1 className="profiles-page__heading">Quem está assistindo?</h1>
      <p className="profiles-page__subheading">Selecione seu perfil para continuar</p>
      <p className="profiles-page__account">{accountLabel}</p>

      {profiles.isError && (
        <CatalogMessage
          tone="error"
          icon="info"
          title="Não foi possível carregar os perfis"
          description="Verifique a conexão e tente novamente. Sua conta continua autenticada."
          actions={<button type="button" className="btn btn--primary" onClick={() => { void profiles.refetch(); }}>Tentar novamente</button>}
        />
      )}

      {!profiles.isError && profiles.data?.length === 0 && (
        <CatalogMessage
          icon="user"
          title="Nenhum perfil disponível"
          description="Esta conta ainda não possui perfis disponíveis."
        />
      )}

      {!profiles.isError && Boolean(profiles.data?.length) && (
        <div className="profiles-page__grid">
          {profiles.data?.map((profile, index) => {
            const isActive = activeProfile.data?.id === profile.id;
            const ratingLabel = profile.maxAgeRating == null
              ? null
              : profile.maxAgeRating === 0
                ? "Livre"
                : `Até ${profile.maxAgeRating} anos`;
            return (
              <div key={profile.id} className={`profile-card${isActive ? " profile-card--active" : ""}`}>
                <button
                  className="profile-card__select"
                  type="button"
                  disabled={busy}
                  aria-label={`${isActive ? "Continuar com" : "Entrar no"} perfil ${profile.name}${profile.pinProtected ? ", protegido por PIN" : ""}${ratingLabel ? `, ${ratingLabel}` : ""}`}
                  data-spatial-initial={index === 0 ? "true" : undefined}
                  onClick={() => void enterProfile(profile)}
                >
                  <ProfileAvatar
                    name={profile.name}
                    avatar={profile.avatar}
                    className={`profile-card__avatar ${profile.role === "admin" ? "profile-card__avatar--admin" : "profile-card__avatar--viewer"}`}
                  >
                    {profile.pinProtected && <span className="profile-card__lock">PIN</span>}
                  </ProfileAvatar>
                  <span className="profile-card__name">{profile.name}</span>
                  {isActive && (
                    <span className="profile-card__active">
                      <Icon name="check" />
                      Perfil ativo
                    </span>
                  )}
                  {ratingLabel && <span className="profile-card__rating">{ratingLabel}</span>}
                </button>
                <button
                  className="profile-card__manage"
                  type="button"
                  disabled={busy}
                  aria-label={`Ajustar perfil ${profile.name}`}
                  onClick={() => openSettings(profile)}
                >
                  Ajustar
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="profiles-page__footer">
        <span>{activeProfile.data ? "Você pode trocar de perfil a qualquer momento." : "Escolha um perfil para continuar."}</span>
        <button
          type="button"
          className="profiles-page__logout"
          disabled={loggingOut}
          onClick={() => { void logout(); }}
        >
          <Icon name="logout" />
          {loggingOut ? "Saindo…" : "Sair da conta"}
        </button>
      </div>

      {lockedProfile && (
        <div
          className="profile-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-pin-title"
          data-spatial-scope="pin-dialog"
          data-spatial-overlay="true"
        >
          <form ref={pinDialogRef} className="profile-dialog__card" onSubmit={(event) => { event.preventDefault(); void enterProfile(lockedProfile, pin); }}>
            <h2 id="profile-pin-title">PIN de {lockedProfile.name}</h2>
            <label>PIN<input data-autofocus inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} minLength={4} maxLength={8} type="password" /></label>
            {error && <p className="profile-dialog__error" role="alert">{error}</p>}
            <div className="profile-dialog__actions">
              <button className="btn btn--primary" disabled={busy || pin.length < 4}>Desbloquear</button>
              <button className="btn btn--secondary" type="button" onClick={closePinDialog}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {editingProfile && (
        <div
          className="profile-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-settings-title"
          data-spatial-scope="profile-settings-dialog"
          data-spatial-overlay="true"
        >
          <form ref={settingsDialogRef} className="profile-dialog__card" onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
            <h2 id="profile-settings-title">Ajustar perfil de {editingProfile.name}</h2>
            <label>Nome do perfil<input data-autofocus autoComplete="off" value={profileName} maxLength={60} onChange={(event) => setProfileName(event.target.value)} /></label>
            <label>Novo PIN opcional<input inputMode="numeric" autoComplete="new-password" value={newPin} disabled={removePin} aria-invalid={newPinInvalid} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={editingProfile.pinProtected ? "Manter PIN atual" : "4 a 8 dígitos"} type="password" /></label>
            {editingProfile.pinProtected && <label className="profile-dialog__check"><input type="checkbox" checked={removePin} onChange={(event) => setRemovePin(event.target.checked)} /> Remover PIN atual</label>}
            <label>Classificação etária máxima<select value={maxAgeRating} onChange={(event) => setMaxAgeRating(event.target.value)}><option value="">Sem limite</option><option value="0">Livre</option><option value="10">10 anos</option><option value="12">12 anos</option><option value="14">14 anos</option><option value="16">16 anos</option><option value="18">18 anos</option></select></label>
            {error && <p className="profile-dialog__error" role="alert">{error}</p>}
            <div className="profile-dialog__actions">
              <button className="btn btn--primary" disabled={busy || !profileName.trim() || newPinInvalid}>Salvar</button>
              <button className="btn btn--secondary" type="button" onClick={closeSettings}>Cancelar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
