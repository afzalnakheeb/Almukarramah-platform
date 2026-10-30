// Page chrome: utility bar, header, navigation, phone menu and search, footer and the checkout header.
// All light: ivory and stone, with gold hairlines, ink type and green only where the customer acts.
import { Image } from 'expo-image';
import { Link, router, usePathname, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '@/lib/cart';
import { getSettings } from '@/lib/catalogue';
import { useI18n, type Key } from '@/lib/i18n';
import { MARKET_LIVE } from '@/lib/flags';
import { CURRENCIES } from '@/lib/money';
import { openExternal } from '@/lib/links';
import { DESTINATIONS, usePrefs, type Destination } from '@/lib/prefs';
import { colors, sans, space } from '@/theme';
import { FadeRule, Ornament } from './decor';
import { Icon, type IconName } from './icons';
import { lockup, LogoMark } from './logo-motion';
import { bootMotion, data, motionBooted } from './motion';
import { Container, Notice, OptionCard, Serif, Sheet, styles as ui, T, useWide } from './ui';

const LOGO = require('../../assets/logo-ink.png'); // ink, for light backgrounds
const LOGO_GOLD = require('../../assets/logo-gold.png'); // satin antique gold (kept for the apps' dark splash)
const LOGO_RATIO = 917 / 264;
/** Where 'Sell with us' goes: the seller application and guidelines (app/sell). */
export const SELL_HREF = '/sell';

export const destIcon = (d: Destination): IconName => (d === 'saudi' ? 'house' : d === 'international' ? 'globe' : 'bed');

/** The logo: ink on the light pages (gold only where a dark surface remains, e.g. the apps' splash). With line, the
 *  lock-up: a fine gold rule that fades at both ends, then "For every Muslim home" (لكل بيت مسلم) in spaced capitals.
 *  `slot` marks the site header's logo, where the first-visit intro (public/intro.js) lands. */
export function Logo({ height = 44, white, line, compact, slot }: { height?: number; white?: boolean; line?: boolean; compact?: boolean; slot?: boolean }) {
  const { t, isRTL } = useI18n();
  // compact (the header once scrolled past the hero): 80% of the height and the line folds away (motion: +html.tsx)
  const h = compact ? Math.round(height * 0.8) : height;
  // Website: the exact vector mark, always still. Apps: the PNG.
  const img = Platform.OS === 'web'
    ? <LogoMark height={h} gold={white} label={t('appName')} slot={slot} />
    : <Image source={white ? LOGO_GOLD : LOGO} style={{ height: h, width: h * LOGO_RATIO }} contentFit="contain" accessibilityLabel={t('appName')} />;
  if (!line) return img;
  // proportions shared with the intro, so its large lock-up lands exactly on this one
  const L = lockup(height, isRTL);
  return (
    <View {...data({ logo: compact === undefined ? undefined : compact ? 'compact' : 'full' })} style={{ alignItems: 'center', gap: L.gap }}>
      {img}
      <View {...data({ brandline: slot ? 1 : undefined })} style={{ alignItems: 'center' }}>
        <FadeRule width={L.ruleW} />
        <T w={isRTL ? 500 : 600} size={L.size} color={colors.brassText}
          style={{ marginTop: L.ruleGap, lineHeight: L.size * 1.25, letterSpacing: L.size * L.track, textTransform: isRTL ? 'none' : 'uppercase' }}>
          {t('logoLine')}
        </T>
      </View>
    </View>
  );
}

/**
 * Every customer screen sits inside this. On the website it adds the header and footer;
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
        {padded ? <Container style={[{ paddingTop: wide ? space(5) : space(3), paddingBottom: wide ? space(14) : space(9) }, style]}>{children}</Container> : children}
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

function IconLink({ href, icon, label, badge, onPress }: { href?: Href; icon: IconName; label: string; badge?: number; onPress?: () => void }) {
  const inner = (
    <>
      <Icon name={icon} size={21} stroke={1.3} color={colors.navy} />
      {badge ? (
        <View style={styles.badge}><T w={600} size={9.5} num color={colors.ivory}>{badge}</T></View>
      ) : null}
    </>
  );
  if (!href) return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} {...data({ icon: 1 })} style={ui.iconBtn}>{inner}</Pressable>;
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={badge ? `${label}, ${badge}` : label} {...data({ icon: 1 })} style={ui.iconBtn}>{inner}</Pressable>
    </Link>
  );
}

type NavItem = { label: string; href: Href; match?: string; external?: boolean };
function useNav(): NavItem[] {
  const { t } = useI18n();
  return [
    { label: t('navPerfumeOud'), href: { pathname: '/collections/[slug]', params: { slug: 'perfumes' } }, match: '/collections/perfumes|/collections/oud-oils|/collections/bakhoor' },
    { label: t('navPrayer'), href: { pathname: '/collections/[slug]', params: { slug: 'prayer-mats' } }, match: '/collections/prayer-mats|/collections/woven-rugs' },
    { label: t('navGifts'), href: { pathname: '/collections/[slug]', params: { slug: 'gift-sets' } }, match: '/collections/gift-sets|/collections/keepsakes' },
    { label: t('navDates'), href: { pathname: '/collections/[slug]', params: { slug: 'dates' } }, match: '/collections/dates' },
    { label: t('ourApps'), href: '/apps', match: '/apps' },
  ];
}
const isCurrent = (path: string, match?: string) => !!match && match.split('|').some((m) => path === m || path.startsWith(`${m}/`));

/** A fine vertical divider for the utility bar. */
const Sep = () => <View style={{ width: 1, height: 12, backgroundColor: colors.line }} />;

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const wide = useWide();
  const { t, lang, setLang, currency, isRTL } = useI18n();
  const { destination } = usePrefs();
  const { count } = useCart();
  const path = usePathname();
  const nav = useNav();
  const [sheet, setSheet] = useState<'dest' | 'cur' | 'menu' | 'search' | null>(null);
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

  const util = (size = 11.5) => ({ size, color: colors.body });
  return (
    <View role="banner" {...data({ banner: wide ? 'wide' : 'narrow', compact })}
      onLayout={(e) => { if (!compact && hold === undefined) natural.current = e.nativeEvent.layout.height; }}
      style={{ pointerEvents: 'box-none', height: compact ? natural.current || undefined : hold }}>
      {wide ? (
        <>
          {/* utility row: no bar, just the ivory page and a gold hairline; delivery and currency, the smaller links
              (exactly 36 px: it scrolls away, the house below stays) */}
          <View style={{ backgroundColor: colors.ivory, borderBottomWidth: 1, borderColor: colors.hair }}>
            <Container style={{ height: 35, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Pressable accessibilityRole="button" onPress={() => setSheet('dest')} {...data({ foot: 1 })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={destIcon(destination)} size={13} stroke={1.4} color={colors.brass} />
                  <T {...util()} color={colors.muted}>{t('deliveringTo')}</T>
                  <T w={500} {...util()} color={colors.navy}>{t(`dest_${destination}` as Key)}</T>
                  <Icon name="chevronDown" size={10} stroke={1.6} color={colors.brass} />
                </Pressable>
                <Sep />
                <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setSheet('cur')} {...data({ foot: 1 })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <T w={500} {...util()} num color={colors.navy}>{currency}</T>
                  <Icon name="chevronDown" size={10} stroke={1.6} color={colors.brass} />
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}>
                <Link href={SELL_HREF as Href} {...data({ foot: 1 })}><T w={500} {...util()} color={colors.emerald}>{t('sellWithUs')}</T></Link>
                <Link href="/membership" {...data({ foot: 1 })}><T {...util()}>{t('membership')}</T></Link>
                <Link href="/concierge" {...data({ foot: 1 })}><T {...util()}>{t('concierge')}</T></Link>
                <Sep />
                <Pressable accessibilityRole="button" onPress={toggleLang} {...data({ foot: 1 })}>
                  <T w={500} size={isRTL ? 11.5 : 12.5} color={colors.navy} style={{ fontFamily: isRTL ? 'Manrope_500Medium' : 'ReadexPro_500Medium' }}>{t('language')}</T>
                </Pressable>
              </View>
            </Container>
          </View>
          {/* the house: search, the logo in the centre, assistant, account and bag */}
          <View {...data({ house: compact ? 'compact' : 'full' })} style={{ backgroundColor: colors.ivory }}>
            <Container style={{ paddingTop: compact ? 10 : 26, paddingBottom: compact ? 4 : 12, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, alignItems: 'flex-start' }}><SearchBox /></View>
              <Link href="/" accessibilityLabel={t('home')}><Logo height={50} line compact={compact} slot /></Link>
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                <IconLink href="/concierge" icon="sparkle" label={t('concierge')} />
                <IconLink href="/account" icon="user" label={t('account')} />
                <IconLink href="/cart" icon="bag" label={t('cart')} badge={count || undefined} />
              </View>
            </Container>
            {/* the doors, in spaced capitals; the current one is underlined in Madinah green */}
            <Container style={{ paddingBottom: compact ? 4 : 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 56 }}>
              {nav.map((n) => (
                <Link key={n.label} href={n.href} {...data({ ul: 'nav', cur: isCurrent(path, n.match) ? 1 : undefined })} style={{ paddingVertical: 11 }}>
                  <T w={isRTL ? 500 : 600} size={isRTL ? 14 : 11} color={colors.navy} style={isRTL ? undefined : { letterSpacing: 2.2, textTransform: 'uppercase' }}>{n.label}</T>
                </Link>
              ))}
            </Container>
            <View style={{ height: 1, backgroundColor: colors.goldLine }} />
          </View>
        </>
      ) : (
        <>
          <View {...data({ house: compact ? 'compact' : 'full' })} style={{ backgroundColor: colors.ivory, paddingVertical: 6, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.goldLine }}>
            <View style={{ flexDirection: 'row', width: 96 }}>
              <IconLink icon="menu" label={t('menu')} onPress={() => setSheet('menu')} />
              <IconLink icon="search" label={t('searchPlaceholder')} onPress={() => setSheet('search')} />
            </View>
            <Link href="/" accessibilityLabel={t('home')}><Logo height={30} slot /></Link>
            <View style={{ flexDirection: 'row', width: 96, justifyContent: 'flex-end' }}>
              <IconLink href="/account" icon="user" label={t('account')} />
              <IconLink href="/cart" icon="bag" label={t('cart')} badge={count || undefined} />
            </View>
          </View>
          {/* delivery strip: ivory under a gold hairline (no bar); it folds away as the page scrolls */}
          <View {...data({ collapse: 1 })} style={{ flexDirection: 'row', backgroundColor: colors.ivory, borderBottomWidth: 1, borderColor: colors.hair }}>
            <Pressable accessibilityRole="button" onPress={() => setSheet('dest')} style={{ flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20 }}>
              <Icon name={destIcon(destination)} size={14} stroke={1.4} color={colors.brass} />
              <T size={12.5} color={colors.muted}>{t('deliveringTo')}</T>
              <T w={500} size={12.5} color={colors.navy}>{t(`dest_${destination}` as Key)}</T>
              <Icon name="chevronDown" size={10} stroke={1.6} color={colors.brass} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setSheet('cur')} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 20, borderStartWidth: 1, borderColor: colors.line }}>
              <T w={500} size={12.5} num color={colors.navy}>{currency}</T>
              <Icon name="chevronDown" size={10} stroke={1.6} color={colors.brass} />
            </Pressable>
          </View>
        </>
      )}
      <DestinationSheet open={sheet === 'dest'} onClose={() => setSheet(null)} />
      <CurrencySheet open={sheet === 'cur'} onClose={() => setSheet(null)} />
      <MenuPanel open={sheet === 'menu'} nav={nav} onClose={() => setSheet(null)} onSheet={(s) => setSheet(s)} />
      <SearchPanel open={sheet === 'search'} nav={nav} onClose={() => setSheet(null)} />
    </View>
  );
}

/** Full-screen panel shared by the phone menu and phone search: ivory, a close button and the logo on top. */
function Panel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.ivory }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.goldLine }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={ui.iconBtn}><Icon name="close" size={21} stroke={1.3} /></Pressable>
          <Logo height={30} />
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** Phone menu: the five doors in large serif, then the smaller links, then language, delivery and currency. */
function MenuPanel({ open, nav, onClose, onSheet }: { open: boolean; nav: NavItem[]; onClose: () => void; onSheet: (s: 'dest' | 'cur') => void }) {
  const { t, lang, setLang, currency, isRTL } = useI18n();
  const { destination } = usePrefs();
  const go = (href: Href, external?: boolean) => { onClose(); if (external) openExternal(String(href)); else router.push(href); };
  const small: NavItem[] = [
    { label: t('concierge'), href: '/concierge' }, { label: t('membership'), href: '/membership' },
    { label: t('account'), href: '/account' }, { label: t('sellWithUs'), href: SELL_HREF as Href },
  ];
  return (
    <Panel open={open} onClose={onClose}>
      {nav.map((n) => (
        <Pressable key={n.label} accessibilityRole="link" onPress={() => go(n.href, n.external)} style={styles.menuRow}>
          <Serif size={30}>{n.label}</Serif>
          <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={16} stroke={1.3} color={colors.brass} />
        </Pressable>
      ))}
      <View style={{ paddingTop: 28, gap: 4 }}>
        {small.map((n) => (
          <Pressable key={n.label} accessibilityRole="link" onPress={() => go(n.href, n.external)} style={{ minHeight: 42, justifyContent: 'center' }}>
            <T w={500} size={11.5} caps color={n.external ? colors.emerald : colors.navy}>{n.label}</T>
          </Pressable>
        ))}
      </View>
      <Ornament width={88} style={{ marginTop: 28, marginBottom: 24 }} />
      <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => onSheet('dest')} style={styles.prefRow}>
          <Icon name={destIcon(destination)} size={16} stroke={1.4} color={colors.brass} />
          <T size={13.5} color={colors.muted}>{t('deliveringTo')}</T>
          <T w={500} size={13.5} color={colors.navy} style={{ flex: 1 }}>{t(`dest_${destination}` as Key)}</T>
          <Icon name="chevronDown" size={11} stroke={1.6} color={colors.brass} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable accessibilityRole="button" onPress={() => onSheet('cur')} style={[styles.prefRow, { flex: 1 }]}>
            <T size={13.5} color={colors.muted}>{t('currency')}</T>
            <T w={500} size={13.5} num color={colors.navy} style={{ flex: 1 }}>{currency}</T>
            <Icon name="chevronDown" size={11} stroke={1.6} color={colors.brass} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { onClose(); setLang(lang === 'ar' ? 'en' : 'ar'); }} style={[styles.prefRow, { justifyContent: 'center', paddingHorizontal: 20 }]}>
            <T w={500} size={14} color={colors.navy}>{t('language')}</T>
          </Pressable>
        </View>
      </View>
    </Panel>
  );
}

/** Phone search: one underlined field, then the doors as quick links. */
function SearchPanel({ open, nav, onClose }: { open: boolean; nav: NavItem[]; onClose: () => void }) {
  const { t, isRTL } = useI18n();
  const [q, setQ] = useState('');
  const go = () => { if (!q.trim()) return; onClose(); router.push({ pathname: MARKET_LIVE ? '/search' : '/shop', params: { q: q.trim() } }); };
  return (
    <Panel open={open} onClose={onClose}>
      <View {...data({ search: 1 })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.navy, marginTop: 20 }}>
        <Icon name="search" size={20} stroke={1.3} color={colors.navy} />
        <TextInput value={q} onChangeText={setQ} onSubmitEditing={go} returnKeyType="search" autoFocus
          placeholder={t('searchPlaceholder')} placeholderTextColor={colors.muted} accessibilityLabel={t('searchPlaceholder')}
          style={[sans(400, isRTL), { flex: 1, fontSize: 18, color: colors.ink, minHeight: 52, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr', outlineStyle: 'none' } as never]} />
      </View>
      <T w={600} size={10.5} caps color={colors.brassText} style={{ marginTop: 32, marginBottom: 8 }}>{t('searchSuggest')}</T>
      {nav.slice(0, 4).map((n) => (
        <Pressable key={n.label} accessibilityRole="link" onPress={() => { onClose(); router.push(n.href); }} style={{ minHeight: 46, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.line }}>
          <T size={15} color={colors.navy}>{n.label}</T>
        </Pressable>
      ))}
    </Panel>
  );
}

/** Header search: goes to the shop with ?q=, which also powers the WebSite search action for Google. */
function SearchBox() {
  const { t, isRTL } = useI18n();
  const [q, setQ] = useState('');
  const go = () => q.trim() && router.push({ pathname: MARKET_LIVE ? '/search' : '/shop', params: { q: q.trim() } });
  return (
    <View accessibilityRole="search" {...data({ search: 1 })} style={styles.search}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('searchPlaceholder')} onPress={go}><Icon name="search" size={17} color={colors.navy} stroke={1.3} /></Pressable>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={go}
        returnKeyType="search"
        placeholder={t('searchPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('searchPlaceholder')}
        style={[sans(400, isRTL), { flex: 1, fontSize: 13.5, color: colors.ink, minHeight: 38, textAlign: isRTL ? 'right' : 'left', writingDirection: isRTL ? 'rtl' : 'ltr', outlineStyle: 'none' } as never]}
      />
    </View>
  );
}

export function DestinationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { destination, setDestination } = usePrefs();
  return (
    <Sheet open={open} onClose={onClose} title={t('destHeading')}>
      <T size={13.5} lh={1.55} color={colors.body} style={{ marginTop: -6 }}>{t('destBody')}</T>
      <View style={{ gap: 10 }}>
        {DESTINATIONS.map((d) => (
          <OptionCard
            key={d}
            selected={d === destination}
            onPress={() => { setDestination(d); onClose(); }}
            icon={<Icon name={destIcon(d)} size={22} stroke={1.3} color={colors.brass} />}
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
            {...data({ opt: c === currency ? 'on' : 'off' })}
            style={[styles.curOption, c === currency && { borderColor: colors.emerald }]}>
            <T w={500} size={14} num color={c === currency ? colors.emerald : colors.navy} style={{ letterSpacing: 1.2 }}>{c}</T>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export function SiteFooter() {
  const wide = useWide();
  const { t, setLang, lang, currency } = useI18n();
  const [cur, setCur] = useState(false);
  const col = (title: string, links: { label: string; href?: Href }[]) => (
    <View style={{ gap: 12, minWidth: wide ? 180 : 150, flex: 1 }}>
      <T w={600} size={10.5} caps color={colors.navy} style={{ marginBottom: 6 }}>{title}</T>
      {links.map((l) => (l.href
        ? <Link key={l.label} href={l.href} target={String(l.href).startsWith('http') ? '_blank' : undefined} {...data({ foot: 1 })}><T size={13.5} color={colors.body}>{l.label}</T></Link>
        : <T key={l.label} size={13.5} color={colors.body}>{l.label}</T>))}
    </View>
  );
  return (
    <View role="contentinfo" style={{ backgroundColor: colors.stone, marginTop: 'auto', borderTopWidth: 1, borderColor: colors.goldLine }}>
      <Container style={{ paddingTop: wide ? 72 : 48, alignItems: 'center', gap: 18 }}>
        <Logo height={wide ? 50 : 40} line />
        <T size={13.5} lh={1.6} color={colors.body} center style={{ maxWidth: 420 }}>{t('footerTagline')}</T>
      </Container>
      <Container style={{ paddingTop: wide ? 56 : 36, paddingBottom: wide ? 56 : 32, flexDirection: 'row', flexWrap: 'wrap', rowGap: 32, columnGap: 32 }}>
        {col(t('shop'), [
          { label: t('allGifts'), href: '/shop' },
          { label: t('navPerfumes'), href: { pathname: '/collections/[slug]', params: { slug: 'perfumes' } } },
          { label: t('fragTabOils'), href: { pathname: '/collections/[slug]', params: { slug: 'oud-oils' } } },
          { label: t('navPrayer'), href: { pathname: '/collections/[slug]', params: { slug: 'prayer-mats' } } },
          { label: t('navFashion'), href: '/fashion' },
          { label: t('hajjTitle'), href: { pathname: '/shop', params: { tag: 'hajj' } } },
          { label: t('ramadanTitle'), href: { pathname: '/shop', params: { tag: 'ramadan' } } },
        ])}
        {col(t('footerDelivery'), [
          { label: t('footHotel') }, { label: t('footSaudi') }, { label: t('footIntl') }, { label: t('footOrders'), href: '/account' },
        ])}
        {col(t('footerCompany'), [
          { label: t('sellWithUs'), href: SELL_HREF as Href },
          { label: t('sellerGuidelines'), href: '/sell/guidelines' },
          { label: t('ourSellers'), href: '/sellers' },
          { label: t('membership'), href: '/membership' },
          { label: t('ourApps'), href: '/apps' },
          { label: t('navQuran'), href: { pathname: '/apps/[slug]', params: { slug: 'recite-with-me' } } },
          { label: t('navSeerah'), href: { pathname: '/apps/[slug]', params: { slug: 'seerah-trails' } } },
        ])}
        {col(t('footerHelp'), [
          { label: t('concierge'), href: '/concierge' },
          { label: t('account'), href: '/account' },
          { label: t('privacyPolicy'), href: '/privacy' },
          { label: t('termsOfService'), href: '/terms' },
        ])}
      </Container>
      {/* the black thread: one fine ink rule, then the small print, language and currency */}
      <Container>
        <View style={{ height: 1, backgroundColor: colors.navy, opacity: 0.85 }} />
        <View style={{ paddingTop: 18, paddingBottom: wide ? 30 : 36, flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: wide ? 'center' : 'flex-start', gap: 14 }}>
          <T size={12} color={colors.muted}>© {new Date().getFullYear()} {t('copyright')}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={13} stroke={1.4} color={colors.emerald} />
            <T size={12} color={colors.muted}>{t('re2t')} · {t('payNote')}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <Pressable accessibilityRole="button" onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} {...data({ foot: 1 })}>
              <T w={500} size={13} color={colors.navy} style={{ fontFamily: lang === 'ar' ? 'Manrope_500Medium' : 'ReadexPro_500Medium' }}>{t('language')}</T>
            </Pressable>
            <Sep />
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setCur(true)} {...data({ foot: 1 })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <T w={500} size={12.5} num color={colors.navy}>{currency}</T>
              <Icon name="chevronDown" size={10} stroke={1.6} color={colors.brass} />
            </Pressable>
          </View>
        </View>
      </Container>
      <CurrencySheet open={cur} onClose={() => setCur(false)} />
    </View>
  );
}

/** Checkout header: logo, the three steps (done ones ticked in green), and the secure-checkout line. */
export function CheckoutHeader({ step }: { step: 1 | 2 | 3 }) {
  const wide = useWide();
  const { t } = useI18n();
  const steps = [t('cart'), t('shipping'), t('stepDetails')];
  return (
    <View role="banner" style={{ backgroundColor: colors.ivory, borderBottomWidth: 1, borderColor: colors.goldLine }}>
      <Container style={{ paddingVertical: wide ? 18 : 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
        <Link href="/" accessibilityLabel={t('home')}><Logo height={wide ? 38 : 28} /></Link>
        {wide && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {steps.map((s, i) => {
              const n = i + 1;
              const done = n < step;
              const now = n === step;
              return (
                <React.Fragment key={s}>
                  {i > 0 && <View style={{ width: 40, height: 1, backgroundColor: done || now ? colors.gold : colors.line }} />}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {done ? <Icon name="check" size={14} stroke={1.8} color={colors.emerald} /> : <T w={500} size={11} num color={now ? colors.brassText : colors.muted}>{`0${n}`}</T>}
                    <T w={now ? 600 : 500} size={11} caps color={now ? colors.navy : done ? colors.emerald : colors.muted}>{s}</T>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="lock" size={15} stroke={1.4} color={colors.emerald} />
          <T w={500} size={11} caps color={colors.emerald}>{t('secureCheckout')}</T>
        </View>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { width: 264, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.goldLine, minHeight: 38 },
  badge: { position: 'absolute', top: 7, end: 5, backgroundColor: colors.emerald, borderRadius: 999, minWidth: 15, height: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  menuRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.porcelain },
  curOption: { minWidth: 92, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 1, backgroundColor: colors.porcelain },
});
