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
  flipHorizontal?: boolean;
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

// Helper to scale font size based on text length so single line never overflows
function calculateFontSize(text: string, isSubtitle = false): string {
  const len = text.length;
  if (len > 24) return "clamp(1.3rem, 2.7vw, 2.5rem)";
  if (len > 18) return "clamp(1.6rem, 3.3vw, 3.1rem)";
  if (len > 13) return "clamp(1.9rem, 4.1vw, 3.8rem)";
  return isSubtitle ? "clamp(2.3rem, 4.9vw, 4.6rem)" : "clamp(2.6rem, 5.6vw, 5.2rem)";
}

export const PromoBanner: React.FC<PromoBannerProps> = ({
  character,
  work,
  categoryTitle,
  categorySubtitle,
  tagline,
  logoPosition = "right",
  customColor,
  flipHorizontal,
  characterOffsetX = 0,
  characterOffsetY = 0,
  characterScale = 1.25,
  ctaText = "ASSISTA JÁ",
  className = "",
  onClickCta,
}) => {
  const themeColor = customColor || character.themeColor || "#2b1854";

  // Resolve Category Titles (Role + Archetype)
  const defaultCats = getDefaultCategoryTitles(character.role, character.archetype);
  const displayTitle = (categoryTitle !== undefined ? categoryTitle : defaultCats.title).trim();
  const displaySubtitle = (categorySubtitle !== undefined ? categorySubtitle : defaultCats.subtitle).trim();

  // Resolve Cutout Image - ONLY body photo
  const charPhoto = character.bodyPhotoUrl || null;

  // Obra Logo
  const logoUrl = work ? getLogoUrl(work) : null;
  const workTitle = work?.title || (character.work ? character.work.title : "CyanFlix Original");

  // Single Background Name (Only once, stretched, never cut off)
  const bgName = character.name.trim().toUpperCase();

  // Dynamic font sizing for Role and Archetype to guarantee single line without clipping
  const titleFontSize = calculateFontSize(displayTitle, false);
  const subtitleFontSize = calculateFontSize(displaySubtitle, true);

  // Background Name sizing based on length to prevent horizontal cut off
  const bgNameFontSize =
    bgName.length <= 4
      ? "clamp(8rem, 23vw, 18rem)"
      : bgName.length <= 7
      ? "clamp(6.2rem, 17vw, 14.5rem)"
      : "clamp(4.5rem, 12vw, 10.5rem)";

  // Flip & Mirrored X calculations
  const shouldFlip = flipHorizontal !== undefined ? flipHorizontal : (logoPosition === "left");
  const effectiveScaleX = (shouldFlip ? -1 : 1) * characterScale;
  const effectiveScaleY = characterScale;
  const effectiveOffsetX = shouldFlip ? -characterOffsetX : characterOffsetX;

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
        padding: "0 clamp(2.5rem, 4vw, 4.5rem)",
        boxSizing: "border-box",
        userSelect: "none",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Giant Background Character Name (Single, vertically stretched, never clipped) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: logoPosition === "right" ? "10%" : "22%",
          right: logoPosition === "right" ? "22%" : "10%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 1,
          overflow: "visible",
        }}
      >
        <span
          style={{
            fontSize: bgNameFontSize,
            fontWeight: 700,
            lineHeight: 0.8,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.22)",
            fontFamily: "'Teko', 'Bebas Neue', 'Impact', sans-serif",
            textAlign: "center",
            whiteSpace: "nowrap",
            display: "inline-block",
            transform: "scale(1, 1.35)",
            transformOrigin: "center center",
            textShadow: "0 0 35px rgba(255, 255, 255, 0.12)",
          }}
        >
          {bgName}
        </span>
      </div>

      {/* Role + Archetype Section (Tall condensed Teko font, white, single lines, safe margins) */}
      <div
        style={{
          zIndex: 3,
          order: logoPosition === "right" ? 1 : 3,
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "40%",
          marginRight: logoPosition === "left" ? "1.5rem" : "0",
          marginLeft: logoPosition === "right" ? "1.5rem" : "0",
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 0.82,
            fontFamily: "'Teko', 'Bebas Neue', 'Impact', sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.01em",
            textShadow: "0 4px 18px rgba(0, 0, 0, 0.95)",
            transform: "scale(1, 1.15)",
            transformOrigin: logoPosition === "right" ? "left center" : "right center",
            textAlign: logoPosition === "left" ? "right" : "left",
          }}
        >
          {/* Tipo / Papel */}
          <span
            style={{
              fontSize: titleFontSize,
              fontWeight: 700,
              color: "#ffffff",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {displayTitle}
          </span>
          {/* Arquétipo (Single line, complete, with spacing gap) */}
          {displaySubtitle && (
            <span
              style={{
                fontSize: subtitleFontSize,
                fontWeight: 700,
                color: "#ffffff",
                whiteSpace: "nowrap",
                display: "block",
                marginTop: "0.45rem",
              }}
            >
              {displaySubtitle}
            </span>
          )}
        </div>
      </div>

      {/* Center Character Cutout (Adjustable position, scale, and auto/manual flip) */}
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
              transform: `translate(${effectiveOffsetX}px, ${characterOffsetY}px) scale(${effectiveScaleX}, ${effectiveScaleY})`,
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

      {/* Obra Logo & Call To Action Section (Centered Column with Button) */}
      <div
        style={{
          zIndex: 3,
          order: logoPosition === "right" ? 3 : 1,
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          maxWidth: "34%",
          gap: "0.9rem",
          textAlign: "center",
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

        {/* Logo da Obra Oficial (Centered) */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={workTitle}
            style={{
              maxHeight: "clamp(65px, 9.5vw, 120px)",
              maxWidth: "280px",
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

        {/* CTA Button (Branco com texto escuro, centralizado com a logo) */}
        <button
          type="button"
          onClick={onClickCta}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "clamp(0.72rem, 1.15vw, 0.95rem) clamp(2.4rem, 3.2vw, 3.4rem)",
            backgroundColor: "#ffffff",
            backgroundImage: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)",
            color: "#080c14",
            fontSize: "clamp(0.95rem, 1.3vw, 1.25rem)",
            fontWeight: 900,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            borderRadius: "9999px",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 8px 24px -2px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25)",
            transition: "transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.filter = "brightness(1.05)";
            e.currentTarget.style.boxShadow = "0 10px 28px -2px rgba(0, 0, 0, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.filter = "brightness(1)";
            e.currentTarget.style.boxShadow = "0 8px 24px -2px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25)";
          }}
        >
          {ctaText}
        </button>

        {/* Studio / Copyright Footnote (Centered with button) */}
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
