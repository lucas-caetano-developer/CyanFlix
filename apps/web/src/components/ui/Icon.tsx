export type IconName = 'back' | 'play' | 'pause' | 'volume' | 'muted' | 'pip' | 'fullscreen' | 'exit-fullscreen' | 'settings' | 'info' | 'chevron-left' | 'chevron-right' | 'rotate' | 'search' | 'menu' | 'close' | 'logout' | 'filter' | 'check' | 'user' | 'trash';

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
    {name === 'settings' && <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 7h8m4 0h4M4 12h2m4 0h10M4 17h7m4 0h5" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="14" cy="17" r="2" />
    </g>}
    {name === 'info' && <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M11 10.5h2V17h-2zm0-3.5h2v2h-2z" /></>}
    {name === 'chevron-left' && <path d="M14.5 5 7.5 12l7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {name === 'chevron-right' && <path d="m9.5 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {name === 'rotate' && <path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
    {name === 'search' && <><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
    {name === 'menu' && <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    {name === 'logout' && <><path d="M10 4H5v16h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 8l4 4-4 4m4-4H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>}
    {name === 'filter' && <path d="M4 5h16l-6.2 7.1V19l-3.6-2v-4.9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />}
    {name === 'check' && <path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
    {name === 'user' && <><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
    {name === 'trash' && <><path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>;
}
