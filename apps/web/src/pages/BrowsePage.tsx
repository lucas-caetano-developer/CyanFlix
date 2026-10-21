import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { HeroCarousel } from '../components/carousel/HeroCarousel';
import { ContentRow } from '../components/carousel/ContentRow';
import { WorkCard } from '../components/cards/WorkCard';
import { CatalogHeader } from '../components/catalog/CatalogHeader';
import { CatalogMessage } from '../components/catalog/CatalogMessage';
import { FilterChips } from '../components/catalog/FilterChips';
import { Skeleton } from '../components/ui/Skeleton';
import { useProfileStore } from '../stores/useProfileStore';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import {
  catalogViewDescription,
  catalogViewEyebrow,
  catalogViewTitle,
  collectAvailability,
  collectGenres,
  contentKindLabel,
  filterCatalogWorks,
  normalizeSearchTerm,
  parseAvailability,
  parseCatalogSort,
  parseContentKind,
  seeAllLinkForRow,
  uniqueWorks,
} from '../lib/catalog';
import type { Work } from '../lib/types';

export function BrowsePage() {
  const profileId = useProfileStore((state) => state.profileId);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const kind = parseContentKind(searchParams.get('kind'));
  const genre = normalizeSearchTerm(searchParams.get('genre') ?? '');
  const availability = parseAvailability(searchParams.get('availability'));
  const sort = parseCatalogSort(searchParams.get('sort'));
  const isDiscovery = Boolean(kind || genre || availability);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home', profileId, kind],
    queryFn: () => api.getHome(kind),
    enabled: Boolean(profileId),
  });
  const continueWatching = useQuery({
    queryKey: ['continue-watching', profileId],
    queryFn: () => api.getContinueWatching(profileId!),
    enabled: Boolean(profileId) && !isDiscovery,
  });
  const upNext = useQuery({
    queryKey: ['up-next', profileId],
    queryFn: () => api.getUpNext(profileId!),
    enabled: Boolean(profileId) && !isDiscovery,
  });

  const allWorks = useMemo(() => {
    if (!data) return [];
    const recent = data.rows.find((row) => row.id === 'recent')?.items ?? [];
    return uniqueWorks([...recent, ...data.rows.flatMap((row) => row.items)]);
  }, [data]);
  const categoryWorks = useMemo(() => filterCatalogWorks(allWorks, { kind }), [allWorks, kind]);
  const genreOptions = useMemo(() => collectGenres(categoryWorks), [categoryWorks]);
  const availabilityOptions = useMemo(() => collectAvailability(categoryWorks), [categoryWorks]);
  const works = useMemo(
    () => filterCatalogWorks(categoryWorks, { genre, availability, sort }),
    [categoryWorks, genre, availability, sort],
  );

  useScrollRestoration(`${location.pathname}${location.search}`, !isLoading);

  const updateParam = (key: string, value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const clearFilters = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('genre');
      next.delete('availability');
      next.delete('sort');
      return next;
    });
  };

  if (isDiscovery && isLoading) {
    return (
      <div className="catalog-page browse-category" aria-busy="true">
        <CatalogHeader
          eyebrow={catalogViewEyebrow(kind, genre, availability)}
          title={catalogViewTitle(kind, genre, availability)}
          description={catalogViewDescription(kind, genre, availability)}
        />
        <p className="sr-only" role="status">Carregando catálogo…</p>
        <div className="catalog-grid" aria-hidden="true">
          <Skeleton variant="poster" count={10} />
        </div>
      </div>
    );
  }

  if (!isDiscovery && (isLoading || !data) && !isError) {
    return (
      <div className="browse" aria-busy="true">
        <p className="sr-only" role="status">Carregando catálogo…</p>
        <div className="browse__loading-hero" aria-hidden="true">
          <Skeleton variant="backdrop" />
          <div className="browse__loading-copy">
            <div className="skeleton skeleton--loading-kicker" />
            <div className="skeleton skeleton--loading-title" />
            <div className="skeleton skeleton--loading-line" />
            <div className="skeleton skeleton--loading-line skeleton--loading-line--short" />
            <div className="browse__loading-actions">
              <div className="skeleton skeleton--loading-button" />
              <div className="skeleton skeleton--loading-button skeleton--loading-button--ghost" />
            </div>
          </div>
        </div>
        <div className="browse__rows browse__rows--loading">
          <div className="browse__loading-row">
            <Skeleton variant="text" count={1} />
            <div className="browse__loading-posters">
              <Skeleton variant="poster" count={5} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={isDiscovery ? 'catalog-page browse-category' : 'catalog-page'}>
        <CatalogMessage
          tone="error"
          icon="info"
          title="Não foi possível carregar o catálogo"
          description="Verifique a conexão e tente novamente."
          actions={<button type="button" className="btn btn--primary" onClick={() => { void refetch(); }}>Tentar novamente</button>}
        />
      </div>
    );
  }

  if (isDiscovery) {
    const activeFilters = Boolean(genre || availability);
    const hasAdjustments = activeFilters || sort === 'az';
    const countText = genre || availability
      ? `${works.length} de ${categoryWorks.length} títulos nesta visão`
      : `${categoryWorks.length} ${categoryWorks.length === 1 ? 'título' : 'títulos'} nesta visão`;

    return (
      <div className="catalog-page browse-category">
        <CatalogHeader
          eyebrow={catalogViewEyebrow(kind, genre, availability)}
          title={catalogViewTitle(kind, genre, availability)}
          description={catalogViewDescription(kind, genre, availability)}
          meta={countText}
          backLink={{ to: '/browse', label: 'Início' }}
          actions={
            <>
              <Link to={kind ? `/search?kind=${kind}` : '/search'} className="btn btn--secondary">
                Buscar {kind ? `em ${contentKindLabel(kind)}` : 'no catálogo'}
              </Link>
              {hasAdjustments && (
                <button type="button" className="btn btn--secondary" onClick={clearFilters}>Limpar filtros</button>
              )}
            </>
          }
        />

        <div className="catalog-toolbar">
          {genreOptions.length > 0 && (
            <div className="catalog-toolbar__row">
              <div className="filter-group">
                <span className="filter-group__label">Gênero</span>
                <FilterChips
                  label="Filtrar por gênero"
                  options={genreOptions}
                  allLabel="Todos"
                  value={genre}
                  onChange={(value) => updateParam('genre', value)}
                />
              </div>
            </div>
          )}
          <div className="catalog-toolbar__row">
            {availabilityOptions.length > 0 && (
              <div className="filter-group">
                <span className="filter-group__label">Disponibilidade</span>
                <FilterChips
                  label="Filtrar por disponibilidade"
                  options={availabilityOptions}
                  allLabel="Todas"
                  value={availability ?? ''}
                  onChange={(value) => updateParam('availability', value)}
                />
              </div>
            )}
            <label className="catalog-sort">
              <span>Ordenar</span>
              <select value={sort} onChange={(event) => updateParam('sort', event.target.value === 'az' ? 'az' : '')}>
                <option value="catalog">Ordem do catálogo</option>
                <option value="az">A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {works.length > 0 ? (
          <>
            <div className="catalog-results-summary" role="status" aria-live="polite">
              <span><strong>{works.length}</strong> {works.length === 1 ? 'título exibido' : 'títulos exibidos'}</span>
              {sort === 'az' && <span className="catalog-results-summary__hint">A–Z aplicado aos títulos disponíveis nesta visão.</span>}
            </div>
            <div className="catalog-grid">
              {works.map((work: Work) => (
                <WorkCard key={work.id} work={work} />
              ))}
            </div>
          </>
        ) : (
          <CatalogMessage
            icon={activeFilters ? 'filter' : 'info'}
            title={activeFilters ? 'Nenhum título com esses filtros' : 'Nenhum título nesta categoria'}
            description={activeFilters
              ? 'Remova um filtro ou escolha outra combinação para continuar explorando.'
              : 'Novos títulos aparecerão aqui assim que estiverem disponíveis no catálogo.'}
            actions={activeFilters ? (
              <button type="button" className="btn btn--primary" onClick={clearFilters}>Limpar filtros</button>
            ) : undefined}
          />
        )}
      </div>
    );
  }

  const heroById = new Map<string, Work>();
  if (data.hero) heroById.set(data.hero.id, data.hero);
  const recentRow = data.rows.find((row) => row.id === 'recent');
  if (recentRow) {
    for (const item of recentRow.items) {
      if (heroById.size >= 5) break;
      heroById.set(item.id, item);
    }
  }
  const heroItems = Array.from(heroById.values());
  const continueItems = continueWatching.data ?? [];
  const continueIds = new Set(continueItems.map((item) => item.id));
  const nextItems = (upNext.data ?? []).filter((item) => !continueIds.has(item.id));

  return (
    <div className="browse">
      {heroItems.length > 0 && <HeroCarousel items={heroItems} />}
      <div className="browse__rows">
        {continueItems.length > 0 && (
          <ContentRow title="Continuar assistindo" items={continueItems} />
        )}
        {nextItems.length > 0 && (
          <ContentRow title="Próximo episódio" items={nextItems} />
        )}
        {data.rows.map((row) => (
          <ContentRow
            key={row.id}
            title={row.title}
            items={row.items}
            seeAllLink={seeAllLinkForRow(row.id, row.title)}
          />
        ))}
      </div>
    </div>
  );
}
