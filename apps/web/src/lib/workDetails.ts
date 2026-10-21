import { getMetaField } from './utils';

type Metadata = Record<string, unknown> | undefined;
type JsonRecord = Record<string, unknown>;

export type DetailCredit = {
  name: string;
  role?: string;
  profileUrl?: string;
};

export type DetailAward = {
  title: string;
  category?: string;
  year?: string;
  won: boolean | null;
};

const CREW_ROLE_LABELS: Record<string, string> = {
  'director': 'Direção',
  'directing': 'Direção',
  'creator': 'Criação',
  'created by': 'Criação',
  'writer': 'Roteiro',
  'writers': 'Roteiro',
  'screenplay': 'Roteiro',
  'screenwriter': 'Roteiro',
  'story': 'História',
  'producer': 'Produção',
  'production': 'Produção',
  'executive producer': 'Produção executiva',
  'director of photography': 'Fotografia',
  'cinematography': 'Fotografia',
  'original music composer': 'Música',
  'music': 'Música',
  'editor': 'Edição',
  'editing': 'Edição',
  'production design': 'Direção de arte',
  'art': 'Direção de arte',
  'costume design': 'Figurino',
  'visual effects': 'Efeitos visuais',
  'animation': 'Animação',
  'sound': 'Som',
};

const STATUS_LABELS: Record<string, string> = {
  'returning series': 'Em andamento',
  'ended': 'Finalizada',
  'finished': 'Finalizada',
  'canceled': 'Cancelada',
  'cancelled': 'Cancelada',
  'in production': 'Em produção',
  'planned': 'Planejada',
  'released': 'Lançada',
  'post production': 'Pós-produção',
  'rumored': 'Rumor',
  'releasing': 'Em exibição',
  'not yet released': 'Em breve',
  'not_yet_released': 'Em breve',
  'hiatus': 'Em hiato',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Árabe',
  da: 'Dinamarquês',
  de: 'Alemão',
  en: 'Inglês',
  es: 'Espanhol',
  fr: 'Francês',
  hi: 'Hindi',
  it: 'Italiano',
  ja: 'Japonês',
  ko: 'Coreano',
  nl: 'Holandês',
  no: 'Norueguês',
  pl: 'Polonês',
  pt: 'Português',
  ru: 'Russo',
  sv: 'Sueco',
  th: 'Tailandês',
  tr: 'Turco',
  zh: 'Chinês',
};

export function getRuntimeMinutes(metadata: Metadata): number | null {
  if (!metadata) return null;
  const tmdb = asRecord(metadata.tmdb);
  const candidates = [
    metadata.runtime,
    metadata.duration_minutes,
    metadata.duration,
    tmdb.runtime,
    Array.isArray(metadata.episode_run_time) ? metadata.episode_run_time[0] : metadata.episode_run_time,
    Array.isArray(tmdb.episode_run_time) ? tmdb.episode_run_time[0] : tmdb.episode_run_time,
  ];

  for (const candidate of candidates) {
    const minutes = parseMinutes(candidate);
    if (minutes !== null) return minutes;
  }
  return null;
}

export function getWorkStatus(metadata: Metadata): string | null {
  if (!metadata) return null;
  const tmdb = asRecord(metadata.tmdb);
  const anilist = asRecord(metadata.anilist);
  const candidates = [
    metadata.status,
    metadata.release_status,
    tmdb.status,
    anilist.status,
  ];

  for (const candidate of candidates) {
    const value = asText(candidate);
    if (!value) continue;
    return STATUS_LABELS[value.toLowerCase().replace(/[_-]+/g, ' ').trim()] ?? value;
  }
  return null;
}

export function getReleaseDate(metadata: Metadata): string | null {
  if (!metadata) return null;
  const tmdb = asRecord(metadata.tmdb);
  const anilist = asRecord(metadata.anilist);
  const candidates = [
    metadata.release_date,
    metadata.first_air_date,
    metadata.air_date,
    metadata.start_date,
    metadata.premiere_date,
    tmdb.release_date,
    tmdb.first_air_date,
    anilist.startDate,
  ];

  for (const candidate of candidates) {
    const value = formatDateValue(candidate);
    if (value) return value;
  }
  return null;
}

export function getOriginalLanguage(metadata: Metadata): string | null {
  if (!metadata) return null;
  const tmdb = asRecord(metadata.tmdb);
  const value = asText(metadata.original_language)
    ?? asText(metadata.language)
    ?? asText(tmdb.original_language);
  return value ? formatLanguage(value) : null;
}

export function getOriginCountries(metadata: Metadata): string[] {
  if (!metadata) return [];
  const tmdb = asRecord(metadata.tmdb);
  const anilist = asRecord(metadata.anilist);
  const values = [
    metadata.production_countries,
    metadata.origin_country,
    metadata.countries,
    metadata.country,
    tmdb.production_countries,
    tmdb.origin_country,
    anilist.countryOfOrigin,
  ].flatMap((value) => collectPlaces(value));

  return unique(values.map(formatRegion));
}

export function getDistributor(metadata: Metadata): string | null {
  if (!metadata) return null;
  const values = [
    metadata.distributor,
    metadata.distributors,
    metadata.distribution,
  ].flatMap((value) => collectNamedValues(value));
  return unique(values).join(', ') || null;
}

export function getClassificationAgency(metadata: Metadata): string | null {
  if (!metadata) return null;
  const tmdb = asRecord(metadata.tmdb);
  const values = [
    metadata.certification_agency,
    metadata.certification_body,
    metadata.rating_body,
    metadata.rating_system,
    metadata.certification_country,
    tmdb.certification_country,
  ].map(asText).filter((value): value is string => Boolean(value));

  return unique(values.map((value) => /^[A-Za-z]{2,3}$/.test(value) ? formatRegion(value) : value)).join(' · ') || null;
}

export function getContentDescriptors(metadata: Metadata): string[] {
  if (!metadata) return [];
  const values = [
    metadata.content_descriptors,
    metadata.descriptors,
    metadata.content_warnings,
    metadata.rating_descriptors,
  ].flatMap((value) => collectDescriptors(value));
  return unique(values);
}

export function getCrew(metadata: Metadata): DetailCredit[] {
  if (!metadata) return [];
  const tmdb = asRecord(metadata.tmdb);
  const credits = asRecord(tmdb.credits);
  const sources: Array<{ value: unknown; role: string }> = [
    { value: metadata.crew, role: 'Equipe' },
    { value: credits.crew, role: 'Equipe' },
    { value: metadata.directors, role: 'Direção' },
    { value: metadata.director, role: 'Direção' },
    { value: metadata.creators, role: 'Criação' },
    { value: metadata.creator, role: 'Criação' },
    { value: metadata.writers, role: 'Roteiro' },
    { value: metadata.writer, role: 'Roteiro' },
    { value: metadata.screenwriters, role: 'Roteiro' },
    { value: metadata.screenwriter, role: 'Roteiro' },
    { value: metadata.producers, role: 'Produção' },
    { value: metadata.producer, role: 'Produção' },
  ];

  const people: DetailCredit[] = [];
  for (const source of sources) {
    for (const item of asArray(source.value)) {
      const credit = normalizeCredit(item, source.role);
      if (credit) people.push(credit);
    }
  }

  const seen = new Set<string>();
  return people.filter((person) => {
    const key = `${person.name.toLowerCase()}::${(person.role ?? '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getAwards(metadata: Metadata): DetailAward[] {
  if (!metadata) return [];
  const sources: Array<{ value: unknown; won: boolean | null }> = [];
  const awards = metadata.awards;

  if (isRecord(awards) && (Array.isArray(awards.wins) || Array.isArray(awards.nominations))) {
    sources.push({ value: awards.wins, won: true });
    sources.push({ value: awards.nominations, won: false });
  } else {
    sources.push({ value: awards, won: null });
  }

  sources.push({ value: metadata.accolades, won: null });
  sources.push({ value: metadata.nominations, won: false });

  const records = sources.flatMap((source) => asArray(source.value)
    .map((item) => normalizeAward(item, source.won))
    .filter((item): item is DetailAward => Boolean(item)));

  const seen = new Set<string>();
  return records
    .filter((award) => {
      const key = `${award.title.toLowerCase()}::${(award.category ?? '').toLowerCase()}::${award.year ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      if (left.won !== right.won) {
        if (left.won === true) return -1;
        if (right.won === true) return 1;
      }
      return (right.year ?? '').localeCompare(left.year ?? '');
    });
}

export function getAlternateTitles(metadata: Metadata): string[] {
  if (!metadata) return [];
  const alternativeTitles = metadata.alternative_titles;
  const nestedTitles = isRecord(alternativeTitles) ? alternativeTitles.titles : undefined;
  const values = [
    alternativeTitles,
    nestedTitles,
    metadata.alternate_titles,
    metadata.synonyms,
    getMetaField<unknown>(metadata, 'anilist', 'synonyms'),
  ].flatMap((value) => collectNamedValues(value));
  return unique(values);
}

export function getThemes(metadata: Metadata): string[] {
  if (!metadata) return [];
  return unique(asArray(metadata.themes).flatMap((item) => collectNamedValues(item)));
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim())) {
    return Number(value.trim().replace(',', '.'));
  }
  return null;
}

function parseMinutes(value: unknown): number | null {
  const numeric = asNumber(value);
  if (numeric !== null && numeric > 0) return Math.round(numeric);
  const text = asText(value);
  if (!text) return null;
  const hours = text.match(/(\d+)\s*h/i);
  const minutes = text.match(/(\d+)\s*(?:min|m)\b/i);
  if (!hours && !minutes) return null;
  const total = Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
  return total > 0 ? total : null;
}

function formatDateValue(value: unknown): string | null {
  if (isRecord(value)) {
    const year = asNumber(value.year);
    const month = asNumber(value.month);
    const day = asNumber(value.day);
    if (!year || year < 1) return null;
    if (month && month >= 1 && month <= 12) {
      if (day && day >= 1 && day <= 31) return formatDateParts(year, month, day);
      return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, month - 1, 1)));
    }
    return String(year);
  }

  const text = asText(value);
  if (!text) return null;
  const fullDate = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (fullDate) {
    const year = Number(fullDate[1]);
    const month = Number(fullDate[2]);
    const day = Number(fullDate[3]);
    if (year < 1) return null;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return formatDateParts(year, month, day);
    return String(year);
  }
  const yearMonth = text.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (year < 1) return null;
    if (month >= 1 && month <= 12) {
      return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, month - 1, 1)));
    }
    return String(year);
  }
  if (/^\d{4}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(parsed);
  }
  return null;
}

function formatDateParts(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function collectPlaces(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (!isRecord(item)) return [];
    const name = asText(item.name)
      ?? asText(item.label)
      ?? asText(item.country)
      ?? asText(item.iso_3166_1)
      ?? asText(item.code);
    return name ? [name] : [];
  });
}

function collectNamedValues(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : [];
    if (!isRecord(item)) return [];
    const name = asText(item.title)
      ?? asText(item.name)
      ?? asText(item.label)
      ?? asText(item.value);
    return name ? [name] : [];
  });
}

function collectDescriptors(value: unknown): string[] {
  return asArray(value).flatMap((item) => {
    if (typeof item === 'string') {
      return item.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
    }
    if (!isRecord(item)) return [];
    const direct = asText(item.name)
      ?? asText(item.label)
      ?? asText(item.description)
      ?? asText(item.title);
    if (direct) return [direct];
    return [item.descriptors, item.items, item.list].flatMap((nested) => collectDescriptors(nested));
  });
}

function normalizeCredit(value: unknown, fallbackRole: string): DetailCredit | null {
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { name, role: labelCrewRole(fallbackRole) } : null;
  }
  if (!isRecord(value)) return null;

  const name = asText(value.name) ?? asText(value.original_name) ?? asText(value.person);
  if (!name) return null;
  const rawRole = asText(value.job)
    ?? asText(value.role)
    ?? asText(value.department)
    ?? fallbackRole;
  const profileUrl = publicImageUrl(
    asText(value.profile_url)
    ?? asText(value.profileUrl)
    ?? asText(value.image)
    ?? asText(value.photo_url)
  );

  return {
    name,
    role: labelCrewRole(rawRole),
    ...(profileUrl ? { profileUrl } : {}),
  };
}

function normalizeAward(value: unknown, sourceResult: boolean | null): DetailAward | null {
  if (typeof value === 'string') {
    const title = value.trim();
    return title ? { title, won: sourceResult } : null;
  }
  if (!isRecord(value)) return null;

  const title = asText(value.award)
    ?? asText(value.ceremony)
    ?? asText(value.organization)
    ?? asText(value.name)
    ?? asText(value.title);
  const category = asText(value.category)
    ?? asText(value.category_name)
    ?? asText(value.role);
  if (!title && !category) return null;

  const result = asText(value.result) ?? asText(value.status);
  const explicitWon = typeof value.won === 'boolean'
    ? value.won
    : typeof value.winner === 'boolean' ? value.winner : null;
  const inferredWon = result
    ? (/winner|won|venceu|vencedor/i.test(result) ? true : /nominee|nominated|indica/i.test(result) ? false : null)
    : null;
  const year = asNumber(value.year);

  return {
    title: title ?? category!,
    ...(title && category ? { category } : {}),
    ...(year ? { year: String(Math.round(year)) } : {}),
    won: explicitWon ?? inferredWon ?? sourceResult,
  };
}

function labelCrewRole(role: string): string {
  const normalized = role.toLowerCase().replace(/[_-]+/g, ' ').trim();
  return CREW_ROLE_LABELS[normalized] ?? role.trim();
}

function publicImageUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  return value.startsWith('/media/') || /^https?:\/\//i.test(value) ? value : undefined;
}

function formatLanguage(value: string): string {
  const code = value.toLowerCase();
  if (LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code];
  if (/^[a-z]{2,3}$/.test(code)) return code.toUpperCase();
  return value;
}

function formatRegion(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(code)) return value.trim();
  try {
    const names = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
