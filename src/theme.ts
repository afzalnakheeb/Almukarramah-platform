// Design tokens from the AlMukarramah Platform Design (PL-06 · Shared design system).
export const colors = {
  navy: '#141210',
  navyDeep: '#0C0B0A', // footer
  navyLine: '#2E2A26',
  ink: '#141210',
  body: '#45413C',
  muted: '#69645D',
  ivory: '#F6F3EE',
  cream: '#F6F3EE',
  sand: '#E9E4DB',
  sandSoft: '#F0ECE5',
  line: '#E3DED4',
  lineSoft: '#EDE9E1',
  inputLine: '#D1CABE',
  brass: '#A08048',
  brassText: '#7D6538',
  champagne: '#E6DAC1',
  // Gold and night (the darker, richer layer: hero, heritage, footer)
  gold: '#BF9D5E', // gold on dark backgrounds (7:1 on night)
  goldBright: '#D4B783',
  goldSoft: '#F1EADB', // pale gold panels on light backgrounds
  goldLine: 'rgba(191,157,94,0.45)',
  night: '#0E0D0C', // deepest navy: hero and heritage
  nightSoft: '#1B1917',
  onNight: '#D9D3C8', // body text on night
  onNightSoft: '#BDB6AA', // secondary text on night
  onNightFaint: '#948D82', // fine print on night
  scrim: 'rgba(14,13,12,0.78)', // text panel over a photo
  scrimSoft: 'rgba(14,13,12,0.22)',
  overlay: 'rgba(14,13,12,0.50)', // behind dialogs
  lavender: '#F2F0EC',
  white: '#FFFFFF',
  success: '#1E6B4A',
  successBg: '#E6F2EC',
  warn: '#5E3A12',
  warnBg: '#FBF1E3',
  danger: '#A3271F',
  dangerBg: '#FBE9E7',
  infoBg: '#F0EDE7',
  sample: '#B5523A',
  sampleText: '#8A3A26',
  disabled: '#D9D2C3',
};

/** Soft image tones used where a photograph will go. */
export const tones = ['#E9E4DB', '#E6E3DE', '#EEE7DE', '#E5E5DE', '#ECE6E2', '#F4F0E9'];
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
