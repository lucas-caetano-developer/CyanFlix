import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HeroCarousel } from "../components/carousel/HeroCarousel";
import { ContentRow } from "../components/carousel/ContentRow";
import { Skeleton } from "../components/ui/Skeleton";
import { Work } from "../lib/types";
import { useProfileStore } from "../stores/useProfileStore";
import { useSearchParams } from "react-router-dom";

export function BrowsePage() {
  const profileId = useProfileStore((state) => state.profileId);
  const [searchParams] = useSearchParams();
  const requestedKind = searchParams.get("kind");
  const kind = requestedKind === "movie" || requestedKind === "series" || requestedKind === "anime" ? requestedKind : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["home", kind],
    queryFn: () => api.getHome(kind),
  });
  const continueWatching = useQuery({
    queryKey: ["continue-watching", profileId],
    queryFn: () => api.getContinueWatching(profileId!),
    enabled: Boolean(profileId),
  });
  const upNext = useQuery({
    queryKey: ["up-next", profileId],
    queryFn: () => api.getUpNext(profileId!),
    enabled: Boolean(profileId),
  });

  if (isLoading || !data) {
    return (
      <div className="browse">
        <Skeleton variant="backdrop" />
        <div className="browse__loading-row">
          <Skeleton variant="text" count={1} />
          <div className="browse__loading-posters">
            <Skeleton variant="poster" count={5} />
          </div>
        </div>
      </div>
    );
  }

  const heroById = new Map<string, Work>();
  if (data.hero) heroById.set(data.hero.id, data.hero);
  const recentRow = data.rows.find((row) => row.id === "recent");
  if (recentRow) {
    for (const item of recentRow.items) {
      if (heroById.size >= 5) break;
      heroById.set(item.id, item);
    }
  }
  const heroItems = Array.from(heroById.values());

  return (
    <div className="browse">
      {heroItems.length > 0 && <HeroCarousel items={heroItems} />}
      <div className="browse__rows">
        {continueWatching.data && continueWatching.data.length > 0 && (
          <ContentRow title="Continuar assistindo" items={continueWatching.data} />
        )}
        {upNext.data && upNext.data.length > 0 && (
          <ContentRow title="Próximo episódio" items={upNext.data} />
        )}
        {data.rows.map((row) => (
          <ContentRow key={row.id} title={row.title} items={row.items} />
        ))}
      </div>
    </div>
  );
}
