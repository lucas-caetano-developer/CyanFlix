import { useEffect, useRef } from 'react';
import { collectSpatialCandidates, focusSpatialElement } from '../lib/spatialNavigation';

/**
 * Keeps Tab and directional focus inside an open dialog, closes it with Escape
 * and restores focus to the control that opened it.
 */
export function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const preferred = dialog?.querySelector<HTMLElement>('[data-autofocus], input:not([disabled]), select:not([disabled]), button:not([disabled])');
      preferred?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      const target = event.target;
      if (dialogRef.current && target instanceof HTMLInputElement
        && (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color'].includes(target.type)) {
        // Up/Down do not move a caret in a single-line field, so they can leave
        // the field without taking Left/Right text editing away from the viewer.
        const focusable = collectSpatialCandidates(dialogRef.current);
        const index = focusable.indexOf(target);
        const destination = event.key === 'ArrowDown' ? focusable[index + 1] : focusable[index - 1];
        if (destination) {
          event.preventDefault();
          event.stopPropagation();
          focusSpatialElement(destination);
        }
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = collectSpatialCandidates(dialogRef.current);
      if (focusable.length === 0) return;
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

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, [open]);

  return dialogRef;
}
