import { parseArchetypes } from "./characterConstants";
import { getDefaultCategoryTitles } from "../components/admin/PromoBanner";
import type { Character, Work } from "./types";

export interface BannerCustomState {
  logoPosition: "left" | "right";
  customColor?: string;
  flipHorizontal?: boolean;
  characterOffsetX: number;
  characterOffsetY: number;
  characterScale: number;
  tagline?: string;
}

export const BANNER_STORAGE_KEY = "cyanflix.admin.banner_custom_states";

export function loadLocalBannerStates(): Record<string, BannerCustomState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalBannerStates(states: Record<string, BannerCustomState>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(states));
  } catch (err) {
    console.error("Erro ao salvar estados no localStorage:", err);
  }
}

export function isEligibleBannerRole(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (
    r.includes("protag") ||
    r.includes("coadj") ||
    r.includes("apoio") ||
    r.includes("antag") ||
    r.includes("vil")
  );
}

export function generatePromoBannerId(
  charId: string,
  workId: string,
  archIndex: number,
  arch: string | null
): string {
  return `${charId}-${workId}-${archIndex}-${arch ? arch.toLowerCase().replace(/\s+/g, "-") : "base"}`;
}

export function getBannerCustomState(
  customStates: Record<string, BannerCustomState> | undefined,
  bannerId: string,
  charId?: string
): BannerCustomState {
  if (!customStates) {
    return {
      logoPosition: "right",
      characterOffsetX: 0,
      characterOffsetY: 0,
      characterScale: 1.25,
    };
  }
  return (
    customStates[bannerId] ||
    (charId ? customStates[charId] : undefined) || {
      logoPosition: "right",
      characterOffsetX: 0,
      characterOffsetY: 0,
      characterScale: 1.25,
    }
  );
}

export interface PromoBannerItem {
  id: string;
  character: Character;
  archetype: string | null;
  categoryTitle: string;
  categorySubtitle: string;
  workId: string;
  work: Work | null;
  customState: BannerCustomState;
}

/**
 * Single, unified promotional banner generator for Admin, Browse catalog, and Welcome/Login screens.
 * Exactly 1 banner per archetype for eligible characters (protagonists, supporting, antagonists).
 */
export function generateAdminPromoBanners(
  characters: Character[],
  worksMap?: Map<string, Work>,
  customStates?: Record<string, BannerCustomState>
): PromoBannerItem[] {
  const items: PromoBannerItem[] = [];

  for (const char of characters) {
    if (!isEligibleBannerRole(char.role)) continue;
    // Must have body photo
    if (!char.bodyPhotoUrl) continue;

    const archetypes = parseArchetypes(char.archetype);
    const bannerArchetypes = archetypes.length > 0 ? archetypes : [null];

    const charWorks =
      char.works && char.works.length > 0
        ? char.works
        : char.workId
        ? [{ id: char.workId, title: char.work?.title || "Obra Desconhecida", contentKind: "series" as const }]
        : [{ id: "unassigned", title: "CyanFlix Originals", contentKind: "series" as const }];

    for (const w of charWorks) {
      const fullWork = (worksMap ? worksMap.get(w.id) : null) ?? (w as unknown as Work);

      for (let i = 0; i < bannerArchetypes.length; i++) {
        const arch = bannerArchetypes[i];
        const titles = getDefaultCategoryTitles(char.role, arch);
        const bannerId = generatePromoBannerId(char.id, w.id, i, arch);

        const customState = getBannerCustomState(customStates, bannerId, char.id);

        items.push({
          id: bannerId,
          character: char,
          archetype: arch,
          categoryTitle: titles.title,
          categorySubtitle: titles.subtitle,
          workId: w.id,
          work: fullWork,
          customState,
        });
      }
    }
  }

  return items;
}
