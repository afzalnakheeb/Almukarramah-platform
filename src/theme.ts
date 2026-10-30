// Design tokens: an ivory house, stitched with three threads (spec: studio/ui/spec.md).
// The canvas is warm ivory and stone. Madinah green, Kaaba black and antique gold never fill a surface larger than a
// button: gold draws the hairlines, ticks and small capitals; green marks where the customer acts (buttons, focus,
// selected states, the bag badge); black is the ink of the type and the logo, and the secondary button's outline.
// Older token names are kept so every screen keeps compiling: 'navy' is the ink, 'night'/'kiswah' are Kaaba black,
// used only for type and tiny marks now; 'white' stays pure white for the few places that need it (Google's button).
export const colors = {
  // Ink (Kaaba black)
  navy: '#1C1A17',
  navyDeep: '#141210', // admin sidebar only
  navyLine: '#2E2A25',
  ink: '#1C1A17',
  body: '#4A453E',
  muted: '#6E675E',
  // Canvas
  ivory: '#F7F3EC', // the page
  cream: '#F7F3EC',
  porcelain: '#FBF9F5', // raised: cards, inputs, panels, product tiles' text never sits on pure white
  stone: '#EFE9DF', // quiet bands: utility bar, fragrance house, footer
  sand: '#E9E2D6', // photograph panels
  sandSoft: '#EEE8DE',
  line: '#E3DACB', // neutral hairline (UI)
  lineSoft: '#ECE5DA',
  inputLine: '#D3C8B6',
  // Gold (satin, antique): lines, ticks, icons; text only in brassText (5.2:1 on ivory)
  brass: '#9C7B45',
  brassText: '#7D6237',
  champagne: '#E7DAC2',
  gold: '#B08D52',
  goldBright: '#C9A86E', // hover tint on gold only, never a fill
  goldSoft: '#F3ECDD',
  goldLine: 'rgba(176,141,82,0.42)', // brand hairline
  hair: 'rgba(176,141,82,0.24)',
  // Kaaba black, for type and the Kiswah mark (no black surfaces)
  night: '#151311',
  nightSoft: '#211E1A',
  kiswah: '#141210',
  kiswahSoft: '#211E1A',
  onNight: '#E4DCCD',
  onNightSoft: '#C2B8A7',
  onNightFaint: '#998F80',
  // Madinah green: action only (buttons, focus, selected, badge, seals)
  emerald: '#18493B',
  emeraldDeep: '#0F362B', // hover
  emeraldSoft: '#E6EEE9',
  emeraldLine: 'rgba(24,73,59,0.32)',
  scrim: 'rgba(21,19,17,0.72)',
  scrimSoft: 'rgba(21,19,17,0.18)',
  overlay: 'rgba(28,26,23,0.32)', // behind dialogs: a soft veil, never a black screen
  lavender: '#F1ECE3', // selected option fill (kept name)
  white: '#FFFFFF',
  success: '#1E5E45',
  successBg: '#E6F0EA',
  warn: '#6B4316',
  warnBg: '#FAF1E4',
  danger: '#9E2C22',
  dangerBg: '#F9EAE7',
  infoBg: '#F1ECE3',
  sample: '#B5523A',
  sampleText: '#8A3A26',
  disabled: '#E2DBCF',
};

/** Soft image tones used where a photograph will go. */
export const tones = ['#E9E2D6', '#E7E1D7', '#ECE4D9', '#E6E2D8', '#EBE4DD', '#EFE9DF'];
export const toneFor = (key: string) => tones[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length];

export const space = (n: number) => n * 8;

/** Crisp corners read as tailored; rounded corners read as an everyday app. */
export const radius = { sm: 1, md: 2, lg: 2, xl: 4, pill: 999 };

/** Font family names registered in app/_layout.tsx (Google Fonts via expo-font). */
export const fonts = {
  serif: 'CormorantGaramond_500Medium',
  serifAr: 'Amiri_400Regular', // display Arabic: the finer weight
  serifArSmall: 'Amiri_700Bold', // Arabic serif under 28 px (product names) needs the heavier cut
  quran: 'Amiri_400Regular',
  sans: { 400: 'Manrope_400Regular', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold' },
  sansAr: { 400: 'ReadexPro_400Regular', 500: 'ReadexPro_500Medium', 600: 'ReadexPro_600SemiBold', 700: 'ReadexPro_600SemiBold' },
};

export type Weight = 400 | 500 | 600 | 700;

export const sans = (weight: Weight = 400, ar = false) => ({ fontFamily: (ar ? fonts.sansAr : fonts.sans)[weight] });
/** Serif display. Arabic is set in Amiri at 0.86 of the English size, with the taller line its marks need. */
export const serif = (size: number, ar = false) => {
  if (!ar) return { fontFamily: fonts.serif, fontSize: size, lineHeight: Math.round(size * (size >= 40 ? 1.06 : 1.14)), color: colors.navy };
  const s = Math.round(size * 0.86);
  return { fontFamily: size >= 28 ? fonts.serifAr : fonts.serifArSmall, fontSize: s, lineHeight: Math.round(s * (size >= 40 ? 1.5 : 1.55)), color: colors.navy };
};

/** Shared text styles (English fonts; components swap to Arabic fonts when the language is Arabic). */
export const type = {
  display: { ...serif(40), marginBottom: 4 },
  title: { ...sans(600), fontSize: 17, color: colors.navy },
  body: { ...sans(400), fontSize: 15, color: colors.ink, lineHeight: 24 },
  small: { ...sans(400), fontSize: 13, color: colors.muted, lineHeight: 20 },
  kicker: { ...sans(600), fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, color: colors.brassText },
};

/** Tabular figures, so prices and quantities line up. */
export const figures = { fontVariant: ['tabular-nums' as const] };

export const WIDE = 900;
export const MAX_WIDTH = 1280;
/** Side gutters: desktop and phone. */
export const GUTTER = { wide: 40, narrow: 20 };
