export const colors = {
  navy: '#010852',
  navySoft: '#1B2370',
  brass: '#A9824B',
  brassText: '#8A6A3A',
  cream: '#FBF8F3',
  sand: '#F2ECE1',
  line: '#ECE4D6',
  ink: '#14152A',
  muted: '#5E5A52',
  white: '#FFFFFF',
  danger: '#A3271F',
  success: '#1E6B4A',
};

export const space = (n: number) => n * 8;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, color: colors.navy },
  title: { fontSize: 20, fontWeight: '700' as const, color: colors.navy },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  small: { fontSize: 13, color: colors.muted },
  kicker: { fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' as const, color: colors.brassText, fontWeight: '700' as const },
};
