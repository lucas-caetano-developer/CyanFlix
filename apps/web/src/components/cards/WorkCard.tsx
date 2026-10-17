import React from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getPosterUrl, labelKind } from '../../lib/utils';
import { Badge } from '../ui/Badge';

export function WorkCard({ work, showProgress, progressPercent }: { work: Work; showProgress?: boolean; progressPercent?: number }) {
  const posterUrl = getPosterUrl(work);
  const initial = work.title ? work.title.charAt(0).toUpperCase() : '?';
  const resume = work.continueWatching;
  const destination = resume ? `/watch/${resume.itemType}/${resume.itemId}` : `/title/${work.id}`;
  const effectiveProgress = resume?.progressPercent ?? progressPercent;

  return (
    <Link to={destination} className="work-card">
      <div className="work-card__poster-wrapper">
        {posterUrl ? (
          <img src={posterUrl} alt={work.title} className="work-card__poster" loading="lazy" />
        ) : (
          <div className="work-card__placeholder">
            <span>{initial}</span>
          </div>
        )}
        <div className="work-card__overlay">
          <h3 className="work-card__title-hover">{work.title}</h3>
        </div>
        <div className="work-card__badge-corner">
          <Badge variant={`kind-${work.contentKind}`} label={labelKind(work.contentKind)} />
        </div>
        {(showProgress || resume) && effectiveProgress !== undefined && (
          <div className="work-card__progress">
            <progress className="work-card__progress-bar" value={effectiveProgress} max="100" aria-label={`${Math.round(effectiveProgress)}% assistido`} />
          </div>
        )}
      </div>
      <h3 className="work-card__title">{work.title}</h3>
      {resume?.itemType === 'episode' && (
        <div className="work-card__resume-label">
          T{resume.seasonNumber ?? '?'} E{resume.episodeNumber ?? '?'}{resume.episodeTitle ? ` · ${resume.episodeTitle}` : ''}
        </div>
      )}
    </Link>
  );
}
