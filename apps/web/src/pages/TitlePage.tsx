import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useFavoriteMutation } from "../hooks/useFavoriteMutation";
import {
  formatDuration,
  getBackdropUrl,
  getCast,
  getCertification,
  getGenres,
  getLogoUrl,
  getMotionPreviewUrl,
  getPosterUrl,
  getRating,
  getStudios,
  getSynopsis,
  getTrailerUrl,
  labelKind,
} from "../lib/utils";
import {
  DetailCredit,
  getAlternateTitles,
  getAwards,
  getClassificationAgency,
  getContentDescriptors,
  getCrew,
  getDistributor,
  getOriginalLanguage,
  getOriginCountries,
  getReleaseDate,
  getRuntimeMinutes,
  getThemes,
  getWorkStatus,
} from "../lib/workDetails";
import { Rating } from "../components/ui/Rating";
import { Badge } from "../components/ui/Badge";
import { Icon } from "../components/ui/Icon";
import { EpisodeCard } from "../components/cards/EpisodeCard";
import { SeasonSelector, SEASON_PANEL_ID, getSeasonTabId, seasonLabel } from "../components/title/SeasonSelector";
import { TrailerDialog } from "../components/title/TrailerDialog";
import { Season, Episode } from "../lib/types";
import { useProfileStore } from "../stores/useProfileStore";

export function TitlePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.profileId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [showAllAwards, setShowAllAwards] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [showMotion, setShowMotion] = useState(false);
  const [motionReady, setMotionReady] = useState(false);
  const [heroInView, setHeroInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  const [favoriteFeedback, setFavoriteFeedback] = useState("");
  const heroRef = useRef<HTMLElement>(null);

  const { data: work, isLoading, isError, error } = useQuery({
    queryKey: ["work", profileId, id],
    queryFn: () => api.getWork(id!),
    enabled: Boolean(id && profileId),
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
  const hasResumeForWork = Boolean(continueWatching.data?.some((item) => item.id === id));
  const upNext = useQuery({
    queryKey: ["up-next", profileId],
    queryFn: () => api.getUpNext(profileId!),
    enabled: Boolean(
      profileId
      && id
      && work
      && work.contentKind !== "movie"
      && continueWatching.isSuccess
      && !hasResumeForWork,
    ),
  });
  const favoriteMutation = useFavoriteMutation(profileId);

  useEffect(() => {
    setTrailerOpen(false);
    setSynopsisExpanded(false);
    setShowAllAwards(false);
    setFavoriteFeedback("");
  }, [id]);

  useEffect(() => {
    if (!favoriteMutation.isSuccess || !work || favoriteMutation.variables?.work.id !== work.id) return;
    setFavoriteFeedback(favoriteMutation.variables.nextFavorite
      ? `“${work.title}” foi adicionado à Minha Lista.`
      : `“${work.title}” foi removido da Minha Lista.`);
    const timer = window.setTimeout(() => setFavoriteFeedback(""), 5000);
    return () => window.clearTimeout(timer);
  }, [favoriteMutation.isSuccess, favoriteMutation.variables, work]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const precisePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const refresh = () => setMotionAllowed(
      !reducedMotion.matches
      && precisePointer.matches
      && !connection?.saveData
      && !["slow-2g", "2g"].includes(connection?.effectiveType ?? ""),
    );
    refresh();
    reducedMotion.addEventListener("change", refresh);
    precisePointer.addEventListener("change", refresh);
    return () => {
      reducedMotion.removeEventListener("change", refresh);
      precisePointer.removeEventListener("change", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  useEffect(() => {
    const element = heroRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroInView(entry.isIntersecting),
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [work?.id]);

  const motionPreview = work ? getMotionPreviewUrl(work) : null;
  useEffect(() => {
    setShowMotion(false);
    setMotionReady(false);
    if (!motionAllowed || !motionPreview || !pageVisible || !heroInView || trailerOpen) return;
    const timer = window.setTimeout(() => setShowMotion(true), 1200);
    return () => window.clearTimeout(timer);
  }, [heroInView, motionAllowed, motionPreview, pageVisible, trailerOpen]);

  const closeTrailer = useCallback(() => setTrailerOpen(false), []);

  if (isError) {
    return (
      <div className="title-page title-page--error" role="alert">
        <h1>Não foi possível carregar este título</h1>
        <p>{error instanceof Error ? error.message : "Erro desconhecido"}</p>
        <Link to="/browse" className="btn btn--secondary">Voltar ao início</Link>
      </div>
    );
  }

  if (isLoading || !work || (Boolean(profileId) && (continueWatching.isLoading || upNext.isLoading))) {
    return (
      <div className="title-page title-page--loading" aria-busy="true">
        <span className="sr-only" role="status">Carregando detalhes do título</span>
        <div className="title-page__hero title-page__hero--loading">
          <div className="title-page__content">
            <div className="title-page__header" aria-hidden="true">
              <div className="skeleton title-page__skeleton-poster" />
              <div className="title-page__skeleton-info">
                <div className="skeleton title-page__skeleton-line title-page__skeleton-line--eyebrow" />
                <div className="skeleton title-page__skeleton-line title-page__skeleton-line--title" />
                <div className="skeleton title-page__skeleton-line title-page__skeleton-line--short" />
                <div className="skeleton title-page__skeleton-line" />
                <div className="skeleton title-page__skeleton-line title-page__skeleton-line--actions" />
              </div>
            </div>
          </div>
        </div>
        <div className="skeleton title-page__skeleton-nav" aria-hidden="true" />
        <div className="title-page__body" aria-hidden="true">
          <div className="title-page__skeleton-section">
            <div className="skeleton title-page__skeleton-heading" />
            <div className="skeleton title-page__skeleton-episode" />
            <div className="skeleton title-page__skeleton-episode" />
            <div className="skeleton title-page__skeleton-episode" />
          </div>
        </div>
      </div>
    );
  }

  const backdrop = getBackdropUrl(work);
  const poster = getPosterUrl(work);
  const logo = getLogoUrl(work);
  const genres = getGenres(work.metadata);
  const synopsis = getSynopsis(work);
  const synopsisIsLong = synopsis.length > 320 || synopsis.split(/\r?\n/).length > 3;
  const seasons: Season[] = work.seasons || [];
  const resume = continueWatching.data?.find((item) => item.id === work.id)?.continueWatching;
  const nextEpisode = upNext.data?.find((item) => item.id === work.id)?.continueWatching;
  const playbackContinuation = resume ?? (nextEpisode?.itemType === "episode" ? nextEpisode : undefined);
  const requestedSeason = searchParams.get("season");
  const resumeSeason = playbackContinuation?.itemType === "episode"
    ? seasons.find((season) => season.episodes?.some((episode) => episode.id === playbackContinuation.itemId))
    : undefined;
  const currentSeason = seasons.find((season) => season.id === requestedSeason || String(season.number) === requestedSeason)
    || resumeSeason
    || seasons[0];

  const currentEpisodes = currentSeason?.episodes || [];
  const seasonMetadata = currentSeason?.metadata;
  const cert = getCertification(work.metadata) ?? getCertification(seasonMetadata);
  const tmdbRating = getRating(work, "tmdb", currentSeason);
  const malRating = work.contentKind === "anime" ? getRating(work, "mal", currentSeason) : null;
  const firstEpisodeId = currentSeason?.episodes?.[0]?.id;
  const playUrl = playbackContinuation
    ? `/watch/${playbackContinuation.itemType}/${playbackContinuation.itemId}`
    : work.contentKind === "movie"
      ? `/watch/movie/${work.id}`
      : (firstEpisodeId ? `/watch/episode/${firstEpisodeId}` : null);
  const playbackContext = playbackContinuation?.itemType === "episode"
    && typeof playbackContinuation.seasonNumber === "number"
    && typeof playbackContinuation.episodeNumber === "number"
    ? `T${playbackContinuation.seasonNumber} E${playbackContinuation.episodeNumber}`
    : null;
  const resumeEpisodeContext = resume?.itemType === "episode"
    && typeof resume.seasonNumber === "number"
    && typeof resume.episodeNumber === "number"
    ? `T${resume.seasonNumber} E${resume.episodeNumber}`
    : null;
  const playLabel = resume
    ? playbackContext ? `Continuar ${playbackContext}` : "Continuar assistindo"
    : nextEpisode?.itemType === "episode"
      ? playbackContext ? `Próximo episódio ${playbackContext}` : "Próximo episódio"
      : work.contentKind === "movie"
        ? "Assistir"
        : firstEpisodeId
          ? `Assistir ao episódio ${currentSeason?.episodes?.[0]?.number ?? 1}`
          : "Assistir";
  const resumeEpisodeId = resume?.itemType === "episode" ? resume.itemId : null;
  const isFavorite = Boolean(favorites.data?.some((item) => item.id === work.id));
  const trailer = getTrailerUrl(work) || getTrailerUrl({ ...work, assets: currentSeason?.assets });
  const availability = typeof seasonMetadata?.media_availability === "string" ? seasonMetadata.media_availability : null;
  const audioLanguages = stringArray(seasonMetadata?.audio_languages);
  const subtitleLanguages = stringArray(seasonMetadata?.subtitle_languages).filter((language) => !/indispon/i.test(language));
  const workStudios = getStudios(work.metadata);
  const seasonStudios = getStudios(seasonMetadata);
  const studios = seasonStudios.length > 0 ? seasonStudios : workStudios;
  const completeness = recordValue(currentSeason?.completeness);
  const missingEpisodes = numberArray(completeness.missing_episode_numbers);
  const workCast = getCast(work.metadata);
  const cast = workCast.length > 0 ? workCast : getCast(seasonMetadata);
  const workCrew = getCrew(work.metadata);
  const crew = workCrew.length > 0 ? workCrew : getCrew(seasonMetadata);
  const crewGroups = groupCrew(crew);
  const workAwards = getAwards(work.metadata);
  const awards = workAwards.length > 0 ? workAwards : getAwards(seasonMetadata);
  const descriptors = uniqueStrings([...getContentDescriptors(work.metadata), ...getContentDescriptors(seasonMetadata)]);
  const classificationAgency = getClassificationAgency(work.metadata) ?? getClassificationAgency(seasonMetadata);
  const themes = getThemes(work.metadata);
  const releaseDate = getReleaseDate(work.metadata) ?? getReleaseDate(seasonMetadata);
  const runtime = getRuntimeMinutes(work.metadata) ?? getRuntimeMinutes(seasonMetadata);
  const status = getWorkStatus(work.metadata) ?? getWorkStatus(seasonMetadata);
  const originalLanguage = getOriginalLanguage(work.metadata) ?? getOriginalLanguage(seasonMetadata);
  const originCountries = getOriginCountries(work.metadata);
  const distributor = getDistributor(work.metadata) ?? getDistributor(seasonMetadata);
  const alternateTitles = getAlternateTitles(work.metadata).filter((title) => {
    const normalized = title.toLocaleLowerCase();
    return normalized !== work.title.toLocaleLowerCase()
      && normalized !== (work.originalTitle ?? "").toLocaleLowerCase();
  });
  const seasonCountLabel = `${seasons.length} ${seasons.length === 1 ? "temporada" : "temporadas"}`;
  const episodeCountLabel = currentEpisodes.length > 0
    ? `${currentEpisodes.length} ${currentEpisodes.length === 1 ? "episódio" : "episódios"} nesta temporada`
    : "Nenhum episódio disponível";
  const hasEpisodes = work.contentKind !== "movie" && seasons.length > 0;
  const hasCredits = cast.length > 0 || crew.length > 0;
  const infoRows: Array<{ label: string; value: string }> = [
    {
      label: "Título original",
      value: work.originalTitle && work.originalTitle.trim().toLocaleLowerCase() !== work.title.trim().toLocaleLowerCase()
        ? work.originalTitle
        : null,
    },
    { label: "Data de estreia", value: releaseDate },
    ...(work.contentKind !== "movie" && runtime
      ? [{ label: "Duração por episódio", value: formatDuration(runtime) }]
      : []),
    { label: "País de origem", value: originCountries.join(", ") || null },
    { label: "Idioma original", value: originalLanguage },
    { label: "Estúdio", value: workStudios.join(", ") || null },
    { label: "Distribuição", value: distributor },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  const showInfo = infoRows.length > 0
    || alternateTitles.length > 0
    || themes.length > 0
    || descriptors.length > 0
    || Boolean(classificationAgency);
  const hasClassificationAside = descriptors.length > 0 || Boolean(classificationAgency);
  const classificationTitle = cert
    ? "Classificação indicativa"
    : descriptors.length > 0 ? "Descritores de conteúdo" : "Classificação";
  const showExtras = Boolean(trailer);
  const visibleAwards = showAllAwards ? awards : awards.slice(0, 6);
  const heroArtwork = backdrop ?? poster;
  const heroArtworkIsPoster = !backdrop && Boolean(poster);
  const sections = [
    ...(hasEpisodes ? [{ id: "episodios", label: "Episódios" }] : []),
    ...(showExtras ? [{ id: "trailer", label: "Trailer e extras" }] : []),
    ...(hasCredits ? [{ id: "creditos", label: "Elenco e equipe" }] : []),
    ...(awards.length > 0 ? [{ id: "premios", label: "Prêmios" }] : []),
    ...(showInfo ? [{ id: "detalhes", label: "Informações" }] : []),
  ];

  return (
    <div className="title-page">
      <header
        ref={heroRef}
        className={`title-page__hero${!heroArtwork && !synopsis ? " title-page__hero--sparse" : ""}`}
      >
        <div className={`title-page__backdrop${heroArtworkIsPoster ? " title-page__backdrop--poster" : ""}`}>
          <HeroArtwork src={heroArtwork} />
          {showMotion && motionPreview && (
            <video
              key={motionPreview}
              className={`title-page__motion${motionReady ? " title-page__motion--visible" : ""}`}
              src={motionPreview}
              poster={backdrop ?? undefined}
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
              aria-hidden="true"
              tabIndex={-1}
              onCanPlay={() => setMotionReady(true)}
              onLoadedData={() => setMotionReady(true)}
              onPlaying={() => setMotionReady(true)}
              onError={() => setShowMotion(false)}
            />
          )}
          <div className="title-page__backdrop-gradient" aria-hidden="true" />
        </div>

        <div className="title-page__content">
          <div className={`title-page__header${poster ? "" : " title-page__header--no-poster"}`}>
            {poster && <PosterArtwork src={poster} title={work.title} />}

            <div className="title-page__info">
              <div className="title-page__eyebrow">
                <span className="title-page__kind">{labelKind(work.contentKind)}</span>
                {status && (
                  <>
                    <span className="title-page__eyebrow-dot" aria-hidden="true" />
                    <span className="title-page__status">{status}</span>
                  </>
                )}
              </div>

              <TitleLogo logo={logo} title={work.title} />

              <ul className="title-page__meta-row">
                {work.year && <li>{work.year}</li>}
                {cert && <li><Badge variant="age" label={cert} /></li>}
                {work.contentKind === "movie" && runtime && <li>{formatDuration(runtime)}</li>}
                {hasEpisodes && <li>{seasonCountLabel}</li>}
                {genres.length > 0 && (
                  <li title={genres.join(" • ")}>{genres.slice(0, 3).join(" • ")}</li>
                )}
              </ul>

              {(tmdbRating || malRating) && (
                <div className="title-page__ratings" role="group" aria-label="Avaliações disponíveis">
                  {tmdbRating && <Rating value={tmdbRating.value} source={tmdbRating.label} votes={tmdbRating.votes} scale={10} />}
                  {malRating && <Rating value={malRating.value} source={malRating.label} votes={malRating.votes} scale={10} />}
                </div>
              )}

              {synopsis && (
                <>
                  <p
                    id="title-synopsis"
                    className={`title-page__synopsis${synopsisIsLong && !synopsisExpanded ? " title-page__synopsis--clamped" : ""}`}
                  >
                    {synopsis}
                  </p>
                  {synopsisIsLong && (
                    <button
                      type="button"
                      className="title-page__synopsis-toggle"
                      aria-expanded={synopsisExpanded}
                      aria-controls="title-synopsis"
                      onClick={() => setSynopsisExpanded((expanded) => !expanded)}
                    >
                      {synopsisExpanded ? "Mostrar menos" : "Ler sinopse completa"}
                    </button>
                  )}
                </>
              )}

              <div className="title-page__actions">
                {playUrl ? (
                  <Link to={playUrl} className="btn btn--primary btn--lg title-page__play" data-spatial-initial="true">
                    <span className="title-page__action-icon" aria-hidden="true"><Icon name="play" /></span>
                    {playLabel}
                  </Link>
                ) : (
                  <button className="btn btn--primary btn--lg title-page__play" disabled>
                    Mídia indisponível
                  </button>
                )}
                <button
                  type="button"
                  className={`btn btn--secondary btn--lg title-page__list-button${isFavorite ? " title-page__list-button--active" : ""}`}
                  aria-pressed={isFavorite}
                  disabled={favorites.isLoading || favorites.isError || favoriteMutation.isPending}
                  onClick={() => favoriteMutation.mutate({ work, nextFavorite: !isFavorite })}
                >
                  <span className="title-page__action-icon" aria-hidden="true">{isFavorite ? "✓" : "+"}</span>
                  {favoriteMutation.isPending
                    ? "Salvando…"
                    : favorites.isError
                      ? "Minha Lista indisponível"
                      : isFavorite
                        ? "Na Minha Lista"
                        : "Minha Lista"}
                </button>
                {trailer && (
                  <button
                    type="button"
                    className="btn btn--secondary btn--lg title-page__trailer-button"
                    onClick={() => setTrailerOpen(true)}
                  >
                    <span className="title-page__action-icon" aria-hidden="true"><Icon name="play" /></span>
                    Ver trailer
                  </button>
                )}
              </div>

              {favoriteFeedback && (
                <p className="title-page__favorite-feedback" role="status">{favoriteFeedback}</p>
              )}
              {favoriteMutation.isError && (
                <p className="title-page__favorite-feedback title-page__favorite-feedback--error" role="alert">
                  Não foi possível atualizar a Minha Lista. Sua seleção anterior foi preservada.
                </p>
              )}
              {favorites.isError && (
                <div className="title-page__favorite-error">
                  <p role="alert">Não foi possível carregar o estado da Minha Lista.</p>
                  <button
                    type="button"
                    className="title-page__favorite-retry"
                    onClick={() => { void favorites.refetch(); }}
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {resume && resume.progressPercent > 0 && (
                <div className="title-page__resume">
                  <progress
                    className="title-page__resume-bar"
                    value={Math.min(100, Math.max(0, resume.progressPercent))}
                    max="100"
                    aria-label={`Progresso de reprodução: ${Math.round(Math.min(100, Math.max(0, resume.progressPercent)))}%`}
                  />
                  <span>
                    {Math.round(Math.min(100, Math.max(0, resume.progressPercent)))}% assistido
                    {resumeEpisodeContext ? ` · ${resumeEpisodeContext}` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {sections.length > 1 && (
        <nav className="title-page__section-nav" aria-label="Seções do título">
          <div className="title-page__section-nav-inner">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="title-page__section-link">
                {section.label}
              </a>
            ))}
          </div>
        </nav>
      )}

      <div className="title-page__body">
        {hasEpisodes && (
          <section id="episodios" className="title-page__section" aria-labelledby="episodios-title">
            <div className="title-page__section-heading">
              <div>
                <h2 id="episodios-title" className="title-page__section-title">Episódios</h2>
                <p className="title-page__section-kicker">
                  {seasonCountLabel} <span aria-hidden="true">·</span> {episodeCountLabel}
                </p>
              </div>
            </div>

            <SeasonSelector
              seasons={seasons}
              currentSeason={currentSeason}
              onSelect={(season) => setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set("season", String(season.number));
                return next;
              })}
            />

            <div
              id={SEASON_PANEL_ID}
              className="title-page__season-panel"
              role={seasons.length > 1 ? "tabpanel" : "region"}
              aria-labelledby={seasons.length > 1 && currentSeason ? getSeasonTabId(currentSeason) : undefined}
              aria-label={seasons.length <= 1 && currentSeason ? seasonLabel(currentSeason) : undefined}
            >
              {currentSeason?.completeness && completeness.is_complete === false && (
                <div className="title-page__completeness" role="note">
                  <Badge variant="incomplete" label="Temporada incompleta" />
                  <span>
                    {Number(completeness.included_episode_count ?? currentSeason.episodes?.length ?? 0)} de {String(completeness.expected_episode_count ?? "?")} episódios disponíveis
                  </span>
                  {missingEpisodes.length > 0 && <span>Ausentes: {missingEpisodes.join(", ")}</span>}
                </div>
              )}

              {(availability || audioLanguages.length > 0 || subtitleLanguages.length > 0 || studios.length > 0) && (
                <div className="title-page__delivery" role="group" aria-label="Disponibilidade da temporada">
                  {availability && <Badge variant={availability.includes("DUB") ? "dub" : "leg"} label={availability} />}
                  {audioLanguages.length > 0 && <span className="title-page__delivery-item"><strong>Áudio</strong> {audioLanguages.join(", ")}</span>}
                  {subtitleLanguages.length > 0 && <span className="title-page__delivery-item"><strong>Legendas</strong> {subtitleLanguages.join(", ")}</span>}
                  {studios.length > 0 && <span className="title-page__delivery-item"><strong>Estúdio</strong> {studios.join(", ")}</span>}
                </div>
              )}

              <div className="title-page__episodes-list">
                {currentEpisodes.length > 0 ? (
                  currentEpisodes.map((episode: Episode) => (
                    <EpisodeCard
                      key={episode.id}
                      episode={episode}
                      workTitle={work.title}
                      progressPercent={resumeEpisodeId === episode.id ? resume?.progressPercent : undefined}
                      onClick={() => navigate(`/watch/episode/${episode.id}`)}
                    />
                  ))
                ) : (
                  <div className="empty-state empty-state--compact">
                    Nenhum episódio cadastrado para esta temporada.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {showExtras && trailer && (
          <section id="trailer" className="title-page__section" aria-labelledby="trailer-title">
            <div className="title-page__section-heading">
              <div>
                <h2 id="trailer-title" className="title-page__section-title">Trailer e extras</h2>
                <p className="title-page__section-kicker">Material promocional publicado</p>
              </div>
            </div>
            <div className="title-page__promo-grid">
              <button
                type="button"
                className="title-page__trailer-card"
                onClick={() => setTrailerOpen(true)}
                aria-label={`Reproduzir trailer de ${work.title}`}
              >
                <span className="title-page__trailer-card-art" aria-hidden="true" />
                {backdrop && (
                  <img
                    src={backdrop}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                )}
                <span className="title-page__trailer-card-play" aria-hidden="true"><Icon name="play" /></span>
                <span className="title-page__trailer-card-copy">
                  <span className="title-page__trailer-card-type">Trailer</span>
                  <strong>{work.title}</strong>
                </span>
              </button>
            </div>
          </section>
        )}

        {hasCredits && (
          <section id="creditos" className="title-page__section" aria-labelledby="creditos-title">
            <div className="title-page__section-heading">
              <div>
                <h2 id="creditos-title" className="title-page__section-title">Elenco e equipe</h2>
                <p className="title-page__section-kicker">Créditos editoriais disponíveis</p>
              </div>
            </div>

            {cast.length > 0 && (
              <div className="title-page__credits-group">
                <h3 className="title-page__credits-subtitle">Elenco</h3>
                <div className="title-page__cast">
                  {cast.map((member, index) => (
                    <CastMember key={`${member.name}-${index}`} member={member} />
                  ))}
                </div>
              </div>
            )}

            {crewGroups.length > 0 && (
              <div className="title-page__credits-group">
                <h3 className="title-page__credits-subtitle">Equipe</h3>
                <div className="title-page__crew">
                  {crewGroups.map((group) => (
                    <div key={group.role} className="title-page__crew-group">
                      <h4>{group.role}</h4>
                      <p>{group.names.join(", ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {awards.length > 0 && (
          <section id="premios" className="title-page__section" aria-labelledby="premios-title">
            <div className="title-page__section-heading">
              <div>
                <h2 id="premios-title" className="title-page__section-title">Prêmios e indicações</h2>
                <p className="title-page__section-kicker">
                  {awards.length} {awards.length === 1 ? "registro" : "registros"}
                </p>
              </div>
            </div>
            <ul className="title-page__awards">
              {visibleAwards.map((award, index) => (
                <li key={`${award.title}-${award.category ?? ""}-${award.year ?? ""}-${index}`} className="title-page__award">
                  <div className="title-page__award-copy">
                    <strong>{award.title}</strong>
                    {award.category && <span>{award.category}</span>}
                  </div>
                  {award.year && <span className="title-page__award-year">{award.year}</span>}
                  <span className={`title-page__award-result${award.won === true ? " title-page__award-result--won" : award.won === false ? " title-page__award-result--nominated" : ""}`}>
                    {award.won === true ? "Vencedor" : award.won === false ? "Indicado" : "Registro"}
                  </span>
                </li>
              ))}
            </ul>
            {awards.length > 6 && (
              <button
                type="button"
                className="title-page__section-toggle"
                aria-expanded={showAllAwards}
                onClick={() => setShowAllAwards((expanded) => !expanded)}
              >
                {showAllAwards ? "Mostrar menos" : `Mostrar todos os ${awards.length} registros`}
              </button>
            )}
          </section>
        )}

        {showInfo && (
          <section id="detalhes" className="title-page__section" aria-labelledby="detalhes-title">
            <div className="title-page__section-heading">
              <div>
                <h2 id="detalhes-title" className="title-page__section-title">Informações</h2>
                <p className="title-page__section-kicker">Dados editoriais da obra</p>
              </div>
            </div>

            <div className={`title-page__details-layout${infoRows.length === 0 || !hasClassificationAside ? " title-page__details-layout--single" : ""}`}>
              {infoRows.length > 0 && (
                <dl className="title-page__info-list">
                  {infoRows.map((row) => (
                    <div key={row.label} className="title-page__info-row">
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {hasClassificationAside && (
                <aside className="title-page__classification" aria-label="Classificação e descritores">
                  {cert && <Badge variant="age" label={cert} />}
                  <div className="title-page__classification-copy">
                    <strong>{classificationTitle}</strong>
                    {classificationAgency && <span>{classificationAgency}</span>}
                    {descriptors.length > 0 && (
                      <ul className="title-page__descriptors">
                        {descriptors.map((descriptor) => <li key={descriptor}>{descriptor}</li>)}
                      </ul>
                    )}
                  </div>
                </aside>
              )}
            </div>

            {(alternateTitles.length > 0 || themes.length > 0) && (
              <div className="title-page__tag-groups">
                {alternateTitles.length > 0 && (
                  <div className="title-page__tag-group">
                    <h3>Títulos alternativos</h3>
                    <div className="title-page__tag-list">
                      {alternateTitles.map((title) => <span key={title}>{title}</span>)}
                    </div>
                  </div>
                )}
                {themes.length > 0 && (
                  <div className="title-page__tag-group">
                    <h3>Temas</h3>
                    <div className="title-page__tag-list">
                      {themes.map((theme) => <span key={theme}>{theme}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {trailerOpen && trailer && (
        <TrailerDialog title={work.title} src={trailer} poster={backdrop} onClose={closeTrailer} />
      )}
    </div>
  );
}

function TitleLogo({ logo, title }: { logo: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logo]);

  if (logo && !failed) {
    return (
      <h1 className="title-page__title title-page__title--logo">
        <img src={logo} alt={title} decoding="async" draggable={false} onError={() => setFailed(true)} />
      </h1>
    );
  }
  return <h1 className="title-page__title">{title}</h1>;
}

function HeroArtwork({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return <div className="title-page__backdrop-fallback" aria-hidden="true" />;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function PosterArtwork({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const initial = title.trim().charAt(0).toLocaleUpperCase() || "?";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className="title-page__poster">
      {!failed ? (
        <img src={src} alt="" aria-hidden="true" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className="title-page__poster-fallback" aria-hidden="true">{initial}</div>
      )}
    </div>
  );
}

function CastMember({ member }: { member: { name: string; profile_url?: string; role?: string } }) {
  const [failed, setFailed] = useState(false);
  const initial = member.name.trim().charAt(0).toLocaleUpperCase() || "?";

  useEffect(() => {
    setFailed(false);
  }, [member.profile_url]);

  return (
    <div className="title-page__cast-item">
      {member.profile_url && !failed ? (
        <img
          src={member.profile_url}
          alt=""
          className="title-page__cast-photo"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="title-page__cast-photo title-page__cast-placeholder" aria-hidden="true">
          <span>{initial}</span>
        </div>
      )}
      <div className="title-page__cast-name">{member.name}</div>
      {member.role && <div className="title-page__cast-role">{member.role}</div>}
    </div>
  );
}

function groupCrew(crew: DetailCredit[]): Array<{ role: string; names: string[] }> {
  const groups = new Map<string, string[]>();
  for (const person of crew) {
    const role = person.role || "Equipe";
    const names = groups.get(role) ?? [];
    if (!names.some((name) => name.toLocaleLowerCase() === person.name.toLocaleLowerCase())) {
      names.push(person.name);
    }
    groups.set(role, names);
  }
  return Array.from(groups, ([role, names]) => ({ role, names }));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
