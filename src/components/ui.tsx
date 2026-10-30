// Building blocks: an ivory house stitched with gold, green and black threads (spec: studio/ui/spec.md).
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import React, { useSyncExternalStore } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { useI18n } from '@/lib/i18n';
import { formatMoney, priceIn } from '@/lib/money';
import { imageUrl } from '@/lib/images';
import type { Product } from '@/lib/types';
import { colors, figures, GUTTER, MAX_WIDTH, sans, serif, space, toneFor, WIDE, type Weight } from '@/theme';
import { ArchMotif, Icon } from './icons';
import { data, reveal as revealAttrs } from './motion';

const noSubscribe = () => () => undefined;
/** False while React hydrates the pre-rendered page (which was built without a screen size), true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}

/** Wide (desktop) layout. On the website the first render matches the pre-rendered HTML, then adapts to the screen. */
export function useWide() {
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  return hydrated && width >= WIDE;
}

/** Spaced capitals in English; Arabic has no capitals, so it gets a touch more size instead of tracking. */
export const capsStyle = (size: number, isRTL: boolean, track = 0.18): TextStyle =>
  isRTL ? { fontSize: size + 2, letterSpacing: 0 } : { fontSize: size, letterSpacing: Math.round(size * track * 10) / 10, textTransform: 'uppercase' };

/** In Arabic, text starts on the right even when a line is Latin (a maker's name, a reference); without this the
 *  browser aligns such a line by its own script, to the left. */
const START_RTL: TextStyle = { textAlign: 'right' };

/** Text in Manrope (English) or Readex Pro (Arabic). `num` sets tabular figures; `caps` spaced capitals (English). */
export function T({ children, w = 400, size = 15, color = colors.ink, lh, style, numberOfLines, center, num, caps }: {
  children: React.ReactNode; w?: Weight; size?: number; color?: string; lh?: number; style?: StyleProp<TextStyle>; numberOfLines?: number; center?: boolean; num?: boolean; caps?: boolean;
}) {
  const { isRTL } = useI18n();
  const fs = caps ? capsStyle(size, isRTL) : { fontSize: size };
  return (
    <Text numberOfLines={numberOfLines} style={[sans(w, isRTL), { color }, fs, lh ? { lineHeight: Math.round((fs.fontSize ?? size) * lh) } : null, num && figures, center ? { textAlign: 'center' } : isRTL && START_RTL, style]}>
      {children}
    </Text>
  );
}

/** Headlines in Cormorant Garamond (English) or Amiri (Arabic). */
export function Serif({ children, size = 44, color = colors.navy, style, center, role, numberOfLines }: {
  children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle>; center?: boolean; role?: 'h1' | 'h2' | 'h3'; numberOfLines?: number;
}) {
  const { isRTL } = useI18n();
  const aria = role ? { role: 'heading' as const, 'aria-level': Number(role[1]) } : {};
  return <Text {...aria} numberOfLines={numberOfLines} style={[serif(size, isRTL), { color }, center ? { textAlign: 'center' } : isRTL && START_RTL, style]}>{children}</Text>;
}

/** Small gold capitals above a title. With `rule`, a short gold hairline leads in (it sits on the reading side). */
export function Eyebrow({ children, color = colors.brassText, size = 11, style, rule, center }: { children: React.ReactNode; color?: string; size?: number; style?: StyleProp<TextStyle>; rule?: boolean; center?: boolean }) {
  const { isRTL } = useI18n();
  const text = (
    <Text {...data({ eyebrow: 1 })} style={[sans(isRTL ? 500 : 600, isRTL), { color }, capsStyle(size, isRTL, 0.2), center ? { textAlign: 'center' } : isRTL && START_RTL, style]}>
      {children}
    </Text>
  );
  if (!rule) return text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: center ? 'center' : 'flex-start' }}>
      <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
      {text}
    </View>
  );
}

/** Page width container: 1280 max, 40 px gutters (20 on phones). */
export function Container({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const wide = useWide();
  return <View style={[{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: wide ? GUTTER.wide : GUTTER.narrow }, style]}>{children}</View>;
}

export function H1({ children, size, center }: { children: React.ReactNode; size?: number; center?: boolean }) {
  const wide = useWide();
  return <Serif role="h1" size={size ?? (wide ? 56 : 36)} center={center} style={{ marginBottom: space(1) }}>{children}</Serif>;
}

/** The Kiswah mark (inline copy of decor's, so ui.tsx stays free of the decor module). */
function Mark({ width = 96, center }: { width?: number; center?: boolean }) {
  const line = { height: 1, flex: 1, backgroundColor: colors.gold, opacity: 0.75 };
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: center ? 'center' : 'flex-start' }}>
      <View style={line} />
      <View style={{ width: 9, height: 9, backgroundColor: colors.kiswah }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 3, height: 1, backgroundColor: colors.gold }} />
      </View>
      <View style={line} />
    </View>
  );
}
export { Mark as KiswahRule };

/** Small capitals link with a fine gold underline that turns green on hover. */
export function CapsLink({ label, href, onPress, center, color = colors.navy }: { label: string; href?: Href; onPress?: () => void; center?: boolean; color?: string }) {
  const { isRTL } = useI18n();
  const inner = <T w={600} size={11.5} caps color={color}>{label}</T>;
  const style = { alignSelf: center ? 'center' as const : 'flex-start' as const, borderBottomWidth: 1, borderColor: colors.goldLine, paddingBottom: 5, paddingTop: 4 };
  if (href) return <Link href={href} {...data({ caps: 1 })} style={style}>{inner}</Link>;
  return <Pressable accessibilityRole="button" onPress={onPress} {...data({ caps: 1 })} style={style}>{inner}</Pressable>;
}

/**
 * Section heading. Default: eyebrow with a gold lead-in, serif title, and a caps link on the far side.
 * `center`: eyebrow, title and the Kiswah mark centred (the homepage chapters); the link then goes under the content.
 */
export function SectionHead({ kicker, title, sub, link, href, size, reveal, center }: { kicker?: string; title: string; sub?: string; link?: string; href?: Href; size?: number; reveal?: boolean; center?: boolean }) {
  const wide = useWide();
  const titleSize = size ?? (wide ? 48 : 34);
  if (center) {
    return (
      <View {...(reveal ? revealAttrs(0) : {})} style={{ alignItems: 'center', gap: wide ? 14 : 10, marginBottom: wide ? 48 : 28 }}>
        {kicker ? <Eyebrow center>{kicker}</Eyebrow> : null}
        <Serif role="h2" size={titleSize} center>{title}</Serif>
        <Mark center width={wide ? 112 : 88} />
        {sub ? <T size={wide ? 16 : 14.5} lh={1.6} color={colors.body} center style={{ maxWidth: 620, marginTop: 4 }}>{sub}</T> : null}
      </View>
    );
  }
  return (
    <View {...(reveal ? revealAttrs(0) : {})} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: wide ? 36 : 22 }}>
      <View style={{ flexShrink: 1, gap: wide ? 14 : 10 }}>
        {kicker ? <Eyebrow rule>{kicker}</Eyebrow> : null}
        <Serif role="h2" size={titleSize}>{title}</Serif>
        {sub ? <T color={colors.body} lh={1.6}>{sub}</T> : null}
      </View>
      {link && href ? <CapsLink label={link} href={href} /> : null}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'light' | 'text' | 'gold' | 'outlineLight' | 'quiet';
export function Button({ label, onPress, href, kind = 'primary', disabled, busy, style, size = 'md', full, icon }: {
  label: string; onPress?: () => void; href?: Href; kind?: ButtonKind; disabled?: boolean; busy?: boolean;
  style?: StyleProp<ViewStyle>; size?: 'sm' | 'md' | 'lg'; full?: boolean; icon?: React.ReactNode;
}) {
  // Primary: Madinah green fill. Secondary / outlineLight: a fine ink outline that fills ink on hover.
  // Gold: a satin gold outline on porcelain (special moments: membership). Quiet / text: no frame.
  const BG: Record<ButtonKind, string> = { primary: colors.emerald, danger: colors.danger, light: colors.porcelain, text: 'transparent', quiet: 'transparent', gold: colors.porcelain, outlineLight: 'transparent', secondary: 'transparent' };
  const FG: Record<ButtonKind, string> = { primary: colors.ivory, danger: colors.white, light: colors.navy, text: colors.navy, quiet: colors.navy, gold: colors.navy, outlineLight: colors.navy, secondary: colors.navy };
  const BORDER: Record<ButtonKind, string> = { primary: colors.emerald, danger: colors.danger, light: colors.line, text: 'transparent', quiet: 'transparent', gold: colors.gold, outlineLight: colors.navy, secondary: colors.navy };
  const bare = kind === 'text' || kind === 'quiet';
  // Disabled keeps the button's own colours, faded: a grey slab reads cheap.
  const bg = BG[kind];
  const fg = FG[kind];
  const border = BORDER[kind];
  const { isRTL } = useI18n();
  const h = size === 'lg' ? 56 : size === 'sm' ? 40 : 48;
  const base: StyleProp<ViewStyle> = [
    styles.button,
    { minHeight: bare ? 36 : h, backgroundColor: bg, borderColor: border, paddingHorizontal: bare ? 2 : size === 'sm' ? 18 : size === 'lg' ? 34 : 26 },
    disabled && { opacity: 0.38 },
    full && { alignSelf: 'stretch' },
    style,
  ];
  const fs = size === 'lg' ? 12.5 : size === 'sm' ? 11 : 12;
  const content = busy ? <ActivityIndicator color={fg} /> : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon}
      {kind === 'text' ? (
        <T w={500} size={isRTL ? 15 : 14} color={fg} style={{ textDecorationLine: 'underline', textDecorationColor: colors.goldLine } as TextStyle}>{label}</T>
      ) : (
        <View {...(kind === 'quiet' ? data({ ul: 'start' }) : {})} style={kind === 'quiet' ? { borderBottomWidth: 1, borderColor: colors.goldLine, paddingBottom: 4 } : undefined}>
          <T w={isRTL ? 500 : 600} size={fs} caps color={fg}>{label}</T>
        </View>
      )}
    </View>
  );
  // Links: one flat style object. Link asChild spreads the child's style into an object, so a style function or
  // array breaks (a function dropped the button's background; an array crashes the page on the web).
  if (href && !disabled) {
    return (
      <Link href={href} asChild>
        <Pressable accessibilityRole="link" {...data({ btn: kind })} style={StyleSheet.flatten(base)}>{content}</Pressable>
      </Link>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      {...data({ btn: disabled ? undefined : kind })}
      style={({ pressed }: { pressed: boolean }) => [base, pressed && !disabled && !bare && { opacity: 0.9 }]}>
      {content}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; hint?: string; error?: string | null; dirLtr?: boolean }) {
  const { isRTL } = useI18n();
  const { label, hint, error, dirLtr, style, ...rest } = props;
  return (
    <View style={{ marginBottom: space(2), flexGrow: 1 }}>
      {label ? <T w={500} size={12.5} color={colors.body} style={{ marginBottom: 7 }}>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label || props.placeholder}
        {...data({ field: error ? 'error' : 1 })}
        {...rest}
        style={[
          styles.input, sans(400, isRTL),
          { textAlign: dirLtr ? 'left' : isRTL ? 'right' : 'left', writingDirection: dirLtr ? 'ltr' : isRTL ? 'rtl' : 'ltr' },
          rest.multiline && { minHeight: 104, paddingTop: 13, textAlignVertical: 'top' },
          error ? { borderColor: colors.danger } : null,
          style,
        ]}
      />
      {error ? <T size={12} w={500} color={colors.danger} style={{ marginTop: 6 }}>{error}</T> : hint ? <T size={12} color={colors.muted} style={{ marginTop: 6 }}>{hint}</T> : null}
    </View>
  );
}

export function Card({ children, style, pad = 24 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  return <View style={[styles.card, { padding: pad }, style]}>{children}</View>;
}

/** Filter chip (phones, compact lists): a fine line; the chosen one is outlined in Madinah green. */
export function Chip({ label, onPress, active, size = 'md' }: { label: string; onPress?: () => void; active?: boolean; size?: 'sm' | 'md' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      {...data({ chip: active ? 'on' : 'off' })}
      style={[styles.chip, size === 'sm' && { minHeight: 34, paddingHorizontal: 13 }, active && { borderColor: colors.emerald, backgroundColor: colors.emeraldSoft }]}>
      <T w={500} size={size === 'sm' ? 12.5 : 13} color={active ? colors.emerald : colors.navy}>{label}</T>
    </Pressable>
  );
}

/** A filter row for the desktop sidebar: a small square that takes a green tick, then the label. */
export function FilterOption({ label, active, onPress, count, radio }: { label: string; active?: boolean; onPress?: () => void; count?: number; radio?: boolean }) {
  return (
    <Pressable accessibilityRole={radio ? 'radio' : 'checkbox'} accessibilityState={{ checked: !!active }} onPress={onPress} {...data({ opt: active ? 'on' : 'off' })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 }}>
      {radio ? (
        <View style={{ width: 15, height: 15, borderRadius: 999, borderWidth: 1, borderColor: active ? colors.emerald : colors.inputLine, backgroundColor: colors.porcelain, alignItems: 'center', justifyContent: 'center' }}>
          {active ? <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: colors.emerald }} /> : null}
        </View>
      ) : (
        <View style={{ width: 14, height: 14, borderWidth: 1, borderColor: active ? colors.emerald : colors.inputLine, backgroundColor: active ? colors.emerald : colors.porcelain, alignItems: 'center', justifyContent: 'center' }}>
          {active ? <Icon name="check" size={11} color={colors.ivory} stroke={2.2} /> : null}
        </View>
      )}
      <T size={13.5} w={active ? 500 : 400} color={active ? colors.navy : colors.body} style={{ flex: 1 }}>{label}</T>
      {count !== undefined ? <T size={12} num color={colors.muted}>{count}</T> : null}
    </Pressable>
  );
}

const TAGS = {
  ok: [colors.successBg, colors.success], warn: [colors.warnBg, colors.warn], info: [colors.infoBg, colors.navy],
  err: [colors.dangerBg, colors.danger], mute: [colors.stone, colors.muted], sample: [colors.porcelain, colors.sampleText],
} as const;

/** Status tag. "sample" is the dashed brick tag for anything not real yet (not connected, provisional). */
export function Tag({ label, tone = 'mute' }: { label: string; tone?: keyof typeof TAGS }) {
  const [bg, fg] = TAGS[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }, tone === 'sample' && { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sample }]}>
      <T w={600} size={11} color={fg} num>{label}</T>
    </View>
  );
}

/** Photograph slot: product image when there is one, otherwise a soft tone (optionally with the arch motif). */
export function Photo({ uri, tone, shape = 'rounded', ratio = 4 / 5, style, motif, label, fit = 'cover', fade = 200 }: {
  uri?: string | null; tone?: string; shape?: 'rounded' | 'arch' | 'tall-arch'; ratio?: number; style?: StyleProp<ViewStyle>; motif?: number; label?: string; fit?: 'cover' | 'contain'; fade?: number;
}) {
  const r = shape === 'rounded' ? { borderRadius: 1 } : { borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 };
  return (
    <View
      accessible={!!label}
      accessibilityLabel={label}
      style={[{ width: '100%', aspectRatio: ratio, backgroundColor: tone ?? colors.sand, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, r, style]}>
      {uri ? (
        // The zoom layer: photographs settle as they are revealed and zoom slowly under the pointer (web, see +html.tsx).
        <View {...data({ zoom: 1 })} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: imageUrl(uri) }} style={StyleSheet.absoluteFill} contentFit={fit} transition={fade} />
        </View>
      ) : motif ? <ArchMotif width={motif} /> : null}
    </View>
  );
}

/** Price: medium weight, tabular figures, never bold (houses state a price; they do not shout it). */
export function Price({ product, style, size = 15 }: { product: Product; style?: StyleProp<TextStyle>; size?: number }) {
  const { currency, lang } = useI18n();
  return <T w={500} size={size} num color={colors.navy} style={[{ letterSpacing: 0.2 }, style]}>{formatMoney(priceIn(product, currency), currency, lang)}</T>;
}

/** Product names without the brand in front ("Ahmed Al Maghribi Zumar Eau de Parfum" becomes "Zumar Eau de Parfum");
 *  the brand is shown above the name instead, the way houses present a maker. */
const BRAND_AR: Record<string, string> = { 'Ahmed Al Maghribi': 'أحمد المغربي' };
export const brandName = (brand: string, ar: boolean) => (ar ? BRAND_AR[brand] ?? brand : brand);
/** The maker named at the start (or, in Arabic, the end) of a product name, when it is one of the houses we carry. */
export const makerOf = (name: string): string | undefined =>
  Object.keys(BRAND_AR).find((b) => name.startsWith(b) || name.includes(BRAND_AR[b]));

export function shortName(name: string, brand?: string | null) {
  let n = name;
  if (brand) {
    if (n.startsWith(brand)) n = n.slice(brand.length).replace(/^[\s·,:-]+/, '');
    n = n.replace(/\s+من أحمد المغربي/, '').replace(/^أحمد المغربي\s+/, '');
  }
  // a size stays with its number ("60 ml", "500 g"): never a lone "ml" on the next line
  return (n || name).replace(/([\d٠-٩])\s+(ml|g|kg|cm|مل|غ|جم|كغ)(?=$|[\s,)،])/g, '$1\u00A0$2');
}

/** Products whose cover is still a close-up taken on the floor; kept out of curated rows until re-shot. */
export const NOT_STUDIO = ['kaaba-clock-tower-woven-rug-gold', 'kids-rawdah-woven-rug-red', 'kids-rawdah-woven-rug-green', 'black-stone-prayer-mat'];

/** Product card, no box: the photograph on a pale panel, then the maker in gold capitals, the name and the price, centred. */
export function ProductTile({ product, compact }: { product: Product; compact?: boolean }) {
  const { pick, t, isRTL } = useI18n();
  const tag = product.categories ?? product.product_tags?.[0]?.tags;
  const seller = product.sellers?.kind === 'marketplace' ? product.sellers : null;
  const soldOut = product.stock <= 0 && !product.made_to_measure;
  const img = product.images[0];
  const nameSize = compact ? 17 : 20;
  return (
    <Link href={{ pathname: '/product/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable accessibilityRole="link" {...data({ hover: 'tile' })} style={styles.tile}>
        <Photo uri={img} tone={img ? colors.sand : toneFor(product.slug)} fit="cover" motif={compact ? 54 : 80} style={soldOut ? { opacity: 0.55 } : undefined} />
        <View style={{ alignItems: 'center', gap: compact ? 5 : 7, paddingHorizontal: compact ? 4 : 10, paddingTop: compact ? 12 : 18 }}>
          {/* the maker above the name: a marketplace seller, the brand we resell, or the collection */}
          {seller || product.brand || tag ? (
            <Eyebrow size={compact ? 9.5 : 10} center>{seller ? (isRTL && seller.name_ar ? seller.name_ar : seller.name_en) : product.brand ? brandName(product.brand, isRTL) : pick(tag!, 'name')}</Eyebrow>
          ) : null}
          <Serif size={nameSize} center color={colors.navy} numberOfLines={2} style={!isRTL && { lineHeight: Math.round(nameSize * 1.2) }}>{shortName(pick(product, 'name'), product.brand)}</Serif>
          {/* fine gold hairline under the name, drawn in from the centre on hover (web) */}
          <View {...data({ hairline: 'c' })} style={{ height: 1, width: compact ? 22 : 30, backgroundColor: colors.gold }} />
          <Price product={product} size={compact ? 13.5 : 14.5} />
          {product.made_to_measure ? <T w={500} size={10.5} caps color={colors.brassText}>{t('tailorMade')}</T> : null}
          {soldOut ? <T w={500} size={10.5} caps color={colors.sampleText}>{t('outOfStock')}</T> : null}
        </View>
      </Pressable>
    </Link>
  );
}

/** Responsive grid: equal columns that wrap. With `reveal`, each cell rises into view, the cells of a row 80 ms apart. */
export function Grid({ children, min = 240, gap = 24, rowGap, cols, reveal }: { children: React.ReactNode; min?: number; gap?: number; rowGap?: number; cols?: number; reveal?: boolean }) {
  const { width: w } = useWindowDimensions();
  const width = useHydrated() ? w : 0;
  const avail = Math.min(width, MAX_WIDTH) - (width >= WIDE ? GUTTER.wide * 2 : GUTTER.narrow * 2);
  const n = cols ?? Math.max(1, Math.floor((avail + gap) / (min + gap)));
  const items = React.Children.toArray(children);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2 }}>
      {items.map((c, i) => (
        <View key={i} {...(reveal ? revealAttrs(i % n) : {})} style={{ width: `${100 / n}%`, paddingHorizontal: gap / 2, marginBottom: rowGap ?? gap }}>{c}</View>
      ))}
    </View>
  );
}

export function Loading() {
  return <ActivityIndicator style={{ marginVertical: space(8) }} color={colors.gold} />;
}

/** A quiet note: porcelain with a fine rule on the start side (gold for information, green for done, brick for a warning). */
export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' | 'ok' }) {
  const rule = tone === 'warn' ? colors.danger : tone === 'ok' ? colors.emerald : colors.gold;
  const fg = tone === 'warn' ? colors.danger : tone === 'ok' ? colors.success : colors.body;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.porcelain, borderStartWidth: 2, borderColor: rule, paddingVertical: 12, paddingHorizontal: 16, marginVertical: space(1) }}>
      <T w={tone === 'info' ? 400 : 500} size={13.5} lh={1.55} color={fg}>{text}</T>
    </View>
  );
}

/** Empty and error states: the Kiswah mark, a serif line, a sentence and the way on. */
export function EmptyState({ title, body, children, h1 }: { title: string; body?: string; children?: React.ReactNode; h1?: boolean }) {
  const wide = useWide();
  return (
    <View style={{ alignItems: 'center', paddingVertical: wide ? 72 : 48, paddingHorizontal: 12, gap: 16 }}>
      <Mark center width={104} />
      <Serif role={h1 ? 'h1' : 'h2'} size={wide ? 40 : 30} center style={{ marginTop: 8 }}>{title}</Serif>
      {body ? <T size={15} lh={1.65} color={colors.body} center style={{ maxWidth: 460 }}>{body}</T> : null}
      {children ? <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: wide ? 28 : 16, marginTop: 10, alignSelf: wide ? 'center' : 'stretch' }}>{children}</View> : null}
    </View>
  );
}

export function Divider({ style, gold }: { style?: StyleProp<ViewStyle>; gold?: boolean }) {
  return <View style={[{ height: 1, backgroundColor: gold ? colors.goldLine : colors.line }, style]} />;
}

export function Breadcrumb({ items }: { items: { label: string; href?: Href }[] }) {
  return (
    <View role="navigation" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={{ width: 3, height: 3, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />}
          {it.href ? <Link href={it.href} {...data({ foot: 1 })}><T size={12.5} color={colors.body}>{it.label}</T></Link> : <T size={12.5} color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{it.label}</T>}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Radio-style option card (delivery destination, delivery kind, shipping quote). Chosen: a green line and tick. */
export function OptionCard({ selected, onPress, title, body, icon, extra }: {
  selected?: boolean; onPress?: () => void; title: string; body?: string; icon?: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      onPress={onPress}
      {...data({ opt: selected ? 'on' : 'off' })}
      style={[styles.option, selected && { borderColor: colors.emerald, backgroundColor: colors.porcelain }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {icon ?? <View />}
        <View style={{ width: 18, height: 18, borderRadius: 999, borderWidth: 1, borderColor: selected ? colors.emerald : colors.inputLine, alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: colors.emerald }} /> : null}
        </View>
      </View>
      <T w={600} size={15} color={colors.navy}>{title}</T>
      {body ? <T size={13} color={colors.muted} lh={1.5}>{body}</T> : null}
      {extra}
    </Pressable>
  );
}

/** Bottom sheet (phones) or centred panel (desktop) for pickers: ivory, a gold hairline on top, a serif title. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const wide = useWide();
  const { t } = useI18n();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('close')} onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: wide ? 540 : undefined, backgroundColor: colors.ivory, borderTopWidth: 1, borderColor: colors.gold, padding: wide ? 32 : 22, paddingBottom: wide ? 32 : 36, gap: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Serif size={wide ? 32 : 28}>{title}</Serif>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={styles.iconBtn}><Icon name="close" size={20} stroke={1.3} /></Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Quantity stepper: a fine frame, tabular figures. */
export function Stepper({ value, onChange, min = 0, tall }: { value: number; onChange: (n: number) => void; min?: number; tall?: boolean }) {
  const btn = [styles.stepBtn, tall && { height: 54, width: 42 }];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.inputLine, borderRadius: 1, backgroundColor: colors.porcelain }}>
      <Pressable accessibilityRole="button" accessibilityLabel="−" onPress={() => onChange(Math.max(min, value - 1))} {...data({ step: 1 })} style={btn}><Icon name="minus" size={14} stroke={1.3} /></Pressable>
      <T w={500} size={tall ? 15 : 14.5} num style={{ minWidth: 28, textAlign: 'center' }}>{value}</T>
      <Pressable accessibilityRole="button" accessibilityLabel="+" onPress={() => onChange(value + 1)} {...data({ step: 1 })} style={btn}><Icon name="plus" size={14} stroke={1.3} /></Pressable>
    </View>
  );
}

export function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 }}>
      <T w={bold ? 600 : 400} size={bold ? 15.5 : 14} color={color ?? (bold ? colors.navy : colors.body)} style={{ flexShrink: 1 }}>{label}</T>
      <T w={bold ? 600 : 400} size={bold ? 15.5 : 14} num color={color ?? (bold ? colors.navy : colors.ink)}>{value}</T>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { borderRadius: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 1, paddingHorizontal: 14, backgroundColor: colors.porcelain, fontSize: 16, color: colors.ink },
  card: { backgroundColor: colors.porcelain, borderRadius: 2, borderWidth: 1, borderColor: colors.line },
  tile: { flex: 1 },
  chip: { paddingHorizontal: 15, minHeight: 38, justifyContent: 'center', borderRadius: 1, borderWidth: 1, borderColor: colors.line, backgroundColor: 'transparent' },
  tag: { alignSelf: 'flex-start', borderRadius: 1, paddingHorizontal: 9, paddingVertical: 3 },
  option: { flex: 1, minWidth: 220, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.porcelain, borderRadius: 2, padding: 18, gap: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
