import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PromoBanner } from '../admin/PromoBanner';
import {
  type BannerCustomState,
  type PromoBannerItem,
  loadLocalBannerStates,
  saveLocalBannerStates,
  generateAdminPromoBanners,
} from '../../lib/promoBanners';
import type { Work } from '../../lib/types';

export type { BannerCustomState, PromoBannerItem };

// Helper to pick initial unique indices ensuring zero duplicates across slots
function pickDistinctIndices(items: PromoBannerItem[], count: number): number[] {
  if (items.length === 0) return [];
  if (items.length <= count) {
    return Array.from({ length: items.length }, (_, i) => i);
  }

  // Shuffle candidate indices
  const allIndices = Array.from({ length: items.length }, (_, i) => i);
  for (let i = allIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
  }

  // First pass: try to pick items with distinct character IDs
  const picked: number[] = [];
  const pickedCharIds = new Set<string>();

  for (const idx of allIndices) {
    if (picked.length >= count) break;
    const charId = items[idx]?.character?.id;
    if (charId && !pickedCharIds.has(charId)) {
      picked.push(idx);
      pickedCharIds.add(charId);
    }
  }

  // Second pass: if not enough unique characters, fill with remaining unique item indices
  if (picked.length < count) {
    for (const idx of allIndices) {
      if (picked.length >= count) break;
      if (!picked.includes(idx)) {
        picked.push(idx);
      }
    }
  }

  return picked;
}

interface PromoBannerCoordinatorContextValue {
  getBannerForSlot: (slotIndex: number) => PromoBannerItem | null;
  bannerItems: PromoBannerItem[];
}

const PromoBannerCoordinatorContext = createContext<PromoBannerCoordinatorContextValue | null>(null);

export function usePromoBannerCoordinator() {
  return useContext(PromoBannerCoordinatorContext);
}

export function PromoBannerCoordinatorProvider({
  featuredWorkIds,
  worksMap,
  slotCount = 3,
  rotationIntervalMs = 7000,
  children,
}: {
  featuredWorkIds?: string[];
  worksMap?: Map<string, Work>;
  slotCount?: number;
  rotationIntervalMs?: number;
  children: React.ReactNode;
}) {
  // Fetch Server-persisted Banner Custom States (public endpoint available to everyone)
  const { data: serverCustomStates } = useQuery({
    queryKey: ['public', 'bannerCustomStates'],
    queryFn: () => api.getPublicBannerCustomStates().catch(() => api.getBannerCustomStates()),
    staleTime: 30_000,
  });

  const [customStates, setCustomStates] = useState<Record<string, BannerCustomState>>(loadLocalBannerStates);

  // Sync server custom states into local state if available
  useEffect(() => {
    if (serverCustomStates && Object.keys(serverCustomStates).length > 0) {
      setCustomStates((prev) => {
        const merged = { ...serverCustomStates, ...prev };
        saveLocalBannerStates(merged);
        return merged;
      });
    }
  }, [serverCustomStates]);

  // Fetch characters (public endpoint with fallback to admin)
  const { data: characters = [] } = useQuery({
    queryKey: ['characters', 'promo'],
    queryFn: async () => {
      try {
        return await api.getPublicCharacters();
      } catch {
        return await api.getAdminCharacters();
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const featuredSet = useMemo(
    () => (featuredWorkIds && featuredWorkIds.length > 0 ? new Set(featuredWorkIds) : null),
    [featuredWorkIds]
  );

  // Single unified promotional banner generation from Admin models
  const allBanners = useMemo(() => {
    return generateAdminPromoBanners(characters, worksMap, customStates);
  }, [characters, worksMap, customStates]);

  // Filter to featured works if specified (e.g. for Browse hero works)
  const bannerItems = useMemo(() => {
    if (!featuredSet || featuredSet.size === 0) return allBanners;
    const filtered = allBanners.filter(
      (b) =>
        featuredSet.has(b.workId) ||
        (b.character.workId && featuredSet.has(b.character.workId)) ||
        (b.character.works && b.character.works.some((w) => featuredSet.has(w.id)))
    );
    return filtered.length > 0 ? filtered : allBanners;
  }, [allBanners, featuredSet]);

  const [activeIndices, setActiveIndices] = useState<number[]>([]);
  const rotateSlotRef = useRef(0);

  // Initialize distinct non-repeating indices
  useEffect(() => {
    if (bannerItems.length === 0) {
      setActiveIndices([]);
      return;
    }
    const count = Math.min(slotCount, bannerItems.length);
    setActiveIndices(pickDistinctIndices(bannerItems, count));
  }, [bannerItems, slotCount]);

  // Periodic coordinated rotation: strictly guarantees no banner repeats across active slots
  useEffect(() => {
    if (bannerItems.length <= 1 || activeIndices.length === 0) return;

    const interval = setInterval(() => {
      setActiveIndices((currentIndices) => {
        if (currentIndices.length === 0 || bannerItems.length <= 1) return currentIndices;

        const slotToUpdate = rotateSlotRef.current % currentIndices.length;
        rotateSlotRef.current = (rotateSlotRef.current + 1) % currentIndices.length;

        // Current indices in OTHER slots that must NOT be collided with
        const otherIndices = new Set(currentIndices.filter((_, i) => i !== slotToUpdate));
        const otherCharIds = new Set(
          currentIndices
            .filter((_, i) => i !== slotToUpdate)
            .map((i) => bannerItems[i]?.character?.id)
            .filter(Boolean)
        );

        // Candidates must not be in any other active slot
        const baseCandidates = bannerItems
          .map((_, i) => i)
          .filter((i) => !otherIndices.has(i));

        if (baseCandidates.length === 0) return currentIndices;

        // Ideal candidates: different character ID and not currently shown in this slot
        const bestCandidates = baseCandidates.filter(
          (i) =>
            !otherCharIds.has(bannerItems[i]?.character?.id) &&
            i !== currentIndices[slotToUpdate]
        );

        let chosenIndex: number;
        if (bestCandidates.length > 0) {
          chosenIndex = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
        } else {
          // Secondary candidates: different index than current slot
          const secondaryCandidates = baseCandidates.filter(
            (i) => i !== currentIndices[slotToUpdate]
          );
          if (secondaryCandidates.length > 0) {
            chosenIndex = secondaryCandidates[Math.floor(Math.random() * secondaryCandidates.length)];
          } else {
            chosenIndex = baseCandidates[Math.floor(Math.random() * baseCandidates.length)];
          }
        }

        const next = [...currentIndices];
        next[slotToUpdate] = chosenIndex;
        return next;
      });
    }, rotationIntervalMs);

    return () => clearInterval(interval);
  }, [bannerItems, activeIndices.length, rotationIntervalMs]);

  const getBannerForSlot = (slotIndex: number): PromoBannerItem | null => {
    if (slotIndex < 0 || slotIndex >= activeIndices.length) return null;
    const itemIndex = activeIndices[slotIndex];
    if (itemIndex === undefined || itemIndex < 0 || itemIndex >= bannerItems.length) return null;
    return bannerItems[itemIndex] ?? null;
  };

  const contextValue = useMemo(
    () => ({
      getBannerForSlot,
      bannerItems,
    }),
    [activeIndices, bannerItems]
  );

  return (
    <PromoBannerCoordinatorContext.Provider value={contextValue}>
      {children}
    </PromoBannerCoordinatorContext.Provider>
  );
}

export function BrowsePromoBannerSlot({
  slotIndex,
  onCtaClick,
  ctaText = 'ASSISTA JÁ',
  className,
  style,
}: {
  slotIndex: number;
  onCtaClick?: (workId?: string) => void;
  ctaText?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const navigate = useNavigate();
  const coordinator = usePromoBannerCoordinator();
  const item = coordinator ? coordinator.getBannerForSlot(slotIndex) : null;

  if (!item) return null;

  const targetWork = item.work;
  const targetWorkId =
    targetWork?.id || item.character.workId || item.character.works?.[0]?.id;

  const handleClick = () => {
    if (onCtaClick) {
      onCtaClick(targetWorkId);
    } else if (targetWorkId) {
      navigate(`/title/${targetWorkId}`);
    }
  };

  const cs = item.customState;

  return (
    <div
      className={`browse-promo-section ${className ?? ''}`}
      style={{
        padding: '0 var(--side-padding)',
        margin: 'clamp(1.5rem, 3vw, 2.75rem) 0',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <div
        style={{
          cursor: targetWorkId || onCtaClick ? 'pointer' : 'default',
          transition: 'transform 0.22s ease, opacity 0.3s ease',
        }}
        onClick={handleClick}
      >
        <PromoBanner
          key={item.id}
          character={item.character}
          work={targetWork}
          categoryTitle={item.categoryTitle}
          categorySubtitle={item.categorySubtitle}
          tagline={cs.tagline}
          logoPosition={cs.logoPosition}
          customColor={cs.customColor || item.character.themeColor || undefined}
          flipHorizontal={cs.flipHorizontal}
          characterOffsetX={cs.characterOffsetX}
          characterOffsetY={cs.characterOffsetY}
          characterScale={cs.characterScale}
          ctaText={ctaText}
          onClickCta={handleClick}
        />
      </div>
    </div>
  );
}

// Standalone component for Welcome Page
export function WelcomePromoBanner({
  onLoginClick,
}: {
  onLoginClick: (workId?: string) => void;
}) {
  return (
    <PromoBannerCoordinatorProvider slotCount={1} rotationIntervalMs={6500}>
      <BrowsePromoBannerSlot
        slotIndex={0}
        onCtaClick={(workId) => onLoginClick(workId)}
        ctaText="ASSISTA JÁ"
        style={{ padding: 0, margin: 0 }}
      />
    </PromoBannerCoordinatorProvider>
  );
}

// Backward-compatible standalone component for single promo banner
export function BrowsePromoBannerSection({
  featuredWorkIds,
  worksMap,
}: {
  featuredWorkIds: string[];
  worksMap?: Map<string, Work>;
}) {
  return (
    <PromoBannerCoordinatorProvider
      featuredWorkIds={featuredWorkIds}
      worksMap={worksMap}
      slotCount={1}
    >
      <BrowsePromoBannerSlot slotIndex={0} />
    </PromoBannerCoordinatorProvider>
  );
}
