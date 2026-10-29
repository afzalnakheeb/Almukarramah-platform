// Design tokens from the AlMukarramah Platform Design (PL-06 · Shared design system).
export const colors = {
  navy: '#010852',
  navyDeep: '#0B1030', // footer
  navyLine: '#23284F',
  ink: '#14152A',
  body: '#3F3C36',
  muted: '#5E5A52',
  ivory: '#FBF8F3',
  cream: '#FBF8F3',
  sand: '#EDE5D6',
  sandSoft: '#F2ECE1',
  line: '#ECE4D6',
  lineSoft: '#F1EBE0',
  inputLine: '#D8CFBF',
  brass: '#A9824B',
  brassText: '#8A6A3A',
  champagne: '#E9D9B8',
  // Gold and night (the darker, richer layer: hero, heritage, footer)
  gold: '#C9A45C', // gold on dark backgrounds (7:1 on night)
  goldBright: '#DDBE7E',
  goldSoft: '#F4EAD3', // pale gold panels on light backgrounds
  goldLine: 'rgba(201,164,92,0.45)',
  night: '#070B2C', // deepest navy: hero and heritage
  nightSoft: '#11174A',
  onNight: '#C9CCE0', // body text on night
  lavender: '#F4F2F9',
  white: '#FFFFFF',
  success: '#1E6B4A',
  successBg: '#E6F2EC',
  warn: '#5E3A12',
  warnBg: '#FBF1E3',
  danger: '#A3271F',
  dangerBg: '#FBE9E7',
  infoBg: '#EEF1F8',
  sample: '#B5523A',
  sampleText: '#8A3A26',
  disabled: '#D9D2C3',
};

/** Soft image tones used where a photograph will go. */
export const tones = ['#EDE5D6', '#E8E4EE', '#F3E6DF', '#E6EBE2', '#F2E8EC', '#F6F1E8'];
export const toneFor = (key: string) => tones[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length];

export const space = (n: number) => n * 8;

export const radius = { sm: 10, md: 16, lg: 20, xl: 26, pill: 999 };

/** Font family names registered in app/_layout.tsx (Google Fonts via expo-font). */
export const fonts = {
  serif: 'CormorantGaramond_600SemiBold',
  serifAr: 'Amiri_700Bold',
  quran: 'Amiri_400Regular',
  sans: { 400: 'Manrope_400Regular', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold' },
  sansAr: { 400: 'ReadexPro_400Regular', 500: 'ReadexPro_500Medium', 600: 'ReadexPro_600SemiBold', 700: 'ReadexPro_600SemiBold' },
};

export type Weight = 400 | 500 | 600 | 700;

export const sans = (weight: Weight = 400, ar = false) => ({ fontFamily: (ar ? fonts.sansAr : fonts.sans)[weight] });
export const serif = (size: number, ar = false) => ({
  fontFamily: ar ? fonts.serifAr : fonts.serif,
  fontSize: ar ? Math.round(size * 0.82) : size,
  lineHeight: Math.round(size * (ar ? 1.35 : 1.05)),
  color: colors.navy,
});

/** Shared text styles (English fonts; components swap to Arabic fonts when the language is Arabic). */
export const type = {
  display: { ...serif(40), marginBottom: 4 },
  title: { ...sans(700), fontSize: 17, color: colors.navy },
  body: { ...sans(400), fontSize: 15, color: colors.ink, lineHeight: 24 },
  small: { ...sans(400), fontSize: 13, color: colors.muted, lineHeight: 19 },
  kicker: { ...sans(700), fontSize: 12, letterSpacing: 1.9, textTransform: 'uppercase' as const, color: colors.brassText },
};

export const WIDE = 900;
export const MAX_WIDTH = 1280;
