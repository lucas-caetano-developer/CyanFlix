import { expect, test } from 'vitest';
import type { Work } from './types';
import {
  availabilityForWork,
  catalogViewTitle,
  collectAvailability,
  collectContentKinds,
  collectGenres,
  filterCatalogWorks,
  normalizeCatalogText,
  normalizeSearchTerm,
  parseAvailability,
  parseCatalogSort,
  parseContentKind,
  seeAllLinkForRow,
  uniqueWorks,
} from './catalog';

const movie: Work = {
  id: 'movie-1',
  title: 'Ação Final',
  contentKind: 'movie',
  metadata: { genres: ['Ação', 'Aventura'] },
};

const series: Work = {
  id: 'series-1',
  title: 'Série Dublada',
  contentKind: 'series',
  metadata: { genres: ['Drama', 'ação'] },
  seasons: [
    { id: 'season-1', number: 1, metadata: { media_availability: 'DUB' } },
    { id: 'season-2', number: 2, metadata: { media_availability: 'LEG' } },
  ],
};

const anime: Work = {
  id: 'anime-1',
  title: 'Anime Legendado',
  contentKind: 'anime',
  metadata: { genres: ['Ação'] },
  seasons: [{ id: 'season-3', number: 1, metadata: { media_availability: 'LEG' } }],
};

test('parses only supported catalog parameters', () => {
  expect(parseContentKind('anime')).toBe('anime');
  expect(parseContentKind('documentary')).toBeUndefined();
  expect(parseAvailability('dub')).toBe('DUB');
  expect(parseAvailability('both')).toBeUndefined();
  expect(parseCatalogSort('az')).toBe('az');
  expect(parseCatalogSort('newest')).toBe('catalog');
});

test('normalises search terms and comparisons without changing the displayed value', () => {
  expect(normalizeSearchTerm('  Ação   Final  ')).toBe('Ação Final');
  expect(normalizeCatalogText('AÇÃO')).toBe(normalizeCatalogText('acao'));
  expect(catalogViewTitle(undefined, 'Ação', undefined)).toBe('Ação');
});

test('deduplicates works and derives only real genres and availability', () => {
  expect(uniqueWorks([movie, series, movie]).map((work) => work.id)).toEqual(['movie-1', 'series-1']);
  expect(collectGenres([movie, series, anime])).toEqual([
    { value: 'Ação', label: 'Ação', count: 3 },
    { value: 'Aventura', label: 'Aventura', count: 1 },
    { value: 'Drama', label: 'Drama', count: 1 },
  ]);
  expect(availabilityForWork(series)).toEqual({ dub: true, leg: true });
  expect(collectAvailability([movie, series, anime])).toEqual([
    { value: 'DUB', label: 'Dublado', count: 1 },
    { value: 'LEG', label: 'Legendado', count: 2 },
  ]);
  expect(collectContentKinds([movie, series, anime])).toEqual([
    { value: 'movie', label: 'Filmes', count: 1 },
    { value: 'series', label: 'Séries', count: 1 },
    { value: 'anime', label: 'Animes', count: 1 },
  ]);
});

test('combines type, accent-insensitive genre and availability filters', () => {
  expect(filterCatalogWorks([movie, series, anime], { genre: 'acao' }).map((work) => work.id))
    .toEqual(['movie-1', 'series-1', 'anime-1']);
  expect(filterCatalogWorks([movie, series, anime], { kind: 'series', genre: 'Ação', availability: 'DUB' }).map((work) => work.id))
    .toEqual(['series-1']);
  expect(filterCatalogWorks([movie, series, anime], { kind: 'series', genre: 'Ação', availability: 'LEG' }).map((work) => work.id))
    .toEqual(['series-1']);
  expect(filterCatalogWorks([movie, series, anime], { kind: 'movie', availability: 'LEG' })).toEqual([]);
});

test('sorts a copy alphabetically only when requested', () => {
  const original = [series, movie, anime];
  const sorted = filterCatalogWorks(original, { sort: 'az' });
  expect(sorted.map((work) => work.title)).toEqual(['Ação Final', 'Anime Legendado', 'Série Dublada']);
  expect(original.map((work) => work.id)).toEqual(['series-1', 'movie-1', 'anime-1']);
});

test('creates see-all links only for destinations backed by catalog routes', () => {
  expect(seeAllLinkForRow('movies', 'Filmes')).toBe('/browse?kind=movie');
  expect(seeAllLinkForRow('series', 'Séries')).toBe('/browse?kind=series');
  expect(seeAllLinkForRow('anime', 'Animes')).toBe('/browse?kind=anime');
  expect(seeAllLinkForRow('dubbed', 'Dublados')).toBe('/browse?availability=DUB');
  expect(seeAllLinkForRow('subtitled', 'Legendados')).toBe('/browse?availability=LEG');
  expect(seeAllLinkForRow('genre:acao', 'Ação & Aventura')).toBe('/browse?genre=A%C3%A7%C3%A3o%20%26%20Aventura');
  expect(seeAllLinkForRow('recent', 'Adicionados recentemente')).toBeUndefined();
  expect(seeAllLinkForRow('collection:1', 'Coleção')).toBeUndefined();
});
