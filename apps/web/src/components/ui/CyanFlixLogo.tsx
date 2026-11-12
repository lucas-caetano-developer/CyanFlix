import React, { useId } from 'react';
import '../../styles/brand.css';

export interface CyanFlixLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  glow?: boolean;
  title?: string;
}

export function CyanFlixLogo({
  className = '',
  glow = true,
  title = 'CyanFlix',
  ...props
}: CyanFlixLogoProps) {
  const uniqueId = useId().replace(/:/g, '');
  const gradId = `cf-wm-grad-${uniqueId}`;
  const clipId = `cf-wm-arc-${uniqueId}`;
  const glowId = `cf-wm-glow-${uniqueId}`;

  return (
    <svg
      viewBox="0 0 540 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={`cyanflix-logo ${className}`.trim()}
      {...props}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4ae3ff" />
          <stop offset="35%" stopColor="#00d4ff" />
          <stop offset="85%" stopColor="#009fe3" />
          <stop offset="100%" stopColor="#007cb8" />
        </linearGradient>

        {glow && (
          <filter id={glowId} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#00d4ff" floodOpacity="0.32" />
          </filter>
        )}

        {/* Netflix signature cinema screen arc: curved bottom edge */}
        <clipPath id={clipId}>
          <path d="M 0 0 L 540 0 L 540 114 Q 270 90 0 114 Z" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clipId})`} fill={`url(#${gradId})`} filter={glow ? `url(#${glowId})` : undefined}>
        {/* C: bold condensed Netflix-style arch */}
        <path d="M 88 12 L 88 32 L 64 32 C 55 32 51 38 51 50 L 51 76 C 51 88 55 94 64 94 L 88 94 L 88 114 L 62 114 C 42 114 34 100 34 80 L 34 46 C 34 26 42 12 62 12 Z" />

        {/* Y: angled upper arms + straight center stem */}
        <polygon points="99,12 117,12 125,54 133,12 151,12 134,64 134,114 116,114 116,64" />

        {/* A: flat apex + angled legs + crisp crossbar */}
        <path d="M 177 12 L 193 12 L 214 114 L 195 114 L 191 84 L 179 84 L 175 114 L 156 114 Z M 185 38 L 178 69 L 192 69 Z" />

        {/* N: left stem, diagonal slash, right stem */}
        <polygon points="225,12 243,12 258,74 258,12 276,12 276,114 258,114 243,52 243,114 225,114" />

        {/* F: stem + top bar + mid bar */}
        <polygon points="288,12 332,12 332,30 306,30 306,54 328,54 328,70 306,70 306,114 288,114" />

        {/* L: stem + bottom bar */}
        <polygon points="344,12 362,12 362,96 388,96 388,114 344,114" />

        {/* I: single vertical stem */}
        <polygon points="400,12 418,12 418,114 400,114" />

        {/* X: crossing diagonals */}
        <polygon points="430,12 449,12 485,114 466,114" />
        <polygon points="466,12 485,12 449,114 430,114" />
      </g>
    </svg>
  );
}

export interface CyanFlixIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  variant?: 'badge' | 'transparent';
  size?: number | string;
  title?: string;
}

export function CyanFlixIcon({
  className = '',
  variant = 'badge',
  size,
  title = 'CyanFlix',
  style,
  ...props
}: CyanFlixIconProps) {
  const uniqueId = useId().replace(/:/g, '');
  const bgGradId = `cf-ic-bg-${uniqueId}`;
  const spineGradId = `cf-ic-sp-${uniqueId}`;
  const topGradId = `cf-ic-top-${uniqueId}`;
  const btmGradId = `cf-ic-btm-${uniqueId}`;
  const shadowTopId = `cf-ic-sh-top-${uniqueId}`;
  const shadowBtmId = `cf-ic-sh-btm-${uniqueId}`;
  const glowId = `cf-ic-glow-${uniqueId}`;
  const arcClipId = `cf-ic-arc-${uniqueId}`;

  const dimensions = size
    ? { width: size, height: size }
    : {};

  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={`cyanflix-icon ${className}`.trim()}
      style={{ ...dimensions, ...style }}
      {...props}
    >
      <title>{title}</title>
      <defs>
        {variant === 'badge' && (
          <linearGradient id={bgGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0c131d" />
            <stop offset="100%" stopColor="#04070c" />
          </linearGradient>
        )}

        <linearGradient id={spineGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#007fae" />
          <stop offset="45%" stopColor="#00a3dc" />
          <stop offset="100%" stopColor="#005d82" />
        </linearGradient>

        <linearGradient id={topGradId} x1="0%" y1="0%" x2="100%" y2="20%">
          <stop offset="0%" stopColor="#45e6ff" />
          <stop offset="50%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#008ec9" />
        </linearGradient>

        <linearGradient id={btmGradId} x1="0%" y1="80%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00c8fa" />
          <stop offset="50%" stopColor="#00a3dc" />
          <stop offset="100%" stopColor="#006692" />
        </linearGradient>

        <filter id={shadowTopId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="-2" dy="8" stdDeviation="10" floodColor="#000000" floodOpacity="0.85" />
        </filter>

        <filter id={shadowBtmId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="-2" dy="-8" stdDeviation="10" floodColor="#000000" floodOpacity="0.85" />
        </filter>

        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor="#00d4ff" floodOpacity="0.25" />
        </filter>

        <clipPath id={arcClipId}>
          <path d="M 0 0 L 512 0 L 512 436 Q 256 414 0 436 Z" />
        </clipPath>
      </defs>

      {variant === 'badge' && (
        <>
          <rect
            width="512"
            height="512"
            rx="116"
            fill={`url(#${bgGradId})`}
            stroke="rgba(0, 212, 255, 0.22)"
            strokeWidth="4"
          />
          <circle cx="256" cy="256" r="170" fill="#00d4ff" opacity="0.07" />
        </>
      )}

      <g clipPath={`url(#${arcClipId})`} filter={`url(#${glowId})`}>
        {/* 1. Left Vertical Spine */}
        <rect x="124" y="80" width="86" height="356" fill={`url(#${spineGradId})`} />

        {/* 2. Top Ribbon Arm */}
        <g filter={`url(#${shadowTopId})`}>
          <path d="M 124 80 L 388 80 L 388 168 L 210 168 L 124 80 Z" fill={`url(#${topGradId})`} />
        </g>

        {/* 3. Bottom Ribbon Arm */}
        <g filter={`url(#${shadowBtmId})`}>
          <path d="M 124 436 L 210 348 L 388 348 L 388 436 Z" fill={`url(#${btmGradId})`} />
        </g>
      </g>
    </svg>
  );
}
