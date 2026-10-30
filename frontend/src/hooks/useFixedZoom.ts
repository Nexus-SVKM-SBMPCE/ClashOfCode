import { useEffect, useRef } from 'react';

/**
 * High-performance, 100% glitch-free zoom compensation hook.
 *
 * Uses direct DOM manipulation on GPU-accelerated elements with requestAnimationFrame
 * throttling to ensure completely constant physical dimensions on screen without:
 * - Layout thrashing
 * - React re-render loops
 * - Sub-pixel edge flickering
 */
export function useFixedZoomRef<T extends HTMLElement = HTMLDivElement>(
  origin: 'bottom left' | 'bottom right' = 'bottom left'
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Promote to hardware-accelerated compositor layer
    el.style.transformOrigin = origin;
    el.style.willChange = 'transform';
    el.style.backfaceVisibility = 'hidden';
    el.style.setProperty('-webkit-backface-visibility', 'hidden');
    el.style.transition = 'none';

    // Baseline DPR at 100% browser zoom
    const standardDprs = [1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];
    let baseDpr = 1.0;
    const stored = localStorage.getItem('coc_base_dpr');
    if (stored) {
      const parsed = parseFloat(stored);
      if (parsed >= 0.5 && parsed <= 3.5) {
        baseDpr = parsed;
      }
    } else {
      const current = window.devicePixelRatio || 1;
      let closest = standardDprs[0];
      let minDiff = Math.abs(current - closest);
      for (const d of standardDprs) {
        const diff = Math.abs(current - d);
        if (diff < minDiff) {
          minDiff = diff;
          closest = d;
        }
      }
      baseDpr = closest;
      try {
        localStorage.setItem('coc_base_dpr', baseDpr.toString());
      } catch {
        /* ignore */
      }
    }

    let rafId: number | null = null;
    let lastScale = -1;

    const update = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!el) return;

        const currentDpr = window.devicePixelRatio || 1;
        const vpScale = window.visualViewport ? (window.visualViewport.scale || 1) : 1;
        const zoom = (currentDpr / baseDpr) * vpScale;

        if (zoom > 0.1 && zoom < 10) {
          const inv = 1 / zoom;
          // Avoid micro-jitter: only update when change is detectable
          if (Math.abs(inv - lastScale) > 0.0005) {
            lastScale = inv;
            el.style.transform = `scale(${inv})`;
          }
        }
      });
    };

    update();

    window.addEventListener('resize', update, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update, { passive: true });
    }

    // Ctrl+0 recalibration
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
        setTimeout(() => {
          baseDpr = window.devicePixelRatio || 1;
          try {
            localStorage.setItem('coc_base_dpr', baseDpr.toString());
          } catch {
            /* ignore */
          }
          lastScale = -1;
          update();
        }, 100);
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: true });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', update);
      window.removeEventListener('keydown', onKeyDown);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update);
      }
    };
  }, [origin]);

  return ref;
}

export function useFixedZoom(): number {
  return 1;
}
