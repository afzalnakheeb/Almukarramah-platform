// Design tokens from the AlMukarramah Platform Design (PL-06 · Shared design system).
export const colors = {
  navy: '#14392F',
  navyDeep: '#0D2A22', // footer
  navyLine: '#2B4B41',
  ink: '#16211D',
  body: '#3F443F',
  muted: '#61665F',
  ivory: '#F6F2EA',
  cream: '#F6F2EA',
  sand: '#E9E2D4',
  sandSoft: '#F0EBE1',
  line: '#E3DCCD',
  lineSoft: '#EDE8DD',
  inputLine: '#D2CABA',
  brass: '#A07E46',
  brassText: '#7C6236',
  champagne: '#E6D9BE',
  // Gold and night (the darker, richer layer: hero, heritage, footer)
  gold: '#C4A468', // gold on dark backgrounds (7:1 on night)
  goldBright: '#D8BF8C',
  goldSoft: '#F1EADA', // pale gold panels on light backgrounds
  goldLine: 'rgba(196,164,104,0.45)',
  night: '#0F2C25', // deepest navy: hero and heritage
  nightSoft: '#173A31',
  onNight: '#D5DED7', // body text on night
  onNightSoft: '#B9C7BE', // secondary text on night
  onNightFaint: '#8DA096', // fine print on night
  scrim: 'rgba(15,44,37,0.80)', // text panel over a photo
  scrimSoft: 'rgba(15,44,37,0.22)',
  overlay: 'rgba(15,44,37,0.45)', // behind dialogs
  lavender: '#EFF2EC',
  white: '#FFFFFF',
  success: '#1E6B4A',
  successBg: '#E6F2EC',
  warn: '#5E3A12',
  warnBg: '#FBF1E3',
  danger: '#A3271F',
  dangerBg: '#FBE9E7',
  infoBg: '#ECF1EC',
  sample: '#B5523A',
  sampleText: '#8A3A26',
  disabled: '#D9D2C3',
};

/** Soft image tones used where a photograph will go. */
export const tones = ['#E9E2D4', '#E4E8E0', '#EFE6DA', '#E3EAE3', '#EEE7E0', '#F4EFE6'];
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
