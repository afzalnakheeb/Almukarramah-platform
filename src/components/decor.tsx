// Decorative layer for the darker, gold-accented look: an eight-point star lattice (Rub el Hizb motif),
// a soft glow, and a small gold ornament for headings. All purely decorative and hidden from screen readers.
import { Image } from 'expo-image';
import React from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
import { imageUrl } from '@/lib/images';
import { colors } from '@/theme';

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

/** Small gold ornament: line, diamond, line. `align` centres it or keeps it at the start. */
export function Ornament({ color = colors.gold, width = 88, align = 'start', style }: { color?: string; width?: number; align?: 'start' | 'center'; style?: StyleProp<ViewStyle> }) {
  const line = { height: 1, flex: 1, backgroundColor: color, opacity: 0.8 };
  return (
    <View {...hidden} style={[{ width, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: align === 'center' ? 'center' : 'flex-start' }, style]}>
      <View style={line} />
      <View style={{ width: 7, height: 7, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
      <View style={line} />
    </View>
  );
}

/** Thin gold rule across the full width (used between the header and dark sections, and atop the footer). */
export function GoldRule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View {...hidden} style={[{ height: 2, backgroundColor: colors.gold }, style]} />;
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
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.02, 1.09] });
  const shift = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
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
