import {
  getAlternateTitles,
  getAwards,
  getContentDescriptors,
  getCrew,
  getOriginalLanguage,
  getOriginCountries,
  getReleaseDate,
  getRuntimeMinutes,
  getThemes,
  getWorkStatus,
} from './workDetails';

test('reads the editorial metadata already supported by the catalogue', () => {
  const metadata = {
    runtime: 142,
    original_language: 'en',
    origin_country: ['US'],
    release_date: '2021-10-22',
    status: 'Released',
    production_studios: ['Legendary Pictures'],
    crew: [
      { name: 'Denis Villeneuve', job: 'Director' },
      { name: 'Jon Spaihts', job: 'Screenplay' },
      { name: 'Greig Fraser', job: 'Director of Photography' },
    ],
    awards: [
      { award: 'Oscar', category: 'Melhor Filme', year: 2022, won: true },
      { name: 'BAFTA', category: 'Melhor Filme', year: 2022, result: 'nominated' },
    ],
    content_descriptors: ['Violência', 'Linguagem imprópria'],
    alternative_titles: { titles: [{ title: 'Dune: Part One' }] },
    themes: ['Poder', 'Destino'],
  };

  expect(getRuntimeMinutes(metadata)).toBe(142);
  expect(getOriginalLanguage(metadata)).toBe('Inglês');
  expect(getOriginCountries(metadata)).toEqual(['Estados Unidos']);
  expect(getReleaseDate(metadata)).toBe('22 de outubro de 2021');
  expect(getWorkStatus(metadata)).toBe('Lançada');
  expect(getCrew(metadata)).toEqual(expect.arrayContaining([
    { name: 'Denis Villeneuve', role: 'Direção' },
    { name: 'Jon Spaihts', role: 'Roteiro' },
    { name: 'Greig Fraser', role: 'Fotografia' },
  ]));
  expect(getAwards(metadata)).toEqual([
    { title: 'Oscar', category: 'Melhor Filme', year: '2022', won: true },
    { title: 'BAFTA', category: 'Melhor Filme', year: '2022', won: false },
  ]);
  expect(getContentDescriptors(metadata)).toEqual(['Violência', 'Linguagem imprópria']);
  expect(getAlternateTitles(metadata)).toEqual(['Dune: Part One']);
  expect(getThemes(metadata)).toEqual(['Poder', 'Destino']);
});

test('supports nested rating metadata without inventing missing information', () => {
  const metadata = {
    tmdb: { runtime: 98, status: 'Returning Series', first_air_date: '2023-01-15' },
    anilist: { status: 'FINISHED', startDate: { year: 2023, month: 1, day: 15 } },
    original_language: 'ja',
    production_countries: [{ iso_3166_1: 'JP', name: 'Japão' }],
    crew: [{ name: 'Equipe sem função' }],
  };

  expect(getRuntimeMinutes(metadata)).toBe(98);
  expect(getWorkStatus(metadata)).toBe('Em andamento');
  expect(getReleaseDate(metadata)).toBe('15 de janeiro de 2023');
  expect(getOriginalLanguage(metadata)).toBe('Japonês');
  expect(getOriginCountries(metadata)).toEqual(['Japão']);
  expect(getCrew(metadata)).toEqual([{ name: 'Equipe sem função', role: 'Equipe' }]);
  expect(getAwards({})).toEqual([]);
  expect(getContentDescriptors({})).toEqual([]);
});

test('does not invent missing date parts', () => {
  expect(getReleaseDate({ release_date: '2023-05' })).toBe('maio de 2023');
  expect(getReleaseDate({ release_date: '2023' })).toBe('2023');
  expect(getReleaseDate({ release_date: '2023-13-40' })).toBe('2023');
  expect(getReleaseDate({})).toBeNull();
});
