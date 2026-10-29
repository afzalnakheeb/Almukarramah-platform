// Design tokens from the AlMukarramah Platform Design (PL-06 · Shared design system).
export const colors = {
  navy: '#3A2520',
  navyDeep: '#2A1A16', // footer
  navyLine: '#4E3730',
  ink: '#2A1C18',
  body: '#4E423D',
  muted: '#71635D',
  ivory: '#F8F2EC',
  cream: '#F8F2EC',
  sand: '#EEE2D7',
  sandSoft: '#F4EBE3',
  line: '#E9DDD2',
  lineSoft: '#F0E7DF',
  inputLine: '#D8C8BC',
  brass: '#A27358',
  brassText: '#7F5844',
  champagne: '#EBD6C6',
  // Gold and night (the darker, richer layer: hero, heritage, footer)
  gold: '#C9A07F', // gold on dark backgrounds (7:1 on night)
  goldBright: '#DDBB9E',
  goldSoft: '#F4E8DE', // pale gold panels on light backgrounds
  goldLine: 'rgba(201,160,127,0.45)',
  night: '#2B1B17', // deepest navy: hero and heritage
  nightSoft: '#3B2722',
  onNight: '#E8D9CF', // body text on night
  onNightSoft: '#CDB8AC', // secondary text on night
  onNightFaint: '#A58F84', // fine print on night
  scrim: 'rgba(43,27,23,0.78)', // text panel over a photo
  scrimSoft: 'rgba(43,27,23,0.22)',
  overlay: 'rgba(43,27,23,0.45)', // behind dialogs
  lavender: '#F5EEEA',
  white: '#FFFFFF',
  success: '#1E6B4A',
  successBg: '#E6F2EC',
  warn: '#5E3A12',
  warnBg: '#FBF1E3',
  danger: '#A3271F',
  dangerBg: '#FBE9E7',
  infoBg: '#F4ECE6',
  sample: '#B5523A',
  sampleText: '#8A3A26',
  disabled: '#D9D2C3',
};

/** Soft image tones used where a photograph will go. */
export const tones = ['#EEE2D7', '#EDE3E0', '#F2E4DC', '#E9E4DC', '#F1E5E3', '#F6EFE8'];
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
