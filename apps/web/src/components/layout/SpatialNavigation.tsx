import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  clearSpatialFocus,
  collectSpatialCandidates,
  findSpatialDestination,
  focusSpatialElement,
  isSpatialElement,
  isTextEntryTarget,
  type SpatialDirection,
} from '../../lib/spatialNavigation';

const ROOT_ROUTES = new Set(['/browse', '/profiles', '/login', '/admin']);
const DIRECTION_BY_KEY: Record<string, SpatialDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function isRendered(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function visibleScope(selector: string): HTMLElement | null {
  const scopes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (isRendered(scopes[index])) return scopes[index];
  }
  return null;
}

function findScope(active: HTMLElement | null): HTMLElement | null {
  const closest = active?.closest<HTMLElement>('[data-spatial-scope]');
  if (closest && isRendered(closest)) return closest;
  return visibleScope('[data-spatial-scope]:not([data-spatial-overlay])');
}

function canNavigateBack(): boolean {
  if (typeof window === 'undefined') return false;
  const index = window.history.state?.idx;
  return typeof index === 'number' ? index > 0 : window.history.length > 1;
}

/**
 * One document-level listener supplies directional navigation for every
 * registered scope. Local controls (forms, player, dialogs and menus) keep
 * their own keyboard behaviour; this component only moves focus.
 */
export function SpatialNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location.pathname);
  locationRef.current = location.pathname;

  useEffect(() => {
    clearSpatialFocus();
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      document.body.dataset.input = event.pointerType === 'touch' ? 'touch' : 'pointer';
      clearSpatialFocus();
    };

    const onFocusOut = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) event.target.removeAttribute('data-spatial-focus');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.key === 'Escape' || event.key === 'GoBack' || event.key === 'BrowserBack') {
        if (isTextEntryTarget(target)) return;
        const overlay = visibleScope('[data-spatial-overlay]');
        const player = visibleScope('[data-spatial-player]');
        if (overlay || player || document.fullscreenElement) return;
        if (locationRef.current && ROOT_ROUTES.has(locationRef.current)) return;

        event.preventDefault();
        if (canNavigateBack()) navigate(-1);
        else navigate('/browse', { replace: true });
        return;
      }

      const direction = DIRECTION_BY_KEY[event.key];
      if (!direction) return;
      if (isTextEntryTarget(target)) return;

      document.body.dataset.input = 'keyboard';
      const player = visibleScope('[data-spatial-player]');
      const overlay = visibleScope('[data-spatial-overlay]');

      let scope: HTMLElement | null = null;
      if (player && !overlay) {
        // The player owns arrows while the video itself has focus. Once the
        // viewer focuses a control, directional navigation takes over.
        if (!active || !player.contains(active) || !isSpatialElement(active)) return;
        scope = player;
      } else if (overlay) {
        scope = overlay;
      } else {
        scope = findScope(active);
      }
      if (!scope) return;

      const candidates = collectSpatialCandidates(scope);
      if (candidates.length === 0) return;

      const current = active && scope.contains(active) && isSpatialElement(active) && candidates.includes(active)
        ? active
        : null;

      if (!current) {
        const preferred = scope.querySelector<HTMLElement>('[data-spatial-initial]');
        const destination = preferred && candidates.includes(preferred) ? preferred : candidates[0];
        event.preventDefault();
        focusSpatialElement(destination);
        return;
      }

      const destination = findSpatialDestination(candidates, current, direction);
      if (!destination) return;
      event.preventDefault();
      focusSpatialElement(destination);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [navigate]);

  return null;
}
