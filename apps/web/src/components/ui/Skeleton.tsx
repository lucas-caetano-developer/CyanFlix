import React from 'react';

export function Skeleton({ variant, count = 1 }: { variant: string; count?: number }) {
  const skeletons = Array.from({ length: count }, (_, i) => i);
  
  return (
    <React.Fragment>
      {skeletons.map((i) => (
        <div key={i} className={`skeleton skeleton--${variant}`}></div>
      ))}
    </React.Fragment>
  );
}
