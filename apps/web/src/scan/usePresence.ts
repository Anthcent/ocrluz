import { useEffect, useState } from 'react';

/**
 * Keeps an overlay mounted long enough to play its exit transition.
 * `shown` flips one frame after mount so CSS transitions can run on enter.
 */
export function usePresence(open: boolean, exitMs = 200) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);

  return { mounted: mounted || open, shown: shown && open };
}

/** True when the primary pointer is coarse (phones, tablets). */
export const isTouchFirst = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
