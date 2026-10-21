import { useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import { useDebounce } from '../hooks/useDebounce';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { WorkCard } from '../components/cards/WorkCard';
import { CatalogHeader } from '../components/catalog/CatalogHeader';
import { CatalogMessage } from '../components/catalog/CatalogMessage';
import { FilterChips } from '../components/catalog/FilterChips';
import { Skeleton } from '../components/ui/Skeleton';
import { Icon } from '../components/ui/Icon';
import { focusSpatialElement } from '../lib/spatialNavigation';
import {
  CONTENT_KIND_OPTIONS,
  normalizeSearchTerm,
  parseContentKind,
  searchKindLabel,
  uniqueWorks,
} from '../lib/catalog';
import type { Work } from '../lib/types';

export function SearchPage() {
  const profileId = useProfileStore((state) => state.profileId);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const pageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const q = searchParams.get('q') ?? '';
  const query = normalizeSearchTerm(q);
  const kind = parseContentKind(searchParams.get('kind'));
  const debouncedQuery = useDebounce(query, 300);
  const effectiveQuery = query.length === 0 ? '' : debouncedQuery;

  const results = useInfiniteQuery({
    queryKey: ['search', profileId, effectiveQuery, kind],
    queryFn: ({ pageParam }) => api.searchWorks(effectiveQuery, pageParam, kind),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(profileId) && effectiveQuery.length > 0,
  });

  const works = useMemo(
    () => uniqueWorks(results.data?.pages.flatMap((page) => page.items) ?? []),
    [results.data],
  );
  useScrollRestoration(`${location.pathname}${location.search}`, !results.isFetching || results.isError);

  const updateParam = (key: string, value: string, replace = false) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace });
  };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateParam('q', query, true);
  };

  const clearSearch = () => {
    updateParam('q', '');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && q) {
      event.preventDefault();
      clearSearch();
      return;
    }
    if (event.key !== 'ArrowDown') return;
    const firstResult = pageRef.current?.querySelector<HTMLElement>('.catalog-grid a[href]');
    if (!firstResult) return;
    event.preventDefault();
    focusSpatialElement(firstResult);
  };

  const waitingForFirstQuery = query.length > 0 && effectiveQuery.length === 0;
  const loading = waitingForFirstQuery || (effectiveQuery.length > 0 && results.isLoading);
  const failed = effectiveQuery.length > 0 && results.isError && works.length === 0;
  const hasResults = works.length > 0;
  const loadingTerm = effectiveQuery || query;

  return (
    <div ref={pageRef} className="catalog-page search-page" aria-busy={results.isFetching || query !== effectiveQuery}>
      <CatalogHeader
        eyebrow="Descobrir"
        title="Busca"
        description="Encontre uma obra específica ou explore o catálogo por título, título original, gênero e outros termos editoriais."
        actions={<Link to="/browse" className="btn btn--secondary">Explorar catálogo</Link>}
      />

      <form className="search-page__form" role="search" aria-label="Buscar no catálogo" onSubmit={submitSearch}>
        <span className="search-page__icon" aria-hidden="true"><Icon name="search" /></span>
        <label htmlFor="catalog-search-input" className="sr-only">Buscar no catálogo</label>
        <input
          ref={inputRef}
          id="catalog-search-input"
          type="search"
          className="search-page__input"
          placeholder="Buscar por título, gênero, elenco..."
          value={q}
          maxLength={200}
          onChange={(event) => updateParam('q', event.target.value, true)}
          onKeyDown={handleSearchKeyDown}
          aria-describedby={hintId}
          autoComplete="off"
          autoFocus={!q}
          enterKeyHint="search"
        />
        {q && (
          <button type="button" className="search-page__clear" aria-label="Limpar busca" onClick={clearSearch}>
            <Icon name="close" />
          </button>
        )}
      </form>
      <p className="search-page__hint" id={hintId}>
        A busca não diferencia maiúsculas de minúsculas e também considera títulos originais e termos do catálogo.
      </p>

      <div className="catalog-toolbar">
        <div className="catalog-toolbar__row">
          <div className="filter-group">
            <span className="filter-group__label">Tipo</span>
            <FilterChips
              label="Filtrar resultados por tipo"
              options={CONTENT_KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={kind ?? ''}
              onChange={(value) => updateParam('kind', value)}
            />
          </div>
          {kind && (
            <button type="button" className="catalog-toolbar__clear" onClick={() => updateParam('kind', '')}>
              Limpar filtro
            </button>
          )}
        </div>
      </div>

      {loading && (
        <>
          <p className="catalog-results-summary" role="status">Buscando “{loadingTerm}”…</p>
          <div className="catalog-grid" aria-hidden="true">
            <Skeleton variant="poster" count={8} />
          </div>
        </>
      )}

      {!loading && failed && (
        <CatalogMessage
          tone="error"
          icon="info"
          title="Não foi possível concluir a busca"
          description="Verifique a conexão e tente novamente. O termo pesquisado foi preservado."
          actions={
            <button type="button" className="btn btn--primary" onClick={() => { void results.refetch(); }}>
              Tentar novamente
            </button>
          }
        />
      )}

      {!loading && !failed && effectiveQuery.length > 0 && hasResults && (
        <>
          <div className="catalog-results-summary" role="status" aria-live="polite">
            <span>
              <strong>{works.length}</strong> {works.length === 1 ? 'título carregado' : 'títulos carregados'} {searchKindLabel(kind)}
              {results.hasNextPage ? ' · há mais resultados' : ''}
            </span>
          </div>
          <div className="catalog-grid">
            {works.map((work: Work) => (
              <WorkCard key={work.id} work={work} />
            ))}
          </div>
          {(results.hasNextPage || results.isFetchNextPageError) && (
            <button
              type="button"
              className="btn btn--secondary search-page__more"
              disabled={results.isFetchingNextPage}
              onClick={() => { void results.fetchNextPage(); }}
            >
              {results.isFetchingNextPage
                ? 'Carregando…'
                : results.isFetchNextPageError
                  ? 'Tentar novamente'
                  : 'Carregar mais'}
            </button>
          )}
          {results.isFetchNextPageError && (
            <p className="catalog-inline-error" role="alert">Não foi possível carregar mais resultados.</p>
          )}
        </>
      )}

      {!loading && !failed && effectiveQuery.length > 0 && !hasResults && (
        <CatalogMessage
          icon="search"
          title={`Nenhum resultado para “${effectiveQuery}”`}
          description={kind
            ? `Não encontramos correspondências em ${searchKindLabel(kind).replace('em ', '')}. Tente outro termo ou remova o filtro de tipo.`
            : 'Tente outro termo, verifique a escrita ou explore as categorias do catálogo.'}
          actions={
            <>
              {kind && (
                <button type="button" className="btn btn--secondary" onClick={() => updateParam('kind', '')}>
                  Remover filtro
                </button>
              )}
              <button type="button" className="btn btn--primary" onClick={clearSearch}>
                Limpar busca
              </button>
            </>
          }
        />
      )}

      {!loading && query.length === 0 && (
        <CatalogMessage
          icon="search"
          title="Encontre algo para assistir"
          description="Digite um título, um gênero ou outro termo do catálogo. Você também pode começar explorando uma categoria."
          actions={
            <>
              <Link to="/browse?kind=movie" className="btn btn--secondary">Filmes</Link>
              <Link to="/browse?kind=series" className="btn btn--secondary">Séries</Link>
              <Link to="/browse?kind=anime" className="btn btn--secondary">Animes</Link>
            </>
          }
        />
      )}
    </div>
  );
}
