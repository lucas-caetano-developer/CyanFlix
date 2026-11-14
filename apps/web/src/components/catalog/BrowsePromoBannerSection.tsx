import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { PromoBanner } from '../admin/PromoBanner';
import { parseArchetypes } from '../../lib/characterConstants';
import type { Character, Work } from '../../lib/types';

interface BrowsePromoBannerSectionProps {
  featuredWorkIds: string[];
  worksMap?: Map<string, Work>;
}

interface BannerCustomState {
  logoPosition: 'left' | 'right';
  customColor?: string;
  flipHorizontal?: boolean;
  characterOffsetX: number;
  characterOffsetY: number;
  characterScale: number;
  tagline?: string;
}

const BANNER_STORAGE_KEY = 'cyanflix.admin.banner_custom_states';

export function BrowsePromoBannerSection({
  featuredWorkIds,
  worksMap,
}: BrowsePromoBannerSectionProps) {
  const navigate = useNavigate();

  // Load custom offsets/scale/colors configured in Admin Banners
  const [customStates] = useState<Record<string, BannerCustomState>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(BANNER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Fetch all characters
  const { data: characters = [] } = useQuery({
    queryKey: ['admin', 'characters'],
    queryFn: () => api.getAdminCharacters(),
    staleTime: 5 * 60 * 1000,
  });

  const featuredSet = useMemo(() => new Set(featuredWorkIds), [featuredWorkIds]);

  // Filter to characters from featured works only (Protagonists, Supporting, Antagonists with body photo)
  const eligibleCharacters = useMemo(() => {
    return characters.filter((c) => {
      const inFeatured =
        (c.workId && featuredSet.has(c.workId)) ||
        (c.works && c.works.some((w) => featuredSet.has(w.id)));
      if (!inFeatured) return false;

      if (!c.bodyPhotoUrl) return false;

      const role = (c.role || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return (
        role.includes('protag') ||
        role.includes('coadj') ||
        role.includes('apoio') ||
        role.includes('antag') ||
        role.includes('vil')
      );
    });
  }, [characters, featuredSet]);

  // Generate banners for each archetype of eligible characters
  const bannerItems = useMemo(() => {
    const items: Array<{
      id: string;
      character: Character;
      archetype: string | null;
      work: Work | null;
      customState?: BannerCustomState;
    }> = [];

    for (const char of eligibleCharacters) {
      const workId = char.workId || char.works?.[0]?.id;
      const work = workId && worksMap ? worksMap.get(workId) ?? null : null;

      const archetypes = parseArchetypes(char.archetype);
      const archetypesList = archetypes.length > 0 ? archetypes : [null];

      for (const arch of archetypesList) {
        const id = `${char.id}-${arch ?? 'default'}`;
        items.push({
          id,
          character: char,
          archetype: arch,
          work,
          customState: customStates[id],
        });
      }
    }
    return items;
  }, [eligibleCharacters, worksMap, customStates]);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Automatically cycle randomly between character banners every 7.5 seconds
  useEffect(() => {
    if (bannerItems.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        let next = Math.floor(Math.random() * bannerItems.length);
        if (next === prev && bannerItems.length > 1) {
          next = (prev + 1) % bannerItems.length;
        }
        return next;
      });
    }, 7500);
    return () => clearInterval(interval);
  }, [bannerItems.length]);

  if (bannerItems.length === 0) return null;

  const safeIndex = currentIndex % bannerItems.length;
  const activeItem = bannerItems[safeIndex];
  if (!activeItem) return null;

  const targetWork = activeItem.work;
  const targetWorkId = targetWork?.id || activeItem.character.workId || activeItem.character.works?.[0]?.id;

  const handleCta = () => {
    if (targetWorkId) {
      navigate(`/title/${targetWorkId}`);
    }
  };

  const cs = activeItem.customState;

  return (
    <div
      className="browse-promo-section"
      style={{
        padding: '0 var(--side-padding)',
        margin: 'clamp(1.5rem, 3vw, 2.75rem) 0',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          cursor: targetWorkId ? 'pointer' : 'default',
          transition: 'transform 0.22s ease, opacity 0.3s ease',
        }}
        onClick={handleCta}
      >
        <PromoBanner
          key={activeItem.id}
          character={activeItem.character}
          work={targetWork}
          categorySubtitle={activeItem.archetype ? activeItem.archetype.trim().toUpperCase() : undefined}
          tagline={cs?.tagline}
          logoPosition={cs?.logoPosition ?? 'right'}
          customColor={cs?.customColor}
          flipHorizontal={cs?.flipHorizontal}
          characterOffsetX={cs?.characterOffsetX ?? 0}
          characterOffsetY={cs?.characterOffsetY ?? 0}
          characterScale={cs?.characterScale ?? 1.25}
          ctaText="ASSISTA JÁ"
          onClickCta={handleCta}
        />
      </div>
    </div>
  );
}
