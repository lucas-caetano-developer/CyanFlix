import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HeroCarousel } from "../components/carousel/HeroCarousel";
import { ContentRow } from "../components/carousel/ContentRow";
import { Skeleton } from "../components/ui/Skeleton";
import { Work } from "../lib/types";
import { useProfileStore } from "../stores/useProfileStore";

export function BrowsePage() {
  const profileId = useProfileStore((state) => state.profileId);
  const { data, isLoading } = useQuery({
    queryKey: ["home"],
    queryFn: api.getHome,
  });
  const continueWatching = useQuery({
    queryKey: ["continue-watching", profileId],
    queryFn: () => api.getContinueWatching(profileId!),
    enabled: Boolean(profileId),
  });

  if (isLoading || !data) {
    return (
      <div className="browse">
        <Skeleton variant="backdrop" />
        <div style={{ padding: "0 var(--side-padding)", marginTop: "2rem" }}>
          <Skeleton variant="text" count={1} />
          <div style={{ display: "flex", gap: "10px", marginTop: "1rem" }}>
            <Skeleton variant="poster" count={5} />
          </div>
        </div>
      </div>
    );
  }

  const heroItems: Work[] = [];
  if (data.hero) heroItems.push(data.hero);
  const recentRow = data.rows.find((r: any) => r.id === "recent");
  if (recentRow) {
    heroItems.push(...recentRow.items.slice(0, 5));
  }

  return (
    <div className="browse">
      {heroItems.length > 0 && <HeroCarousel items={heroItems} />}
      <div className="browse__rows">
        {continueWatching.data && continueWatching.data.length > 0 && (
          <ContentRow title="Continuar assistindo" items={continueWatching.data} />
        )}
        {data.rows.map((row: any) => (
          <ContentRow key={row.id} title={row.title} items={row.items} />
        ))}
      </div>
    </div>
  );
}
