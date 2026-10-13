import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBackdropUrl, getPosterUrl, getCertification, getGenres, getCast, getRating, labelKind, getSynopsis } from "../lib/utils";
import { Rating } from "../components/ui/Rating";
import { Badge } from "../components/ui/Badge";
import { EpisodeCard } from "../components/cards/EpisodeCard";
import { Spinner } from "../components/ui/Spinner";
import { Skeleton } from "../components/ui/Skeleton";
import { Season, Episode } from "../lib/types";
import { useProfileStore } from "../stores/useProfileStore";

export function TitlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.profileId);
  const queryClient = useQueryClient();
  
  const { data: work, isLoading, isError, error } = useQuery({
    queryKey: ["work", id],
    queryFn: () => api.getWork(id!),
    enabled: !!id,
  });

  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const favorites = useQuery({
    queryKey: ["favorites", profileId],
    queryFn: () => api.getFavorites(profileId!),
    enabled: Boolean(profileId),
  });
  const favoriteMutation = useMutation({
    mutationFn: async (favorite: boolean) => {
      if (!profileId || !id) return;
      if (favorite) await api.removeFavorite(profileId, id);
      else await api.addFavorite(profileId, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites", profileId] }),
  });

  if (isLoading || !work) {
    if (isError) {
      return (
        <div className="title-page" style={{ padding: "8rem var(--side-padding) 2rem" }}>
          <h1 style={{ marginBottom: "1rem" }}>Não foi possível carregar este título</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
            {error instanceof Error ? error.message : "Erro desconhecido"}
          </p>
          <Link to="/browse" className="btn btn--secondary">Voltar ao início</Link>
        </div>
      );
    }

    return (
      <div className="title-page">
        <Skeleton variant="backdrop" />
        <div style={{ padding: "2rem var(--side-padding)" }}>
          <Spinner />
        </div>
      </div>
    );
  }

  const backdrop = getBackdropUrl(work);
  const poster = getPosterUrl(work);
  const genres = getGenres(work.metadata);
  const cert = getCertification(work.metadata);
  const cast = getCast(work.metadata);
  const synopsis = getSynopsis(work);

  const seasons: Season[] = work.seasons || [];
  const currentSeason = seasons.find((s: Season) => s.id === (selectedSeasonId || seasons[0]?.id)) || seasons[0];

  const tmdbRating = getRating(work, "tmdb", currentSeason);
  const malRating = work.contentKind === "anime" ? getRating(work, "mal", currentSeason) : null;

  const firstEpisodeId = currentSeason?.episodes?.[0]?.id;
  const playUrl = work.contentKind === "movie" 
    ? `/watch/movie/${work.id}` 
    : (firstEpisodeId ? `/watch/episode/${firstEpisodeId}` : null);
  const isFavorite = Boolean(favorites.data?.some((item) => item.id === work.id));

  return (
    <div className="title-page">
      <div className="title-page__backdrop">
        {backdrop && <img src={backdrop} alt={work.title} />}
        <div className="title-page__backdrop-gradient"></div>
      </div>

      <div className="title-page__content">
        <div className="title-page__header">
          {poster && (
            <div className="title-page__poster">
              <img src={poster} alt={work.title} />
            </div>
          )}

          <div className="title-page__info">
            <div className="title-page__kind">{labelKind(work.contentKind)}</div>
            <h1 className="title-page__title">{work.title}</h1>
            
            <div className="title-page__meta-row">
              {work.year && <span>{work.year}</span>}
              {cert && <Badge variant="age" label={cert} />}
              {genres && genres.length > 0 && <span>{genres.join(" • ")}</span>}
            </div>

            <div className="title-page__ratings">
              {tmdbRating && (
                <Rating value={tmdbRating.value} source={tmdbRating.label} votes={tmdbRating.votes} />
              )}
              {malRating && (
                <Rating value={malRating.value} source={malRating.label} votes={malRating.votes} />
              )}
            </div>

            {synopsis && (
              <p className="title-page__synopsis">{synopsis}</p>
            )}

            <div className="title-page__actions">
              {playUrl ? (
                <Link to={playUrl} className="btn btn--primary btn--lg">
                  ▶ Assistir {work.contentKind === "movie" ? "Filme" : "Agora"}
                </Link>
              ) : (
                <button className="btn btn--secondary btn--lg" disabled>
                  Mídia Indisponível
                </button>
              )}
              <button className="btn btn--secondary btn--lg"
                      disabled={favoriteMutation.isPending}
                      onClick={() => favoriteMutation.mutate(isFavorite)}>
                {isFavorite ? "✓ Minha Lista" : "+ Minha Lista"}
              </button>
            </div>
          </div>
        </div>

        {/* Seasons & Episodes */}
        {work.contentKind !== "movie" && seasons.length > 0 && (
          <div className="title-page__section">
            <h2 className="title-page__section-title">Episódios</h2>
            
            {seasons.length > 1 && (
              <div className="title-page__season-selector">
                {seasons.map((season: Season) => (
                  <button
                    key={season.id}
                    className={`title-page__season-tab ${season.id === currentSeason?.id ? "title-page__season-tab--active" : ""}`}
                    onClick={() => setSelectedSeasonId(season.id)}
                  >
                    {season.title || `Temporada ${season.number}`}
                  </button>
                ))}
              </div>
            )}

            {currentSeason?.completeness && (currentSeason.completeness as any).is_complete === false && (
              <div style={{ marginBottom: "1rem" }}>
                <Badge variant="incomplete" label="Temporada Incompleta (Novos episódios em breve)" />
              </div>
            )}

            <div className="title-page__episodes-list">
              {currentSeason?.episodes && currentSeason.episodes.length > 0 ? (
                currentSeason.episodes.map((ep: Episode) => (
                  <EpisodeCard
                    key={ep.id}
                    episode={ep}
                    workTitle={work.title}
                    onClick={() => navigate(`/watch/episode/${ep.id}`)}
                  />
                ))
              ) : (
                <div style={{ color: "var(--text-muted)", padding: "1rem 0" }}>
                  Nenhum episódio cadastrado para esta temporada.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cast */}
        {cast && cast.length > 0 && (
          <div className="title-page__section">
            <h2 className="title-page__section-title">Elenco</h2>
            <div className="title-page__cast">
              {cast.slice(0, 15).map((member, i) => (
                <div key={i} className="title-page__cast-item">
                  {member.profile_url ? (
                    <img src={member.profile_url} alt={member.name} className="title-page__cast-photo" />
                  ) : (
                    <div className="title-page__cast-photo" style={{ display: "grid", placeItems: "center" }}>👤</div>
                  )}
                  <div className="title-page__cast-name">{member.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
