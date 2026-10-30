// Line icons: fine strokes (1.4–1.5), rounded caps, drawn on a 24 px grid.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

export type IconName =
  | 'menu' | 'search' | 'bag' | 'user' | 'help' | 'bed' | 'house' | 'globe' | 'chevronDown' | 'chevronLeft' | 'chevronRight'
  | 'arrowRight' | 'arrowLeft' | 'close' | 'send' | 'lock' | 'gift' | 'sparkle' | 'book' | 'check' | 'plus' | 'minus' | 'shield' | 'grid' | 'filter';

export function Icon({ name, size = 22, color = colors.navy, stroke = 1.5 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'menu' && <Path {...p} d="M4 7h16M4 12h16M4 17h10" />}
      {name === 'search' && <><Circle {...p} cx={11} cy={11} r={7} /><Path {...p} d="M20 20l-3.5-3.5" /></>}
      {name === 'bag' && <><Path {...p} d="M5 8h14l-1.2 12H6.2z" /><Path {...p} d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>}
      {name === 'user' && <><Circle {...p} cx={12} cy={8} r={4} /><Path {...p} d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>}
      {name === 'help' && <><Path {...p} d="M4 5h16v11H8l-4 4z" /><Path {...p} d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4M12 14.5h.01" /></>}
      {name === 'bed' && <><Path {...p} d="M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3" /><Circle {...p} cx={7} cy={10.5} r={1.5} /></>}
      {name === 'house' && <><Path {...p} d="M4 11l8-7 8 7v9H4z" /><Path {...p} d="M10 20v-5h4v5" /></>}
      {name === 'globe' && <><Circle {...p} cx={12} cy={12} r={9} /><Path {...p} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>}
      {name === 'chevronDown' && <Path {...p} d="M6 9l6 6 6-6" />}
      {name === 'chevronLeft' && <Path {...p} d="M15 6l-6 6 6 6" />}
      {name === 'chevronRight' && <Path {...p} d="M9 6l6 6-6 6" />}
      {name === 'arrowRight' && <Path {...p} d="M5 12h14M13 6l6 6-6 6" />}
      {name === 'arrowLeft' && <Path {...p} d="M19 12H5M11 6l-6 6 6 6" />}
      {name === 'close' && <Path {...p} d="M6 6l12 12M18 6L6 18" />}
      {name === 'send' && <Path {...p} d="M4 12l16-8-6 16-2.5-6.5z" />}
      {name === 'lock' && <><Rect {...p} x={5} y={10} width={14} height={10} rx={2} /><Path {...p} d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>}
      {name === 'gift' && <><Rect {...p} x={4} y={9} width={16} height={11} rx={1.5} /><Path {...p} d="M4 13h16M12 9v11M12 9c-1.5-3-5-3.5-5-1.2C7 9 9.5 9 12 9zm0 0c1.5-3 5-3.5 5-1.2C17 9 14.5 9 12 9z" /></>}
      {name === 'sparkle' && <Path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />}
      {name === 'book' && <><Path {...p} d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><Path {...p} d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5" /></>}
      {name === 'check' && <Path {...p} d="M5 12.5l4.5 4.5L19 7" />}
      {name === 'plus' && <Path {...p} d="M12 5v14M5 12h14" />}
      {name === 'minus' && <Path {...p} d="M5 12h14" />}
      {name === 'shield' && <><Path {...p} d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><Path {...p} d="M8.5 12l2.5 2.5 4.5-5" /></>}
      {name === 'filter' && <><Path {...p} d="M4 7h9M19 7h1M4 17h3M13 17h7" /><Circle {...p} cx={16} cy={7} r={2.5} /><Circle {...p} cx={10} cy={17} r={2.5} /></>}
      {name === 'grid' && <><Rect {...p} x={4} y={4} width={7} height={7} rx={1.5} /><Rect {...p} x={13} y={4} width={7} height={7} rx={1.5} /><Rect {...p} x={4} y={13} width={7} height={7} rx={1.5} /><Rect {...p} x={13} y={13} width={7} height={7} rx={1.5} /></>}
    </Svg>
  );
}

/** Decorative arch in fine gold lines, used where a photograph will go (no dark block behind it). */
export function ArchMotif({ width = 150, color = colors.gold }: { width?: number; color?: string }) {
  return (
    <Svg width={width} height={width * 1.4} viewBox="0 0 300 420" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M60 394V170a90 90 0 0 1 180 0v224" fill="none" stroke={color} strokeWidth={2} opacity={0.7} />
      <Path d="M90 394V185a60 60 0 0 1 120 0v209" fill="none" stroke={color} strokeWidth={1.2} opacity={0.45} />
      <Path d="M40 394h220" fill="none" stroke={color} strokeWidth={1.2} opacity={0.5} />
    </Svg>
  );
}
