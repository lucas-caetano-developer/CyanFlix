import { formatDuration, formatMs, getCast, getGenres, getStudios, labelKind } from './utils';

test('ignores malformed credits and keeps only usable names', () => {
  expect(getCast({
    cast: [
      { name: '  Ana Souza ', role: ' Protagonista ', profile_url: ' /media/ana.jpg ' },
      { name: '   ' },
      { role: 'Sem nome' },
      null,
      'Nome solto',
    ],
  })).toEqual([
    { name: 'Ana Souza', profile_url: '/media/ana.jpg', role: 'Protagonista' },
  ]);
});

test('sanitizes genres and studios without inventing values', () => {
  expect(getGenres({ genres: ['Drama', '', 42, '  Mistério  '] })).toEqual(['Drama', 'Mistério']);
  expect(getGenres({ anilist: { genres: [''] }, genres: ['Drama'] })).toEqual(['Drama']);
  expect(getStudios({ production_studios: [' Aurora ', null, ''] })).toEqual(['Aurora']);
  expect(getStudios({ production_studios: [''], anilist: { studios: [{ name: 'Studio' }] } })).toEqual(['Studio']);
  expect(getStudios({ anilist: { studios: [{ name: ' Studio ' }, null, { name: '' }] } })).toEqual(['Studio']);
  expect(getStudios({})).toEqual([]);
});

test('formats whole hours without a trailing zero-minute segment', () => {
  expect(formatDuration(120)).toBe('2h');
  expect(formatDuration(121)).toBe('2h 1min');
  expect(formatDuration(45)).toBe('45min');
});

test('formats playback time with hours when needed', () => {
  expect(formatMs(0)).toBe('0:00');
  expect(formatMs(65_000)).toBe('1:05');
  expect(formatMs(3_599_000)).toBe('59:59');
  expect(formatMs(3_600_000)).toBe('1:00:00');
  expect(formatMs(Number.NaN)).toBe('0:00');
});

test('labels films, series and anime consistently', () => {
  expect(labelKind('movie')).toBe('Filme');
  expect(labelKind('series')).toBe('Série');
  expect(labelKind('anime')).toBe('Anime');
});
