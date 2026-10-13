import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useProfileStore } from "../stores/useProfileStore";
import { WorkCard } from "../components/cards/WorkCard";
import { Spinner } from "../components/ui/Spinner";
import { Work } from "../lib/types";

export function MyListPage() {
  const profileId = useProfileStore((s) => s.profileId);

  const { data: favorites, isLoading, isError } = useQuery({
    queryKey: ["favorites", profileId],
    queryFn: () => profileId ? api.getFavorites(profileId) : Promise.reject("No profile"),
    enabled: !!profileId,
    retry: 1,
  });

  return (
    <div className="my-list">
      <h1 className="my-list__title">Minha Lista</h1>
      
      {isLoading && <Spinner />}
      
      {isError && !isLoading && (
        <div style={{ color: "var(--text-muted)", padding: "2rem 0" }}>
          Sua lista está vazia ou a sincronização de favoritos ainda não foi iniciada.
        </div>
      )}

      {favorites && favorites.length > 0 && (
        <div className="search-page__results">
          {favorites.map((work: Work) => (
            <WorkCard key={work.id} work={work} />
          ))}
        </div>
      )}
      {favorites && favorites.length === 0 && !isLoading && (
        <div style={{ color: "var(--text-muted)", padding: "2rem 0" }}>
          Sua lista está vazia. Adicione títulos pela página da obra.
        </div>
      )}
    </div>
  );
}
