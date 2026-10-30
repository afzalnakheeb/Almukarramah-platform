// The animated logo (website). The mark is the brand artwork as vector paths (logo-data.ts), drawn exactly as the PNGs.
// On the first visit of a session a fine gold thread traces the arch from its keystone down both sides, then a single
// slow glint of light passes across the whole mark. Hovering the logo sends the glint across again. The logo is always
// fully visible (also in the pre-rendered HTML and for visitors who prefer less motion): the motion is only laid over it.
import React from 'react';
import { Platform, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { ARCH_LINES, GOLD, GOLD_SHEEN, LOGO_H, LOGO_INK, LOGO_OPACITY, LOGO_PATHS, LOGO_W } from './logo-data';

const SESSION_KEY = 'logoIntroShown';
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); // ease-out cubic
const easeInOut = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

function prefersLessMotion() {
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

export function LogoMark({ height, gold, label, intro = true }: { height: number; gold?: boolean; label?: string; intro?: boolean }) {
  const n = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = { clip: `lc${n}`, gold: `lg${n}`, sheen: `ls${n}`, glint: `lgl${n}`, thread: `lt${n}` };
  const width = (height * LOGO_W) / LOGO_H;
  // intro: 0..1 over 2.4 s (thread 0..0.55, glint 0.45..1); hover: glint only
  const [introP, playIntro] = useTimeline();
  const [hoverP, playHover] = useTimeline();
  React.useEffect(() => {
    if (Platform.OS !== 'web' || !intro || prefersLessMotion()) return;
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === '1'; sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* private mode */ }
    if (!seen) playIntro(2400, 350);
  }, [intro, playIntro]);

  const thread = introP === null ? null : easeInOut(introP / 0.55);
  const threadFade = introP === null ? 0 : introP < 0.55 ? 1 : 1 - ease((introP - 0.55) / 0.35);
  const glintP = introP !== null && introP > 0.45 ? easeInOut((introP - 0.45) / 0.55) : hoverP !== null ? easeInOut(hoverP) : null;
  const glintX = glintP === null ? null : -260 + glintP * (LOGO_W + 520);

  const fill = gold ? `url(#${ids.gold})` : LOGO_INK;
  const hover = Platform.OS === 'web' ? { onMouseEnter: () => { if (!prefersLessMotion() && introP === null) playHover(1300); } } : {};
  return (
    <View {...(hover as object)} accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined} style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${LOGO_W} ${LOGO_H}`}>
        <Defs>
          <ClipPath id={ids.clip}>
            <Path d={LOGO_PATHS.arabic} fillRule="evenodd" />
            <Path d={LOGO_PATHS.latin} fillRule="evenodd" />
            <Path d={LOGO_PATHS.arch} fillRule="evenodd" />
          </ClipPath>
          <LinearGradient id={ids.gold} x1="0" y1={GOLD.y1} x2="0" y2={GOLD.y2} gradientUnits="userSpaceOnUse">
            {GOLD.stops.map(([o, c]) => <Stop key={String(o)} offset={o as number} stopColor={c as string} />)}
          </LinearGradient>
          <LinearGradient id={ids.sheen} x1={GOLD_SHEEN.x1} y1={GOLD_SHEEN.y1} x2={GOLD_SHEEN.x2} y2={GOLD_SHEEN.y2} gradientUnits="userSpaceOnUse">
            {GOLD_SHEEN.stops.map(([o, a]) => <Stop key={String(o)} offset={o as number} stopColor={GOLD_SHEEN.color} stopOpacity={a as number} />)}
          </LinearGradient>
          <LinearGradient id={ids.glint} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={gold ? '#FFF4D6' : '#E9D3A2'} stopOpacity={0} />
            <Stop offset="0.5" stopColor={gold ? '#FFF4D6' : '#E9D3A2'} stopOpacity={gold ? 0.85 : 0.95} />
            <Stop offset="1" stopColor={gold ? '#FFF4D6' : '#E9D3A2'} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={ids.thread} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#E2C68C" />
            <Stop offset="1" stopColor="#B08D52" />
          </LinearGradient>
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
        {glintX !== null ? (
          <G clipPath={`url(#${ids.clip})`}>
            <Rect x={glintX} y={-40} width={200} height={LOGO_H + 80} fill={`url(#${ids.glint})`} transform={`skewX(-18)`} />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}
