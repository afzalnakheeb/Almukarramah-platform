// Page chrome from the design: top bar, header, navigation, footer and the checkout header.
import { Image } from 'expo-image';
import { Link, router, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '@/lib/cart';
import { getSettings } from '@/lib/catalogue';
import { useI18n, type Key } from '@/lib/i18n';
import { CURRENCIES } from '@/lib/money';
import { openExternal, SEERAH_TRAIL_URL } from '@/lib/links';
import { DESTINATIONS, usePrefs, type Destination } from '@/lib/prefs';
import { colors, sans, space } from '@/theme';
import { Icon, type IconName } from './icons';
import { Container, Notice, OptionCard, Sheet, styles as ui, T, useWide } from './ui';

const LOGO = require('../../assets/logo.png');
const LOGO_WHITE = require('../../assets/logo-white.png');
const LOGO_RATIO = 917 / 264;

export const destIcon = (d: Destination): IconName => (d === 'saudi' ? 'house' : d === 'international' ? 'globe' : 'bed');

export function Logo({ height = 44, white }: { height?: number; white?: boolean }) {
  const { t } = useI18n();
  return <Image source={white ? LOGO_WHITE : LOGO} style={{ height, width: height * LOGO_RATIO }} contentFit="contain" accessibilityLabel={t('appName')} />;
}

/**
 * Every customer screen sits inside this. On the website it adds the header and footer from the design;
 * in the iPhone and Android apps the tab bar and stack headers do that job instead.
 */
export function Screen({ children, scroll = true, chrome = 'site', step, padded = true, footer = true, style }: {
  children: React.ReactNode; scroll?: boolean; chrome?: 'site' | 'checkout' | 'none'; step?: 1 | 2 | 3; padded?: boolean; footer?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const web = Platform.OS === 'web';
  const body = (
    <>
      {web && chrome === 'site' && <SiteHeader />}
      {web && chrome === 'checkout' && <CheckoutHeader step={step ?? 1} />}
      <StoreBanner />
      {padded ? <Container style={[{ paddingTop: space(3), paddingBottom: space(8) }, style]}>{children}</Container> : children}
      {web && chrome === 'site' && footer && <SiteFooter />}
    </>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ivory }} edges={web ? [] : ['top']}>
      {scroll ? <ScrollView contentContainerStyle={{ flexGrow: 1 }}>{body}</ScrollView> : body}
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

function IconLink({ href, icon, label, badge }: { href: Href; icon: IconName; label: string; badge?: number }) {
  return (
    <Link href={href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={badge ? `${label}, ${badge}` : label} style={ui.iconBtn}>
        <Icon name={icon} size={22} stroke={1.7} />
        {badge ? (
          <View style={styles.badge}><T w={700} size={10} color={colors.white}>{badge}</T></View>
        ) : null}
      </Pressable>
    </Link>
  );
}

export function SiteHeader() {
  const wide = useWide();
  const { t, lang, setLang, currency, isRTL } = useI18n();
  const { destination } = usePrefs();
  const { count } = useCart();
  const [sheet, setSheet] = useState<'dest' | 'cur' | 'menu' | null>(null);
  const toggleLang = () => setLang(lang === 'ar' ? 'en' : 'ar');

  const nav: { label: string; href: Href; external?: boolean }[] = [
    { label: t('shop'), href: '/shop' },
    { label: t('navOccasions'), href: { pathname: '/', params: { s: 'occasions' } } },
    { label: t('membership'), href: '/membership' },
    { label: t('navQuran'), href: { pathname: '/apps/[slug]', params: { slug: 'recite-with-me' } } },
    { label: t('navSeerah'), href: { pathname: '/apps/[slug]', params: { slug: 'seerah-trails' } } },
    { label: t('ourApps'), href: '/apps' },
  ];

  return (
    <View accessibilityRole="header">
      {wide ? (
        <>
          <View style={{ backgroundColor: colors.navy }}>
            <Container style={{ paddingVertical: 9, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <T size={13} color="#E6E7F2">{t('topBar')}</T>
              <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
                <Link href="/membership"><T size={13} color={colors.white}>{t('membership')}</T></Link>
                <Link href="/concierge"><T size={13} color={colors.white}>{t('concierge')}</T></Link>
                <Pressable accessibilityRole="button" onPress={toggleLang} style={{ borderStartWidth: 1, borderColor: '#3A3F7A', paddingStart: 16 }}>
                  <T size={13} color={colors.white} style={{ fontFamily: isRTL ? 'Manrope_600SemiBold' : 'ReadexPro_400Regular' }}>{t('language')}</T>
                </Pressable>
              </View>
            </Container>
          </View>
          <View style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.line }}>
            <Container style={{ paddingVertical: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
              <Link href="/" accessibilityLabel={t('home')}><Logo height={44} /></Link>
              <SearchBox />
              <Pressable accessibilityRole="button" onPress={() => setSheet('dest')} style={styles.destPill}>
                <Icon name={destIcon(destination)} size={18} />
                <View>
                  <T size={11} color={colors.muted}>{t('deliveringTo')}</T>
                  <T w={700} size={14}>{t(`dest_${destination}` as Key)}</T>
                </View>
                <Icon name="chevronDown" size={14} stroke={2.2} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setSheet('cur')} style={styles.curPill}>
                <T w={600} size={14}>{currency}</T>
                <Icon name="chevronDown" size={14} stroke={2.2} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                <IconLink href="/concierge" icon="help" label={t('concierge')} />
                <IconLink href="/account" icon="user" label={t('account')} />
                <IconLink href="/cart" icon="bag" label={t('cart')} badge={count || undefined} />
              </View>
            </Container>
            <Container style={{ paddingBottom: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 30 }}>
              {nav.map((n) => (
                <Link key={n.label} href={n.href} target={n.external ? '_blank' : undefined} style={{ paddingVertical: 8 }}><T w={600} size={15} color={colors.navy}>{n.label}</T></Link>
              ))}
              <View style={{ flex: 1 }} />
              <Link href="/concierge" style={{ paddingVertical: 8 }}><T w={600} size={15} color={colors.brassText}>{t('helpChoose')}</T></Link>
            </Container>
          </View>
        </>
      ) : (
        <>
          <View style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 6, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('menu')} onPress={() => setSheet('menu')} style={ui.iconBtn}><Icon name="menu" /></Pressable>
            <Link href="/" accessibilityLabel={t('home')}><Logo height={30} /></Link>
            <View style={{ flexDirection: 'row' }}>
              <IconLink href="/shop" icon="search" label={t('shop')} />
              <IconLink href="/cart" icon="bag" label={t('cart')} badge={count || undefined} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.lavender }}>
            <Pressable accessibilityRole="button" onPress={() => setSheet('dest')} style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
              <T size={13} color={colors.muted}>{t('deliveringTo')}:</T>
              <T w={700} size={13}>{t(`dest_${destination}` as Key)}</T>
              <Icon name="chevronDown" size={12} stroke={2.4} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`${t('currency')}: ${currency}`} onPress={() => setSheet('cur')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderStartWidth: 1, borderColor: '#DCD8EA' }}>
              <T w={700} size={13}>{currency}</T>
            </Pressable>
          </View>
        </>
      )}

      <DestinationSheet open={sheet === 'dest'} onClose={() => setSheet(null)} />
      <CurrencySheet open={sheet === 'cur'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={t('menu')}>
        {[...nav, { label: t('helpChoose'), href: '/concierge' as Href }, { label: t('account'), href: '/account' as Href }].map((n) => (
          <Pressable key={n.label} accessibilityRole="link" onPress={() => { setSheet(null); if ('external' in n && n.external) openExternal(String(n.href)); else router.push(n.href); }} style={styles.menuRow}>
            <T w={700} size={16} color={colors.navy}>{n.label}</T>
            <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={18} />
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
function SearchBox() {
  const { t, isRTL } = useI18n();
  const [q, setQ] = useState('');
  const go = () => q.trim() && router.push({ pathname: '/shop', params: { q: q.trim() } });
  return (
    <View accessibilityRole="search" style={styles.search}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('searchPlaceholder')} onPress={go}><Icon name="search" size={18} color={colors.muted} /></Pressable>
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={go}
        returnKeyType="search"
        placeholder={t('searchPlaceholder')}
        placeholderTextColor={colors.muted}
        accessibilityLabel={t('searchPlaceholder')}
        style={[sans(400, isRTL), { flex: 1, fontSize: 15, color: colors.ink, minHeight: 44, textAlign: isRTL ? 'right' : 'left', outlineStyle: 'none' } as never]}
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
      <T w={700} color={colors.white}>{title}</T>
      {links.map((l) => (l.href ? <Link key={l.label} href={l.href} target={String(l.href).startsWith('http') ? '_blank' : undefined}><T size={14} color="#C9CBDB">{l.label}</T></Link> : <T key={l.label} size={14} color="#9EA1BD">{l.label}</T>))}
    </View>
  );
  return (
    <View accessibilityRole="contentinfo" style={{ backgroundColor: colors.navyDeep, marginTop: 'auto' }}>
      <Container style={{ paddingTop: wide ? 56 : 28, paddingBottom: 28, flexDirection: 'row', flexWrap: 'wrap', gap: 32 }}>
        <View style={{ gap: 14, minWidth: 220, flex: 1 }}>
          <Logo height={40} white />
          <T size={14} color="#C9CBDB">{t('footerTagline')}</T>
          <Pressable accessibilityRole="button" onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')}><T w={600} size={14} color={colors.white}>{t('language')}</T></Pressable>
        </View>
        {col(t('shop'), [
          { label: t('allGifts'), href: '/shop' },
          { label: t('hajjTitle'), href: { pathname: '/shop', params: { tag: 'hajj' } } },
          { label: t('ramadanTitle'), href: { pathname: '/shop', params: { tag: 'ramadan' } } },
          { label: t('concierge'), href: '/concierge' },
        ])}
        {col(t('footerDelivery'), [
          { label: t('footHotel') }, { label: t('footSaudi') }, { label: t('footIntl') }, { label: t('footOrders'), href: '/account' },
        ])}
        {col(t('footerCompany'), [
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
          <T size={12} color="#9EA1BD">© {new Date().getFullYear()} {t('copyright')}</T>
          <T size={12} color="#9EA1BD">{t('securePayment')} · {t('payNote')}</T>
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
    <View accessibilityRole="header" style={{ backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.line }}>
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
  search: { flexGrow: 1, flexBasis: 280, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.ivory, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 18, minHeight: 46 },
  destPill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.navy, borderRadius: 999, paddingHorizontal: 16, minHeight: 46 },
  curPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, minHeight: 46 },
  badge: { position: 'absolute', top: 6, end: 4, backgroundColor: colors.brass, borderRadius: 999, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  menuRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.line },
  curOption: { minWidth: 88, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 14, backgroundColor: colors.white },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.inputLine, alignItems: 'center', justifyContent: 'center' },
});
