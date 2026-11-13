import React from "react";
import type { Character, CharacterSummary, Work } from "../../lib/types";
import { getLogoUrl } from "../../lib/utils";

export interface PromoBannerProps {
  character: Character | CharacterSummary;
  work?: Work | null;
  categoryTitle?: string;
  categorySubtitle?: string;
  logoPosition?: "left" | "right";
  customColor?: string;
  preferredPhoto?: "body" | "avatar" | "auto";
  ctaText?: string;
  className?: string;
  onClickCta?: () => void;
}

export function getDefaultCategoryTitles(role?: string | null): { title: string; subtitle: string } {
  const cleanRole = (role || "").toLowerCase();
  if (cleanRole.includes("vil") || cleanRole.includes("antagonista")) {
    return { title: "VILÕES", subtitle: "ICÔNICOS" };
  }
  if (cleanRole.includes("coadj") || cleanRole.includes("apoio") || cleanRole.includes("secund")) {
    return { title: "COADJUVANTES", subtitle: "MARCANTES" };
  }
  return { title: "PROTAGONISTAS", subtitle: "LENDÁRIOS" };
}

export const PromoBanner: React.FC<PromoBannerProps> = ({
  character,
  work,
  categoryTitle,
  categorySubtitle,
  logoPosition = "right",
  customColor,
  preferredPhoto = "auto",
  ctaText = "ASSISTA JÁ",
  className = "",
  onClickCta,
}) => {
  const themeColor = customColor || character.themeColor || "#0284C7";

  // Resolve Category Titles
  const defaultCats = getDefaultCategoryTitles(character.role);
  const displayTitle = categoryTitle !== undefined ? categoryTitle : defaultCats.title;
  const displaySubtitle = categorySubtitle !== undefined ? categorySubtitle : defaultCats.subtitle;

  // Resolve Cutout Image
  let charPhoto: string | null = null;
  if (preferredPhoto === "body") {
    charPhoto = character.bodyPhotoUrl || character.photoUrl || null;
  } else if (preferredPhoto === "avatar") {
    charPhoto = character.photoUrl || character.bodyPhotoUrl || null;
  } else {
    // Auto: prioritize body photo
    charPhoto = character.bodyPhotoUrl || character.photoUrl || null;
  }

  // Obra Logo
  const logoUrl = work ? getLogoUrl(work) : null;
  const workTitle = work?.title || (character.work ? character.work.title : "CyanFlix Original");

  // Watermark Name - Last or primary uppercase word
  const nameParts = character.name.trim().split(/\s+/);
  const watermarkName =
    nameParts.length > 1
      ? nameParts[nameParts.length - 1].toUpperCase()
      : character.name.toUpperCase();

  return (
    <div
      className={`promo-banner ${className}`}
      style={{
        position: "relative",
        width: "100%",
        minHeight: "260px",
        maxHeight: "380px",
        aspectRatio: "3.2 / 1",
        borderRadius: "14px",
        overflow: "hidden",
        backgroundColor: "#0d111a",
        backgroundImage: `
          radial-gradient(ellipse 65% 90% at ${logoPosition === "right" ? "42%" : "58%"} 55%, ${themeColor}38 0%, transparent 75%),
          linear-gradient(135deg, #090c14 0%, #111726 50%, #080b12 100%)
        `,
        border: `1px solid ${themeColor}44`,
        boxShadow: `0 16px 36px -10px rgba(0, 0, 0, 0.7), 0 0 25px -5px ${themeColor}22`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2.5rem",
        boxSizing: "border-box",
        userSelect: "none",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Dynamic Background Watermark Typography */}
      <div
        style={{
          position: "absolute",
          top: "4%",
          left: logoPosition === "right" ? "20%" : "30%",
          right: logoPosition === "right" ? "25%" : "20%",
          bottom: "4%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none",
          zIndex: 1,
          opacity: 0.22,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            fontSize: "clamp(0.75rem, 1.3vw, 1.05rem)",
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "#ffffff",
            marginBottom: "-0.2rem",
            whiteSpace: "nowrap",
          }}
        >
          {character.name}
        </span>
        <span
          style={{
            fontSize: "clamp(4.2rem, 11vw, 9.5rem)",
            fontWeight: 900,
            lineHeight: 0.85,
            letterSpacing: "-0.04em",
            textTransform: "uppercase",
            color: "#ffffff",
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            textAlign: "center",
            whiteSpace: "nowrap",
            textShadow: `0 0 20px ${themeColor}66`,
          }}
        >
          {watermarkName}
        </span>
      </div>

      {/* Role / Category Title Section */}
      <div
        style={{
          zIndex: 3,
          order: logoPosition === "right" ? 1 : 3,
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "28%",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 0.88,
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            textTransform: "uppercase",
            color: "#ffffff",
            letterSpacing: "-0.02em",
            textShadow: "0 4px 14px rgba(0, 0, 0, 0.8)",
          }}
        >
          <span
            style={{
              fontSize: "clamp(1.8rem, 4.2vw, 3.8rem)",
              fontWeight: 900,
            }}
          >
            {displayTitle}
          </span>
          {displaySubtitle && (
            <span
              style={{
                fontSize: "clamp(1.6rem, 3.8vw, 3.4rem)",
                fontWeight: 900,
                color: "#f1f5f9",
              }}
            >
              {displaySubtitle}
            </span>
          )}
        </div>
      </div>

      {/* Center Character Cutout */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: logoPosition === "right" ? "24%" : "28%",
          right: logoPosition === "right" ? "28%" : "24%",
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
              maxHeight: "115%",
              maxWidth: "100%",
              objectFit: "contain",
              objectPosition: "bottom center",
              filter: `
                drop-shadow(0 15px 30px rgba(0, 0, 0, 0.75))
                drop-shadow(0 0 25px ${themeColor}44)
              `,
              transform: "translateY(0%)",
            }}
          />
        ) : (
          <div
            style={{
              width: "160px",
              height: "220px",
              borderRadius: "16px",
              background: `linear-gradient(180deg, ${themeColor}33 0%, rgba(15,23,42,0.6) 100%)`,
              border: `2px dashed ${themeColor}66`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
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

      {/* Obra Logo & Call To Action Section */}
      <div
        style={{
          zIndex: 3,
          order: logoPosition === "right" ? 3 : 1,
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: logoPosition === "right" ? "flex-end" : "flex-start",
          justifyContent: "center",
          maxWidth: "32%",
          gap: "0.9rem",
          textAlign: logoPosition === "right" ? "right" : "left",
        }}
      >
        {/* Logo / Obra Title */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={workTitle}
            style={{
              maxHeight: "clamp(45px, 6vw, 75px)",
              maxWidth: "230px",
              objectFit: "contain",
              filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.8))",
            }}
          />
        ) : (
          <div
            style={{
              fontFamily: "'Impact', 'Arial Black', sans-serif",
              fontSize: "clamp(1.4rem, 2.5vw, 2.2rem)",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              color: "#ffffff",
              textShadow: `0 2px 10px rgba(0,0,0,0.8), 0 0 15px ${themeColor}66`,
              lineHeight: 1.1,
            }}
          >
            {workTitle}
          </div>
        )}

        {/* CTA Button */}
        <button
          type="button"
          onClick={onClickCta}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0.6rem 1.8rem",
            backgroundColor: "#ff5e00",
            backgroundImage: "linear-gradient(135deg, #ff6b1a 0%, #ea580c 100%)",
            color: "#ffffff",
            fontSize: "clamp(0.85rem, 1.1vw, 1.05rem)",
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            borderRadius: "9999px",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 6px 20px -3px rgba(234, 88, 12, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4)",
            transition: "transform 0.15s ease, filter 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.filter = "brightness(1.1)";
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
            fontSize: "0.65rem",
            color: "rgba(255, 255, 255, 0.45)",
            letterSpacing: "0.02em",
            marginTop: "0.2rem",
          }}
        >
          © CyanFlix • {workTitle}
        </div>
      </div>
    </div>
  );
};
