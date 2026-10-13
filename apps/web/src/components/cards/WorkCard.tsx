import React from 'react';
import { Link } from 'react-router-dom';
import { Work } from '../../lib/types';
import { getPosterUrl, labelKind } from '../../lib/utils';
import { Badge } from '../ui/Badge';

export function WorkCard({ work, showProgress, progressPercent }: { work: Work; showProgress?: boolean; progressPercent?: number }) {
  const posterUrl = getPosterUrl(work);
  const initial = work.title ? work.title.charAt(0).toUpperCase() : '?';

  return (
    <Link to={`/title/${work.id}`} className="work-card">
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
        {showProgress && progressPercent !== undefined && (
          <div className="work-card__progress">
            <div className="work-card__progress-bar" style={{ width: `${progressPercent}%` }}></div>
          </div>
        )}
      </div>
      <h3 className="work-card__title">{work.title}</h3>
    </Link>
  );
}
