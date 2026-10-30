// The vector logo (website). The mark is the brand artwork as vector paths (logo-data.ts), drawn exactly as the PNGs.
// It is still by default: the old gold-thread intro is kept behind `intro` (off everywhere) and the hover glint is gone.
//
// Hook for the coming Kaaba-corner animation: pass `overlay`, a function that returns SVG drawn over the mark inside
// the same <Svg> (viewBox units: 917 x 264, the arch monogram spans x 695–905). It receives the clip id of the letter
// shapes, so a layer can draw inside the artwork (clipPath={`url(#${clip})`}) or around it. The overlay must leave
// the mark fully visible at rest and in the pre-rendered HTML, and must stay still for visitors who prefer less motion
// (use prefersLessMotion()). Example: <LogoMark height={48} overlay={({ clip }) => <KaabaCorner clip={clip} />} />
import React from 'react';
import { Platform, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ARCH_LINES, GOLD, GOLD_SHEEN, LOGO_H, LOGO_INK, LOGO_OPACITY, LOGO_PATHS, LOGO_W } from './logo-data';

const SESSION_KEY = 'logoIntroShown';
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); // ease-out cubic
const easeInOut = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/** True when the visitor asked for less motion (and on the server, where nothing should animate). */
export function prefersLessMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

/** Runs a timeline of `ms` milliseconds and returns progress 0..1 (or null when idle). */
function useTimeline() {
  const [p, setP] = React.useState<number | null>(null);
  const raf = React.useRef<number | null>(null);
  const play = React.useCallback((ms: number, delay = 0) => {
    if (typeof window === 'undefined') return;
    if (raf.current) cancelAnimationFrame(raf.current);
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const x = (now - start) / ms;
      if (x >= 1) { setP(null); raf.current = null; return; }
      setP(Math.max(0, x));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);
  React.useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  return [p, play] as const;
}

export type LogoOverlay = (ctx: { clip: string; gold: boolean; width: number; height: number }) => React.ReactNode;

export function LogoMark({ height, gold, label, intro = false, overlay }: { height: number; gold?: boolean; label?: string; intro?: boolean; overlay?: LogoOverlay }) {
  const n = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = { clip: `lc${n}`, gold: `lg${n}`, sheen: `ls${n}`, thread: `lt${n}` };
  const width = (height * LOGO_W) / LOGO_H;
  // Optional intro (off by default): a fine gold thread traces the arch once per session, 1.4 s.
  const [introP, playIntro] = useTimeline();
  React.useEffect(() => {
    if (Platform.OS !== 'web' || !intro || prefersLessMotion()) return;
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === '1'; sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
    if (!seen) playIntro(1400, 350);
  }, [intro, playIntro]);
  const thread = introP === null ? null : easeInOut(introP / 0.75);
  const threadFade = introP === null ? 0 : introP < 0.75 ? 1 : 1 - ease((introP - 0.75) / 0.25);

  const fill = gold ? `url(#${ids.gold})` : LOGO_INK;
  return (
    <View accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined} style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`}>
        <Defs>
          <ClipPath id={ids.clip}>
            <Path d={LOGO_PATHS.arabic} fillRule="evenodd" />
            <Path d={LOGO_PATHS.latin} fillRule="evenodd" />
            <Path d={LOGO_PATHS.arch} fillRule="evenodd" />
          </ClipPath>
          {gold ? (
            <>
              <LinearGradient id={ids.gold} x1="0" y1={GOLD.y1} x2="0" y2={GOLD.y2} gradientUnits="userSpaceOnUse">
                {GOLD.stops.map(([o, c]) => <Stop key={String(o)} offset={o as number} stopColor={c as string} />)}
              </LinearGradient>
              <LinearGradient id={ids.sheen} x1={GOLD_SHEEN.x1} y1={GOLD_SHEEN.y1} x2={GOLD_SHEEN.x2} y2={GOLD_SHEEN.y2} gradientUnits="userSpaceOnUse">
                {GOLD_SHEEN.stops.map(([o, a]) => <Stop key={String(o)} offset={o as number} stopColor={GOLD_SHEEN.color} stopOpacity={a as number} />)}
              </LinearGradient>
            </>
          ) : null}
          {intro ? (
            <LinearGradient id={ids.thread} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#C9A86E" />
              <Stop offset="1" stopColor="#B08D52" />
            </LinearGradient>
          ) : null}
        </Defs>
        <G opacity={LOGO_OPACITY}>
          <Path d={LOGO_PATHS.arabic} fill={fill} fillRule="evenodd" />
          <Path d={LOGO_PATHS.latin} fill={fill} fillRule="evenodd" />
          <Path d={LOGO_PATHS.arch} fill={fill} fillRule="evenodd" />
          {gold ? (
            <G clipPath={`url(#${ids.clip})`}>
              <Rect x="0" y="0" width={LOGO_W} height={LOGO_H} fill={`url(#${ids.sheen})`} />
            </G>
          ) : null}
        </G>
        {thread !== null && threadFade > 0 ? (
          <G opacity={threadFade}>
            {ARCH_LINES.map((l, i) => (
              <Path key={i} d={l.d} fill="none" stroke={`url(#${ids.thread})`} strokeWidth={7} strokeLinecap="round"
                strokeDasharray={`${l.len} ${l.len}`} strokeDashoffset={l.len * (1 - thread)} />
            ))}
          </G>
        ) : null}
        {overlay ? overlay({ clip: ids.clip, gold: !!gold, width, height }) : null}
      </Svg>
    </View>
  );
}
