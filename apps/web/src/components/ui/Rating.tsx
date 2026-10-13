import React from 'react';

export function Rating({ value, source, votes }: { value: number; source: string; votes?: number }) {
  return (
    <div className="rating">
      <span className="rating__star">★</span>
      <span className="rating__value">{value.toFixed(1)}</span>
      <span className="rating__source">{source}</span>
      {votes !== undefined && (
        <span className="rating__votes">({votes.toLocaleString()})</span>
      )}
    </div>
  );
}
