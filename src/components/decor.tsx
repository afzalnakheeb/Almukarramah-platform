// Decorative layer for the darker, gold-accented look: an eight-point star lattice (Rub el Hizb motif),
// a soft glow, and a small gold ornament for headings. All purely decorative and hidden from screen readers.
import { Image } from 'expo-image';
import React from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { imageUrl } from '@/lib/images';
import { colors } from '@/theme';
import { data } from './motion';

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };

// Eight-point star: two overlapping squares, one turned 45°.
const STAR = 'M32 14 L37.3 26.7 L50 32 L37.3 37.3 L32 50 L26.7 37.3 L14 32 L26.7 26.7 Z M19.3 19.3 H44.7 V44.7 H19.3 Z';
let uid = 0;

/** Faint repeating star lattice, fills its parent (parent needs overflow hidden). */
export function StarLattice({ color = colors.gold, opacity = 0.08, size = 64 }: { color?: string; opacity?: number; size?: number }) {
  const id = React.useMemo(() => `lattice${uid++}`, []);
  return (
    <View {...hidden} style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size} viewBox="0 0 64 64">
            <Path d={STAR} fill="none" stroke={color} strokeWidth={1} opacity={opacity} />
            <Path d="M0 32 H14 M50 32 H64 M32 0 V14 M32 50 V64" stroke={color} strokeWidth={1} opacity={opacity * 0.7} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Soft radial glow (e.g. gold light behind the hero photograph). */
export function Glow({ color = colors.gold, opacity = 0.22, cx = '75%', cy = '40%', r = '55%' }: { color?: string; opacity?: number; cx?: string; cy?: string; r?: string }) {
  const id = React.useMemo(() => `glow${uid++}`, []);
  return (
    <View {...hidden} style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx={cx} cy={cy} r={r} fx={cx} fy={cy} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * The Kiswah mark: a small square in Kaaba black crossed by a gold band (the hizam), between two short gold hairlines.
 * The house's quiet signature under centred titles, in the footer and in empty states. `color` tints the hairlines.
 */
export function Ornament({ color = colors.gold, width = 96, align = 'start', size = 9, style }: { color?: string; width?: number; align?: 'start' | 'center'; size?: number; style?: StyleProp<ViewStyle> }) {
  const line = { height: 1, flex: 1, backgroundColor: color, opacity: 0.75 };
  return (
    <View {...hidden} style={[{ width, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: align === 'center' ? 'center' : 'flex-start' }, style]}>
      <View style={line} />
      <KiswahMark size={size} />
      <View style={line} />
    </View>
  );
}

/** The square alone: Kaaba black with a satin gold band a third of the way down. */
export function KiswahMark({ size = 9 }: { size?: number }) {
  const band = Math.max(1, Math.round(size / 8));
  return (
    <View {...hidden} style={{ width: size, height: size, backgroundColor: colors.kiswah }}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: Math.round(size * 0.28), height: band, backgroundColor: colors.gold }} />
    </View>
  );
}

/**
 * Kaaba corner: two fine gold strokes meeting at a corner, set just outside a framed object (the parent must not clip).
 * `at` picks the corners (start/end follow the reading direction). With `draw`, the strokes are drawn in on hover of
 * the nearest [data-hover] ancestor (web, +html.tsx); otherwise they are always shown.
 */
export function Corners({ at = ['ts', 'be'], len = 16, inset = -9, color = colors.gold, draw }: { at?: ('ts' | 'te' | 'bs' | 'be')[]; len?: number; inset?: number; color?: string; draw?: boolean }) {
  return (
    <>
      {at.map((c) => {
        const top = c[0] === 't';
        const start = c[1] === 's';
        return (
          <View key={c} {...hidden} {...data({ corner: draw ? 'draw' : 'on', cv: top ? 't' : 'b', ch: start ? 's' : 'e' })}
            style={{
              position: 'absolute', width: len, height: len,
              ...(top ? { top: inset } : { bottom: inset }),
              ...(start ? { start: inset } : { end: inset }),
              borderColor: color,
              ...(top ? { borderTopWidth: 1 } : { borderBottomWidth: 1 }),
              ...(start ? { borderStartWidth: 1 } : { borderEndWidth: 1 }),
            }} />
        );
      })}
    </>
  );
}

/** Thin gold rule across the full width. */
export function GoldRule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View {...hidden} style={[{ height: 1, backgroundColor: colors.goldLine }, style]} />;
}

/** Double gold rule frame (letterpress stationery): wrap content; the inner rule sits `gap` inside the outer one. */
export function DoubleFrame({ children, gap = 5, pad = 40, style }: { children: React.ReactNode; gap?: number; pad?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ borderWidth: 1, borderColor: colors.goldLine, padding: gap }, style]}>
      <View style={{ borderWidth: 1, borderColor: colors.hair, padding: pad }}>{children}</View>
    </View>
  );
}

/** True when the visitor asked their device for less motion (web only; apps follow the system setting elsewhere). */
function reducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * Cinematic photograph: a very slow push-in and drift (like a camera moving through a gallery), with a soft band of
 * gold light that passes across every few seconds. Fills its parent; the first frame matches the pre-rendered page.
 */
export function CinematicPhoto({ uri, position = 'center', label, sweep: withSweep = true }: { uri: string; position?: 'center' | 'right' | 'left'; label?: string; sweep?: boolean }) {
  const drift = React.useRef(new Animated.Value(0)).current;
  const sweep = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (reducedMotion()) return;
    const native = Platform.OS !== 'web';
    const a = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
    ]));
    const b = Animated.loop(Animated.sequence([
      Animated.delay(1800),
      Animated.timing(sweep, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: false }),
      Animated.delay(5000),
    ]));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [drift, sweep]);
  // A barely-there push-in: the Art Director's compositions are exact, so the camera only breathes.
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.035] });
  const shift = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const sweepX = sweep.interpolate({ inputRange: [0, 1], outputRange: ['-60%', '160%'] });
  const sweepO = sweep.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const id = React.useMemo(() => `sweep${uid++}`, []);
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale }, { translateX: shift }] }]}>
        <Image source={{ uri: imageUrl(uri) }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={position} priority="high" />
      </Animated.View>
      {withSweep && <Animated.View {...hidden} style={{ position: 'absolute', top: '-20%', bottom: '-20%', width: '38%', left: sweepX as unknown as number, opacity: sweepO, transform: [{ rotate: '14deg' }] }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.goldBright} stopOpacity={0} />
              <Stop offset="0.5" stopColor={colors.goldBright} stopOpacity={0.13} />
              <Stop offset="1" stopColor={colors.goldBright} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </Animated.View>}
    </View>
  );
}

/** Soft shade from one side, so a headline can sit over a photograph. */
export function SideShade({ color = colors.night, from = 'left', strength = 0.92, reach = 0.62 }: { color?: string; from?: 'left' | 'right'; strength?: number; reach?: number }) {
  const id = React.useMemo(() => `shade${uid++}`, []);
  const ltr = from === 'left';
  return (
    <View {...hidden} style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1={ltr ? '0' : '1'} y1="0" x2={ltr ? '1' : '0'} y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={strength} />
            <Stop offset={String(reach * 0.55)} stopColor={color} stopOpacity={strength * 0.75} />
            <Stop offset={String(reach)} stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Hero film: a muted, looping video on the website (desktop or phone cut, chosen after hydration so phones never
 * download the desktop file), with the poster image shown first and kept for visitors who prefer less motion.
 * In the iPhone and Android apps the poster is shown with the slow camera drift instead.
 */
export function HeroFilm({ desktop, phone, poster, posterPhone, label, wide }: { desktop: string; phone: string; poster: string; posterPhone?: string; label?: string; wide: boolean }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { setReady(!reducedMotion()); }, []);
  const still = wide ? poster : posterPhone ?? poster;
  if (Platform.OS !== 'web') return <CinematicPhoto uri={still} label={label} sweep={false} />;
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessible={!!label} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined}>
      <Image source={{ uri: imageUrl(still) }} style={StyleSheet.absoluteFill} contentFit="cover" priority="high" />
      {ready ? (
        <video key={wide ? 'd' : 'm'} src={imageUrl(wide ? desktop : phone)} poster={imageUrl(still)} autoPlay muted loop playsInline preload="auto" aria-hidden
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
    </View>
  );
}
