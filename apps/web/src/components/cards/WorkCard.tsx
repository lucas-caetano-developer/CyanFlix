import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getAssetUrl, getCertification, getGenres, getPosterUrl, labelKind } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';

export function WorkCard({
  work,
  showProgress,
  progressPercent,
  showKindBadge = true,
}: {
  work: Work;
  showProgress?: boolean;
  progressPercent?: number;
  showKindBadge?: boolean;
}) {
  const posterUrl = getPosterUrl(work);
  const resume = work.continueWatching;
  const landscape = Boolean(resume);
  const landscapeArtworkUrl = getAssetUrl(work.assets, 'backdrop-card', 'backdrop', 'hero');
  const artworkUrl = landscape ? (landscapeArtworkUrl ?? posterUrl) : posterUrl;
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>(artworkUrl ? 'loading' : 'error');

  useEffect(() => {
    setImageStatus(artworkUrl ? 'loading' : 'error');
  }, [artworkUrl]);

  const initial = work.title ? work.title.charAt(0).toUpperCase() : '?';
  const destination = resume ? `/watch/${resume.itemType}/${resume.itemId}` : `/title/${work.id}`;
  const effectiveProgress = resume?.progressPercent ?? progressPercent;
  const normalizedProgress = typeof effectiveProgress === 'number' && Number.isFinite(effectiveProgress)
    ? Math.min(100, Math.max(0, effectiveProgress))
    : undefined;
  const certification = getCertification(work.metadata);
  const genres = getGenres(work.metadata).slice(0, 2);
  const hoverDetails = [work.year, certification, genres.join(' · ')].filter(Boolean).join(' · ');
  const accessibleLabel = [
    resume ? `Continuar ${work.title}` : work.title,
    showKindBadge && labelKind(work.contentKind) !== work.title ? labelKind(work.contentKind) : null,
    resume?.itemType === 'episode'
      ? `T${resume.seasonNumber ?? '?'} E${resume.episodeNumber ?? '?'}${resume.episodeTitle ? ` · ${resume.episodeTitle}` : ''}`
      : null,
    normalizedProgress !== undefined && normalizedProgress > 0 ? `${Math.round(normalizedProgress)}% assistido` : null,
  ].filter(Boolean).join('. ');

  return (
    <Link
      to={destination}
      aria-label={accessibleLabel}
      className={`work-card${landscape ? ' work-card--landscape' : ''}${resume ? ' work-card--continue' : ''}`}
      data-spatial-item="work"
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

        {landscape && (
          <span className="work-card__play" aria-hidden="true"><Icon name="play" /></span>
        )}

        {showKindBadge && (
          <div className="work-card__badge-corner">
            <Badge variant={`kind-${work.contentKind}`} label={labelKind(work.contentKind)} />
          </div>
        )}

        {(showProgress || resume) && normalizedProgress !== undefined && normalizedProgress > 0 && (
          <div className="work-card__progress" title={`${Math.round(normalizedProgress)}% assistido`}>
            <progress
              className="work-card__progress-bar"
              value={normalizedProgress}
              max="100"
              aria-label={`${Math.round(normalizedProgress)}% assistido`}
            />
          </div>
        )}
      </div>

      <h3 className="work-card__title" title={work.title}>{work.title}</h3>
      {resume?.itemType === 'episode' && (
        <div className="work-card__resume-label">
          <span className="work-card__resume-icon" aria-hidden="true"><Icon name="play" /></span>
          <span className="work-card__resume-text">
            T{resume.seasonNumber ?? '?'} E{resume.episodeNumber ?? '?'}{resume.episodeTitle ? ` · ${resume.episodeTitle}` : ''}
          </span>
        </div>
      )}
    </Link>
  );
}
