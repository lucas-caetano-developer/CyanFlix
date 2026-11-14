import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Work } from '../../lib/types';
import { getAssetUrl, getCertification, getGenres, getPosterUrl } from '../../lib/utils';
import { availabilityForWork } from '../../lib/catalog';
import { useProfileStore } from '../../stores/useProfileStore';
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
  const profileId = useProfileStore((state) => state.profileId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

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
  const genres = getGenres(work.metadata).slice(0, 2);
  const hoverDetails = [work.year, certification, genres.join(' · ')].filter(Boolean).join(' · ');

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

          <div className="work-card__overlay" aria-hidden="true">
            <h3 className="work-card__title-hover">{work.title}</h3>
            {hoverDetails && <span className="work-card__meta-hover">{hoverDetails}</span>}
          </div>

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
