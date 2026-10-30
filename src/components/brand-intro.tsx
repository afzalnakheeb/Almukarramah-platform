// The first-visit brand intro (website only), approved by Afzal: the Kaaba corner.
//
//   0.3 s  a spark at the apex of the emblem (the corner of the Kaaba) on a dark field
//   0.8 s  fine gold lines draw the arch from the apex, down both sides
//   2.0 s  the photograph of the Kaaba corner opens outward from the centre line inside the emblem, with a slow
//          push-in and one pass of light
//   4.5 s  an ivory bloom spreads out from the emblem
//   4.8 s  the emblem settles into the centred logo and turns to ink; the wordmark, the gold rule and the tagline
//          ("For every Muslim home" / «لكل بيت مسلم») appear
//   6.8 s  the whole logo glides into the header's logo slot while the page fades in; at 7.7 s the overlay is gone
//
// The page is pre-rendered and painted underneath from the first byte: this is only an overlay, so search engines,
// LCP and hydration are untouched. Once per browser session, never for visitors who prefer less motion, never for
// crawlers, never on checkout or admin pages. A click, tap, scroll or key press skips to the end.
//
// The decision is taken before the first paint by a small script in app/+html.tsx (it sets <html data-intro>, which
// paints the dark field so the page never flashes, and preloads the photograph). This component then takes over.
// Design review: ?intro=play forces the intro; ?intro=2.5 freezes it at 2.5 s (screenshots); ?intro=0 disables it.
//
// Photograph: the Kaaba corner by Emad Alhusayni (licence handled by Afzal), cut to the emblem's box: pixels that can
// never show through the arch are flattened, so the WebP stays small (public/images/brand/emblem-kaaba.webp).
import React from 'react';
import { Platform } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { ARCH_LINES, LOGO_H, LOGO_INK, LOGO_OPACITY, LOGO_PATHS, LOGO_W } from './logo-data';
import { EMBLEM_PHOTO, lockup } from './logo-motion';

const INTRO_PHOTO = EMBLEM_PHOTO;
const END = 7.7;
const IVORY = '#F7F3EC';
const DARK = 'radial-gradient(ellipse at 50% 45%, #2a241d 0%, #14110e 55%, #0c0a08 100%)';
// The emblem (arch monogram) inside the logo's viewBox: the photograph's box, its centre and the apex.
const EM = { x: 708.1, y: 24.2, w: 184.1, h: 213.8, cx: 800.15, cy: 131.1, ax: 800.1, ay: 24.2 };

const cl = (x: number) => Math.min(1, Math.max(0, x));
const io = (x: number) => { x = cl(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eo = (x: number) => 1 - Math.pow(1 - cl(x), 3);
const r = (t: number, a: number, b: number) => cl((t - a) / (b - a));

/** Where things sit for a viewport: the emblem alone (centred, large), then the centred logo lock-up. */
function geometry(W: number, H: number) {
  const narrow = W < 700;
  const emH = Math.min(H * (narrow ? 0.46 : 0.56), (W * (narrow ? 0.7 : 0.5) * EM.h) / EM.w);
  const ws = emH / EM.h;
  const fs = narrow ? (W * 0.78) / LOGO_W : Math.min((W * 0.52) / LOGO_W, (H * 0.25) / LOGO_H);
  const lockH = LOGO_H * fs * 1.6; // the logo, the rule and the tagline (logo-motion lockup)
  const cy = H * (narrow ? 0.46 : 0.47);
  return { ws, tx0: W / 2 - EM.cx * ws, ty0: cy - EM.cy * ws, fs, fx: W / 2 - (LOGO_W * fs) / 2, fy: cy - lockH / 2 };
}

type Mode = { freeze?: number };

export function BrandIntro() {
  if (Platform.OS !== 'web') return null;
  return <BrandIntroWeb />;
}

function BrandIntroWeb() {
  const { t, isRTL } = useI18n();
  const [mode, setMode] = React.useState<Mode | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const root = React.useRef<HTMLDivElement | null>(null);

  // Decide after hydration (the server HTML never contains the overlay).
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    let q: string | null = null;
    try { q = new URLSearchParams(window.location.search).get('intro'); } catch { q = null; }
    const forced = q !== null && q !== '0';
    if (!forced && !html.hasAttribute('data-intro')) return;
    // A very slow script load: the dark field has already faded (failsafe in +html.tsx); do not start late.
    if (!forced && typeof performance !== 'undefined' && performance.now() > 3300) { html.removeAttribute('data-intro'); return; }
    const freeze = q && /^\d+(\.\d+)?$/.test(q) ? parseFloat(q) : undefined;
    setMode({ freeze });
  }, []);

  React.useEffect(() => {
    if (!mode || !root.current) return;
    const el = root.current;
    const $ = (id: string) => el.querySelector(`#ami-${id}`) as (SVGElement & HTMLElement) | null;
    const set = (id: string, a: string, v: string | number) => $(id)?.setAttribute(a, String(v));
    const lineBox = $('line') as HTMLElement | null;
    const lineRule = $('rule') as HTMLElement | null;
    const field = $('field') as HTMLElement | null;
    const dark = $('dark') as HTMLElement | null;
    const ivory = $('ivory') as HTMLElement | null;

    const render = (tt: number) => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      el.querySelector('svg')?.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const g0 = geometry(W, H);
      // the spark at the corner, 0.3-0.9, gone by 2.4
      set('spark', 'opacity', (io(r(tt, 0.3, 0.9)) * (1 - r(tt, 1.6, 2.4))).toFixed(3));
      set('spark', 'r', (10 + 6 * Math.sin(tt * 3)).toFixed(2));
      // gold lines from the apex: the outline 0.8-2.4, the opening 1.1-2.6; they fade as the photograph takes over
      ARCH_LINES.forEach((l, i) => {
        const p = i < 2 ? io(r(tt, 0.8, 2.4)) : io(r(tt, 1.1, 2.6));
        const path = $(`l${i}`);
        if (path) { path.style.strokeDashoffset = String(l.len * (1 - p)); path.style.opacity = String(1 - r(tt, 3.4, 4.2)); }
      });
      // the photograph opens outward from the centre line 2.0-3.7, pushes in 2.0-5.2, one pass of light 3.3-4.8
      const w = 110 * eo(r(tt, 2.0, 3.7));
      set('rev', 'x', (EM.cx - w).toFixed(2));
      set('rev', 'width', (2 * w).toFixed(2));
      const k = 1.1 - 0.1 * io(r(tt, 2.0, 5.2));
      set('ph', 'transform', `translate(${(EM.ax * (1 - k)).toFixed(2)} ${(EM.ay * (1 - k)).toFixed(2)}) scale(${k.toFixed(4)})`);
      set('sweep', 'x', (640 + 300 * io(r(tt, 3.3, 4.8))).toFixed(1));
      set('phg', 'opacity', (1 - r(tt, 6.05, 6.4)).toFixed(3));
      // to the centred lock-up 4.8-5.9, then into the header's logo slot 6.8-7.6
      const mv = io(r(tt, 4.8, 5.9));
      let S = g0.ws + (g0.fs - g0.ws) * mv;
      let X = g0.tx0 + (g0.fx - g0.tx0) * mv;
      let Y = g0.ty0 + (g0.fy - g0.ty0) * mv;
      const gl = io(r(tt, 6.8, 7.6));
      const slot = document.querySelector('[data-brandslot]');
      const sr = slot ? slot.getBoundingClientRect() : null;
      const hasSlot = !!sr && sr.width > 0 && sr.bottom > 0;
      if (gl > 0 && hasSlot && sr) {
        const Sh = sr.height / LOGO_H;
        S = g0.fs + (Sh - g0.fs) * gl; X = g0.fx + (sr.left - g0.fx) * gl; Y = g0.fy + (sr.top - g0.fy) * gl;
      }
      const tr = `translate(${X.toFixed(2)} ${Y.toFixed(2)}) scale(${S.toFixed(5)})`;
      set('em', 'transform', tr);
      set('word', 'transform', tr);
      set('ink', 'opacity', (LOGO_OPACITY * io(r(tt, 5.5, 6.2))).toFixed(3));
      set('word', 'opacity', (LOGO_OPACITY * io(r(tt, 5.8, 6.6))).toFixed(3));
      // the gold rule draws from the centre 6.0-6.6, the tagline follows 6.2-6.8; both ride with the logo
      if (lineBox && lineRule) {
        const hasLine = !!document.querySelector('[data-brandline]') && hasSlot;
        const f = S / g0.fs;
        const gap = lockup(LOGO_H * g0.fs).gap; // the same in both languages
        lineBox.style.transform = `translate(${(X + (LOGO_W * S) / 2).toFixed(2)}px, ${(Y + LOGO_H * S + gap * f).toFixed(2)}px) scale(${f.toFixed(5)}) translateX(-50%)`;
        lineBox.style.opacity = String(io(r(tt, 6.0, 6.5)) * (hasLine ? 1 : 1 - r(tt, 6.8, 7.15)));
        lineRule.style.transform = `scaleX(${eo(r(tt, 6.0, 6.6)).toFixed(4)})`;
        // the rule reads 1.5 px in the large lock-up and lands as the header's 1 px hairline
        lineRule.style.height = `${((1.5 - 0.5 * gl) / f).toFixed(3)}px`;
        const tag = lineBox.lastElementChild as HTMLElement | null;
        if (tag) tag.style.opacity = String(io(r(tt, 6.2, 6.8)));
      }
      // the field: dark until the ivory bloom has covered it (4.5-5.5), then the page fades in (6.85-7.6)
      if (dark && ivory && field) {
        const q = io(r(tt, 4.5, 5.5));
        dark.style.opacity = q >= 1 ? '0' : '1';
        ivory.style.opacity = q > 0 ? '1' : '0';
        const R = q * Math.hypot(W, H) * 1.05;
        const ex = X + EM.cx * S;
        const ey = Y + EM.cy * S;
        const mk = q >= 1 ? 'none' : `radial-gradient(circle at ${ex.toFixed(1)}px ${ey.toFixed(1)}px, #000 ${R.toFixed(1)}px, transparent ${(R + 380).toFixed(1)}px)`;
        ivory.style.maskImage = mk;
        (ivory.style as unknown as Record<string, string>).webkitMaskImage = mk;
        field.style.opacity = String(hasSlot ? 1 - io(r(tt, 6.85, 7.6)) : 1 - io(r(tt, 6.9, 7.6)));
      }
      // without a header slot (no site header on this page) the logo fades out with the field
      if (!hasSlot) el.style.opacity = String(1 - io(r(tt, 7.1, 7.7)));
    };

    // The overlay has painted its dark field: the pre-paint cover (+html.tsx) can go, and the header's logo stays
    // hidden until the intro's logo lands on it.
    const html = document.documentElement;
    html.setAttribute('data-intro', 'live');
    let raf = 0;
    let done = false;
    const finish = (skip: boolean) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      const end = () => { html.removeAttribute('data-intro'); setMode(null); };
      if (skip) { setLeaving(true); window.setTimeout(end, 280); } else end();
    };

    if (mode.freeze !== undefined) {
      const tt = mode.freeze;
      const draw = () => render(tt);
      draw();
      const again = window.setTimeout(draw, 400); // once fonts and layout have settled
      window.addEventListener('resize', draw);
      return () => { window.clearTimeout(again); window.removeEventListener('resize', draw); };
    }

    // The dark field may already have been on screen while the scripts loaded; start the spark without a second wait.
    const t0 = Math.min(0.3, Math.max(0, (typeof performance !== 'undefined' ? performance.now() : 0) / 1000 - 0.4));
    const start = performance.now() - t0 * 1000;
    const tick = (now: number) => {
      const tt = (now - start) / 1000;
      render(tt);
      if (tt >= END) finish(false);
      else raf = requestAnimationFrame(tick);
    };
    render(t0);
    raf = requestAnimationFrame(tick);
    const skip = () => finish(true);
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener('pointerdown', skip, opts);
    window.addEventListener('keydown', skip);
    window.addEventListener('wheel', skip, opts);
    window.addEventListener('touchstart', skip, opts);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchstart', skip);
    };
  }, [mode]); // the language may settle just after the start: React updates the tagline, the timeline runs on

  if (!mode) return null;
  const W = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const H = typeof window !== 'undefined' ? window.innerHeight : 900;
  const g = geometry(W, H);
  const L = lockup(LOGO_H * g.fs, isRTL);
  const full = { position: 'absolute', inset: 0 } as const;
  return (
    <div ref={root} aria-hidden="true" role="presentation" data-brand-intro=""
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, overflow: 'hidden', pointerEvents: 'auto', opacity: leaving ? 0 : 1, transition: leaving ? 'opacity 260ms ease' : undefined }}>
      <div id="ami-field" style={full}>
        <div id="ami-dark" style={{ ...full, background: DARK }} />
        <div id="ami-ivory" style={{ ...full, background: IVORY, opacity: 0 }} />
      </div>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ ...full, overflow: 'visible' }}>
        <defs>
          <clipPath id="ami-clip"><path d={LOGO_PATHS.arch} clipRule="evenodd" /></clipPath>
          <filter id="ami-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
          <mask id="ami-mask" maskUnits="userSpaceOnUse" x="600" y="0" width="400" height="300">
            <rect id="ami-rev" x={EM.cx} y="0" width="0" height="300" fill="#fff" filter="url(#ami-soft)" />
          </mask>
          <linearGradient id="ami-sw" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFE9C2" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFE9C2" stopOpacity="0.55" />
            <stop offset="1" stopColor="#FFE9C2" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ami-th" x1="0" y1="24" x2="0" y2="238" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFF0CF" />
            <stop offset="1" stopColor="#C9A260" />
          </linearGradient>
          <filter id="ami-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="ami-spk">
            <stop offset="0" stopColor="#FFF6E0" />
            <stop offset="0.25" stopColor="#FFD992" stopOpacity="0.8" />
            <stop offset="1" stopColor="#FFC66B" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g id="ami-em">
          <g clipPath="url(#ami-clip)">
            <g id="ami-phg">
              <g mask="url(#ami-mask)">
                <g id="ami-ph"><image href={INTRO_PHOTO} x={EM.x} y={EM.y} width={EM.w} height={EM.h} preserveAspectRatio="none" /></g>
                <rect id="ami-sweep" x="600" y="0" width="90" height="300" fill="url(#ami-sw)" style={{ mixBlendMode: 'screen' }} transform="skewX(-14)" />
              </g>
            </g>
            <path id="ami-ink" d={LOGO_PATHS.arch} fill={LOGO_INK} fillRule="evenodd" opacity="0" />
          </g>
          <g filter="url(#ami-glow)" fill="none" stroke="url(#ami-th)" strokeLinecap="round">
            {ARCH_LINES.map((l, i) => (
              <path key={i} id={`ami-l${i}`} d={l.d} strokeWidth="1.3" strokeDasharray={`${l.len} ${l.len}`} style={{ strokeDashoffset: l.len }} />
            ))}
          </g>
          <circle id="ami-spark" cx={EM.ax} cy={EM.ay} r="14" fill="url(#ami-spk)" opacity="0" />
        </g>
        <g id="ami-word" opacity="0" fill={LOGO_INK}>
          <path d={LOGO_PATHS.arabic} fillRule="evenodd" />
          <path d={LOGO_PATHS.latin} fillRule="evenodd" />
        </g>
      </svg>
      {/* the rule and the tagline, laid out like the header's (logo-motion lockup), scaled with the logo */}
      <div id="ami-line" style={{ position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', transformOrigin: '0 0', opacity: 0, willChange: 'transform' }}>
        <div id="ami-rule" style={{ width: L.ruleW, height: 1.5, background: 'linear-gradient(90deg, rgba(176,141,82,0), rgba(176,141,82,0.85) 50%, rgba(176,141,82,0))', transform: 'scaleX(0)' }} />
        <div style={{ marginTop: L.ruleGap, fontFamily: isRTL ? 'ReadexPro_500Medium' : 'Manrope_600SemiBold', fontSize: L.size, lineHeight: `${L.size * 1.25}px`, letterSpacing: isRTL ? 0 : `${L.track}em`, textTransform: isRTL ? undefined : 'uppercase', color: '#7D6237', whiteSpace: 'nowrap', direction: isRTL ? 'rtl' : 'ltr', opacity: 0 }}>
          {t('logoLine')}
        </div>
      </div>
    </div>
  );
}
