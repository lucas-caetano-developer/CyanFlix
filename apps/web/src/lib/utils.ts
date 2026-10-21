import { Asset, Episode, Season, Work } from './types';

export function getAssetUrl(assets: Asset[] | undefined, ...types: string[]): string | null {
  if (!assets) return null;
  const normalizedTypes = types.flatMap((type) => [type, type.replace(/-/g, '_')]);
  for (const type of normalizedTypes) {
    const asset = assets.find((a) => a.type === type && a.publicPath);
    if (asset && asset.publicPath) return asset.publicPath;
  }
  return null;
}

export function getPosterUrl(work: Work): string | null {
  return getAssetUrl(work.assets, 'poster-card', 'poster_card', 'poster');
}

export function getBackdropUrl(work: Work): string | null {
  return getAssetUrl(work.assets, 'hero', 'backdrop-card', 'backdrop_card', 'backdrop');
}

export function getLogoUrl(work: Work): string | null {
  return getAssetUrl(work.assets, 'logo');
}

export function getEpisodeThumbnail(episode: Episode): string | null {
  return getAssetUrl(episode.assets, 'thumbnail_webp', 'thumbnail', 'episode_thumbnail');
}

export function getTrailerUrl(work: Work): string | null {
  return getAssetUrl(work.assets, 'trailer');
}

export function getMotionPreviewUrl(work: Work): string | null {
  return getAssetUrl(work.assets, 'motion_preview');
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  return `${m}min`;
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(ms) ? ms / 1000 : 0));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function labelKind(kind: Work['contentKind']): string {
  switch (kind) {
    case 'movie': return 'Filme';
    case 'series': return 'Série';
    case 'anime': return 'Anime';
    default: return kind;
  }
}

export function labelKindTag(kind: Work["contentKind"]): string {
  return labelKind(kind);
}

export function getMetaField<T>(metadata: Record<string, unknown> | undefined, ...path: string[]): T | undefined {
  if (!metadata) return undefined;
  let current: any = metadata;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current as T;
}

export function getRating(work: Work, source: 'tmdb' | 'mal', season?: Season): { value: number; votes: number; label: string } | null {
  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  if (work.contentKind === 'movie') {
    const val = toNumber(getMetaField<unknown>(work.metadata, 'rating'));
    const votes = toNumber(getMetaField<unknown>(work.metadata, 'vote_count')) || 0;
    if (val !== null) return { value: val, votes, label: 'TMDb' };
  } else if (work.seasons && work.seasons.length > 0) {
    const s1 = season ?? work.seasons[0];
    const valKey = source === 'tmdb' ? 'tmdb_rating' : 'mal_rating';
    const votesKey = source === 'tmdb' ? 'tmdb_vote_count' : 'mal_vote_count';
    const val = toNumber(getMetaField<unknown>(s1.metadata, valKey));
    const votes = toNumber(getMetaField<unknown>(s1.metadata, votesKey)) || 0;
    if (val !== null) return { value: val, votes, label: source === 'tmdb' ? 'TMDb' : 'MAL' };
  }
  return null;
}

export function getGenres(metadata: Record<string, unknown> | undefined): string[] {
  const anilistGenres = getMetaField<unknown>(metadata, 'anilist', 'genres');
  const tmdbGenres = getMetaField<unknown>(metadata, 'genres');
  const normalize = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
  const anilist = normalize(anilistGenres);
  return anilist.length > 0 ? anilist : normalize(tmdbGenres);
}

export function getCertification(metadata: Record<string, unknown> | undefined): string | null {
  const value = getMetaField<unknown>(metadata, 'certification');
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getCast(metadata: Record<string, unknown> | undefined): Array<{ name: string; profile_url?: string; role?: string }> {
  const cast = getMetaField<unknown>(metadata, 'cast');
  if (!Array.isArray(cast)) return [];

  return cast.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name) return [];
    const profileUrl = typeof record.profile_url === 'string' && record.profile_url.trim() ? record.profile_url.trim() : undefined;
    const role = typeof record.role === 'string' && record.role.trim() ? record.role.trim() : undefined;
    return [{ name, ...(profileUrl ? { profile_url: profileUrl } : {}), ...(role ? { role } : {}) }];
  });
}

export function getStudios(metadata: Record<string, unknown> | undefined): string[] {
  const productionStudios = getMetaField<unknown>(metadata, 'production_studios');
  const normalize = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : [];
  const production = normalize(productionStudios);
  if (production.length > 0) return production;

  const studios = getMetaField<unknown>(metadata, 'anilist', 'studios');
  if (!Array.isArray(studios)) return [];
  return studios.flatMap((studio) => {
    if (!studio || typeof studio !== 'object' || Array.isArray(studio)) return [];
    const name = (studio as Record<string, unknown>).name;
    return typeof name === 'string' && name.trim() ? [name.trim()] : [];
  });
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

export function getSynopsis(work: Work): string {
  if (work.synopsis) return work.synopsis;
  const anilistDesc = getMetaField<string>(work.metadata, 'anilist', 'description');
  if (anilistDesc) return stripHtml(anilistDesc);
  return '';
}
