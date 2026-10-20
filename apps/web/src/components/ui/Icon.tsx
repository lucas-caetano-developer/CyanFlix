type IconName = 'back' | 'play' | 'pause' | 'volume' | 'muted' | 'pip' | 'fullscreen' | 'exit-fullscreen' | 'info' | 'chevron-left' | 'chevron-right' | 'rotate';

export function Icon({ name }: { name: IconName }) {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {name === 'back' && <path d="M20 11H7.8l4.6-4.6L11 5l-7 7 7 7 1.4-1.4L7.8 13H20z" />}
    {name === 'play' && <path d="M8 5v14l11-7z" />}
    {name === 'pause' && <path d="M7 5h4v14H7zm6 0h4v14h-4z" />}
    {name === 'volume' && <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16 8.2a5 5 0 0 1 0 7.6M18.5 5.7a8.5 8.5 0 0 1 0 12.6" fill="none" stroke="currentColor" strokeWidth="2" /></>}
    {name === 'muted' && <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m16 9 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2" /></>}
    {name === 'pip' && <><rect x="3" y="5" width="18" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="2" /><rect x="12" y="11" width="7" height="5" rx="1" /></>}
    {name === 'fullscreen' && <path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z" />}
    {name === 'exit-fullscreen' && <path d="M9 4v5H4V7h3V4zm6 0h2v3h3v2h-5zM4 15h5v5H7v-3H4zm11 0h5v2h-3v3h-2z" />}
    {name === 'info' && <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M11 10.5h2V17h-2zm0-3.5h2v2h-2z" /></>}
    {name === 'chevron-left' && <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {name === 'chevron-right' && <path d="m9.5 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {name === 'rotate' && <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>;
}
