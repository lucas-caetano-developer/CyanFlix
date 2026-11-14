import { useEffect, useRef, useState } from "react";
import type { Character } from "../../lib/types";
import { Icon } from "../ui/Icon";

interface CharacterSheetModalProps {
  character: Character;
  workTitle?: string;
  onClose: () => void;
}

export function CharacterSheetModal({
  character,
  workTitle,
  onClose,
}: CharacterSheetModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlayingVoice, setIsPlayingVoice] = useState(false);
  const [activePhotoTab, setActivePhotoTab] = useState<"body" | "avatar">(
    character.bodyPhotoUrl ? "body" : "avatar"
  );

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock body scroll while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Parse archetypes into clean tags
  const archetypes = character.archetype
    ? character.archetype
        .split(/[,;\n]+/)
        .map((a) => a.trim())
        .filter(Boolean)
    : [];

  const handleToggleVoice = () => {
    if (!audioRef.current) return;
    if (isPlayingVoice) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlayingVoice(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlayingVoice(true))
        .catch(() => setIsPlayingVoice(false));
    }
  };

  const themeColor = character.themeColor || "#00d4ff";

  return (
    <div
      className="character-sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-sheet-name"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="character-sheet-card"
        ref={modalRef}
        style={{
          // Custom CSS variable for dynamic character glow
          ["--character-theme" as string]: themeColor,
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          className="character-sheet-close"
          onClick={onClose}
          aria-label="Fechar ficha do personagem"
        >
          <Icon name="close" />
        </button>

        {/* Modal Layout */}
        <div className="character-sheet-layout">
          {/* Visual Column */}
          <div className="character-sheet-visual">
            <div className="character-sheet-art-stage">
              {activePhotoTab === "body" && character.bodyPhotoUrl ? (
                <div className="character-sheet-body-container">
                  <img
                    src={character.bodyPhotoUrl}
                    alt={character.name}
                    className="character-sheet-body-img"
                    loading="lazy"
                  />
                  <div
                    className="character-sheet-glow"
                    style={{ backgroundColor: themeColor }}
                    aria-hidden="true"
                  />
                </div>
              ) : (
                <div className="character-sheet-portrait-container">
                  {character.photoUrl ? (
                    <img
                      src={character.photoUrl}
                      alt={character.name}
                      className="character-sheet-portrait-img"
                      loading="lazy"
                    />
                  ) : (
                    <div className="character-sheet-portrait-fallback">
                      {character.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div
                    className="character-sheet-glow"
                    style={{ backgroundColor: themeColor }}
                    aria-hidden="true"
                  />
                </div>
              )}

              {/* View Switcher if both photos are present */}
              {character.bodyPhotoUrl && character.photoUrl && (
                <div className="character-sheet-view-toggle">
                  <button
                    type="button"
                    className={`character-sheet-view-btn ${activePhotoTab === "body" ? "character-sheet-view-btn--active" : ""}`}
                    onClick={() => setActivePhotoTab("body")}
                  >
                    Corpo inteiro
                  </button>
                  <button
                    type="button"
                    className={`character-sheet-view-btn ${activePhotoTab === "avatar" ? "character-sheet-view-btn--active" : ""}`}
                    onClick={() => setActivePhotoTab("avatar")}
                  >
                    Retrato
                  </button>
                </div>
              )}
            </div>

            {/* Profile Avatar Badge if showing full body */}
            {activePhotoTab === "body" && character.photoUrl && (
              <div className="character-sheet-avatar-peek">
                <img
                  src={character.photoUrl}
                  alt=""
                  className="character-sheet-avatar-peek-img"
                  aria-hidden="true"
                />
                <span className="character-sheet-avatar-peek-label">Foto de Perfil</span>
              </div>
            )}
          </div>

          {/* Details Column (Ficha Técnica) */}
          <div className="character-sheet-content">
            <div className="character-sheet-header">
              <span className="character-sheet-kicker">
                Ficha do Personagem {workTitle ? `· ${workTitle}` : ""}
              </span>
              <h2 id="character-sheet-name" className="character-sheet-name">
                {character.name}
              </h2>
            </div>

            {/* Tags / Badges */}
            <div className="character-sheet-tags">
              {character.role ? (
                <span className="character-sheet-tag character-sheet-tag--role">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span>{character.role}</span>
                </span>
              ) : (
                <span className="character-sheet-tag character-sheet-tag--role">
                  <span>Personagem</span>
                </span>
              )}

              {character.voiceActor && (
                <span className="character-sheet-tag character-sheet-tag--actor">
                  {character.voiceActor.photoUrl && (
                    <img
                      src={character.voiceActor.photoUrl}
                      alt=""
                      className="character-sheet-actor-avatar"
                    />
                  )}
                  <span>Voz: {character.voiceActor.name}</span>
                </span>
              )}
            </div>

            {/* Voice Line Player */}
            {character.voiceAudioUrl && (
              <div className="character-sheet-voice-card">
                <audio
                  ref={audioRef}
                  src={character.voiceAudioUrl}
                  onEnded={() => setIsPlayingVoice(false)}
                  onPause={() => setIsPlayingVoice(false)}
                />
                <button
                  type="button"
                  className={`character-sheet-voice-btn ${isPlayingVoice ? "character-sheet-voice-btn--playing" : ""}`}
                  onClick={handleToggleVoice}
                >
                  <Icon name={isPlayingVoice ? "pause" : "volume"} />
                  <span>{isPlayingVoice ? "Pausar fala do personagem" : "Ouvir voz do personagem"}</span>
                </button>
              </div>
            )}

            {/* Archetypes */}
            {archetypes.length > 0 && (
              <div className="character-sheet-section">
                <h3 className="character-sheet-section-title">Arquétipos</h3>
                <div className="character-sheet-archetypes-list">
                  {archetypes.map((archetype) => (
                    <span key={archetype} className="character-sheet-archetype-chip">
                      {archetype}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mini História / Bio */}
            <div className="character-sheet-section character-sheet-section--bio">
              <h3 className="character-sheet-section-title">Mini História</h3>
              {character.profileSentiments ? (
                <div className="character-sheet-bio-text">
                  {character.profileSentiments
                    .split(/\n\n+/)
                    .map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                </div>
              ) : (
                <p className="character-sheet-bio-empty">
                  Nenhuma mini história ou biografia detalhada cadastrada para este personagem ainda.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
