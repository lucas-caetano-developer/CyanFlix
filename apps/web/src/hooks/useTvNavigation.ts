import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const selector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useTvNavigation(rootId: string) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select') || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(event.key)) return;
      if (event.key === 'Backspace') { event.preventDefault(); navigate(-1); return; }
      const root = document.getElementById(rootId);
      if (!root) return;
      const candidates = [...root.querySelectorAll<HTMLElement>(selector)].filter((element) => element.offsetParent !== null);
      if (!candidates.length) return;
      const current = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
      if (!current) { event.preventDefault(); candidates[0].focus(); return; }
      const origin = center(current.getBoundingClientRect());
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
      const next = candidates.filter((element) => element !== current).map((element) => {
        const point = center(element.getBoundingClientRect());
        const primary = (vertical ? point.y - origin.y : point.x - origin.x) * direction;
        const secondary = Math.abs(vertical ? point.x - origin.x : point.y - origin.y);
        return { element, primary, score: primary * 10 + secondary };
      }).filter((entry) => entry.primary > 3).sort((left, right) => left.score - right.score)[0]?.element;
      if (next) { event.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, rootId]);
}

function center(rect: DOMRect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }
