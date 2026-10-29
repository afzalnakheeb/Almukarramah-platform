// Design tokens from the AlMukarramah Platform Design (PL-06 · Shared design system).
export const colors = {
  navy: '#211C18',
  navyDeep: '#171310', // footer
  navyLine: '#3B342D',
  ink: '#1E1A16',
  body: '#4A443C',
  muted: '#6F675D',
  ivory: '#F7F3EC',
  cream: '#F7F3EC',
  sand: '#ECE5D9',
  sandSoft: '#F2EDE4',
  line: '#E5DDD0',
  lineSoft: '#EEE8DE',
  inputLine: '#D5CBBB',
  brass: '#9A7A47',
  brassText: '#7A5F36',
  champagne: '#E7DAC2',
  // Gold and night (the darker, richer layer: hero, heritage, footer)
  gold: '#B89A62', // gold on dark backgrounds (7:1 on night)
  goldBright: '#CDB485',
  goldSoft: '#F1EADC', // pale gold panels on light backgrounds
  goldLine: 'rgba(184,154,98,0.45)',
  night: '#1D1915', // deepest navy: hero and heritage
  nightSoft: '#2A241F',
  onNight: '#DCD3C6', // body text on night
  onNightSoft: '#C2B8AA', // secondary text on night
  onNightFaint: '#9D9387', // fine print on night
  scrim: 'rgba(29,25,21,0.78)', // text panel over a photo
  scrimSoft: 'rgba(29,25,21,0.22)',
  overlay: 'rgba(29,25,21,0.45)', // behind dialogs
  lavender: '#F3EFE8',
  white: '#FFFFFF',
  success: '#1E6B4A',
  successBg: '#E6F2EC',
  warn: '#5E3A12',
  warnBg: '#FBF1E3',
  danger: '#A3271F',
  dangerBg: '#FBE9E7',
  infoBg: '#F1ECE3',
  sample: '#B5523A',
  sampleText: '#8A3A26',
  disabled: '#D9D2C3',
};

/** Soft image tones used where a photograph will go. */
export const tones = ['#ECE5D9', '#E9E3DA', '#EFE6DC', '#E7E4DB', '#EEE6E1', '#F4EFE7'];
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
