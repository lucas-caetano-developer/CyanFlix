import type { KeyboardEvent } from 'react';
import { Season } from '../../lib/types';

export const SEASON_PANEL_ID = 'episode-season-panel';

export function getSeasonTabId(season: Pick<Season, 'id'>): string {
  return `season-tab-${season.id}`;
}

export function seasonLabel(season: Season): string {
  const title = season.title?.trim();
  if (title) return title;
  if (season.number === 0) return 'Especiais';
  return `Temporada ${season.number}`;
}

export function SeasonSelector({
  seasons,
  currentSeason,
  onSelect,
}: {
  seasons: Season[];
  currentSeason?: Season;
  onSelect: (season: Season) => void;
}) {
  if (seasons.length <= 1) return null;

  const activeIndex = Math.max(0, seasons.findIndex((season) => season.id === currentSeason?.id));

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % seasons.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + seasons.length) % seasons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = seasons.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    onSelect(seasons[nextIndex]);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs?.[nextIndex]?.focus();
  };

  return (
    <div className="title-page__season-selector" role="tablist" aria-label="Selecionar temporada">
      {seasons.map((season, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={season.id}
            id={getSeasonTabId(season)}
            type="button"
            role="tab"
            className={`title-page__season-tab${active ? ' title-page__season-tab--active' : ''}`}
            aria-selected={active}
            aria-controls={SEASON_PANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(season)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {seasonLabel(season)}
          </button>
        );
      })}
    </div>
  );
}
