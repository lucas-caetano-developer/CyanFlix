import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useProfileStore } from '../stores/useProfileStore';
import { useFavoriteMutation } from '../hooks/useFavoriteMutation';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { WorkCard } from '../components/cards/WorkCard';
import { CatalogHeader } from '../components/catalog/CatalogHeader';
import { CatalogMessage } from '../components/catalog/CatalogMessage';
import { FilterChips } from '../components/catalog/FilterChips';
import { Icon } from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Skeleton';
import {
  collectContentKinds,
  filterCatalogWorks,
  parseCatalogSort,
  parseContentKind,
} from '../lib/catalog';
import type { Work } from '../lib/types';

export function MyListPage() {
  const profileId = useProfileStore((state) => state.profileId);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const kind = parseContentKind(searchParams.get('kind'));
  const sort = parseCatalogSort(searchParams.get('sort'));
  const [removeFeedback, setRemoveFeedback] = useState('');

  const { data: favorites, isLoading, isError, refetch } = useQuery({
    queryKey: ['favorites', profileId],
    queryFn: () => profileId ? api.getFavorites(profileId) : Promise.reject(new Error('No profile')),
    enabled: Boolean(profileId),
    retry: 1,
  });
  const activeProfile = useQuery({
    queryKey: ['profiles', 'active'],
    queryFn: api.getActiveProfile,
    enabled: Boolean(profileId),
    retry: false,
  });
  const removeFavorite = useFavoriteMutation(profileId);

  useEffect(() => {
    if (!removeFeedback) return;
    const timer = window.setTimeout(() => setRemoveFeedback(''), 5000);
    return () => window.clearTimeout(timer);
  }, [removeFeedback]);

  const allWorks = favorites ?? [];
  const profileName = activeProfile.data?.name?.trim();
  const kindOptions = useMemo(() => collectContentKinds(allWorks), [allWorks]);
  const works = useMemo(
    () => filterCatalogWorks(allWorks, { kind, sort }),
    [allWorks, kind, sort],
  );
  useScrollRestoration(`${location.pathname}${location.search}`, !isLoading);

  const handleRemove = (work: Work) => {
    setRemoveFeedback('');
    removeFavorite.mutate({ work, nextFavorite: false }, {
      onSuccess: () => setRemoveFeedback(`“${work.title}” foi removido da Minha Lista.`),
    });
  };

  const updateParam = (key: string, value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const total = allWorks.length;
  const countLabel = total === 0
    ? undefined
    : works.length === total
      ? `${total} ${total === 1 ? 'título salvo' : 'títulos salvos'}`
      : `${works.length} de ${total} títulos salvos`;

  return (
    <div className="catalog-page my-list" aria-busy={isLoading}>
      <CatalogHeader
        eyebrow={profileName ? `Lista de ${profileName}` : 'Sua seleção'}
        title="Minha Lista"
        description="Os títulos que você salvou para assistir depois."
        meta={countLabel}
        actions={<Link to="/browse" className="btn btn--secondary">Explorar catálogo</Link>}
      />

      {removeFeedback && <p className="catalog-feedback" role="status">{removeFeedback}</p>}
      {removeFavorite.isError && (
        <p className="catalog-feedback catalog-feedback--error" role="alert">
          Não foi possível remover o título. Sua lista foi restaurada.
        </p>
      )}

      {isLoading && (
        <>
          <p className="sr-only" role="status">Carregando sua lista…</p>
          <div className="catalog-grid" aria-hidden="true">
            <Skeleton variant="poster" count={8} />
          </div>
        </>
      )}

      {!isLoading && isError && (
        <CatalogMessage
          tone="error"
          icon="info"
          title="Não foi possível carregar sua lista"
          description="Sua seleção continua salva. Verifique a conexão e tente novamente."
          actions={<button type="button" className="btn btn--primary" onClick={() => { void refetch(); }}>Tentar novamente</button>}
        />
      )}

      {!isLoading && !isError && total > 0 && (
        <>
          <div className="catalog-toolbar">
            <div className="catalog-toolbar__row">
              {kindOptions.length > 1 && (
                <div className="filter-group">
                  <span className="filter-group__label">Tipo</span>
                  <FilterChips
                    label="Filtrar Minha Lista por tipo"
                    options={kindOptions}
                    allCount={total}
                    value={kind ?? ''}
                    onChange={(value) => updateParam('kind', value)}
                  />
                </div>
              )}
              <label className="catalog-sort">
                <span>Ordenar</span>
                <select value={sort} onChange={(event) => updateParam('sort', event.target.value === 'az' ? 'az' : '')}>
                  <option value="catalog">Ordem da lista</option>
                  <option value="az">A–Z</option>
                </select>
              </label>
              {(kind || sort === 'az') && (
                <button
                  type="button"
                  className="catalog-toolbar__clear"
                  onClick={() => setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.delete('kind');
                    next.delete('sort');
                    return next;
                  })}
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          <div className="catalog-results-summary" role="status" aria-live="polite">
            <span><strong>{works.length}</strong> {works.length === 1 ? 'título exibido' : 'títulos exibidos'}</span>
          </div>

          {works.length > 0 ? (
            <div className="catalog-grid">
              {works.map((work: Work) => (
                <div key={work.id} className="my-list-card">
                  <WorkCard work={work} />
                  <button
                    type="button"
                    className="my-list-card__remove"
                    aria-label={`Remover ${work.title} da Minha Lista`}
                    title="Remover da Minha Lista"
                    disabled={removeFavorite.isPending}
                    onClick={() => handleRemove(work)}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <CatalogMessage
              icon="filter"
              title="Nenhum título com esses filtros"
              description="Sua lista tem títulos salvos, mas nenhum corresponde ao tipo selecionado."
              actions={
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setSearchParams((current) => {
                    const next = new URLSearchParams(current);
                    next.delete('kind');
                    next.delete('sort');
                    return next;
                  })}
                >
                  Limpar filtros
                </button>
              }
            />
          )}
        </>
      )}

      {!isLoading && !isError && total === 0 && (
        <CatalogMessage
          icon="info"
          title="Sua lista está vazia"
          description="Adicione títulos pela página da obra para encontrá-los aqui depois."
          actions={<Link to="/browse" className="btn btn--primary">Explorar catálogo</Link>}
        />
      )}
    </div>
  );
}
