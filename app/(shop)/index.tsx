// Homepage — follows Main.dc.html (desktop) and MobileHome.dc.html (phone) in the AlMukarramah Platform Design.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { DestinationSheet, destIcon, Logo, Screen } from '@/components/chrome';
import { Glow, Ornament, StarLattice } from '@/components/decor';
import { Icon, type IconName } from '@/components/icons';
import { Button, Card, Container, Eyebrow, Grid, Loading, OptionCard, Photo, ProductTile, SectionHead, Serif, T, useWide } from '@/components/ui';
import { Faq } from '@/components/faq';
import { faqLd, itemListLd, organizationLd, Seo, websiteLd } from '@/components/seo';
import { getCategories, getFeatured, getProducts } from '@/lib/catalogue';
import { snapshot, snapshotByCategory, snapshotFeatured } from '@/lib/snapshot';
import { strings, useI18n, type Key } from '@/lib/i18n';
import { imageUrl } from '@/lib/images';
import { convertFromSar, formatWhole } from '@/lib/money';
import { DESTINATIONS, usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import type { Category, Product } from '@/lib/types';
import { colors, space } from '@/theme';

/** Gold-ringed icon on a night disc. */
function Medallion({ icon }: { icon: IconName }) {
  return (
    <View style={{ width: 46, height: 46, borderRadius: 999, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={21} color={colors.goldBright} stroke={1.6} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 1, borderColor: colors.champagne },
});

type FragTab = 'perfumes' | 'oud-oils';
const premiumFirst = (rows: Product[]) => [...rows].sort((a, b) => b.base_price_sar - a.base_price_sar);

/** Night band with gold: the fragrance collections, a tab for perfumes and one for oud oils, and links to both pages. */
function FragranceHouse() {
  const wide = useWide();
  const { t } = useI18n();
  const [tab, setTab] = useState<FragTab>('perfumes');
  const [rows, setRows] = useState<Record<FragTab, Product[]>>(() => ({
    perfumes: premiumFirst(snapshotByCategory('perfumes')),
    'oud-oils': premiumFirst(snapshotByCategory('oud-oils')),
  }));
  useEffect(() => {
    (['perfumes', 'oud-oils'] as FragTab[]).forEach((c) =>
      getProducts({ category: c }).then((r) => r.length && setRows((cur) => ({ ...cur, [c]: premiumFirst(r) }))).catch(() => undefined));
  }, []);
  if (!rows.perfumes.length && !rows['oud-oils'].length) return null;
  const shown = rows[tab].slice(0, 8);
  const tabBtn = (k: FragTab, label: string) => (
    <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)}
      style={{ minHeight: 42, paddingHorizontal: 18, borderRadius: 999, justifyContent: 'center', borderWidth: 1, borderColor: tab === k ? colors.gold : colors.goldLine, backgroundColor: tab === k ? colors.gold : 'transparent' }}>
      <T w={700} size={14} color={tab === k ? colors.night : colors.champagne}>{label} · {rows[k].length}</T>
    </Pressable>
  );
  return (
    <View nativeID="perfumes" style={{ marginTop: wide ? 72 : 32, backgroundColor: colors.night, overflow: 'hidden' }}>
      <StarLattice opacity={0.06} size={72} />
      <Glow cx="80%" cy="10%" r="50%" opacity={0.2} />
      <Container style={{ paddingVertical: wide ? 72 : 32, gap: wide ? 26 : 16 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', alignItems: wide ? 'flex-end' : 'flex-start', gap: 16 }}>
          <View style={{ gap: 10, maxWidth: 680 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
              <Eyebrow size={wide ? 13 : 11} color={colors.gold}>{t('fragKicker')}</Eyebrow>
            </View>
            <Serif role="h2" size={wide ? 52 : 32} color={colors.white}>{t('fragTitle')}</Serif>
            <Ornament width={96} />
            <T size={wide ? 16 : 14} lh={1.6} color={colors.onNight}>{t('fragBody')}</T>
          </View>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {tabBtn('perfumes', t('fragTabPerfumes'))}
            {tabBtn('oud-oils', t('fragTabOils'))}
          </View>
        </View>
        {wide ? (
          <Grid cols={4} gap={20}>
            {shown.map((p) => <ProductTile key={p.id} product={p} />)}
          </Grid>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 16 }}>
            {shown.map((p) => <View key={p.id} style={{ width: 168 }}><ProductTile product={p} compact /></View>)}
          </ScrollView>
        )}
        <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 12, flexWrap: 'wrap' }}>
          <Button label={`${t('fragAll')} · ${rows.perfumes.length}`} kind="gold" size="lg" href={{ pathname: '/collections/[slug]', params: { slug: 'perfumes' } }} />
          <Button label={`${t('fragAllOils')} · ${rows['oud-oils'].length}`} kind="outlineLight" size="lg" href={{ pathname: '/collections/[slug]', params: { slug: 'oud-oils' } }} />
          <T size={13} color={colors.champagne} style={{ flexShrink: 1, marginStart: wide ? 8 : 0 }}>{t('fragShipNote')}</T>
        </View>
      </Container>
    </View>
  );
}

const shop = (params: Record<string, string> = {}): Href => ({ pathname: '/shop', params });

const OCCASIONS: { key: Key; tag?: string; tone: string; img: string }[] = [
  { key: 'occ_eid', tag: 'eid', tone: '#F3E6DF', img: '/images/occ-eid.jpg' },
  { key: 'occ_nikah', tag: 'nikah', tone: '#F2E8EC', img: '/images/occ-nikah.jpg' },
  { key: 'occ_baby', tag: 'new-baby', tone: '#E6EBE2', img: '/images/occ-baby.jpg' },
  { key: 'occ_hifz', tone: '#E8E4EE', img: '/images/occ-hifz.jpg' },
  { key: 'occ_home', tone: '#EDE5D6', img: '/images/occ-home.jpg' },
  { key: 'occ_thanks', tone: '#F6F1E8', img: '/images/occ-thanks.jpg' },
];
const CATEGORIES: { key: Key; tone: string }[] = [
  { key: 'cat_dates', tone: '#EDE5D6' }, { key: 'cat_perfume', tone: '#F3E6DF' }, { key: 'cat_prayer', tone: '#E8E4EE' },
  { key: 'cat_fashion', tone: '#F2E8EC' }, { key: 'cat_books', tone: '#E6EBE2' }, { key: 'cat_sets', tone: '#EDE5D6' },
];
const RECIPIENTS: { key: string; tag?: string; tone: string; img: string }[] = [
  { key: 'rec_her', tag: 'her', tone: '#F2E8EC', img: '/images/rec-her.jpg' }, { key: 'rec_him', tag: 'him', tone: '#E8E4EE', img: '/images/rec-him.jpg' },
  { key: 'rec_parents', tone: '#EDE5D6', img: '/images/rec-parents.jpg' }, { key: 'rec_kids', tag: 'kids', tone: '#E6EBE2', img: '/images/rec-kids.jpg' },
  { key: 'rec_home', tone: '#F3E6DF', img: '/images/rec-home.jpg' },
];
// Budget bands in halalas (SAR minor units).
const BUDGETS = [
  { min: 0, max: 20000, hint: 'budget1' as Key },
  { min: 20000, max: 50000, hint: 'budget2' as Key },
  { min: 50000, max: 100000, hint: 'budget3' as Key },
  { min: 100000, max: 0, hint: 'budget4' as Key },
];

export default function Home() {
  const wide = useWide();
  const { t, lang, currency, pick } = useI18n();
  const { session } = useSession();
  const { destination, setDestination } = usePrefs();
  const params = useLocalSearchParams<{ s?: string }>();
  const [featured, setFeatured] = useState<Product[] | null>(() => snapshotFeatured());
  const [cats, setCats] = useState<Category[]>(snapshot.categories);
  const [destOpen, setDestOpen] = useState(false);

  useEffect(() => {
    getFeatured().then((f) => f.length && setFeatured(f)).catch(() => undefined);
    getCategories().then((c) => c.length && setCats(c)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' && params.s && typeof document !== 'undefined') {
      setTimeout(() => document.getElementById(params.s!)?.scrollIntoView({ behavior: 'smooth' }), 150);
    }
  }, [params.s]);

  const band = (b: (typeof BUDGETS)[number]) => {
    const f = (v: number) => formatWhole(convertFromSar(v, currency), currency, lang);
    if (b.min === 0) return `${t('under')} ${f(b.max)}`;
    if (b.max === 0) return `${f(b.min)}+`;
    return `${f(b.min)}–${f(b.max).replace(/[^\d.,٠-٩٬٫]/g, '').trim()}`;
  };
  const gap = wide ? 72 : 32;

  const homeFaqs = [1, 2, 3, 4].map((n) => ({ q: t(`hfaq${n}q` as Key), a: t(`hfaq${n}a` as Key) }));
  return (
    <Screen padded={false}>
      <Seo
        title="Al Mukarramah | Premium Islamic Gifts from Madinah"
        description="Prayer mats and woven prayer rugs inspired by the Haramain, gift sets, Madinah dates, keepsakes and Ahmed Al Maghribi perfumes and oud oils, from Madinah. Delivery to Madinah and Makkah hotels, across Saudi Arabia and worldwide."
        path="/"
        image="/images/hero.jpg"
        jsonLd={[
          organizationLd,
          websiteLd,
          itemListLd('Featured gifts', featured ?? []),
          faqLd([1, 2, 3, 4].map((n) => ({ q: strings.en[`hfaq${n}q` as Key], a: strings.en[`hfaq${n}a` as Key] }))),
        ]}
      />
      {/* Phones in the app: logo and delivery chip (AppHome design). The website has the full header. */}
      {Platform.OS !== 'web' && (
        <Container style={{ paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo height={30} />
          <Pressable accessibilityRole="button" onPress={() => setDestOpen(true)} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 1, borderColor: colors.inputLine, backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, minHeight: 44 }}>
            <Icon name={destIcon(destination)} size={16} />
            <T w={700} size={12} color={colors.navy}>{t(`dest_${destination}` as Key)}</T>
            <Icon name="chevronDown" size={12} stroke={2.4} />
          </Pressable>
        </Container>
      )}

      {/* 1 · Proposition: night background, gold light, star lattice, the photograph in a gold-framed arch */}
      <View style={{ backgroundColor: colors.night, overflow: 'hidden' }}>
        <StarLattice opacity={0.07} size={wide ? 76 : 56} />
        <Glow cx={wide ? '72%' : '50%'} cy={wide ? '45%' : '22%'} r={wide ? '50%' : '70%'} opacity={0.26} />
        <Container style={{ paddingTop: wide ? 72 : 24, paddingBottom: wide ? 84 : 36, flexDirection: wide ? 'row' : 'column-reverse', gap: wide ? 64 : 26, alignItems: wide ? 'center' : 'stretch' }}>
          <View style={{ flex: wide ? 1 : undefined, gap: wide ? 22 : 14 }}>
            {session && !wide ? <T size={14} color={colors.onNight}>{t('greeting')}</T> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
              <Eyebrow size={wide ? 13 : 11} color={colors.gold}>{t('heroKicker')}</Eyebrow>
            </View>
            <Serif role="h1" size={wide ? 72 : 40} color={colors.white}>{t('heroTitle')}</Serif>
            <Ornament width={wide ? 120 : 96} />
            <T size={wide ? 18 : 15} lh={1.65} color={colors.onNight} style={{ maxWidth: 520 }}>{t('heroBody')}</T>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, marginTop: wide ? 8 : 4 }}>
              <Button label={t('exploreGifts')} href="/shop" kind="gold" size="lg" icon={<Icon name="gift" size={19} color={colors.night} />} />
              <Button label={t('helpChoose')} href="/concierge" kind="outlineLight" size="lg" />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 8, marginTop: wide ? 18 : 8 }}>
              {(['heroTrust1', 'heroTrust2', 'heroTrust3'] as const).map((k) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 5, height: 5, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />
                  <T size={13} w={500} color={colors.champagne}>{t(k)}</T>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flex: wide ? 1.05 : undefined, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: '100%', maxWidth: wide ? 560 : 420, alignSelf: 'center' }}>
              {/* gold outline arch, offset behind the photograph */}
              <View style={{ position: 'absolute', top: wide ? -16 : -8, left: wide ? 16 : 8, right: wide ? -16 : -8, bottom: wide ? 16 : 8, borderWidth: 1.5, borderColor: colors.gold, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, opacity: 0.85 }} />
              <View style={{ height: wide ? 600 : 330, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: wide ? 26 : 18, borderBottomRightRadius: wide ? 26 : 18, overflow: 'hidden', backgroundColor: colors.nightSoft, borderWidth: 4, borderColor: colors.nightSoft }}>
                <Photo uri="/images/hero.jpg" label={t('heroTitle')} style={{ width: '100%', height: '100%', aspectRatio: undefined, borderRadius: 0 }} />
              </View>
            </View>
          </View>
        </Container>
      </View>

      {/* What's the occasion */}
      <Container style={{ paddingTop: wide ? 64 : 30 }}>
        <View nativeID="occasions" />
        <SectionHead kicker={t('occasionsKicker')} title={t('occasionTitle')} link={wide ? t('allOccasions') : t('all')} href="/shop" size={wide ? 48 : 32} />
        <View style={{ flexDirection: 'row', gap: wide ? 20 : 10 }}>
          {[
            { k: t('hajjKicker'), title: t('hajjTitle'), body: t('hajjBody'), tone: colors.sand, tag: 'hajj', img: '/images/hajj.jpg' },
            { k: t('ramadanKicker'), title: t('ramadanTitle'), body: t('ramadanBody'), tone: '#E8E4EE', tag: 'ramadan', img: '/images/ramadan.jpg' },
          ].map((c) => (
            <Link key={c.tag} href={shop({ tag: c.tag })} asChild>
              <Pressable accessibilityRole="link" style={{ flex: 1, minHeight: wide ? 440 : 220, borderRadius: wide ? 26 : 18, backgroundColor: c.tone, justifyContent: 'flex-end', overflow: 'hidden', borderWidth: 1, borderColor: colors.goldLine }}>
                <Image source={{ uri: imageUrl(c.img) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,11,44,0.22)' }]} />
                <View style={{ backgroundColor: 'rgba(7,11,44,0.78)', borderTopWidth: 1, borderColor: colors.gold, padding: wide ? 28 : 12, gap: 6 }}>
                  <Eyebrow size={wide ? 13 : 10} color={colors.gold}>{c.k}</Eyebrow>
                  <Serif size={wide ? 44 : 24} color={colors.white}>{c.title}</Serif>
                  {wide ? <T size={15} color="#E6E7F2" lh={1.5} style={{ maxWidth: 460 }}>{c.body}</T> : null}
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
        <View style={{ marginTop: wide ? 20 : 12 }}>
          <Grid cols={wide ? 6 : 3} gap={wide ? 16 : 10}>
            {OCCASIONS.map((o) => (
              <Link key={o.key} href={shop(o.tag ? { tag: o.tag } : {})} asChild>
                <Pressable accessibilityRole="link" style={{ gap: wide ? 10 : 6 }}>
                  <Photo shape="arch" ratio={3 / 4} tone={o.tone} uri={o.img} style={styles.ring} />
                  <T w={700} size={wide ? 15 : 12.5} color={colors.navy} center lh={1.3}>{t(o.key)}</T>
                </Pressable>
              </Link>
            ))}
          </Grid>
        </View>
      </Container>

      {/* 2 · Delivery destination */}
      <Container style={{ paddingTop: wide ? 48 : 28 }}>
        {wide ? (
          <Card pad={32} style={{ borderRadius: 28 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 20 }}>
              <View style={{ flexShrink: 1 }}>
                <Serif role="h2" size={36}>{t('destHeading')}</Serif>
                <T color={colors.muted} style={{ marginTop: 4 }}>{t('destBody')}</T>
              </View>
              <Button label={t('deliverToHotel')} onPress={() => setDestination('madinah-hotel')} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {DESTINATIONS.map((d) => (
                <OptionCard key={d} selected={d === destination} onPress={() => setDestination(d)}
                  icon={<Icon name={destIcon(d)} size={26} stroke={1.6} />}
                  title={t(`destTitle_${d}` as Key)} body={t(`destDesc_${d}` as Key)} />
              ))}
            </View>
          </Card>
        ) : (
          <Card pad={16} style={{ gap: 10 }}>
            <Serif role="h2" size={26}>{t('destHeading')}</Serif>
            <T size={13.5} color={colors.body} lh={1.5}>{t('destBody')}</T>
            <Button label={t('deliverToHotel')} onPress={() => { setDestination('madinah-hotel'); setDestOpen(true); }} full />
          </Card>
        )}
      </Container>

      {/* 3 · Categories */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead title={t('categoriesTitle')} link={wide ? t('allCategories') : t('all')} href="/shop" size={wide ? 44 : 28} />
        {cats.length > 0 ? (
          <Grid cols={wide ? Math.min(cats.length, 7) : 2} gap={wide ? 18 : 10}>
            {cats.map((c) => (
              <Link key={c.id} href={{ pathname: '/collections/[slug]', params: { slug: c.slug } }} asChild>
                <Pressable accessibilityRole="link" style={{ gap: wide ? 12 : 6 }}>
                  <Photo ratio={wide ? 4 / 5 : 4 / 3} uri={c.image} tone={colors.sand} style={{ borderRadius: wide ? 20 : 14, borderWidth: 1, borderColor: colors.line }} label={pick(c, 'name')} />
                  <T w={700} size={wide ? 16 : 13.5} color={colors.navy}>{pick(c, 'name')}</T>
                  {wide && c.blurb_en ? <T size={13} lh={1.5} color={colors.muted} numberOfLines={2}>{pick(c, 'blurb')}</T> : null}
                </Pressable>
              </Link>
            ))}
          </Grid>
        ) : (
          <Grid cols={wide ? 6 : 2} gap={wide ? 18 : 10}>
            {CATEGORIES.map((c) => (
              <Link key={c.key} href="/shop" asChild>
                <Pressable accessibilityRole="link" style={{ gap: wide ? 12 : 6 }}>
                  <Photo ratio={wide ? 4 / 5 : 4 / 3} tone={c.tone} style={{ borderRadius: wide ? 20 : 14 }} />
                  <T w={700} size={wide ? 16 : 13.5} color={colors.navy}>{t(c.key)}</T>
                </Pressable>
              </Link>
            ))}
          </Grid>
        )}
      </Container>

      {/* Fragrance house: Ahmed Al Maghribi perfumes and oud oils */}
      <FragranceHouse />

      {/* Modest fashion: ready-made or tailor-made */}
      <Container style={{ paddingTop: wide ? 64 : 28 }}>
        <SectionHead kicker={t('fashionKicker')} title={t('fashionTitle')} link={wide ? t('fashionBrowse') : t('all')} href="/fashion" size={wide ? 44 : 28} />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 18 : 10 }}>
          {(['ready', 'tailored'] as const).map((k) => (
            <Link key={k} href="/fashion" asChild>
              <Pressable accessibilityRole="link" style={{ flex: 1, borderRadius: wide ? 24 : 18, padding: wide ? 28 : 18, gap: 8, overflow: 'hidden', backgroundColor: k === 'tailored' ? colors.night : colors.white, borderWidth: 1, borderColor: k === 'tailored' ? colors.gold : colors.champagne }}>
                {k === 'tailored' && <StarLattice opacity={0.08} size={56} />}
                <Eyebrow size={12} color={k === 'tailored' ? colors.gold : colors.brassText}>{t(k === 'tailored' ? 'tailorMade' : 'readyMade')}</Eyebrow>
                <Serif size={wide ? 34 : 26} color={k === 'tailored' ? colors.white : colors.navy}>{t(k === 'tailored' ? 'fashionTailoredTitle' : 'fashionReadyTitle')}</Serif>
                <T size={14} lh={1.6} color={k === 'tailored' ? colors.onNight : colors.body}>{t(k === 'tailored' ? 'fashionTailoredBody' : 'fashionReadyBody')}</T>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>

      {/* Who is it for + budget, on a pale gold band */}
      <View style={{ marginTop: gap, backgroundColor: colors.goldSoft, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.champagne }}>
      <Container style={{ paddingVertical: wide ? 64 : 28 }}>
        <SectionHead title={t('forWhom')} sub={wide ? t('forWhomBody') : undefined} link={wide ? t('giftFinder') : undefined} href="/concierge" size={wide ? 44 : 28} />
        {wide ? (
          <Grid cols={5} gap={18}>
            {RECIPIENTS.map((r) => (
              <Link key={r.key} href={shop(r.tag ? { tag: r.tag } : {})} asChild>
                <Pressable accessibilityRole="link" style={{ gap: 10 }}>
                  <Photo shape="arch" ratio={3 / 4} tone={r.tone} uri={r.img} style={styles.ring} />
                  <Serif size={26} center>{t(r.key as Key)}</Serif>
                  <T size={13} color={colors.muted} center style={{ marginTop: -6 }}>{t(`${r.key}_hint` as Key)}</T>
                </Pressable>
              </Link>
            ))}
          </Grid>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {RECIPIENTS.map((r) => (
              <Link key={r.key} href={shop(r.tag ? { tag: r.tag } : {})} asChild>
                <Pressable accessibilityRole="link" style={{ width: 92, gap: 6, alignItems: 'center' }}>
                  <Photo shape="arch" ratio={92 / 116} tone={r.tone} uri={r.img} style={styles.ring} />
                  <T w={700} size={13} color={colors.navy}>{t(r.key as Key)}</T>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        )}
        <View style={wide ? { marginTop: 34, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.champagne, borderRadius: 24, padding: 22, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 } : { marginTop: 18, gap: 8 }}>
          <T w={700} size={wide ? 16 : 14} color={colors.navy} style={wide ? { marginEnd: 8 } : null}>{t('byBudget')}</T>
          <View style={{ flex: wide ? 1 : undefined, flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 14 : 8 }}>
            {BUDGETS.map((b) => (
              <Link key={b.min} href={shop({ ...(b.min ? { min: String(b.min) } : {}), ...(b.max ? { max: String(b.max) } : {}) })} asChild>
                <Pressable accessibilityRole="link" style={{ flexGrow: 1, flexBasis: wide ? 180 : '45%', borderWidth: 1, borderColor: colors.champagne, backgroundColor: wide ? colors.ivory : colors.white, borderRadius: wide ? 16 : 14, paddingVertical: wide ? 14 : 10, paddingHorizontal: wide ? 18 : 12, gap: 2 }}>
                  <T w={700} size={wide ? 17 : 14} color={colors.navy}>{band(b)}</T>
                  <T size={wide ? 12.5 : 11.5} color={colors.muted}>{t(b.hint)}</T>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      </Container>
      </View>

      {/* 4 · Curated selection */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead title={t('featured')} link={wide ? t('viewAll') : t('all')} href="/shop" size={wide ? 44 : 28} />
        {featured === null ? <Loading /> : (
          <Grid min={wide ? 240 : 150} gap={wide ? 22 : 12} cols={wide ? undefined : 2}>
            {featured.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        )}
      </Container>

      {/* Membership: gold card */}
      <Container style={{ paddingTop: wide ? 48 : 24 }}>
        <View style={{ backgroundColor: colors.nightSoft, borderRadius: wide ? 28 : 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.gold }}>
          <StarLattice opacity={0.1} size={60} />
          <Glow cx="88%" cy="0%" r="55%" opacity={0.16} />
          <View style={{ padding: wide ? 44 : 20, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 32 : 14 }}>
            <View style={{ flex: wide ? 1 : undefined, gap: 10 }}>
              <Eyebrow color={colors.gold} size={12}>{t('membership')}</Eyebrow>
              <Serif size={wide ? 46 : 30} color={colors.white}>{t('circleTitle')}</Serif>
              <Ornament width={90} />
              <T size={wide ? 16 : 14} lh={1.6} color={colors.onNight} style={{ maxWidth: 600 }}>{t('circleBody')}</T>
            </View>
            <Button label={t('circleCta')} kind="gold" size="lg" href="/membership" style={{ alignSelf: wide ? 'center' : 'flex-start' }} />
          </View>
        </View>
      </Container>

      {/* 6 · Heritage: night section with the Prophet's Mosque and a gold timeline */}
      <View style={{ marginTop: wide ? 88 : 36, backgroundColor: colors.night, overflow: 'hidden' }}>
        <StarLattice opacity={0.06} size={80} />
        <Glow cx="20%" cy="50%" r="55%" opacity={0.18} />
        <Container style={{ paddingVertical: wide ? 88 : 36, flexDirection: wide ? 'row' : 'column', gap: wide ? 64 : 20, alignItems: wide ? 'center' : 'stretch' }}>
          <View style={{ flex: 1, height: wide ? 560 : 300, borderRadius: wide ? 26 : 18, overflow: 'hidden', backgroundColor: colors.nightSoft, borderWidth: 1, borderColor: colors.gold }}>
            <Photo uri="/images/madinah-minarets.jpg" style={{ height: '100%', aspectRatio: undefined, borderRadius: 0 }} label={t('heritageTitle')} />
          </View>
          <View style={{ flex: wide ? 1.15 : undefined, gap: wide ? 20 : 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
              <Eyebrow size={wide ? 13 : 11} color={colors.gold}>{t('heritageKicker')}</Eyebrow>
            </View>
            <Serif role="h2" size={wide ? 54 : 32} color={colors.white}>{t('heritageTitle')}</Serif>
            <T size={wide ? 17 : 14.5} lh={1.7} color={colors.onNight}>{t('heritageBody')}</T>
            <View style={wide ? { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.gold, marginTop: 12 } : { borderStartWidth: 1, borderColor: colors.gold, paddingStart: 16, gap: 14, marginTop: 6 }}>
              {(['h1', 'h2', 'h3'] as const).map((h) => (
                <View key={h} style={wide ? { flex: 1, paddingTop: 18, paddingEnd: 18, gap: 6 } : { gap: 2 }}>
                  {wide && <View style={{ position: 'absolute', top: -5, start: 0, width: 9, height: 9, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />}
                  <Serif size={wide ? 34 : 24} color={colors.goldBright}>{t(`${h}Label` as Key)}</Serif>
                  <T size={13.5} lh={1.55} color={colors.onNight} style={{ flexShrink: 1 }}>{t(`${h}Body` as Key)}</T>
                </View>
              ))}
            </View>
          </View>
        </Container>
      </View>

      {/* 7 · Gifting services */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead title={t('servicesTitle')} size={wide ? 44 : 28} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 18 : 10 }}>
          {([['svc1', 'gift'], ['svc2', 'send'], ['svc3', 'bed'], ['svc4', 'sparkle']] as const).map(([k, ic]) => (
            <Card key={k} pad={wide ? 24 : 16} style={{ flexGrow: 1, flexBasis: wide ? 240 : '100%', gap: 10, flexDirection: wide ? 'column' : 'row', alignItems: wide ? 'flex-start' : 'center' }}>
              <Medallion icon={ic} />
              <View style={{ flex: wide ? undefined : 1, gap: 6 }}>
              <T w={700} size={16} color={colors.navy}>{t(`${k}t` as Key)}</T>
              <T size={14} lh={1.55} color={colors.body}>{t(`${k}b` as Key)}</T>
              </View>
            </Card>
          ))}
        </View>
        <Button label={t('helpChoose')} kind="secondary" href="/concierge" style={{ marginTop: wide ? 22 : 12, alignSelf: wide ? 'flex-start' : 'stretch' }} />
      </Container>

      {/* Answers (also read by search engines and AI assistants) */}
      <Container style={{ paddingTop: gap }}>
        <View style={{ maxWidth: 860 }}>
          <Faq title={t('faqTitle')} items={homeFaqs} />
        </View>
      </Container>

      {/* 8 · Reassurance */}
      <Container style={{ paddingTop: wide ? 64 : 28, paddingBottom: wide ? 88 : 40 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.white, borderRadius: 22, borderWidth: 1, borderColor: colors.champagne, paddingVertical: wide ? 8 : 4 }}>
          {([
            ['bag', t('re1t'), t('re1b')], ['lock', t('re2t'), t('payNote')], ['shield', t('re3t'), t('re3b')], ['check', t('re4t'), t('re4b')],
          ] as const).map(([ic, a, b]) => (
            <View key={a} style={{ flexGrow: 1, flexBasis: wide ? 230 : '100%', flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: wide ? 18 : 12, paddingHorizontal: wide ? 22 : 14 }}>
              <Icon name={ic} size={22} color={colors.brass} />
              <View style={{ flex: 1, gap: 2 }}>
                <T w={700} size={15} color={colors.navy}>{a}</T>
                <T size={13} color={colors.body}>{b}</T>
              </View>
            </View>
          ))}
        </View>
      </Container>

      <DestinationSheet open={destOpen} onClose={() => setDestOpen(false)} />
    </Screen>
  );
}
