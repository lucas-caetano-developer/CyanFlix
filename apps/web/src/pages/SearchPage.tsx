import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";
import { WorkCard } from "../components/cards/WorkCard";
import { Spinner } from "../components/ui/Spinner";
import { useSearchParams } from "react-router-dom";
import { Work } from "../lib/types";

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const requestedKind = searchParams.get("kind");
  const kind = requestedKind === "movie" || requestedKind === "series" || requestedKind === "anime" ? requestedKind : undefined;
  const debouncedQuery = useDebounce(q, 300);

  const results = useInfiniteQuery({
    queryKey: ["search", debouncedQuery, kind],
    queryFn: ({ pageParam }) => api.searchWorks(debouncedQuery, pageParam, kind),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: debouncedQuery.length > 0,
  });
  const works = results.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="search-page">
      <div className="search-page__input-wrapper">
        <span className="search-page__icon">🔍</span>
        <input
          type="text"
          className="search-page__input"
          placeholder="Buscar por títulos, elenco, gêneros..."
          value={q}
          onChange={(e) => setSearchParams((current) => { const next = new URLSearchParams(current); if (e.target.value) next.set("q", e.target.value); else next.delete("q"); return next; })}
          autoFocus
        />
      </div>

      <div className="search-page__filters" aria-label="Filtrar resultados por tipo">
        {[{ value: "", label: "Todos" }, { value: "movie", label: "Filmes" }, { value: "series", label: "Séries" }, { value: "anime", label: "Animes" }].map((option) => (
          <button key={option.value} className={`btn ${requestedKind === option.value || (!requestedKind && !option.value) ? "btn--primary" : "btn--secondary"}`}
                  onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); if (option.value) next.set("kind", option.value); else next.delete("kind"); return next; })}>{option.label}</button>
        ))}
      </div>

      {results.isLoading && <Spinner />}

      {works.length > 0 && (
        <div className="search-page__results">
          {works.map((work: Work) => (
            <WorkCard key={work.id} work={work} />
          ))}
        </div>
      )}

      {results.hasNextPage && <button className="btn btn--secondary search-page__more" disabled={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>
        {results.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
      </button>}

      {debouncedQuery.length > 0 && !results.isLoading && works.length === 0 && (
        <div className="search-page__empty">
          Nenhum resultado encontrado para "{debouncedQuery}"
        </div>
      )}

      {debouncedQuery.length === 0 && (
        <div className="search-page__empty">
          Digite para pesquisar em todo o catálogo do CyanFlix
        </div>
      )}
    </div>
  );
}
