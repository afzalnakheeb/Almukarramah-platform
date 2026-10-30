// Motion on the website: quiet reveals as sections come into view, hover states, the compact header and page fades.
// Everything is driven by data-* attributes (react-native-web's dataSet) and the stylesheet in app/+html.tsx, so no
// animation library is needed. Content is never hidden before this runs: the hidden state only applies once
// <html data-motion="on"> is set after hydration, and only to elements that are below the fold at that moment.
// Without JavaScript or IntersectionObserver nothing is ever hidden. The iPhone and Android apps stay static.
import { Platform } from 'react-native';

type DataValue = string | number | boolean | null | undefined;

/** data-* attributes on the website (dataSet in react-native-web); nothing in the apps. Spread onto a View, Pressable, Text or Link:
 *  `<View {...data({ hover: 'tile' })} />` renders `<div data-hover="tile">`. One call per element (a second spread replaces the first). */
export function data(set: Record<string, DataValue>): object {
  if (Platform.OS !== 'web') return {};
  const out: Record<string, string> = {};
  for (const k in set) {
    const v = set[k];
    if (v !== undefined && v !== null && v !== false) out[k] = v === true ? '' : String(v);
  }
  return { dataSet: out };
}

/** Rise and fade in when it enters the view. `i` staggers siblings that enter together by 80 ms each (0–4). */
export const reveal = (i = 0, extra?: Record<string, DataValue>) => data({ reveal: 'up', ri: Math.max(0, Math.min(4, i)), ...extra });

/** True when the visitor asked their device for less motion (web only). */
export function prefersReducedMotion() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

let booted = false;
/** True once the first page has hydrated; pages mounted after that (client navigation) fade in. */
export const motionBooted = () => booted;

/**
 * Starts the reveal observer once, after the first page has hydrated (called from Screen). Elements already on screen
 * (or above it) are marked shown before reveals are switched on, so nothing visible ever blinks; the rest are hidden
 * off screen and revealed by an IntersectionObserver. Elements added later (new pages, more products) are picked up
 * by a MutationObserver. Anything scrolled past without being seen (an anchor jump) is shown too.
 */
export function bootMotion() {
  if (booted || Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') return;
  booted = true;
  // Wait two frames: right after hydration the page re-renders once for the real screen width (useWide), and the
  // "already on screen" check must see that final layout.
  const raf = (f: () => void) => (typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(() => f()) : window.setTimeout(f, 16));
  raf(() => raf(start));
}

function start() {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined' || !document.body) return;
  try {
    const show = (el: Element) => el.setAttribute('data-shown', '');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting || (e.boundingClientRect.bottom < 0 && e.boundingClientRect.height > 0)) {
          show(e.target);
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0 });
    const track = (el: Element, initial: boolean) => {
      if (el.hasAttribute('data-shown')) return;
      if (initial && el.getBoundingClientRect().top < window.innerHeight) { show(el); return; }
      io.observe(el);
    };
    document.querySelectorAll('[data-reveal]').forEach((el) => track(el, true));
    new MutationObserver((list) => {
      for (const m of list) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          if (el.matches('[data-reveal]')) track(el, false);
          el.querySelectorAll('[data-reveal]').forEach((c) => track(c, false));
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
    document.documentElement.setAttribute('data-motion', prefersReducedMotion() ? 'reduced' : 'on');
  } catch {
    // Never leave content hidden because of a motion error.
    document.documentElement.removeAttribute('data-motion');
  }
}
