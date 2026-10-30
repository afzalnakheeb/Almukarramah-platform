// Page chrome from the design: top bar, header, navigation, footer and the checkout header.
import { Image } from 'expo-image';
import { Link, router, usePathname, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '@/lib/cart';
import { getSettings } from '@/lib/catalogue';
import { useI18n, type Key } from '@/lib/i18n';
import { CURRENCIES } from '@/lib/money';
import { openExternal } from '@/lib/links';
import { DESTINATIONS, usePrefs, type Destination } from '@/lib/prefs';
import { colors, sans, space } from '@/theme';
import { Icon, type IconName } from './icons';
import { LogoMark } from './logo-motion';
import { bootMotion, data, motionBooted } from './motion';
import { Container, Notice, OptionCard, Sheet, styles as ui, T, useWide } from './ui';

const LOGO = require('../../assets/logo-ink.png'); // ink, for light backgrounds
const LOGO_GOLD = require('../../assets/logo-gold.png'); // satin antique gold, for dark backgrounds
const LOGO_RATIO = 917 / 264;
/** Where 'Sell with us' goes: an email to the team until the seller sign-up pages are live. */
export const SELL_HREF = 'mailto:hello@almukarramah.com?subject=Selling%20on%20Al%20Mukarramah';

export const destIcon = (d: Destination): IconName => (d === 'saudi' ? 'house' : d === 'international' ? 'globe' : 'bed');

/** The logo: ink on light backgrounds, satin gold on dark ones (white). With line, the descriptor
 *  "For every Muslim home" (لكل بيت مسلم) sits under it in spaced capitals, which tells this house apart from the group's other work. */
export function Logo({ height = 44, white, line, compact }: { height?: number; white?: boolean; line?: boolean; compact?: boolean }) {
  const { t, isRTL } = useI18n();
  // compact (the header once scrolled past the hero): about 80% of the height (48 -> 38) and the line fades out (motion: +html.tsx)
  const h = compact ? Math.round(height * 0.8) : height;
  // Website: the vector logo with its gold-thread intro and hover glint (logo-motion.tsx). Apps: the PNG artwork.
  const img = Platform.OS === 'web'
    ? <LogoMark height={h} gold={white} label={t('appName')} />
    : <Image source={white ? LOGO_GOLD : LOGO} style={{ height: h, width: h * LOGO_RATIO }} contentFit="contain" accessibilityLabel={t('appName')} />;
  if (!line) return img;
  const size = Math.max(8.5, Math.round(height * 0.2 * 10) / 10);
  return (
    <View {...data({ logo: compact === undefined ? undefined : compact ? 'compact' : 'full' })} style={{ alignItems: 'center', gap: Math.round(height * 0.09) }}>
      {img}
      <View style={{ alignSelf: 'stretch', height: StyleSheet.hairlineWidth, backgroundColor: colors.goldLine }} />
      <T w={600} size={isRTL ? size * 1.2 : size} color={white ? colors.gold : colors.brassText} lh={1.25}
        style={{ letterSpacing: isRTL ? 0 : size * 0.18, textTransform: 'uppercase' }}>
        {t('logoLine')}
      </T>
    </View>
  );
}

/**
 * Every customer screen sits inside this. On the website it adds the header and footer from the design;
 * in the iPhone and Android apps the tab bar and stack headers do that job instead.
 */
export function Screen({ children, scroll = true, chrome = 'site', step, padded = true, footer = true, style }: {
  children: React.ReactNode; scroll?: boolean; chrome?: 'site' | 'checkout' | 'none'; step?: 1 | 2 | 3; padded?: boolean; footer?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const web = Platform.OS === 'web';
  const wide = useWide();
  // Website header: compact once the page has scrolled past the hero, full size again near the top.
  const [compact, setCompact] = useState(false);
  const onScroll = web && scroll && chrome === 'site'
    ? (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setCompact((c) => (c ? y > 120 : y > (wide ? 640 : 320)));
    }
    : undefined;
  // Page change (website): the main content fades in over 250 ms. Never on the first, pre-rendered paint.
  const path = usePathname();
  const [fade, setFade] = useState<'a' | 'b' | undefined>(() => (web && motionBooted() ? 'a' : undefined));
  const lastPath = useRef(path);
  useEffect(() => { if (web) bootMotion(); }, [web]);
  useEffect(() => {
    if (lastPath.current === path) return;
    lastPath.current = path;
    setFade((f) => (f === 'a' ? 'b' : 'a'));
  }, [path]);
  const body = (
    <>
      {web && chrome === 'site' && <SiteHeader compact={compact} />}
      {web && chrome === 'checkout' && <CheckoutHeader step={step ?? 1} />}
      <StoreBanner />
      <View {...data({ page: fade })} style={scroll ? { flexGrow: 1 } : { flex: 1 }}>
        {padded ? <Container style={[{ paddingTop: space(3), paddingBottom: space(8) }, style]}>{children}</Container> : children}
      </View>
      {web && chrome === 'site' && footer && <SiteFooter />}
    </>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ivory }} edges={web ? [] : ['top']}>
      {scroll ? <ScrollView {...data({ scroller: 1 })} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={{ flexGrow: 1 }}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

/** Store-wide banner and "store closed" notice from store_settings (set from Claude or the admin panel). */
function StoreBanner() {
  const { t, lang } = useI18n();
  const [s, setS] = useState<{ closed: boolean; banner: string | null } | null>(null);
  useEffect(() => {
    getSettings().then((x) => x && setS({ closed: !x.store_open, banner: lang === 'ar' ? x.banner_ar : x.banner_en })).catch(() => undefined);
  }, [lang]);
  if (!s || (!s.closed && !s.banner)) return null;
  return (
    <Container style={{ paddingTop: space(1) }}>
      {s.closed && <Notice tone="warn" text={t('storeClosed')} />}
      {s.banner ? <Notice text={s.banner} /> : null}
    </Container>
  );
}

function IconLink({ href, icon, label, badge, color = colors.navy }: { href: Href; icon: IconName; label: string; badge?: number; color?: string }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={badge ? `${label}, ${badge}` : label} style={ui.iconBtn}>
        <Icon name={icon} size={22} stroke={1.5} color={color} />
        {badge ? (
          <View style={styles.badge}><T w={700} size={10} color={colors.white}>{badge}</T></View>
        ) : null}
      </Pressable>
    </Link>
  );
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const wide = useWide();
  const { t, lang, setLang, currency, isRTL } = useI18n();
  const { destination } = usePrefs();
  const { count } = useCart();
  const [sheet, setSheet] = useState<'dest' | 'cur' | 'menu' | null>(null);
  const toggleLang = () => setLang(lang === 'ar' ? 'en' : 'ar');
  // Sticky header (web, +html.tsx): while compact, the banner keeps its full height (transparent, clicks pass through)
  // so the page below never jumps as the header shrinks; the hold is released once it has grown back.
  const natural = useRef(0);
  const [hold, setHold] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (compact) { setHold(natural.current || undefined); return; }
    const id = setTimeout(() => setHold(undefined), 360);
    return () => clearTimeout(id);
  }, [compact]);

  const nav: { label: string; href: Href; external?: boolean }[] = [
    { label: t('navPerfumeOud'), href: { pathname: '/collections/[slug]', params: { slug: 'perfumes' } } },
    { label: t('navPrayer'), href: { pathname: '/collections/[slug]', params: { slug: 'prayer-mats' } } },
    { label: t('navGifts'), href: { pathname: '/collections/[slug]', params: { slug: 'gift-sets' } } },
    { label: t('navDates'), href: { pathname: '/collections/[slug]', params: { slug: 'dates' } } },
    { label: t('ourApps'), href: '/apps' },
  ];
  const caps = (size: number) => (isRTL ? { fontSize: size + 2 } : { letterSpacing: size * 0.16, textTransform: 'uppercase' as const });

  return (
    <View role="banner" {...data({ banner: wide ? 'wide' : 'narrow', compact })}
      onLayout={(e) => { if (!compact && hold === undefined) natural.current = e.nativeEvent.layout.height; }}
      style={{ pointerEvents: 'box-none', height: compact ? natural.current || undefined : hold }}>
      {wide ? (
        <>
          {/* thin black bar: delivery, currency and the smaller links (exactly 36 px: it scrolls away, the house below stays) */}
          <View style={{ backgroundColor: colors.kiswah }}>
            <Container style={{ height: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Pressable accessibilityRole="button" onPress={() => setSheet('dest')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T size={12} color={colors.onNightFaint}>{t('deliveringTo')}</T>
                  <T w={600} size={12} color={colors.onNight}>{t(`dest_${destination}` as Key)}</T>
                  <Icon name="chevronDown" size={11} stroke={2} color={colors.gold} />
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setSheet('cur')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderStartWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingStart: 16 }}>
                  <T w={600} size={12} color={colors.onNight}>{currency}</T>
                  <Icon name="chevronDown" size={11} stroke={2} color={colors.gold} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
                <Link href={SELL_HREF as Href}><T size={12} color={colors.goldBright}>{t('sellWithUs')}</T></Link>
                <Link href="/membership" {...data({ foot: 1 })}><T size={12} color={colors.onNight}>{t('membership')}</T></Link>
                <Link href="/concierge" {...data({ foot: 1 })}><T size={12} color={colors.onNight}>{t('concierge')}</T></Link>
                <Pressable accessibilityRole="button" onPress={toggleLang} style={{ borderStartWidth: 1, borderColor: 'rgba(255,255,255,0.14)', paddingStart: 16 }}>
                  <T size={12} color={colors.onNight} style={{ fontFamily: isRTL ? 'Manrope_600SemiBold' : 'ReadexPro_400Regular' }}>{t('language')}</T>
                </Pressable>
              </View>
            </Container>
          </View>
          {/* the house: search, the logo in the centre, account and bag */}
          <View {...data({ house: compact ? 'compact' : 'full' })} style={{ backgroundColor: colors.ivory }}>
            <Container style={{ paddingTop: compact ? 10 : 22, paddingBottom: compact ? 6 : 14, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, alignItems: 'flex-start' }}><SearchBox /></View>
              <Link href="/" accessibilityLabel={t('home')}><Logo height={48} line compact={compact} /></Link>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 2 }}>
                <IconLink href="/concierge" icon="help" label={t('concierge')} />
                <IconLink href="/account" icon="user" label={t('account')} />
                <IconLink href="/cart" icon="bag" label={t('cart')} badge={count || undefined} />
              </View>
            </Container>
            <Container style={{ paddingBottom: compact ? 4 : 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 44 }}>
              {nav.map((n) => (
                <Link key={n.label} href={n.href} target={n.external ? '_blank' : undefined} {...data({ ul: 'center' })} style={{ paddingVertical: 8 }}>
                  <T w={500} size={12} color={colors.navy} style={caps(12)}>{n.label}</T>
                </Link>
              ))}
            </Container>
            <View style={{ height: 1, backgroundColor: colors.goldLine }} />
          </View>
        </>
      ) : (
        <>
          <View {...data({ house: compact ? 'compact' : 'full' })} style={{ backgroundColor: colors.ivory, paddingVertical: 8, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.goldLine }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('menu')} onPress={() => setSheet('menu')} style={ui.iconBtn}><Icon name="menu" stroke={1.5} /></Pressable>
            <Link href="/" accessibilityLabel={t('home')}><Logo height={32} /></Link>
            <View style={{ flexDirection: 'row' }}>
              <IconLink href="/shop" icon="search" label={t('shop')} />
              <IconLink href="/cart" icon="bag" label={t('cart')} badge={count || undefined} />
            </View>
          </View>
          <View {...data({ collapse: 1 })} style={{ flexDirection: 'row', backgroundColor: colors.kiswah }}>
            <Pressable accessibilityRole="button" onPress={() => setSheet('dest')} style={{ flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
              <T size={12.5} color={colors.onNightFaint}>{t('deliveringTo')}</T>
              <T w={600} size={12.5} color={colors.onNight}>{t(`dest_${destination}` as Key)}</T>
              <Icon name="chevronDown" size={11} stroke={2} color={colors.gold} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setSheet('cur')} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, borderStartWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}>
              <T w={600} size={12.5} color={colors.onNight}>{currency}</T>
            </Pressable>
          </View>
        </>
      )}
      <DestinationSheet open={sheet === 'dest'} onClose={() => setSheet(null)} />
      <CurrencySheet open={sheet === 'cur'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={t('menu')}>
        {[...nav, { label: t('membership'), href: '/membership' as Href }, { label: t('helpChoose'), href: '/concierge' as Href }, { label: t('account'), href: '/account' as Href }, { label: t('sellWithUs'), href: SELL_HREF as Href, external: true }].map((n) => (
          <Pressable key={n.label} accessibilityRole="link" onPress={() => { setSheet(null); if ('external' in n && n.external) openExternal(String(n.href)); else router.push(n.href); }} style={styles.menuRow}>
            <T w={500} size={16} color={colors.navy}>{n.label}</T>
            <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={18} stroke={1.4} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => { setSheet(null); toggleLang(); }} style={styles.menuRow}>
          <T w={700} size={16} color={colors.navy}>{t('language')}</T>
        </Pressable>
      </Sheet>
    </View>
  );
}

/** Header search: goes to the shop with ?q=, which also powers the WebSite search action for Google. */
function SearchBox({ dark }: { dark?: boolean }) {
  const { t, isRTL } = useI18n();
  const [q, setQ] = useState('');
  const go = () => q.trim() && router.push({ pathname: '/shop', params: { q: q.trim() } });
  return (
    <View accessibilityRole="search" style={[styles.search, dark && styles.searchDark]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('searchPlaceholder')} onPress={go}><Icon name="search" size={18} color={dark ? colors.gold : colors.muted} stroke={1.5} /></Pressable>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={go}
        returnKeyType="search"
        placeholder={t('searchPlaceholder')}
        placeholderTextColor={dark ? colors.onNightFaint : colors.muted}
        accessibilityLabel={t('searchPlaceholder')}
        style={[sans(400, isRTL), { flex: 1, fontSize: 14, color: dark ? colors.white : colors.ink, minHeight: 40, textAlign: isRTL ? 'right' : 'left', outlineStyle: 'none' } as never]}
      />
    </View>
  );
}

export function DestinationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { destination, setDestination } = usePrefs();
  return (
    <Sheet open={open} onClose={onClose} title={t('destHeading')}>
      <View style={{ gap: 10 }}>
        {DESTINATIONS.map((d) => (
          <OptionCard
            key={d}
            selected={d === destination}
            onPress={() => { setDestination(d); onClose(); }}
            icon={<Icon name={destIcon(d)} size={24} stroke={1.6} />}
            title={t(`destTitle_${d}` as Key)}
            body={t(`destDesc_${d}` as Key)}
          />
        ))}
      </View>
    </Sheet>
  );
}

export function CurrencySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, currency, setCurrency } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={t('currency')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CURRENCIES.map((c) => (
          <Pressable key={c} accessibilityRole="radio" accessibilityState={{ checked: c === currency }} onPress={() => { setCurrency(c); onClose(); }}
            style={[styles.curOption, c === currency && { borderWidth: 2, borderColor: colors.navy, backgroundColor: colors.lavender }]}>
            <T w={700} size={16} color={colors.navy}>{c}</T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export function SiteFooter() {
  const wide = useWide();
  const { t, setLang, lang } = useI18n();
  const col = (title: string, links: { label: string; href?: Href }[]) => (
    <View style={{ gap: 10, minWidth: 190, flex: 1 }}>
      <T w={700} color={colors.goldBright}>{title}</T>
      {links.map((l) => (l.href ? <Link key={l.label} href={l.href} target={String(l.href).startsWith('http') ? '_blank' : undefined} {...data({ foot: 1 })}><T size={14} color={colors.onNight}>{l.label}</T></Link> : <T key={l.label} size={14} color={colors.onNightFaint}>{l.label}</T>))}
    </View>
  );
  return (
    <View role="contentinfo" style={{ backgroundColor: colors.kiswah, marginTop: 'auto', overflow: 'hidden' }}>
      <Container style={{ paddingTop: wide ? 64 : 32, paddingBottom: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 32 }}>
        <View style={{ gap: 14, minWidth: 220, flex: 1 }}>
          <View style={{ alignSelf: 'flex-start' }}><Logo height={52} white line /></View>
          <T size={14} color={colors.onNight}>{t('footerTagline')}</T>
          <Pressable accessibilityRole="button" onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.goldLine, borderRadius: 2, paddingHorizontal: 14, paddingVertical: 6 }}><T w={600} size={14} color={colors.white}>{t('language')}</T></Pressable>
        </View>
        {col(t('shop'), [
          { label: t('allGifts'), href: '/shop' },
          { label: t('navPerfumes'), href: { pathname: '/collections/[slug]', params: { slug: 'perfumes' } } },
          { label: t('fragTabOils'), href: { pathname: '/collections/[slug]', params: { slug: 'oud-oils' } } },
          { label: t('hajjTitle'), href: { pathname: '/shop', params: { tag: 'hajj' } } },
          { label: t('ramadanTitle'), href: { pathname: '/shop', params: { tag: 'ramadan' } } },
          { label: t('concierge'), href: '/concierge' },
        ])}
        {col(t('footerDelivery'), [
          { label: t('footHotel') }, { label: t('footSaudi') }, { label: t('footIntl') }, { label: t('footOrders'), href: '/account' },
        ])}
        {col(t('footerCompany'), [
          { label: t('sellWithUs'), href: SELL_HREF as Href },
          { label: t('membership'), href: '/membership' },
          { label: t('navQuran'), href: { pathname: '/apps/[slug]', params: { slug: 'recite-with-me' } } },
          { label: t('navSeerah'), href: { pathname: '/apps/[slug]', params: { slug: 'seerah-trails' } } },
          { label: t('ourApps'), href: '/apps' },
          { label: t('account'), href: '/account' },
          { label: t('privacyPolicy'), href: '/privacy' },
          { label: t('termsOfService'), href: '/terms' },
        ])}
      </Container>
      <View style={{ borderTopWidth: 1, borderColor: colors.navyLine }}>
        <Container style={{ paddingVertical: 16, paddingBottom: 28, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
          <T size={12} color={colors.onNightFaint}>© {new Date().getFullYear()} {t('copyright')}</T>
          <T size={12} color={colors.onNightFaint}>{t('securePayment')} · {t('payNote')}</T>
        </Container>
      </View>
    </View>
  );
}

/** Checkout header from the design: logo, the three steps, and reassurance. */
export function CheckoutHeader({ step }: { step: 1 | 2 | 3 }) {
  const wide = useWide();
  const { t } = useI18n();
  const steps = [t('cart'), t('shipping'), t('stepDetails')];
  return (
    <View role="banner" style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.line }}>
      <Container style={{ paddingVertical: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <Link href="/" accessibilityLabel={t('home')}><Logo height={wide ? 40 : 30} /></Link>
        {wide && (
          <View style={{ flexDirection: 'row', gap: 26 }}>
            {steps.map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.stepDot, i + 1 <= step && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
                  <T w={700} size={12} color={i + 1 <= step ? colors.white : colors.muted}>{i + 1}</T>
                </View>
                <T w={i + 1 === step ? 700 : 500} size={14} color={i + 1 === step ? colors.navy : colors.muted}>{s}</T>
              </View>
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="lock" size={18} color={colors.success} />
          <T w={600} size={13.5} color={colors.success}>{t('secureCheckout')}</T>
        </View>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { width: 260, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.goldLine, minHeight: 40 },
  searchDark: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: colors.goldLine },
  destPill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 3, paddingHorizontal: 16, minHeight: 46 },
  curPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 3, paddingHorizontal: 14, minHeight: 46 },
  badge: { position: 'absolute', top: 6, end: 4, backgroundColor: colors.emerald, borderRadius: 999, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  menuRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line },
  curOption: { minWidth: 88, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 4, backgroundColor: colors.white },
  stepDot: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: colors.inputLine, alignItems: 'center', justifyContent: 'center' },
});
