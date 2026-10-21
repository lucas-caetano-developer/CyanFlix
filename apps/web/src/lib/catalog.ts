import type { Work } from './types';
import { getGenres } from './utils';

export type ContentKind = Work['contentKind'];
export type AvailabilityFilter = 'DUB' | 'LEG';
export type CatalogSort = 'catalog' | 'az';

export const CONTENT_KIND_OPTIONS: Array<{ value: ContentKind; label: string }> = [
  { value: 'movie', label: 'Filmes' },
  { value: 'series', label: 'Séries' },
  { value: 'anime', label: 'Animes' },
];

export function parseContentKind(value: string | null | undefined): ContentKind | undefined {
  return value === 'movie' || value === 'series' || value === 'anime' ? value : undefined;
}

export function contentKindLabel(kind: ContentKind): string {
  return CONTENT_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? 'Catálogo';
}

export function parseAvailability(value: string | null | undefined): AvailabilityFilter | undefined {
  const normalized = String(value ?? '').trim().toUpperCase();
  return normalized === 'DUB' || normalized === 'LEG' ? normalized : undefined;
}

export function availabilityLabel(value: AvailabilityFilter): string {
  return value === 'DUB' ? 'Dublado' : 'Legendado';
}

export function parseCatalogSort(value: string | null | undefined): CatalogSort {
  return value === 'az' ? 'az' : 'catalog';
}

export function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeCatalogText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function uniqueWorks(works: Work[]): Work[] {
  const seen = new Set<string>();
  return works.filter((work) => {
    if (seen.has(work.id)) return false;
    seen.add(work.id);
    return true;
  });
}

export function availabilityForWork(work: Work): { dub: boolean; leg: boolean } {
  const availability = (work.seasons ?? [])
    .map((season) => season.metadata?.media_availability)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  return { dub: availability.includes('DUB'), leg: availability.includes('LEG') };
}

export function workMatchesAvailability(work: Work, availability: AvailabilityFilter): boolean {
  const flags = availabilityForWork(work);
  return availability === 'DUB' ? flags.dub : flags.leg;
}

export function collectGenres(works: Work[]): Array<{ value: string; label: string; count: number }> {
  const groups = new Map<string, { label: string; workIds: Set<string> }>();
  for (const work of works) {
    for (const genre of getGenres(work.metadata)) {
      const key = normalizeCatalogText(genre);
      if (!key) continue;
      const group = groups.get(key) ?? { label: genre, workIds: new Set<string>() };
      group.workIds.add(work.id);
      groups.set(key, group);
    }
  }
  return Array.from(groups.entries())
    .map(([, group]) => ({ value: group.label, label: group.label, count: group.workIds.size }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'));
}

export function collectAvailability(works: Work[]): Array<{ value: AvailabilityFilter; label: string; count: number }> {
  let dub = 0;
  let leg = 0;
  for (const work of works) {
    const flags = availabilityForWork(work);
    if (flags.dub) dub += 1;
    if (flags.leg) leg += 1;
  }
  return [
    { value: 'DUB' as const, label: 'Dublado', count: dub },
    { value: 'LEG' as const, label: 'Legendado', count: leg },
  ].filter((option) => option.count > 0);
}

export function collectContentKinds(works: Work[]): Array<{ value: ContentKind; label: string; count: number }> {
  return CONTENT_KIND_OPTIONS
    .map((option) => ({
      ...option,
      count: works.filter((work) => work.contentKind === option.value).length,
    }))
    .filter((option) => option.count > 0);
}

export function filterCatalogWorks(
  works: Work[],
  filters: { kind?: ContentKind; genre?: string; availability?: AvailabilityFilter; sort?: CatalogSort },
): Work[] {
  const genreKey = filters.genre ? normalizeCatalogText(filters.genre) : '';
  const filtered = works.filter((work) => {
    if (filters.kind && work.contentKind !== filters.kind) return false;
    if (genreKey && !getGenres(work.metadata).some((genre) => normalizeCatalogText(genre) === genreKey)) return false;
    if (filters.availability && !workMatchesAvailability(work, filters.availability)) return false;
    return true;
  });
  if (filters.sort === 'az') {
    return [...filtered].sort((left, right) => left.title.localeCompare(right.title, 'pt-BR'));
  }
  return filtered;
}

export function seeAllLinkForRow(rowId: string, title: string): string | undefined {
  if (rowId === 'movies') return '/browse?kind=movie';
  if (rowId === 'series') return '/browse?kind=series';
  if (rowId === 'anime') return '/browse?kind=anime';
  if (rowId === 'dubbed') return '/browse?availability=DUB';
  if (rowId === 'subtitled') return '/browse?availability=LEG';
  if (rowId.startsWith('genre:')) return `/browse?genre=${encodeURIComponent(title)}`;
  return undefined;
}

export function catalogViewTitle(kind: ContentKind | undefined, genre: string, availability: AvailabilityFilter | undefined): string {
  if (kind) return contentKindLabel(kind);
  if (genre) return genre;
  if (availability) return availabilityLabel(availability);
  return 'Catálogo';
}

export function catalogViewEyebrow(kind: ContentKind | undefined, genre: string, availability: AvailabilityFilter | undefined): string {
  if (kind) return 'Categoria';
  if (genre) return 'Gênero';
  if (availability) return 'Disponibilidade';
  return 'Catálogo';
}

export function catalogViewDescription(kind: ContentKind | undefined, genre: string, availability: AvailabilityFilter | undefined): string {
  if (kind === 'movie') return 'Longas-metragens disponíveis nesta visão do catálogo do CyanFlix.';
  if (kind === 'series') return 'Séries e temporadas disponíveis nesta visão do catálogo do CyanFlix.';
  if (kind === 'anime') return 'Animes e temporadas disponíveis nesta visão do catálogo do CyanFlix.';
  if (genre) return `Títulos classificados como ${genre} nesta visão do catálogo.`;
  if (availability === 'DUB') return 'Títulos com áudio dublado disponível nesta visão do catálogo.';
  if (availability === 'LEG') return 'Títulos com legendas disponíveis nesta visão do catálogo.';
  return 'Explore os títulos disponíveis nesta visão do catálogo do CyanFlix.';
}

export function searchKindLabel(kind: ContentKind | undefined): string {
  return kind ? `em ${contentKindLabel(kind)}` : 'em todo o catálogo';
}
