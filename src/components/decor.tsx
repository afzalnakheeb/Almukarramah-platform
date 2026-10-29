// Decorative layer for the darker, gold-accented look: an eight-point star lattice (Rub el Hizb motif),
// a soft glow, and a small gold ornament for headings. All purely decorative and hidden from screen readers.
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';
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
