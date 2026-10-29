// Building blocks from the AlMukarramah Platform Design (PL-06 · Shared design system).
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useI18n } from '@/lib/i18n';
import { formatMoney, priceIn } from '@/lib/money';
import { imageUrl } from '@/lib/images';
import type { Product } from '@/lib/types';
import { colors, MAX_WIDTH, radius, sans, serif, space, toneFor, WIDE, type Weight } from '@/theme';
import { ArchMotif, Icon } from './icons';

export function useWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE;
}

/** Text in Manrope (English) or Readex Pro (Arabic). */
export function T({ children, w = 400, size = 15, color = colors.ink, lh, style, numberOfLines, center }: {
  children: React.ReactNode; w?: Weight; size?: number; color?: string; lh?: number; style?: StyleProp<TextStyle>; numberOfLines?: number; center?: boolean;
}) {
  const { isRTL } = useI18n();
  return (
    <Text numberOfLines={numberOfLines} style={[sans(w, isRTL), { fontSize: size, color }, lh ? { lineHeight: Math.round(size * lh) } : null, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

/** Headlines in Cormorant Garamond (English) or Amiri (Arabic). */
export function Serif({ children, size = 44, color = colors.navy, style, center, role }: {
  children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>; center?: boolean; role?: 'h1' | 'h2' | 'h3';
}) {
  const { isRTL } = useI18n();
  const aria = role ? { role: 'heading' as const, 'aria-level': Number(role[1]) } : {};
  return <Text {...aria} style={[serif(size, isRTL), { color }, center && { textAlign: 'center' }, style]}>{children}</Text>;
}

export function Eyebrow({ children, color = colors.brassText, size = 13, style }: { children: React.ReactNode; color?: string; size?: number; style?: StyleProp<TextStyle> }) {
  const { isRTL } = useI18n();
  return (
    <Text style={[sans(700, isRTL), { fontSize: isRTL ? size + 1 : size, color }, !isRTL && { letterSpacing: size * 0.16, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** Page width container: 1280 max, 24 px gutters (16 on phones). */
export function Container({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const wide = useWide();
  return <View style={[{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: wide ? 24 : 16 }, style]}>{children}</View>;
}

export function H1({ children, size }: { children: React.ReactNode; size?: number }) {
  const wide = useWide();
  return <Serif role="h1" size={size ?? (wide ? 52 : 36)} style={{ marginBottom: space(1) }}>{children}</Serif>;
}

/** Section heading row: optional eyebrow, serif title, subtitle and a link on the far side. */
export function SectionHead({ kicker, title, sub, link, href, size }: { kicker?: string; title: string; sub?: string; link?: string; href?: Href; size?: number }) {
  const wide = useWide();
  const { isRTL } = useI18n();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: wide ? 24 : 14 }}>
      <View style={{ flexShrink: 1 }}>
        {kicker ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 22, height: 1, backgroundColor: colors.brass }} />
            <Eyebrow size={wide ? 13 : 11}>{kicker}</Eyebrow>
          </View>
        ) : null}
        <Serif role="h2" size={size ?? (wide ? 44 : 30)} style={{ marginTop: kicker ? 4 : 0 }}>{title}</Serif>
        {sub ? <T color={colors.muted} style={{ marginTop: 4 }}>{sub}</T> : null}
      </View>
      {link && href ? (
        <Link href={href}><T w={700} size={14} color={colors.brassText}>{link} {isRTL ? '←' : '→'}</T></Link>
      ) : null}
    </View>
  );
}

export function Button({ label, onPress, href, kind = 'primary', disabled, busy, style, size = 'md', full, icon }: {
  label: string; onPress?: () => void; href?: Href; kind?: 'primary' | 'secondary' | 'danger' | 'light' | 'text' | 'gold' | 'outlineLight'; disabled?: boolean; busy?: boolean;
  style?: StyleProp<ViewStyle>; size?: 'sm' | 'md' | 'lg'; full?: boolean; icon?: React.ReactNode;
}) {
  const BG = { primary: colors.navy, danger: colors.danger, light: colors.ivory, text: 'transparent', gold: colors.gold, outlineLight: 'transparent', secondary: colors.white };
  const FG = { primary: colors.white, danger: colors.white, light: colors.navy, text: colors.navy, gold: colors.night, outlineLight: colors.white, secondary: colors.navy };
  const BORDER = { primary: colors.navy, danger: colors.danger, light: 'transparent', text: 'transparent', gold: colors.gold, outlineLight: colors.goldLine, secondary: colors.navy };
  const bg = disabled ? colors.disabled : BG[kind];
  const fg = disabled ? colors.muted : FG[kind];
  const border = disabled ? colors.disabled : BORDER[kind];
  const h = size === 'lg' ? 56 : size === 'sm' ? 40 : 48;
  const base: StyleProp<ViewStyle> = [
    styles.button,
    { minHeight: h, backgroundColor: bg, borderColor: border, paddingHorizontal: kind === 'text' ? 4 : size === 'sm' ? 16 : size === 'lg' ? 30 : 24 },
    full && { alignSelf: 'stretch' },
    style,
  ];
  const content = busy ? <ActivityIndicator color={fg} /> : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {icon}
      <T w={700} size={size === 'lg' ? 16 : size === 'sm' ? 13.5 : 15} color={fg} style={kind === 'text' && { textDecorationLine: 'underline' }}>{label}</T>
    </View>
  );
  // Links: one flat style object. Link asChild spreads the child's style into an object, so a style function or
  // array breaks (a function dropped the button's background; an array crashes the page on the web).
  if (href && !disabled) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" style={StyleSheet.flatten(base)}>{content}</Pressable>
      </Link>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [base, (pressed || hovered) && !disabled && kind !== 'text' && { opacity: 0.88 }]}>
      {content}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; hint?: string; error?: string | null; dirLtr?: boolean }) {
  const { isRTL } = useI18n();
  const { label, hint, error, dirLtr, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space(1.75), flexGrow: 1 }}>
      {label ? <T w={600} size={13} style={{ marginBottom: 6 }}>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label || props.placeholder}
        {...rest}
        style={[
          styles.input, sans(400, isRTL),
          { textAlign: dirLtr ? 'left' : isRTL ? 'right' : 'left' },
          rest.multiline && { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
          error ? { borderColor: colors.danger, borderWidth: 2 } : null,
          style,
        ]}
      />
      {error ? <T size={12} w={500} color={colors.danger} style={{ marginTop: 4 }}>{error}</T> : hint ? <T size={12} color={colors.muted} style={{ marginTop: 4 }}>{hint}</T> : null}
    </View>
  );
}

export function Card({ children, style, pad = 20 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  return <View style={[styles.card, { padding: pad }, style]}>{children}</View>;
}

/** Filter chip: navy when active. */
export function Chip({ label, onPress, active, size = 'md' }: { label: string; onPress?: () => void; active?: boolean; size?: 'sm' | 'md' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, size === 'sm' && { minHeight: 36, paddingHorizontal: 12 }, active && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
      <T w={700} size={13} color={active ? colors.white : colors.navy}>{label}</T>
    </Pressable>
  );
}

const TAGS = {
  ok: [colors.successBg, colors.success], warn: [colors.warnBg, colors.warn], info: [colors.infoBg, colors.navy],
  err: [colors.dangerBg, colors.danger], mute: ['#F3EEE5', colors.muted], sample: [colors.white, colors.sampleText],
} as const;

/** Status tag. "sample" is the dashed brick tag for anything not real yet (not connected, provisional). */
export function Tag({ label, tone = 'mute' }: { label: string; tone?: keyof typeof TAGS }) {
  const [bg, fg] = TAGS[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }, tone === 'sample' && { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sample }]}>
      <T w={700} size={11.5} color={fg}>{label}</T>
    </View>
  );
}

/** Photograph slot: product image when there is one, otherwise a soft tone (optionally with the arch motif). */
export function Photo({ uri, tone, shape = 'rounded', ratio = 4 / 5, style, motif, label, fit = 'cover' }: {
  uri?: string | null; tone?: string; shape?: 'rounded' | 'arch' | 'tall-arch'; ratio?: number; style?: StyleProp<ViewStyle>; motif?: number; label?: string; fit?: 'cover' | 'contain';
}) {
  const r = shape === 'rounded' ? { borderRadius: 20 } : { borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 };
  return (
    <View
      accessible={!!label}
      accessibilityLabel={label}
      style={[{ width: '100%', aspectRatio: ratio, backgroundColor: tone ?? colors.sand, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, r, style]}>
      {uri ? <Image source={{ uri: imageUrl(uri) }} style={StyleSheet.absoluteFill} contentFit={fit} transition={200} /> : motif ? <ArchMotif width={motif} /> : null}
    </View>
  );
}

export function Price({ product, style, size = 17 }: { product: Product; style?: StyleProp<TextStyle>; size?: number }) {
  const { currency, lang } = useI18n();
  return <T w={700} size={size} color={colors.navy} style={style}>{formatMoney(priceIn(product, currency), currency, lang)}</T>;
}

/** Product card: 4:5 photograph, category in gold, name, price, availability. */
export function ProductTile({ product, compact }: { product: Product; compact?: boolean }) {
  const { pick, t } = useI18n();
  const tag = product.categories ?? product.product_tags?.[0]?.tags;
  const soldOut = product.stock <= 0;
  const img = product.images[0];
  return (
    <Link href={{ pathname: '/product/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable accessibilityRole="link" style={StyleSheet.flatten([styles.tile, compact && { borderRadius: 16 }, soldOut && { opacity: 0.6 }])}>
        <Photo uri={img} tone={img ? colors.sandSoft : toneFor(product.slug)} fit="cover" motif={compact ? 54 : 80} style={{ borderRadius: 0 }} />
        <View style={{ gap: compact ? 3 : 4, paddingHorizontal: compact ? 10 : 14, paddingTop: compact ? 10 : 14, paddingBottom: compact ? 12 : 16 }}>
          {tag && !compact ? <Eyebrow size={11}>{pick(tag, 'name')}</Eyebrow> : null}
          <T w={700} size={compact ? 13.5 : 15.5} lh={1.35} numberOfLines={2}>{pick(product, 'name')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, paddingTop: 2 }}>
            <Price product={product} size={compact ? 15 : 17} />
            {!compact ? <T w={600} size={12} color={soldOut ? colors.sampleText : colors.success}>{soldOut ? t('outOfStock') : t('inStock')}</T> : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

/** Responsive grid: equal columns that wrap. */
export function Grid({ children, min = 240, gap = 22, cols }: { children: React.ReactNode; min?: number; gap?: number; cols?: number }) {
  const { width } = useWindowDimensions();
  const avail = Math.min(width, MAX_WIDTH) - (width >= WIDE ? 48 : 32);
  const n = cols ?? Math.max(1, Math.floor((avail + gap) / (min + gap)));
  const items = React.Children.toArray(children);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }}>
      {items.map((c, i) => (
        <View key={i} style={{ width: `${100 / n}%`, paddingHorizontal: gap / 2, marginBottom: gap }}>{c}</View>
      ))}
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator style={{ marginVertical: space(6) }} color={colors.navy} />;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'ok' }) {
  const bg = tone === 'warn' ? colors.dangerBg : tone === 'ok' ? colors.successBg : colors.infoBg;
  const fg = tone === 'warn' ? colors.danger : tone === 'ok' ? colors.success : colors.navy;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, marginVertical: space(1) }}>
      <T w={600} size={14} color={fg}>{text}</T>
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;
}

export function Breadcrumb({ items }: { items: { label: string; href?: Href }[] }) {
  return (
    <View role="navigation" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <T size={13} color={colors.muted}>/</T>}
          {it.href ? <Link href={it.href}><T size={13} color={colors.navy}>{it.label}</T></Link> : <T size={13} color={colors.muted}>{it.label}</T>}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Radio-style option card (delivery destination, delivery kind, shipping quote). */
export function OptionCard({ selected, onPress, title, body, icon, extra }: {
  selected?: boolean; onPress?: () => void; title: string; body?: string; icon?: React.ReactNode; extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      style={[styles.option, selected && { borderWidth: 2, borderColor: colors.navy, backgroundColor: colors.lavender, padding: 17 }]}>
      {icon}
      <T w={700} size={16} color={colors.navy}>{title}</T>
      {body ? <T size={13} color={colors.muted} lh={1.45}>{body}</T> : null}
      {extra}
      {selected ? <T w={700} size={12} color={colors.success}>{t('selected')}</T> : null}
    </Pressable>
  );
}

/** Simple bottom sheet / centred menu for pickers (destination, currency, mobile menu). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const wide = useWide();
  const { t } = useI18n();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('close')} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,16,48,0.45)', justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: wide ? 520 : undefined, backgroundColor: colors.ivory, borderRadius: 24, borderBottomLeftRadius: wide ? 24 : 0, borderBottomRightRadius: wide ? 24 : 0, padding: 20, paddingBottom: wide ? 20 : 32, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Serif size={28}>{title}</Serif>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={styles.iconBtn}><Icon name="close" /></Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Quantity stepper. */
export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.inputLine, borderRadius: 999, backgroundColor: colors.white }}>
      <Pressable accessibilityRole="button" accessibilityLabel="−" onPress={() => onChange(Math.max(min, value - 1))} style={styles.stepBtn}><Icon name="minus" size={16} /></Pressable>
      <T w={700} size={15} style={{ minWidth: 26, textAlign: 'center' }}>{value}</T>
      <Pressable accessibilityRole="button" accessibilityLabel="+" onPress={() => onChange(value + 1)} style={styles.stepBtn}><Icon name="plus" size={16} /></Pressable>
    </View>
  );
}

export function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 }}>
      <T w={bold ? 700 : 400} size={bold ? 16 : 14} color={color ?? (bold ? colors.navy : colors.ink)} style={{ flexShrink: 1 }}>{label}</T>
      <T w={bold ? 700 : 400} size={bold ? 16 : 14} color={color ?? (bold ? colors.navy : colors.ink)}>{value}</T>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.white, fontSize: 16, color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  tile: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, overflow: 'hidden', shadowColor: colors.night, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.navy, backgroundColor: colors.white },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  option: { flex: 1, minWidth: 220, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, borderRadius: 18, padding: 18, gap: 6 },
  iconBtn: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
