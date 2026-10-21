import React from 'react';

export function Rating({ value, source, votes, scale }: { value: number; source: string; votes?: number; scale?: number }) {
  const voteLabel = votes !== undefined && votes > 0 ? votes.toLocaleString('pt-BR') : null;
  const accessibleLabel = [
    `${source}: ${value.toFixed(1)}${scale ? ` de ${scale}` : ''}`,
    voteLabel ? `${voteLabel} votos` : null,
  ].filter(Boolean).join(', ');

  return (
    <div className="rating" role="group" aria-label={accessibleLabel}>
      <span className="rating__star" aria-hidden="true">★</span>
      <span className="rating__value">{value.toFixed(1)}</span>
      {scale && <span className="rating__scale" aria-hidden="true">/{scale}</span>}
      <span className="rating__source">{source}</span>
      {voteLabel && (
        <span className="rating__votes">({voteLabel})</span>
      )}
    </div>
  );
}
