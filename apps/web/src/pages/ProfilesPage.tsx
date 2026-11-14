import { useState, useRef, useEffect } from "react";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useProfileStore } from "../stores/useProfileStore";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { clearScrollRestoration } from "../hooks/useScrollRestoration";
import { CatalogMessage } from "../components/catalog/CatalogMessage";
import { ProfileAvatar } from "../components/profile/ProfileAvatar";
import { ProfileFormDialog } from "../components/profile/ProfileFormDialog";
import { Footer } from "../components/layout/Footer";
import { Icon } from "../components/ui/Icon";
import { Spinner } from "../components/ui/Spinner";
import { CyanFlixLogo } from "../components/ui/CyanFlixLogo";
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
  const clearProfile = useProfileStore((state) => state.clearProfile);
  const { data: session } = useQuery({ queryKey: ["auth", "session"], queryFn: api.getSession });
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: api.getProfiles });
  const activeProfile = useQuery({
    queryKey: ["profiles", "active"],
    queryFn: api.getActiveProfile,
    enabled: Boolean(profileId),
    retry: false,
  });

  const [lockedProfile, setLockedProfile] = useState<Profile | null>(null);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [adminPinProfile, setAdminPinProfile] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const clearPersonalCaches = () => {
    for (const prefix of personalQueryPrefixes) {
      queryClient.removeQueries({ queryKey: [prefix] });
    }
    clearScrollRestoration();
  };

  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const destinationFor = (profile: Profile) => {
    if (redirectParam && redirectParam.startsWith("/")) {
      return redirectParam;
    }
    return profile.role === "admin" && (session?.role === "owner" || session?.role === "admin")
      ? "/admin"
      : "/browse";
  };

  const enterProfile = async (profile: Profile, candidatePin?: string) => {
    if (busy) return;

    if (activeProfile.data?.id === profile.id && activeProfile.data.pinProtected) {
      setProfile(profile.id);
      navigate(destinationFor(profile));
      return;
    }

    if (profile.role === "admin" && !profile.pinProtected) {
      setPin("");
      setError("");
      setAdminPinProfile(profile);
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

  const openSettings = (profile: Profile, trigger?: HTMLElement) => {
    lastTriggerRef.current = trigger || (document.activeElement as HTMLElement | null);
    setEditingProfile(profile);
    setError("");
  };

  const closeSettings = () => {
    setEditingProfile(null);
    setError("");
    requestAnimationFrame(() => {
      lastTriggerRef.current?.focus();
    });
  };

  const closePinDialog = () => {
    setLockedProfile(null);
    setError("");
  };

  const closeAdminPinDialog = () => {
    setAdminPinProfile(null);
    setError("");
    setNewPin("");
  };

  const pinDialogRef = useDialogFocus<HTMLFormElement>(Boolean(lockedProfile), closePinDialog);
  const adminPinDialogRef = useDialogFocus<HTMLFormElement>(Boolean(adminPinProfile), closeAdminPinDialog);

  const handleSaveSettings = async (data: {
    name: string;
    avatar: string;
    pin: string | null;
    maxAgeRating: number | null;
  }) => {
    if (!editingProfile || !data.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateProfile(editingProfile.id, {
        name: data.name.trim(),
        avatar: data.avatar || undefined,
        ...(data.pin !== undefined ? { pin: data.pin } : {}),
        maxAgeRating: data.maxAgeRating,
      });
      queryClient.setQueryData<Profile[]>(["profiles"], (current) => (
        current ? current.map((p) => p.id === updated.id ? updated : p) : current
      ));
      if (activeProfile.data?.id === updated.id) {
        queryClient.setQueryData(["profiles", "active"], updated);
      }
      closeSettings();
    } catch {
      setError("Não foi possível salvar o perfil. Verifique os dados.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!editingProfile) return;
    if (!window.confirm(`Tem certeza que deseja excluir o perfil "${editingProfile.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteProfile(editingProfile.id);
      queryClient.setQueryData<Profile[]>(["profiles"], (current) => (
        current ? current.filter((p) => p.id !== editingProfile.id) : []
      ));
      if (activeProfile.data?.id === editingProfile.id) {
        clearProfile();
        queryClient.removeQueries({ queryKey: ["profiles", "active"] });
      }
      closeSettings();
    } catch {
      setError("Não foi possível excluir o perfil.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateProfile = async (
    data: { name: string; avatar: string; pin: string | null; maxAgeRating: number | null },
    isFirst = false,
  ) => {
    if (!data.name.trim()) return;
    setBusy(true);
    setCreateError("");
    try {
      const created = await api.createProfile({
        name: data.name.trim(),
        avatar: data.avatar || undefined,
        pin: data.pin,
        maxAgeRating: data.maxAgeRating,
      });
      queryClient.setQueryData<Profile[]>(["profiles"], (current) => (
        current ? [...current, created] : [created]
      ));
      setCreatingProfile(false);
      if (isFirst) {
        const unlocked = await api.unlockProfile(created.id, data.pin || undefined).catch(() => created);
        queryClient.setQueryData(["profiles", "active"], unlocked);
        setProfile(unlocked.id);
        clearPersonalCaches();
        navigate(destinationFor(unlocked));
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : "";
      setCreateError(/Muitas tentativas/i.test(detail)
        ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
        : "Não foi possível criar o perfil.");
    } finally {
      setBusy(false);
    }
  };

  const defineAdminPin = async () => {
    if (!adminPinProfile || !newPin.trim()) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.updateProfile(adminPinProfile.id, {
        name: adminPinProfile.name,
        pin: newPin,
      });
      queryClient.setQueryData<Profile[]>(["profiles"], (current) => (
        current ? current.map((p) => p.id === updated.id ? updated : p) : current
      ));
      setAdminPinProfile(null);
      setNewPin("");
      setProfile(updated.id);
      clearPersonalCaches();
      navigate(destinationFor(updated));
    } catch {
      setError("Não foi possível definir a senha de administração. Use 4 a 8 dígitos.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (session && !session.authenticated) {
      window.location.href = "/";
    }
  }, [session]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      clearProfile();
      queryClient.clear();
      window.location.href = "/";
    }
  };

  if (profiles.isError && (!session?.authenticated || String(profiles.error).includes("401") || String(profiles.error).includes("Unauthorized"))) {
    return <Navigate to="/" replace />;
  }

  if (profiles.isLoading) return <Spinner fullScreen />;

  const hasProfiles = Boolean(profiles.data?.length);

  return (
    <div className="profiles-page premium" aria-busy={busy} data-spatial-scope="profiles">
      <div className="premium__glow" />

      {profiles.isError && (
        <div style={{ marginTop: "4rem" }}>
          <CatalogMessage
            tone="error"
            icon="info"
            title="Não foi possível carregar os perfis"
            description="Verifique a conexão e tente novamente."
            actions={<button type="button" className="btn btn--primary" onClick={() => { void profiles.refetch(); }}>Tentar novamente</button>}
          />
        </div>
      )}

      {/* First-time Profile Creation Flow: when user logs in and account has 0 profiles */}
      {!profiles.isError && !hasProfiles && (
        <div className="premium__first-profile-wrap">
          <div className="premium__logo" style={{ marginBottom: "1.5rem" }}>
            <CyanFlixLogo className="premium__logo-svg" />
            <span className="sr-only">CyanFlix</span>
          </div>
          <div className="premium__dialog" style={{ width: "min(460px, 92vw)" }}>
            <ProfileFormDialog
              title="Criar seu primeiro perfil"
              isFirstProfile={true}
              busy={busy}
              error={createError}
              onSave={(data) => void handleCreateProfile(data, true)}
              onCancel={() => void handleLogout()}
            />
          </div>
        </div>
      )}

      {/* Normal Profiles Screen: When account has profiles */}
      {!profiles.isError && hasProfiles && (
        <>
          <div className="premium__header">
            <div className="premium__logo">
              <CyanFlixLogo className="premium__logo-svg" />
              <span className="sr-only">CyanFlix</span>
            </div>
            <h1 className="premium__heading">Quem está assistindo?</h1>
            <p className="premium__subheading">Escolha um perfil para continuar</p>
          </div>

          <div className="premium__grid">
            {profiles.data?.map((profile, index) => {
              const isActive = activeProfile.data?.id === profile.id;
              const ratingLabel = profile.maxAgeRating == null
                ? null
                : profile.maxAgeRating === 0
                  ? "Livre"
                  : `Até ${profile.maxAgeRating} anos`;
              return (
                <div key={profile.id} className={`premium__card${isActive ? " premium__card--active" : ""}`}>
                  <button
                    className="premium__select"
                    type="button"
                    disabled={busy}
                    aria-label={`${isActive ? "Continuar com" : "Entrar no"} perfil ${profile.name}${profile.pinProtected ? ", protegido por PIN" : ""}${ratingLabel ? `, ${ratingLabel}` : ""}`}
                    data-spatial-initial={index === 0 ? "true" : undefined}
                    onClick={() => void enterProfile(profile)}
                  >
                    <div className="premium__avatar-wrap">
                      <ProfileAvatar
                        name={profile.name}
                        avatar={profile.avatar}
                        className={`premium__avatar ${profile.role === "admin" ? "premium__avatar--admin" : "premium__avatar--viewer"}`}
                      >
                        {profile.pinProtected && <span className="premium__lock">PIN</span>}
                        {profile.role === "admin" && !profile.pinProtected && <span className="premium__lock">SENHA</span>}
                      </ProfileAvatar>
                      {isActive && (
                        <span className="premium__active-badge">
                          <Icon name="check" /> Ativo
                        </span>
                      )}
                    </div>
                    <span className="premium__name">{profile.name}</span>
                    {ratingLabel && <span className="premium__rating">{ratingLabel}</span>}
                  </button>
                  <button
                    className="premium__manage"
                    type="button"
                    disabled={busy}
                    aria-label={`Ajustar perfil ${profile.name}`}
                    onClick={(e) => openSettings(profile, e.currentTarget)}
                  >
                    <Icon name="settings" />
                  </button>
                </div>
              );
            })}

            <div className="premium__card premium__card--add">
              <button
                className="premium__select premium__select--add"
                type="button"
                disabled={busy}
                aria-label="Criar novo perfil"
                data-spatial-initial={false}
                onClick={() => { setCreatingProfile(true); setCreateError(""); }}
              >
                <div className="premium__avatar-wrap">
                  <div className="premium__avatar premium__avatar--add" aria-hidden="true">
                    <Icon name="plus" />
                  </div>
                </div>
                <span className="premium__name">Novo perfil</span>
              </button>
            </div>
          </div>

          <div className="premium__footer">
            <span>{activeProfile.data ? "Você pode trocar de perfil a qualquer momento." : "Escolha um perfil para continuar."}</span>
            <button
              type="button"
              className="premium__logout"
              disabled={busy}
              onClick={() => void handleLogout()}
            >
              <Icon name="logout" />
              Sair da conta
            </button>
          </div>
        </>
      )}

      <Footer className="site-footer--profiles" />

      {/* Unlock PIN Dialog */}
      {lockedProfile && (
        <div
          className="premium__overlay"
          data-spatial-scope="pin-dialog"
          data-spatial-overlay="true"
        >
          <div className="premium__dialog" role="dialog" aria-modal="true" aria-labelledby="profile-pin-title">
            <form ref={pinDialogRef} className="premium__dialog-card" onSubmit={(event) => { event.preventDefault(); void enterProfile(lockedProfile, pin); }}>
              <h2 id="profile-pin-title">Desbloquear {lockedProfile.name}</h2>
              <label className="premium__field">
                <span>PIN</span>
                <input data-autofocus inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))} minLength={4} maxLength={8} type="password" />
              </label>
              {error && <p className="premium__error">{error}</p>}
              <div className="premium__actions">
                <button className="btn btn--primary premium__btn" disabled={busy || pin.length < 4}>Desbloquear</button>
                <button className="btn btn--secondary premium__btn" type="button" onClick={closePinDialog}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin PIN setup dialog */}
      {adminPinProfile && (
        <div
          className="premium__overlay"
          data-spatial-scope="admin-pin-dialog"
          data-spatial-overlay="true"
        >
          <div className="premium__dialog" role="dialog" aria-modal="true" aria-labelledby="profile-admin-pin-title">
            <form ref={adminPinDialogRef} className="premium__dialog-card" onSubmit={(event) => { event.preventDefault(); void defineAdminPin(); }}>
              <h2 id="profile-admin-pin-title">Definir senha de administração</h2>
              <p className="premium__subtitle">O perfil de administrador <strong>{adminPinProfile.name}</strong> precisa de uma senha para acessar a administração.</p>
              <label className="premium__field">
                <span>Senha (PIN)</span>
                <input data-autofocus inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))} minLength={4} maxLength={8} placeholder="4 a 8 dígitos" type="password" />
              </label>
              {error && <p className="premium__error">{error}</p>}
              <div className="premium__actions">
                <button className="btn btn--primary premium__btn" disabled={busy || newPin.length < 4}>Definir senha e entrar</button>
                <button className="btn btn--secondary premium__btn" type="button" onClick={closeAdminPinDialog}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Profile Dialog */}
      {editingProfile && (
        <div
          className="premium__overlay"
          data-spatial-scope="profile-settings-dialog"
          data-spatial-overlay="true"
        >
          <div className="premium__dialog" style={{ width: "min(460px, 92vw)" }}>
            <ProfileFormDialog
              initialProfile={editingProfile}
              busy={busy}
              error={error}
              onSave={(data) => void handleSaveSettings(data)}
              onCancel={closeSettings}
              onDelete={() => void handleDeleteProfile()}
            />
          </div>
        </div>
      )}

      {/* Create New Profile Dialog */}
      {creatingProfile && (
        <div
          className="premium__overlay"
          data-spatial-scope="profile-create-dialog"
          data-spatial-overlay="true"
        >
          <div className="premium__dialog" style={{ width: "min(460px, 92vw)" }}>
            <ProfileFormDialog
              title="Criar perfil"
              busy={busy}
              error={createError}
              onSave={(data) => void handleCreateProfile(data, false)}
              onCancel={() => setCreatingProfile(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
