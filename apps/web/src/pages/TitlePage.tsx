import { useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBackdropUrl, getPosterUrl, getCertification, getGenres, getCast, getRating, getStudios, getTrailerUrl, labelKind, getSynopsis } from "../lib/utils";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [trailerOpen, setTrailerOpen] = useState(false);
  
  const { data: work, isLoading, isError, error } = useQuery({
    queryKey: ["work", id],
    queryFn: () => api.getWork(id!),
    enabled: !!id,
  });

  const favorites = useQuery({
    queryKey: ["favorites", profileId],
    queryFn: () => api.getFavorites(profileId!),
    enabled: Boolean(profileId),
  });
  const continueWatching = useQuery({
    queryKey: ["continue-watching", profileId],
    queryFn: () => api.getContinueWatching(profileId!),
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
        <div className="title-page title-page--error">
          <h1>Não foi possível carregar este título</h1>
          <p>
            {error instanceof Error ? error.message : "Erro desconhecido"}
          </p>
          <Link to="/browse" className="btn btn--secondary">Voltar ao início</Link>
        </div>
      );
    }

    return (
      <div className="title-page">
        <Skeleton variant="backdrop" />
        <div className="title-page__loading">
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
  const requestedSeason = searchParams.get("season");
  const currentSeason = seasons.find((season) => season.id === requestedSeason || String(season.number) === requestedSeason) || seasons[0];

  const tmdbRating = getRating(work, "tmdb", currentSeason);
  const malRating = work.contentKind === "anime" ? getRating(work, "mal", currentSeason) : null;

  const resume = continueWatching.data?.find((item) => item.id === work.id)?.continueWatching;
  const firstEpisodeId = currentSeason?.episodes?.[0]?.id;
  const playUrl = resume ? `/watch/${resume.itemType}/${resume.itemId}` : work.contentKind === "movie" 
    ? `/watch/movie/${work.id}` 
    : (firstEpisodeId ? `/watch/episode/${firstEpisodeId}` : null);
  const playLabel = resume
    ? resume.itemType === "episode" ? `Continuar T${resume.seasonNumber ?? "?"} E${resume.episodeNumber ?? "?"}` : "Continuar filme"
    : work.contentKind === "movie" ? "Assistir filme" : "Começar agora";
  const isFavorite = Boolean(favorites.data?.some((item) => item.id === work.id));
  const trailer = getTrailerUrl(work) || getTrailerUrl({ ...work, assets: currentSeason?.assets });
  const seasonMetadata = currentSeason?.metadata;
  const availability = typeof seasonMetadata?.media_availability === "string" ? seasonMetadata.media_availability : null;
  const audioLanguages = stringArray(seasonMetadata?.audio_languages);
  const subtitleLanguages = stringArray(seasonMetadata?.subtitle_languages).filter((language) => !/indispon/i.test(language));
  const studios = getStudios(seasonMetadata ?? work.metadata);
  const completeness = recordValue(currentSeason?.completeness);
  const missingEpisodes = numberArray(completeness.missing_episode_numbers);

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
                  {playLabel}
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
              {trailer && <button className="btn btn--secondary btn--lg" onClick={() => setTrailerOpen(true)}>Ver trailer</button>}
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
                    onClick={() => setSearchParams((current) => { const next = new URLSearchParams(current); next.set("season", String(season.number)); return next; })}
                  >
                    {season.title || `Temporada ${season.number}`}
                  </button>
                ))}
              </div>
            )}

            {currentSeason?.completeness && completeness.is_complete === false && (
              <div className="title-page__completeness">
                <Badge variant="incomplete" label="Temporada incompleta" />
                <span>{Number(completeness.included_episode_count ?? currentSeason.episodes?.length ?? 0)} de {String(completeness.expected_episode_count ?? "?")} episódios disponíveis</span>
                {missingEpisodes.length > 0 && <span>Ausentes: {missingEpisodes.join(", ")}</span>}
              </div>
            )}

            {(availability || audioLanguages.length > 0 || subtitleLanguages.length > 0 || studios.length > 0) && <div className="title-page__delivery">
              {availability && <Badge variant={availability.includes("DUB") ? "dub" : "leg"} label={availability} />}
              {audioLanguages.length > 0 && <span>Áudio: {audioLanguages.join(", ")}</span>}
              {subtitleLanguages.length > 0 && <span>Legendas: {subtitleLanguages.join(", ")}</span>}
              {studios.length > 0 && <span>Estúdio: {studios.join(", ")}</span>}
            </div>}

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
                <div className="empty-state empty-state--compact">
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
                    <div className="title-page__cast-photo title-page__cast-placeholder" aria-hidden="true"><span /></div>
                  )}
                  <div className="title-page__cast-name">{member.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {trailerOpen && trailer && <div className="title-page__trailer" role="dialog" aria-modal="true" aria-label={`Trailer de ${work.title}`} onClick={() => setTrailerOpen(false)}>
        <div className="title-page__trailer-content" onClick={(event) => event.stopPropagation()}>
          <button aria-label="Fechar trailer" onClick={() => setTrailerOpen(false)}>×</button>
          <video src={trailer} controls autoPlay playsInline />
        </div>
      </div>}
    </div>
  );
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}
