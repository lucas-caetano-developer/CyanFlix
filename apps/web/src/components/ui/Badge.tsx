import React from 'react';

export function Badge({ variant, label }: { variant: string; label: string }) {
  let className = 'badge';
  
  if (variant === 'kind-anime') {
    className += ' badge--anime';
  } else if (variant.startsWith('kind-')) {
    className += ' badge--kind';
  } else {
    className += ` badge--${variant}`;
  }

  return <span className={className}>{label}</span>;
}
