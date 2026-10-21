import { useEffect, useRef } from 'react';

export function TrailerDialog({
  title,
  src,
  poster,
  onClose,
}: {
  title: string;
  src: string;
  poster?: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], video[controls], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="title-page__trailer" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="title-page__trailer-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="title-page-trailer-heading"
        data-spatial-scope="trailer-dialog"
        data-spatial-overlay="true"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="title-page-trailer-heading" className="sr-only">Trailer de {title}</h2>
        <button
          ref={closeRef}
          type="button"
          className="title-page__trailer-close"
          aria-label="Fechar trailer"
          onClick={onClose}
        >
          ×
        </button>
        <video
          src={src}
          poster={poster ?? undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
        >
          Seu navegador não oferece suporte à reprodução de vídeo.
        </video>
      </div>
    </div>
  );
}
