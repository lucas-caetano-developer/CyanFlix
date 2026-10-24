export type Avatar = {
  id: string;
  label: string;
  color: string;
  svg: string;
};

/**
 * Coletânea de avatares "bonecos" (personagens) para escolha de perfil.
 * São SVGs inline, sem dependência de rede, para funcionar offline.
 */
export const AVATARS: Avatar[] = [
  {
    id: "cyan",
    label: "Cyan",
    color: "#00d4ff",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="48" r="26" fill="#0ea5e9" stroke="#00d4ff" stroke-width="3"/>
        <path d="M42 74 Q60 90 78 74" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="44" r="2.5" fill="#111827"/>
        <circle cx="70" cy="44" r="2.5" fill="#111827"/>
        <path d="M60 52 Q60 58 66 56" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="82" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "vermelho",
    label: "Vermelho",
    color: "#ef4444",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="48" r="26" fill="#dc2626" stroke="#ef4444" stroke-width="3"/>
        <rect x="46" y="40" width="28" height="10" rx="4" fill="#111827"/>
        <path d="M44 76 Q60 92 76 76" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="52" cy="42" r="2.5" fill="#111827"/>
        <circle cx="68" cy="42" r="2.5" fill="#111827"/>
        <path d="M60 54 Q60 60 68 58" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="84" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "roxo",
    label: "Roxo",
    color: "#a855f7",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="44" r="24" fill="#a855f7" stroke="#c084fc" stroke-width="3"/>
        <path d="M46 34 Q60 28 74 34" stroke="#111827" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M46 78 Q60 94 74 78" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="40" r="2.5" fill="#111827"/>
        <circle cx="70" cy="40" r="2.5" fill="#111827"/>
        <path d="M60 50 Q60 56 66 54" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="86" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "verde",
    label: "Verde",
    color: "#22c55e",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <path d="M46 32 Q60 20 74 32 Q74 46 60 50 Q46 46 46 32 Z" fill="#22c55e" stroke="#4ade80" stroke-width="3"/>
        <circle cx="60" cy="48" r="22" fill="#22c55e"/>
        <path d="M44 78 Q60 94 76 78" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="42" r="2.5" fill="#111827"/>
        <circle cx="70" cy="42" r="2.5" fill="#111827"/>
        <path d="M60 52 Q60 58 66 56" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="86" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "laranja",
    label: "Laranja",
    color: "#f97316",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="50" r="25" fill="#f97316" stroke="#fb923c" stroke-width="3"/>
        <path d="M44 66 Q60 60 76 66" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <path d="M44 80 Q60 96 76 80" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="44" r="2.5" fill="#111827"/>
        <circle cx="70" cy="44" r="2.5" fill="#111827"/>
        <path d="M60 54 Q60 60 66 58" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="88" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "azul",
    label: "Azul",
    color: "#2563eb",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="46" r="24" fill="#2563eb" stroke="#3b82f6" stroke-width="3"/>
        <path d="M48 40 Q60 36 72 40" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M44 78 Q60 94 76 78" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="40" r="2.5" fill="#111827"/>
        <circle cx="70" cy="40" r="2.5" fill="#111827"/>
        <path d="M60 50 Q60 56 66 54" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="86" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "rosa",
    label: "Rosa",
    color: "#ec4899",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="46" r="23" fill="#ec4899" stroke("#f0abfc") stroke-width="3"/>
        <path d="M44 42 Q50 36 60 42 Q70 36 76 42" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <path d="M44 78 Q60 94 76 78" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="40" r="2.5" fill="#111827"/>
        <circle cx="70" cy="40" r="2.5" fill="#111827"/>
        <path d="M60 50 Q60 56 66 54" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="86" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
  {
    id: "preto",
    label: "Preto",
    color: "#0f172a",
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="44" r="24" fill="#0f172a" stroke="#334155" stroke-width="3"/>
        <path d="M46 34 Q60 28 74 34" stroke="#111827" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M44 78 Q60 94 76 78" stroke="#111827" stroke-width="4" stroke-linecap="round" fill="none"/>
        <circle cx="50" cy="40" r="2.5" fill="#fbbf24"/>
        <circle cx="70" cy="40" r="2.5" fill="#fbbf24"/>
        <path d="M60 50 Q60 56 66 54" stroke="#111827" stroke-width="3" stroke-linecap="round" fill="none"/>
        <rect x="44" y="86" width="32" height="14" rx="6" fill="#111827"/>
      </svg>
    `,
  },
];

export function findAvatar(id: string): Avatar | undefined {
  return AVATARS.find((a) => a.id === id);
}
