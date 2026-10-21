import React, { useEffect, useState } from 'react';
import { Episode } from '../../lib/types';
import { formatDuration, getEpisodeThumbnail, getMetaField } from '../../lib/utils';

export function EpisodeCard({
  episode,
  workTitle,
  progressPercent,
  onClick,
}: {
  episode: Episode;
  workTitle?: string;
  progressPercent?: number;
  onClick?: () => void;
}) {
  const thumbnail = getEpisodeThumbnail(episode);
  const duration = getMetaField<number>(episode.metadata, 'duration_minutes') || getMetaField<number>(episode.metadata, 'runtime');
  const title = episode.title?.trim() || `Episódio ${episode.number}`;
  const durationLabel = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? formatDuration(duration) : null;
  const progress = typeof progressPercent === 'number' && Number.isFinite(progressPercent)
    ? Math.min(100, Math.max(0, progressPercent))
    : undefined;
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>(thumbnail ? 'loading' : 'error');

  useEffect(() => {
    setImageStatus(thumbnail ? 'loading' : 'error');
  }, [thumbnail]);

  const accessibleLabel = [
    workTitle,
    `Episódio ${episode.number}: ${title}`,
    durationLabel ? `Duração ${durationLabel}` : null,
    progress && progress > 0 ? `${Math.round(progress)}% assistido` : null,
  ].filter(Boolean).join('. ');

  return (
    <button
      type="button"
      className={`episode-card${progress && progress > 0 ? ' episode-card--in-progress' : ''}`}
      onClick={onClick}
      aria-label={accessibleLabel}
      data-spatial-item="episode"
    >
      <div className="episode-card__number" aria-hidden="true">
        <small>EP</small>
        <span>{String(episode.number).padStart(2, '0')}</span>
      </div>

      <div className="episode-card__thumbnail-wrapper">
        {thumbnail && imageStatus !== 'error' ? (
          <img
            src={thumbnail}
            alt=""
            className={`episode-card__thumbnail${imageStatus === 'loaded' ? ' episode-card__thumbnail--loaded' : ''}`}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setImageStatus('loaded')}
            onError={() => setImageStatus('error')}
          />
        ) : (
          <div className="episode-card__placeholder" aria-hidden="true"><span /></div>
        )}
        {progress !== undefined && progress > 0 && (
          <div className="episode-card__progress" title={`${Math.round(progress)}% assistido`}>
            <progress
              className="episode-card__progress-bar"
              value={progress}
              max="100"
              aria-label={`${Math.round(progress)}% assistido`}
            />
          </div>
        )}
      </div>

      <div className="episode-card__content">
        <div className="episode-card__header">
          <h4 className="episode-card__title" title={title}>{title}</h4>
          {durationLabel && <span className="episode-card__duration">{durationLabel}</span>}
        </div>
        {episode.synopsis && <p className="episode-card__synopsis" title={episode.synopsis}>{episode.synopsis}</p>}
      </div>
    </button>
  );
}
