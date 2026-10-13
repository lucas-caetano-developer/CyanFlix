import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useDebounce } from "../hooks/useDebounce";
import { WorkCard } from "../components/cards/WorkCard";
import { Spinner } from "../components/ui/Spinner";
import { useSearchParams } from "react-router-dom";
import { Work } from "../lib/types";

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const debouncedQuery = useDebounce(q, 300);

  const { data: results, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => api.searchWorks(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  return (
    <div className="search-page">
      <div className="search-page__input-wrapper">
        <span className="search-page__icon">🔍</span>
        <input
          type="text"
          className="search-page__input"
          placeholder="Buscar por títulos, elenco, gêneros..."
          value={q}
          onChange={(e) => setSearchParams(e.target.value ? { q: e.target.value } : {})}
          autoFocus
        />
      </div>

      {isLoading && <Spinner />}

      {results && results.length > 0 && (
        <div className="search-page__results">
          {results.map((work: Work) => (
            <WorkCard key={work.id} work={work} />
          ))}
        </div>
      )}

      {debouncedQuery.length > 0 && !isLoading && (!results || results.length === 0) && (
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
