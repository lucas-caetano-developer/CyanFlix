import { useEffect, useRef } from 'react';

const PREFIX = 'cyanflix:scroll:';

function readScroll(key: string): number | null {
  try {
    const value = sessionStorage.getItem(PREFIX + key);
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeScroll(key: string, top: number): void {
  try {
    sessionStorage.setItem(PREFIX + key, String(top));
  } catch {
    // Storage can be unavailable in private browsing; scroll restoration is optional.
  }
}

export function clearScrollRestoration(): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Session storage is optional and may be unavailable.
  }
}

export function useScrollRestoration(key: string, ready = true): void {
  const restoredKey = useRef<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writeScroll(key, window.scrollY);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      writeScroll(key, window.scrollY);
    };
  }, [key]);

  useEffect(() => {
    if (!ready || restoredKey.current === key) return;
    restoredKey.current = key;
    const saved = readScroll(key);
    if (saved === null) {
      window.scrollTo(0, 0);
      return;
    }
    const frame = requestAnimationFrame(() => window.scrollTo(0, saved));
    return () => cancelAnimationFrame(frame);
  }, [key, ready]);
}
