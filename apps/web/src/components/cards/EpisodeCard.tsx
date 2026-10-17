import React from 'react';
import { Episode } from '../../lib/types';
import { getEpisodeThumbnail, getMetaField } from '../../lib/utils';

export function EpisodeCard({ episode, workTitle, onClick }: { episode: Episode; workTitle?: string; onClick?: () => void }) {
  const thumbnail = getEpisodeThumbnail(episode);
  const duration = getMetaField<number>(episode.metadata, 'duration_minutes') || getMetaField<number>(episode.metadata, 'runtime');

  return (
    <button type="button" className="episode-card" onClick={onClick}>
      <div className="episode-card__number">{episode.number}</div>
      <div className="episode-card__thumbnail-wrapper">
        {thumbnail ? (
          <img src={thumbnail} alt={episode.title || `Episode ${episode.number}`} className="episode-card__thumbnail" loading="lazy" />
        ) : (
          <div className="episode-card__placeholder"><span aria-hidden="true" /></div>
        )}
      </div>
      <div className="episode-card__content">
        <div className="episode-card__header">
          <h4 className="episode-card__title">{episode.title || `Episode ${episode.number}`}</h4>
          {duration && <span className="episode-card__duration">{duration}m</span>}
        </div>
        {episode.synopsis && <p className="episode-card__synopsis">{episode.synopsis}</p>}
      </div>
    </button>
  );
}
