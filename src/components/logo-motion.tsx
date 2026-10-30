// The vector logo (website). The mark is the brand artwork as vector paths (logo-data.ts), drawn exactly as the PNGs.
// It is always still: the first-visit Kaaba-corner intro (public/intro.js, from scripts/build-intro.mjs) is a separate overlay that ends by gliding
// into the header's logo, which carries `slot` so the intro can find it. The old thread intro and hover glint are gone.
//
// `overlay` draws extra SVG over the mark inside the same <Svg> (viewBox 917 x 264; the arch monogram spans
// x 695-905). It receives the clip id of the letter shapes, so a layer can draw inside the artwork.
import React from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { GOLD, GOLD_SHEEN, LOGO_H, LOGO_INK, LOGO_OPACITY, LOGO_PATHS, LOGO_W } from './logo-data';
import { data } from './motion';

/** True when the visitor asked for less motion (and on the server, where nothing should animate). */
export function prefersLessMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

/**
 * Proportions of the logo lock-up (the logo, a gold rule, then "For every Muslim home"), for a logo `h` px tall.
 * Linear in h, so the intro's large centred lock-up scales exactly onto the header's.
 */
export const lockup = (h: number, rtl = false) => ({
  gap: h * 0.2, // logo to rule
  ruleW: h * 3.3, // about the logo's width (3.47 h)
  ruleGap: h * 0.17, // rule to tagline
  size: rtl ? h * 0.24 : h * 0.19, // tagline font size
  track: rtl ? 0 : 0.22, // tagline tracking, em
});

/** The emblem's box in the logo's viewBox (the arch monogram), and the photograph that fills it at large brand moments. */
const EMBLEM = { x: 708.1, y: 24.2, w: 184.1, h: 213.8 };
export const EMBLEM_PHOTO = '/images/brand/emblem-kaaba.webp';

/**
 * The photo emblem: the arch monogram filled with the photograph of the Kaaba's corner, outlined by a fine gold line.
 * Only for large brand moments (the intro, our story); the header keeps the flat ink mark. `src` is a loadable URL.
 */
export function EmblemPhoto({ height, src, label }: { height: number; src: string; label?: string }) {
  const n = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const pad = 3;
  const vb = { x: EMBLEM.x - pad, y: EMBLEM.y - pad, w: EMBLEM.w + pad * 2, h: EMBLEM.h + pad * 2 };
  const width = (height * vb.w) / vb.h;
  return (
    <View accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined} style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}>
        <Defs>
          <ClipPath id={`ec${n}`}><Path d={LOGO_PATHS.arch} clipRule="evenodd" /></ClipPath>
        </Defs>
        <G clipPath={`url(#ec${n})`}>
          <Rect x={EMBLEM.x} y={EMBLEM.y} width={EMBLEM.w} height={EMBLEM.h} fill="#14110E" />
          <SvgImage href={src} x={EMBLEM.x} y={EMBLEM.y} width={EMBLEM.w} height={EMBLEM.h} preserveAspectRatio="none" />
        </G>
        <Path d={LOGO_PATHS.arch} fill="none" stroke="#B08D52" strokeOpacity={0.55} strokeWidth={0.6} fillRule="evenodd" />
      </Svg>
    </View>
  );
}

export type LogoOverlay = (ctx: { clip: string; gold: boolean; width: number; height: number }) => React.ReactNode;

export function LogoMark({ height, gold, label, slot, overlay }: { height: number; gold?: boolean; label?: string; slot?: boolean; overlay?: LogoOverlay }) {
  const n = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const ids = { clip: `lc${n}`, gold: `lg${n}`, sheen: `ls${n}` };
  const width = (height * LOGO_W) / LOGO_H;
  const fill = gold ? `url(#${ids.gold})` : LOGO_INK;
  return (
    <View accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined}
      {...data({ brandslot: slot ? '' : undefined })} style={{ width, height }}>
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
        {overlay ? overlay({ clip: ids.clip, gold: !!gold, width, height }) : null}
      </Svg>
    </View>
  );
}
