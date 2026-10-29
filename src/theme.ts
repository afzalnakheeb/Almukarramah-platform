// Design tokens from the AlMukarramah Platform Design (PL-06 · Shared design system).
// Palette: light and modern. Warm ivory canvas, near-black ink, antique gold as hairlines, Rawdah emerald only where
// the customer acts (buttons, selected states) and Kiswah black for a few accents (top bar, fragrance house, footer).
// The token names 'navy' and 'night' are kept from earlier palettes: 'navy' is now the ink, 'night' the black.
export const colors = {
  navy: '#1C1A17',
  navyDeep: '#141210', // footer
  navyLine: '#2E2A25',
  ink: '#1C1A17',
  body: '#4A453E',
  muted: '#6E675E',
  ivory: '#F7F3EC',
  cream: '#F7F3EC',
  sand: '#ECE5D9',
  sandSoft: '#F2EDE4',
  line: '#E6DED1',
  lineSoft: '#EEE8DE',
  inputLine: '#D6CCBC',
  brass: '#9C7B45',
  brassText: '#7D6237',
  champagne: '#E7DAC2',
  // Gold and night (the darker, richer layer: hero, heritage, footer)
  gold: '#B08D52', // gold on dark backgrounds (7:1 on night)
  goldBright: '#C9A86E',
  goldSoft: '#F3ECDD', // pale gold panels on light backgrounds
  goldLine: 'rgba(176,141,82,0.38)',
  night: '#151311', // deepest brand shade: hero and heritage
  nightSoft: '#211E1A',
  onNight: '#E4DCCD', // body text on night
  // Kiswah black: the Kaaba's black with gold thread, used for the top bar, the fragrance house and the footer,
  // so the site carries Makkah (black and gold) and Madinah (green and gold) together, like Harrods and Rolex pair green with gold.
  kiswah: '#151311',
  emerald: '#14392F', // buttons and selected states only
  emeraldSoft: '#E7EEE9',
  emeraldLine: 'rgba(20,57,47,0.28)',
  hair: 'rgba(176,141,82,0.24)', // the finest gold border, for cards
  kiswahSoft: '#211E1A',
  onNightSoft: '#C2B8A7', // secondary text on night
  onNightFaint: '#998F80', // fine print on night
  scrim: 'rgba(21,19,17,0.72)', // text panel over a photo
  scrimSoft: 'rgba(21,19,17,0.18)',
  overlay: 'rgba(21,19,17,0.42)', // behind dialogs
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

/** Crisp corners read as tailored and premium; large rounded corners read as an everyday app. */
export const radius = { sm: 3, md: 4, lg: 6, xl: 8, pill: 2 };

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
