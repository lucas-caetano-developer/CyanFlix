export type SpatialDirection = 'up' | 'down' | 'left' | 'right';

export const SPATIAL_FOCUS_ATTRIBUTE = 'data-spatial-focus';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  'summary',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])',
  '[role="slider"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(',');

export function isTextEntryTarget(target: Element | null): boolean {
  if (!target) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const control = target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="spinbutton"], [role="combobox"]');
  if (!control) return false;
  if (control instanceof HTMLInputElement && ['button', 'checkbox', 'radio', 'submit', 'reset'].includes(control.type)) {
    return false;
  }
  return true;
}

export function isSpatialElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false;
  if (element.tabIndex < 0) return false;
  if (element.closest('[inert], [hidden], [data-spatial-skip]')) return false;
  if (element.closest('[aria-hidden="true"]')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;

  // getClientRects is layout-based and also rejects elements without a rendered box.
  return element.getClientRects().length > 0;
}

export function collectSpatialCandidates(root: ParentNode): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const candidates: HTMLElement[] = [];
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))) {
    if (seen.has(element) || !isSpatialElement(element)) continue;
    seen.add(element);
    candidates.push(element);
  }
  return candidates;
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function center(rect: Rect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function overlap(startA: number, endA: number, startB: number, endB: number): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

/**
 * Chooses the nearest eligible control in the requested direction.
 * The score favours alignment on the perpendicular axis and never wraps around.
 * Horizontal movement inside a carousel stays within its rail.
 */
export function findSpatialDestination(
  candidates: HTMLElement[],
  current: HTMLElement,
  direction: SpatialDirection,
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const origin = center(currentRect);
  const vertical = direction === 'up' || direction === 'down';
  const forward = direction === 'down' || direction === 'right' ? 1 : -1;
  // Horizontal movement inside a carousel rail stays card-to-card. At the
  // rail boundary it stops instead of jumping to unrelated controls above.
  const currentRail = vertical ? null : current.closest('[data-spatial-row]');
  let best: { element: HTMLElement; score: number } | null = null;

  for (const candidate of candidates) {
    if (candidate === current) continue;
    if (currentRail && !currentRail.contains(candidate)) continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const point = center(rect);

    const primaryDelta = vertical ? point.y - origin.y : point.x - origin.x;
    if (primaryDelta * forward <= 2) continue;

    const secondaryDelta = Math.abs(vertical ? point.x - origin.x : point.y - origin.y);
    const primaryCenter = Math.abs(primaryDelta);
    const primaryGap = vertical
      ? forward > 0 ? Math.max(0, rect.top - currentRect.bottom) : Math.max(0, currentRect.top - rect.bottom)
      : forward > 0 ? Math.max(0, rect.left - currentRect.right) : Math.max(0, currentRect.left - rect.right);
    const crossOverlap = vertical
      ? overlap(currentRect.left, currentRect.right, rect.left, rect.right)
      : overlap(currentRect.top, currentRect.bottom, rect.top, rect.bottom);

    // Center distance keeps movement predictable; cross-axis distance and gap
    // break ties without walking the DOM order. A real overlap earns a bonus.
    const score = primaryCenter + secondaryDelta * 1.35 + primaryGap * 0.2 - Math.min(72, crossOverlap * 0.32);
    if (!best || score < best.score) best = { element: candidate, score };
  }

  return best?.element ?? null;
}

function isScrollable(element: HTMLElement, axis: 'x' | 'y'): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  if (!/(auto|scroll)/.test(overflow)) return false;
  return axis === 'x'
    ? element.scrollWidth > element.clientWidth + 1
    : element.scrollHeight > element.clientHeight + 1;
}

function prefersReducedMotion(element: HTMLElement): boolean {
  return element.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Scrolls only the containers that actually need it. A card inside a carousel
 * moves the rail horizontally; only controls outside the viewport move the page.
 */
export function scrollSpatialElementIntoView(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  if (!view) return;
  const behavior: ScrollBehavior = prefersReducedMotion(element) ? 'auto' : 'smooth';
  const margin = 18;
  const insideOverlay = Boolean(element.closest('[data-spatial-overlay]'));

  let parent = element.parentElement;
  while (parent && parent !== element.ownerDocument.body && parent !== element.ownerDocument.documentElement) {
    const rect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    if (isScrollable(parent, 'x')) {
      const left = rect.left - parentRect.left;
      const right = rect.right - parentRect.left;
      if (left < margin) scrollBy(parent, { left: left - margin, behavior });
      else if (right > parent.clientWidth - margin) scrollBy(parent, { left: right - parent.clientWidth + margin, behavior });
    }
    if (isScrollable(parent, 'y')) {
      const top = rect.top - parentRect.top;
      const bottom = rect.bottom - parentRect.top;
      if (top < margin) scrollBy(parent, { top: top - margin, behavior });
      else if (bottom > parent.clientHeight - margin) scrollBy(parent, { top: bottom - parent.clientHeight + margin, behavior });
    }
    parent = parent.parentElement;
  }

  if (insideOverlay) return;

  const rect = element.getBoundingClientRect();
  const topMargin = 24;
  const bottomMargin = 24;
  if (rect.top < topMargin) {
    scrollBy(view, { top: rect.top - topMargin, behavior });
  } else if (rect.bottom > view.innerHeight - bottomMargin) {
    scrollBy(view, { top: rect.bottom - view.innerHeight + bottomMargin, behavior });
  }
}

function scrollBy(
  target: Pick<Window, 'scrollBy'> | Pick<HTMLElement, 'scrollBy'>,
  options: ScrollToOptions,
): void {
  if (typeof target.scrollBy === 'function') target.scrollBy(options);
}

export function focusSpatialElement(element: HTMLElement): void {
  element.ownerDocument.querySelectorAll<HTMLElement>(`[${SPATIAL_FOCUS_ATTRIBUTE}]`).forEach((focused) => {
    focused.removeAttribute(SPATIAL_FOCUS_ATTRIBUTE);
  });
  element.setAttribute(SPATIAL_FOCUS_ATTRIBUTE, 'true');
  element.focus({ preventScroll: true });
  scrollSpatialElementIntoView(element);
}

export function clearSpatialFocus(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(`[${SPATIAL_FOCUS_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(SPATIAL_FOCUS_ATTRIBUTE);
  });
}
