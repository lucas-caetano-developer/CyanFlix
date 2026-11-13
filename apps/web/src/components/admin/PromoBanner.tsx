import React from "react";
import type { Character, CharacterSummary, Work } from "../../lib/types";
import { getLogoUrl } from "../../lib/utils";

export interface PromoBannerProps {
  character: Character | CharacterSummary;
  work?: Work | null;
  categoryTitle?: string;
  categorySubtitle?: string;
  tagline?: string;
  logoPosition?: "left" | "right";
  customColor?: string;
  buttonColorStyle?: "theme" | "cyan" | "orange";
  characterOffsetX?: number;
  characterOffsetY?: number;
  characterScale?: number;
  ctaText?: string;
  className?: string;
  onClickCta?: () => void;
}

export function getDefaultCategoryTitles(
  role?: string | null,
  archetype?: string | null,
): { title: string; subtitle: string } {
  const cleanRole = (role || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let title = "PROTAGONISTA";
  if (cleanRole.includes("vil") || cleanRole.includes("antag")) {
    title = "ANTAGONISTA";
  } else if (cleanRole.includes("coadj") || cleanRole.includes("apoio")) {
    title = "COADJUVANTE";
  } else if (cleanRole.includes("protag")) {
    title = "PROTAGONISTA";
  } else if (role) {
    title = role.toUpperCase();
  }

  const subtitle = archetype ? archetype.trim().toUpperCase() : "";
  return { title, subtitle };
}

export const PromoBanner: React.FC<PromoBannerProps> = ({
  character,
  work,
  categoryTitle,
  categorySubtitle,
  tagline,
  logoPosition = "right",
  customColor,
  buttonColorStyle = "cyan",
  characterOffsetX = 0,
  characterOffsetY = 0,
  characterScale = 1.2,
  ctaText = "ASSISTA JÁ",
  className = "",
  onClickCta,
}) => {
  const themeColor = customColor || character.themeColor || "#2b1854";

  // Resolve Category Titles (Role + Archetype)
  const defaultCats = getDefaultCategoryTitles(character.role, character.archetype);
  const displayTitle = categoryTitle !== undefined ? categoryTitle : defaultCats.title;
  const displaySubtitle = categorySubtitle !== undefined ? categorySubtitle : defaultCats.subtitle;

  // Resolve Cutout Image - ONLY body photo
  const charPhoto = character.bodyPhotoUrl || null;

  // Obra Logo
  const logoUrl = work ? getLogoUrl(work) : null;
  const workTitle = work?.title || (character.work ? character.work.title : "CyanFlix Original");

  // Watermark Name - Primary uppercase word (first or single) and full name above
  const fullName = character.name.trim().toUpperCase();
  const nameParts = fullName.split(/\s+/);
  const giantWatermark = nameParts.length > 0 ? nameParts[0] : fullName;

  // Button background & color based on buttonColorStyle
  let buttonBg = "linear-gradient(135deg, #00d4ff 0%, #00a8cc 100%)";
  let buttonTextColor = "#060d17";
  let buttonShadow = "0 8px 24px -3px rgba(0, 212, 255, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4)";

  if (buttonColorStyle === "theme") {
    buttonBg = `linear-gradient(135deg, ${themeColor} 0%, rgba(255, 255, 255, 0.2) 100%)`;
    buttonTextColor = "#ffffff";
    buttonShadow = `0 8px 24px -3px ${themeColor}88, 0 2px 6px rgba(0, 0, 0, 0.5)`;
  } else if (buttonColorStyle === "orange") {
    buttonBg = "linear-gradient(135deg, #ff6b1a 0%, #ea580c 100%)";
    buttonTextColor = "#ffffff";
    buttonShadow = "0 8px 24px -3px rgba(234, 88, 12, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4)";
  }

  return (
    <div
      className={`promo-banner ${className}`}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "270px",
        maxHeight: "390px",
        aspectRatio: "3.2 / 1",
        borderRadius: "14px",
        overflow: "hidden",
        backgroundColor: themeColor,
        backgroundImage:
          "linear-gradient(180deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.18) 38%, rgba(0, 0, 0, 0) 75%)",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow: `0 18px 45px -10px rgba(0, 0, 0, 0.8), 0 0 35px -5px ${themeColor}44`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2.8rem",
        boxSizing: "border-box",
        userSelect: "none",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Giant Background Character Name (Occupies almost full height) */}
      <div
        style={{
          position: "absolute",
          top: "2%",
          left: logoPosition === "right" ? "18%" : "28%",
          right: logoPosition === "right" ? "28%" : "18%",
          bottom: "2%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        {/* Full Name above */}
        <span
          style={{
            fontSize: "clamp(0.75rem, 1.25vw, 1.1rem)",
            fontWeight: 800,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.6)",
            marginBottom: "-0.5rem",
            whiteSpace: "nowrap",
            textShadow: "0 2px 8px rgba(0, 0, 0, 0.6)",
          }}
        >
          {fullName}
        </span>
        {/* Huge vertical letters */}
        <span
          style={{
            fontSize: "clamp(7rem, 20vw, 16rem)",
            fontWeight: 900,
            lineHeight: 0.82,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.24)",
            fontFamily: "'Bebas Neue', 'Impact', sans-serif",
            textAlign: "center",
            whiteSpace: "nowrap",
            textShadow: "0 0 30px rgba(255, 255, 255, 0.12)",
          }}
        >
          {giantWatermark}
        </span>
      </div>

      {/* Role + Archetype Section (Both white, ultra-condensed font) */}
      <div
        style={{
          zIndex: 3,
          order: logoPosition === "right" ? 1 : 3,
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "34%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 0.84,
            fontFamily: "'Bebas Neue', 'Impact', sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            textShadow: "0 4px 18px rgba(0, 0, 0, 0.95)",
          }}
        >
          <span
            style={{
              fontSize: "clamp(2.5rem, 5.8vw, 5.4rem)",
              fontWeight: 900,
              color: "#ffffff",
              whiteSpace: "nowrap",
            }}
          >
            {displayTitle}
          </span>
          {displaySubtitle && (
            <span
              style={{
                fontSize: "clamp(2.1rem, 4.8vw, 4.5rem)",
                fontWeight: 900,
                color: "#ffffff",
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {displaySubtitle}
            </span>
          )}
        </div>
      </div>

      {/* Center Character Cutout (Adjustable position and scale) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: logoPosition === "right" ? "22%" : "28%",
          right: logoPosition === "right" ? "28%" : "22%",
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          zIndex: 2,
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        {charPhoto ? (
          <img
            src={charPhoto}
            alt={character.name}
            style={{
              maxHeight: "135%",
              maxWidth: "115%",
              objectFit: "contain",
              objectPosition: "bottom center",
              filter: `
                drop-shadow(0 18px 36px rgba(0, 0, 0, 0.85))
                drop-shadow(0 0 25px rgba(0, 0, 0, 0.5))
              `,
              transform: `translate(${characterOffsetX}px, ${characterOffsetY}px) scale(${characterScale})`,
              transformOrigin: "bottom center",
              transition: "transform 0.12s ease-out",
            }}
          />
        ) : (
          <div
            style={{
              width: "160px",
              height: "220px",
              borderRadius: "16px",
              background: "rgba(0, 0, 0, 0.4)",
              border: "2px dashed rgba(255, 255, 255, 0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#cbd5e1",
              fontSize: "0.85rem",
              textAlign: "center",
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <span style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🧍</span>
            <span>Sem foto de corpo</span>
          </div>
        )}
      </div>

      {/* Obra Logo & Call To Action Section (Enlarged) */}
      <div
        style={{
          zIndex: 3,
          order: logoPosition === "right" ? 3 : 1,
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: logoPosition === "right" ? "flex-end" : "flex-start",
          justifyContent: "center",
          maxWidth: "36%",
          gap: "1rem",
          textAlign: logoPosition === "right" ? "right" : "left",
        }}
      >
        {/* Optional Tagline above logo (like 'Junte-se à invasão') */}
        {tagline && (
          <span
            style={{
              color: "#ffffff",
              fontSize: "clamp(0.95rem, 1.4vw, 1.3rem)",
              fontWeight: 800,
              textTransform: "none",
              letterSpacing: "-0.01em",
              textShadow: "0 3px 12px rgba(0, 0, 0, 0.9)",
              marginBottom: "-0.3rem",
            }}
          >
            {tagline}
          </span>
        )}

        {/* Logo da Obra Oficial (Maior) */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={workTitle}
            style={{
              maxHeight: "clamp(65px, 9.5vw, 120px)",
              maxWidth: "300px",
              objectFit: "contain",
              filter: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.9))",
            }}
          />
        ) : (
          <div
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "8px",
              border: "1px dashed rgba(255, 255, 255, 0.25)",
              color: "rgba(255, 255, 255, 0.6)",
              fontSize: "0.8rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Sem logo cadastrada
          </div>
        )}

        {/* CTA Button (Maior e com cor do tema ou ciano) */}
        <button
          type="button"
          onClick={onClickCta}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(0.7rem, 1.1vw, 0.95rem) clamp(2.2rem, 3vw, 3.2rem)",
            backgroundColor: "#00d4ff",
            backgroundImage: buttonBg,
            color: buttonTextColor,
            fontSize: "clamp(0.95rem, 1.3vw, 1.25rem)",
            fontWeight: 900,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            borderRadius: "9999px",
            border: "none",
            cursor: "pointer",
            boxShadow: buttonShadow,
            transition: "transform 0.15s ease, filter 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.filter = "brightness(1.12)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.filter = "brightness(1)";
          }}
        >
          {ctaText}
        </button>

        {/* Studio / Copyright Footnote */}
        <div
          style={{
            fontSize: "0.68rem",
            color: "rgba(255, 255, 255, 0.55)",
            letterSpacing: "0.02em",
            textShadow: "0 1px 4px rgba(0, 0, 0, 0.8)",
          }}
        >
          © CyanFlix • {workTitle}
        </div>
      </div>
    </div>
  );
};
