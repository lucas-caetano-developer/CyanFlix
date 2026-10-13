import React from 'react';

export function Spinner({ size = 'md', fullScreen }: { size?: 'sm' | 'md'; fullScreen?: boolean }) {
  const spinnerClass = `spinner ${size === 'sm' ? 'spinner--sm' : ''}`;
  
  if (fullScreen) {
    return (
      <div className="spinner-container">
        <div className={spinnerClass}></div>
      </div>
    );
  }

  return <div className={spinnerClass}></div>;
}
