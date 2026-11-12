import { useState, useEffect, useRef } from "react";
import { ProfileAvatar } from "./ProfileAvatar";
import { AvatarModal } from "./AvatarModal";
import { Icon } from "../ui/Icon";
import type { Profile } from "../../lib/types";

export interface ProfileFormDialogProps {
  title?: string;
  initialProfile?: Profile | null;
  busy?: boolean;
  error?: string;
  isFirstProfile?: boolean;
  onSave: (data: {
    name: string;
    avatar: string;
    pin: string | null;
    maxAgeRating: number | null;
  }) => Promise<void> | void;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
}

export function ProfileFormDialog({
  title,
  initialProfile,
  busy = false,
  error = "",
  isFirstProfile = false,
  onSave,
  onCancel,
  onDelete,
}: ProfileFormDialogProps) {
  const isEditing = Boolean(initialProfile);
  const [name, setName] = useState(initialProfile?.name ?? "");
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? "cyan");
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // PIN toggle state
  const [hasPin, setHasPin] = useState(Boolean(initialProfile?.pinProtected));
  const [pin, setPin] = useState("");
  
  // Kid/Teen vs Adult toggle state: if maxAgeRating != null, it's Kid/Teen
  const [isKidProfile, setIsKidProfile] = useState(
    initialProfile?.maxAgeRating !== undefined && initialProfile?.maxAgeRating !== null
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isAvatarModalOpen) {
          setIsAvatarModalOpen(false);
        } else {
          onCancel();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAvatarModalOpen, onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let pinToSend: string | null = null;
    if (hasPin) {
      if (pin.trim()) {
        pinToSend = pin.trim();
      } else if (isEditing && initialProfile?.pinProtected) {
        // Keep existing pin
        pinToSend = undefined as unknown as null;
      }
    } else {
      pinToSend = null; // remove PIN
    }

    onSave({
      name: name.trim(),
      avatar,
      pin: pinToSend,
      maxAgeRating: isKidProfile ? 12 : null,
    });
  };

  const defaultTitle = isEditing
    ? `Ajustar perfil de ${initialProfile?.name}`
    : isFirstProfile
      ? "Criar seu primeiro perfil"
      : "Criar perfil";
  const displayTitle = title || defaultTitle;

  return (
    <>
      <div
        className="profile-form-card"
        role="dialog"
        aria-modal="true"
        aria-label={displayTitle}
      >
        <h2 id="profile-form-title" className="profile-form__title">
          {displayTitle}
        </h2>

        {/* Center Avatar Preview with Pencil edit button */}
        <div className="profile-form__avatar-hero">
          <div
            className="profile-form__avatar-wrap"
            onClick={() => setIsAvatarModalOpen(true)}
            role="button"
            tabIndex={0}
            aria-label="Alterar avatar do perfil"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsAvatarModalOpen(true);
              }
            }}
          >
            <ProfileAvatar name={name || "Perfil"} avatar={avatar} className="profile-form__avatar" />
            <button
              type="button"
              className="profile-form__avatar-edit-badge"
              onClick={(e) => {
                e.stopPropagation();
                setIsAvatarModalOpen(true);
              }}
              aria-label="Escolher avatar"
              title="Escolher avatar"
            >
              <Icon name="pencil" />
            </button>
          </div>
        </div>

        <form className="profile-form__body" onSubmit={handleSubmit}>
          {/* Nome do perfil */}
          <div className="profile-form__field">
            <label className="profile-form__label" htmlFor="profile-form-name">
              Nome do perfil
            </label>
            <input
              id="profile-form-name"
              ref={inputRef}
              className="profile-form__input"
              type="text"
              autoComplete="off"
              value={name}
              maxLength={50}
              placeholder="Digite o nome do perfil"
              onChange={(e) => setName(e.target.value)}
              required
            />
            <p className="profile-form__hint">
              Este é visualizado dentro da sua casa e pode ser alterado a qualquer tempo.
            </p>
          </div>

          {/* Senha de Acesso (PIN) */}
          <div className="profile-form__field">
            <div className="profile-form__toggle-row">
              <div className="profile-form__toggle-info">
                <span className="profile-form__toggle-title">Proteger perfil com PIN</span>
                <p className="profile-form__hint">
                  Exige uma senha numérica de 4 a 8 dígitos para acessar este perfil.
                </p>
              </div>
              <label className="profile-form__switch" aria-label="Ativar proteção por PIN">
                <input
                  type="checkbox"
                  checked={hasPin}
                  onChange={(e) => {
                    setHasPin(e.target.checked);
                    if (!e.target.checked) setPin("");
                  }}
                />
                <span className="profile-form__switch-slider" />
              </label>
            </div>

            {hasPin && (
              <div className="profile-form__pin-wrapper">
                <label className="profile-form__sublabel" htmlFor="profile-form-pin">
                  {isEditing && initialProfile?.pinProtected && !pin
                    ? "Nova senha (deixe em branco para manter a atual):"
                    : "Digite a senha numérica (4 a 8 dígitos):"}
                </label>
                <input
                  id="profile-form-pin"
                  className="profile-form__input"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pin}
                  minLength={4}
                  maxLength={8}
                  placeholder={
                    isEditing && initialProfile?.pinProtected
                      ? "Manter senha atual"
                      : "4 a 8 dígitos numéricos"
                  }
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </div>
            )}
          </div>

          {/* Perfil Infantil / Adulto */}
          <div className="profile-form__field">
            <div className="profile-form__toggle-row">
              <div className="profile-form__toggle-info">
                <span className="profile-form__toggle-title">Perfil Infantil</span>
                <p className="profile-form__hint">
                  Crie um perfil com conteúdo seguro para crianças e adolescentes. Obras adultas serão ocultadas no catálogo.
                </p>
              </div>
              <label className="profile-form__switch" aria-label="Ativar perfil infantil">
                <input
                  type="checkbox"
                  checked={isKidProfile}
                  onChange={(e) => setIsKidProfile(e.target.checked)}
                />
                <span className="profile-form__switch-slider" />
              </label>
            </div>
          </div>

          {error && <p className="profile-form__error">{error}</p>}

          {/* Action buttons */}
          <div className="profile-form__actions">
            <button
              type="submit"
              className="profile-form__btn profile-form__btn--save"
              disabled={
                busy ||
                !name.trim() ||
                (hasPin && (!isEditing || !initialProfile?.pinProtected) && pin.length < 4) ||
                (hasPin && pin.length > 0 && pin.length < 4)
              }
            >
              {busy ? "Salvando..." : "Salvar"}
            </button>

            <button
              type="button"
              className="profile-form__btn profile-form__btn--cancel"
              disabled={busy}
              onClick={onCancel}
            >
              {isFirstProfile ? "Sair da conta" : "Cancelar"}
            </button>

            {isEditing && onDelete && (
              <button
                type="button"
                className="profile-form__btn profile-form__btn--delete"
                disabled={busy}
                onClick={onDelete}
              >
                Excluir perfil
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Avatar Modal */}
      <AvatarModal
        isOpen={isAvatarModalOpen}
        currentAvatar={avatar}
        onSave={(newAvatar) => setAvatar(newAvatar)}
        onClose={() => setIsAvatarModalOpen(false)}
      />
    </>
  );
}
