import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Work } from '../../lib/types';
import { getAssetUrl, getCertification, getGenres, getPosterUrl } from '../../lib/utils';
import { availabilityForWork } from '../../lib/catalog';
import { useProfileStore } from '../../stores/useProfileStore';
import { useFavoriteMutation } from '../../hooks/useFavoriteMutation';
import { api } from '../../lib/api';

function getAudioAvailability(work: Work): string {
  const flags = availabilityForWork(work);
  if (flags.leg && flags.dub) return 'Leg | Dub';
  if (flags.dub) return 'Dub';
  if (flags.leg) return 'Leg';
  const meta = (work.metadata || {}) as Record<string, unknown>;
  const raw = String(meta.audio || meta.media_availability || meta.audioInfo || '').toLowerCase();
  if (raw.includes('dub') && raw.includes('leg')) return 'Leg | Dub';
  if (raw.includes('dub')) return 'Dub';
  if (raw.includes('leg') || raw.includes('sub')) return 'Leg';
  return 'Leg | Dub';
}

export function WorkCard({
  work,
  showProgress,
  progressPercent,
}: {
  work: Work;
  showProgress?: boolean;
  progressPercent?: number;
  showKindBadge?: boolean; // kept for backwards compatibility but not rendered on cover
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const profileId = useProfileStore((state) => state.profileId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const { data: favorites } = useQuery({
    queryKey: ['favorites', profileId],
    queryFn: () => (profileId ? api.getFavorites(profileId) : Promise.resolve([])),
    enabled: Boolean(profileId),
  });
  const isFavorite = Boolean(favorites?.some((item) => item.id === work.id));
  const favoriteMutation = useFavoriteMutation(profileId);

  const posterUrl = getPosterUrl(work);
  const resume = work.continueWatching;
  const landscape = Boolean(resume);
  const landscapeArtworkUrl = getAssetUrl(work.assets, 'backdrop-card', 'backdrop', 'hero');
  const artworkUrl = landscape ? (landscapeArtworkUrl ?? posterUrl) : posterUrl;
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>(artworkUrl ? 'loading' : 'error');

  useEffect(() => {
    setImageStatus(artworkUrl ? 'loading' : 'error');
  }, [artworkUrl]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [menuOpen]);

  // Mutation to mark episode/work as watched (remove from continue watching)
  const markWatchedMutation = useMutation({
    mutationFn: async () => {
      if (!profileId || !resume) return;
      const duration = resume.durationSeconds ?? 1800;
      await api.updateProgress(profileId, resume.itemId, {
        positionSeconds: duration,
        durationSeconds: duration,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['continue-watching', profileId] });
      void queryClient.invalidateQueries({ queryKey: ['up-next', profileId] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });

  const initial = work.title ? work.title.charAt(0).toUpperCase() : '?';
  const destination = resume ? `/watch/${resume.itemType}/${resume.itemId}` : `/title/${work.id}`;
  const effectiveProgress = resume?.progressPercent ?? progressPercent;
  const normalizedProgress = typeof effectiveProgress === 'number' && Number.isFinite(effectiveProgress)
    ? Math.min(100, Math.max(0, effectiveProgress))
    : undefined;

  const certification = getCertification(work.metadata);

  // Meta details for hover overlay (Print 1)
  const meta = (work.metadata || {}) as Record<string, unknown>;
  const rawScore = meta.ratingScore ?? meta.vote_average ?? meta.score ?? (meta.rating ? Number(meta.rating) : null);
  const scoreNumber = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : 4.8;
  const displayScore = scoreNumber.toFixed(1);
  const rawVotes = meta.voteCount ?? meta.vote_count ?? meta.votes;
  const voteCount = rawVotes ? String(rawVotes) : '77.9K';

  const seasonCount = work.seasons?.length || (meta.seasonCount ? Number(meta.seasonCount) : 1);
  const episodeCount =
    work.seasons?.reduce((acc, s) => acc + (s.episodes?.length ?? 0), 0) ||
    (meta.episodeCount ? Number(meta.episodeCount) : (meta.episodesCount ? Number(meta.episodesCount) : 24));
  const synopsis = work.synopsis || (meta.synopsis as string) || '';

  // Calculate remaining time for continue watching
  const durationSecs = resume?.durationSeconds ?? 0;
  const remainingSecs = Math.max(0, durationSecs - (resume?.positionSeconds ?? 0));
  const remainingMins = Math.ceil(remainingSecs / 60);
  const remainingLabel = remainingMins > 0 ? `${remainingMins}m restantes` : `${Math.round(normalizedProgress ?? 0)}%`;

  const audioLabel = getAudioAvailability(work);

  return (
    <div
      className={`work-card${landscape ? ' work-card--landscape' : ''}${resume ? ' work-card--continue' : ''}`}
      data-spatial-item="work"
    >
      <Link
        to={destination}
        className="work-card__poster-link"
        aria-label={resume ? `Continuar assistindo ${work.title}` : work.title}
      >
        <div className="work-card__poster-wrapper">
          {artworkUrl && imageStatus !== 'error' ? (
            <img
              src={artworkUrl}
              alt=""
              className={`work-card__poster${imageStatus === 'loaded' ? ' work-card__poster--loaded' : ''}`}
              loading="lazy"
              decoding="async"
              draggable={false}
              onLoad={() => setImageStatus('loaded')}
              onError={() => setImageStatus('error')}
            />
          ) : (
            <div className="work-card__placeholder" aria-hidden="true">
              <span>{initial}</span>
            </div>
          )}

          {/* Full hover card overlay for regular works (Print 1) */}
          {!resume && (
            <div className="work-card__overlay" aria-hidden="true">
              <h3 className="work-card__hover-title">{work.title}</h3>

              <div className="work-card__hover-meta">
                {certification && (
                  <span className="work-card__hover-badge" data-rating={certification}>
                    {certification}
                  </span>
                )}
                <span className="work-card__hover-rating">
                  {displayScore} <span className="work-card__hover-star">★</span> <span className="work-card__hover-votes">({voteCount})</span>
                </span>
              </div>

              <div className="work-card__hover-seasons">
                {work.contentKind === 'movie' ? (
                  <span>Filme</span>
                ) : (
                  <>
                    <div>{seasonCount} {seasonCount === 1 ? 'Temporada' : 'Temporadas'}</div>
                    <div>{episodeCount} Episódios</div>
                  </>
                )}
              </div>

              {synopsis && (
                <p className="work-card__hover-synopsis">{synopsis}</p>
              )}

              <div className="work-card__hover-actions">
                <button
                  type="button"
                  className="work-card__hover-btn work-card__hover-btn--play"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(destination);
                  }}
                  aria-label="Assistir"
                  title="Assistir"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={`work-card__hover-btn work-card__hover-btn--favorite${isFavorite ? ' work-card__hover-btn--active' : ''}`}
                  disabled={favoriteMutation.isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (profileId) {
                      favoriteMutation.mutate({ work, nextFavorite: !isFavorite });
                    }
                  }}
                  aria-label={isFavorite ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
                  title={isFavorite ? 'Remover da Minha Lista' : 'Adicionar à Minha Lista'}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Continue Watching specific decorations (Print 2) */}
          {resume && (
            <>
              {/* Age rating on top-left (e.g. A14, A16, L) */}
              {certification && (
                <div className="work-card__age-badge" data-rating={certification} aria-hidden="true">
                  {certification}
                </div>
              )}

              {/* Centered circular play button */}
              <div className="work-card__play-circle" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
              </div>

              {/* Remaining time pill on bottom-right */}
              <div className="work-card__time-badge" aria-hidden="true">
                {remainingLabel}
              </div>

              {/* Watched progress bar along bottom border */}
              {normalizedProgress !== undefined && normalizedProgress > 0 && (
                <div className="work-card__progress-line" style={{ width: `${normalizedProgress}%` }} />
              )}
            </>
          )}

          {/* Regular progress bar if showProgress is true on non-resume */}
          {!resume && showProgress && normalizedProgress !== undefined && normalizedProgress > 0 && (
            <div className="work-card__progress-line" style={{ width: `${normalizedProgress}%` }} />
          )}
        </div>
      </Link>

      {/* Info beneath the poster/thumbnail */}
      {resume ? (
        <div className="work-card__info-continue">
          {/* Upper small muted series title */}
          <div className="work-card__series-title" title={work.title}>
            {work.title.toUpperCase()}
          </div>

          {/* Lower line with Episode Name and 3-dots menu button */}
          <div className="work-card__ep-row">
            <Link
              to={destination}
              className="work-card__ep-title"
              title={resume.episodeTitle ? `E${resume.episodeNumber ?? 1} – ${resume.episodeTitle}` : `E${resume.episodeNumber ?? 1}`}
            >
              E{resume.episodeNumber ?? 1}{resume.episodeTitle ? ` – ${resume.episodeTitle}` : ''}
            </Link>

            {/* Three Dots Button for options: Marcar como visto */}
            <div className="work-card__menu-container" ref={menuContainerRef}>
              <button
                type="button"
                className="work-card__dots-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                aria-label="Opções do episódio"
                title="Opções"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <circle cx="12" cy="5" r="2.2" />
                  <circle cx="12" cy="12" r="2.2" />
                  <circle cx="12" cy="19" r="2.2" />
                </svg>
              </button>

              {menuOpen && (
                <div className="work-card__menu-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="work-card__menu-item"
                    disabled={markWatchedMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                      markWatchedMutation.mutate();
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {markWatchedMutation.isPending ? 'Marcando…' : 'Marcar como visto'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="work-card__info-regular">
          <Link to={destination} className="work-card__title" title={work.title}>
            {work.title}
          </Link>
          <div className="work-card__audio-badge">
            {audioLabel}
          </div>
        </div>
      )}
    </div>
  );
}
