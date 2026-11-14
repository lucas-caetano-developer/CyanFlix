import { useRef, useState } from "react";
import type { Character } from "../../lib/types";
import { Icon } from "../ui/Icon";
import { CharacterSheetModal } from "./CharacterSheetModal";

interface CharactersSectionProps {
  characters: Character[];
  workTitle: string;
}

export function CharactersSection({
  characters,
  workTitle,
}: CharactersSectionProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  if (characters.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const distance = direction === "left" ? -380 : 380;
    scrollRef.current.scrollBy({ left: distance, behavior: "smooth" });
  };

  return (
    <section
      id="personagens"
      className="title-page__section title-page__section--characters"
      aria-labelledby="personagens-title"
    >
      <div className="title-page__section-heading">
        <div>
          <h2 id="personagens-title" className="title-page__section-title">
            Personagens
          </h2>
          <p className="title-page__section-kicker">
            {characters.length}{" "}
            {characters.length === 1
              ? "personagem cadastrado"
              : "personagens cadastrados"}{" "}
            · Clique para ver a ficha completa
          </p>
        </div>

        {characters.length > 4 && (
          <div className="title-page__character-arrows" aria-hidden="true">
            <button
              type="button"
              className="title-page__character-arrow"
              onClick={() => scroll("left")}
              aria-label="Rolar para a esquerda"
            >
              <Icon name="chevron-left" />
            </button>
            <button
              type="button"
              className="title-page__character-arrow"
              onClick={() => scroll("right")}
              aria-label="Rolar para a direita"
            >
              <Icon name="chevron-right" />
            </button>
          </div>
        )}
      </div>

      <div className="title-page__characters-track" ref={scrollRef}>
        {characters.map((character) => {
          const theme = character.themeColor || "#00d4ff";
          return (
            <button
              key={character.id}
              type="button"
              className="title-page__character-card"
              onClick={() => setSelectedCharacter(character)}
              aria-label={`Ver ficha de ${character.name}`}
            >
              <div
                className="title-page__character-avatar-frame"
                style={{ ["--char-theme" as string]: theme }}
              >
                {character.photoUrl ? (
                  <img
                    src={character.photoUrl}
                    alt=""
                    className="title-page__character-avatar-img"
                    loading="lazy"
                  />
                ) : (
                  <div className="title-page__character-avatar-fallback">
                    {character.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {character.bodyPhotoUrl && (
                  <span
                    className="title-page__character-body-badge"
                    title="Possui arte de corpo inteiro"
                    aria-label="Arte de corpo inteiro"
                  >
                    ★
                  </span>
                )}
              </div>

              <div className="title-page__character-meta">
                <strong className="title-page__character-name">
                  {character.name}
                </strong>
                {character.role ? (
                  <span className="title-page__character-role">
                    {character.role}
                  </span>
                ) : (
                  <span className="title-page__character-role title-page__character-role--generic">
                    Personagem
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Ficha do Personagem Modal */}
      {selectedCharacter && (
        <CharacterSheetModal
          character={selectedCharacter}
          workTitle={workTitle}
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </section>
  );
}
