// Homepage: an ivory house. The Art Director's hero (one oud bottle in an arch of sun), the promise, three doors,
// the fragrance house on stone, a short selection, seasons of giving, the invitation to makers, our story, answers
// and reassurance. Green, black and gold appear only as threads: hairlines, small capitals, a button, a corner.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { DestinationSheet, destIcon, Logo, Screen, SELL_HREF } from '@/components/chrome';
import { CinematicPhoto, Corners, DoubleFrame } from '@/components/decor';
import { data, prefersReducedMotion, reveal } from '@/components/motion';
import { Icon, type IconName } from '@/components/icons';
import { Button, CapsLink, Container, Eyebrow, Grid, Loading, ProductTile, SectionHead, Serif, T, useWide } from '@/components/ui';
import { Faq } from '@/components/faq';
import { faqLd, itemListLd, organizationLd, Seo, websiteLd } from '@/components/seo';
import { getFeatured, getProducts } from '@/lib/catalogue';
import { snapshotByCategory, snapshotFeatured } from '@/lib/snapshot';
import { strings, useI18n, type Key } from '@/lib/i18n';
import { imageUrl } from '@/lib/images';
import { usePrefs } from '@/lib/prefs';
import type { Product } from '@/lib/types';
import { colors } from '@/theme';

type FragTab = 'perfumes' | 'oud-oils';
const premiumFirst = (rows: Product[]) => [...rows].sort((a, b) => b.base_price_sar - a.base_price_sar);

/** A small gold diamond, the separator in quiet lines of text. */
const Dot = () => <View style={{ width: 4, height: 4, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />;

/** The fragrance house on a stone band between gold hairlines: perfumes and oud oils, four of each, and both collections. */
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
  const shown = rows[tab].slice(0, 4);
  const tabBtn = (k: FragTab, label: string) => (
    <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} {...data({ tab: 1 })}
      style={{ minHeight: 40, paddingHorizontal: 2, justifyContent: 'center', borderBottomWidth: 1, borderColor: tab === k ? colors.navy : 'transparent' }}>
      <T w={500} size={11.5} caps num color={tab === k ? colors.navy : colors.muted}>{label} · {rows[k].length}</T>
    </Pressable>
  );
  return (
    <View nativeID="perfumes" style={{ backgroundColor: colors.stone, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.goldLine }}>
      <Container style={{ paddingVertical: wide ? 112 : 64 }}>
        <SectionHead center kicker={t('fragKicker')} title={t('fragTitle')} sub={t('fragBody')} reveal size={wide ? 52 : 34} />
        <View {...reveal(1)} accessibilityRole="tablist" style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: wide ? 40 : 24, marginTop: wide ? -12 : -6, marginBottom: wide ? 44 : 28 }}>
          {tabBtn('perfumes', t('fragTabPerfumes'))}
          {tabBtn('oud-oils', t('fragTabOils'))}
        </View>
        {wide ? (
          <Grid cols={4} gap={28} reveal>
            {shown.map((p) => <ProductTile key={p.id} product={p} />)}
          </Grid>
        ) : (
          <ScrollView horizontal {...reveal(1)} showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}>
            {shown.map((p) => <View key={p.id} style={{ width: 172 }}><ProductTile product={p} compact /></View>)}
          </ScrollView>
        )}
        <View {...reveal(1)} style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'center', alignItems: wide ? 'center' : 'stretch', gap: 12, marginTop: wide ? 28 : 28 }}>
          <Button label={`${t('fragAll')} · ${rows.perfumes.length}`} kind="secondary" href={{ pathname: '/collections/[slug]', params: { slug: 'perfumes' } }} />
          <Button label={`${t('fragAllOils')} · ${rows['oud-oils'].length}`} kind="secondary" href={{ pathname: '/collections/[slug]', params: { slug: 'oud-oils' } }} />
        </View>
        <T size={12.5} lh={1.6} color={colors.muted} center style={{ marginTop: 18, maxWidth: 560, alignSelf: 'center' }}>{t('fragShipNote')}</T>
      </Container>
    </View>
  );
}

/** Products whose cover is still a close-up taken on the floor; kept out of the homepage selection until re-shot. */
const NOT_STUDIO = ['kaaba-clock-tower-woven-rug-gold', 'kids-rawdah-woven-rug-green', 'kids-rawdah-woven-rug-red', 'black-stone-prayer-mat'];

const DOORS: { title: Key; line: Key; img: string; href: Href }[] = [
  { title: 'doorPerfume', line: 'doorPerfumeLine', img: '/images/door-perfume.jpg', href: { pathname: '/collections/[slug]', params: { slug: 'perfumes' } } },
  { title: 'doorPrayer', line: 'doorPrayerLine', img: '/images/door-prayer.jpg', href: { pathname: '/collections/[slug]', params: { slug: 'prayer-mats' } } },
  { title: 'doorGifts', line: 'doorGiftsLine', img: '/images/door-gifts.jpg', href: { pathname: '/collections/[slug]', params: { slug: 'gift-sets' } } },
];

/** A framed photograph: a pale panel that zooms slowly on hover, with Kaaba corners that draw in (or always show). */
function Framed({ uri, ratio, label, corners = 'draw' }: { uri: string; ratio: number; label: string; corners?: 'draw' | 'on' | 'none' }) {
  return (
    <View style={{ aspectRatio: ratio }}>
      <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: colors.sand }]}>
        <View {...data({ zoom: 1 })} style={StyleSheet.absoluteFill}>
          <Image source={{ uri: imageUrl(uri) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={label} />
        </View>
      </View>
      {corners !== 'none' && <Corners draw={corners === 'draw'} />}
    </View>
  );
}

export default function Home() {
  const wide = useWide();
  const { width } = useWindowDimensions();
  const { t, isRTL } = useI18n();
  const { destination } = usePrefs();
  const params = useLocalSearchParams<{ s?: string }>();
  const [featured, setFeatured] = useState<Product[] | null>(() => snapshotFeatured());
  const [destOpen, setDestOpen] = useState(false);

  useEffect(() => {
    getFeatured().then((f) => f.length && setFeatured(f)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web' && params.s && typeof document !== 'undefined') {
      setTimeout(() => document.getElementById(params.s!)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' }), 150);
    }
  }, [params.s]);

  const gap = wide ? 136 : 72;
  // Hero copy: on the quiet wall (desktop, start side) or centred under the photograph (phones).
  const heroText = (
    <View style={{ gap: wide ? 24 : 16, maxWidth: wide ? 540 : undefined, alignItems: wide ? 'flex-start' : 'center' }}>
      <Eyebrow rule={wide} center={!wide}>{t('heroKicker')}</Eyebrow>
      <Serif role="h1" size={wide ? (width >= 1280 ? 78 : 64) : 42} center={!wide}>{t('heroTitle')}</Serif>
      <T size={wide ? 17 : 15} lh={1.65} color={colors.body} center={!wide} style={{ maxWidth: 460 }}>{t('heroBody')}</T>
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'center', alignSelf: wide ? 'flex-start' : 'stretch', gap: wide ? 32 : 18, marginTop: wide ? 12 : 8 }}>
        <Button label={t('exploreGifts')} href="/shop" size="lg" style={wide ? undefined : { alignSelf: 'stretch' }} />
        <Button label={t('helpChoose')} href="/concierge" kind="quiet" />
      </View>
    </View>
  );
  const heroH = Math.round(Math.min(780, Math.max(580, width / 2)));

  const homeFaqs = [1, 2, 3, 4].map((n) => ({ q: t(`hfaq${n}q` as Key), a: t(`hfaq${n}a` as Key) }));
  const promise = ['heroTrust1', 'heroTrust2', 'heroTrust3'] as const;
  const reassure: [IconName, string, string][] = [['bag', t('re1t'), t('re1b')], ['lock', t('re2t'), t('payNote')], ['shield', t('re3t'), t('re3b')], ['check', t('re4t'), t('re4b')]];
  return (
    <Screen padded={false}>
      <Seo
        title="Al Mukarramah | The Premium Marketplace for Every Muslim Home"
        description="A curated marketplace of premium perfumes, oud oils, prayer mats, Madinah dates and gifts from trusted makers across the Muslim world, every product approved by our team. Hotel delivery in Madinah and Makkah, shipping across Saudi Arabia and worldwide."
        path="/"
        image="/images/hero-light.jpg"
        jsonLd={[
          organizationLd,
          websiteLd,
          itemListLd('Featured', featured ?? []),
          faqLd([1, 2, 3, 4].map((n) => ({ q: strings.en[`hfaq${n}q` as Key], a: strings.en[`hfaq${n}a` as Key] }))),
        ]}
      />
      {/* Phones in the app: logo and delivery chip. The website has the full header. */}
      {Platform.OS !== 'web' && (
        <Container style={{ paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo height={30} />
          <Pressable accessibilityRole="button" onPress={() => setDestOpen(true)} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', borderBottomWidth: 1, borderColor: colors.goldLine, minHeight: 44 }}>
            <Icon name={destIcon(destination)} size={16} stroke={1.4} color={colors.brass} />
            <T w={500} size={12} color={colors.navy}>{t(`dest_${destination}` as Key)}</T>
            <Icon name="chevronDown" size={12} stroke={1.6} color={colors.brass} />
          </Pressable>
        </Container>
      )}

      {/* 1 · Hero: the Art Director's still (mirrored for Arabic), the headline on the quiet wall */}
      {wide ? (
        <View style={{ height: heroH, overflow: 'hidden', backgroundColor: colors.sand }}>
          <CinematicPhoto uri={isRTL ? '/images/hero-light-rtl.jpg' : '/images/hero-light.jpg'} position={isRTL ? 'left' : 'right'} label={t('heroImageAlt')} sweep={false} />
          <Container style={{ flex: 1, justifyContent: 'center', paddingBottom: Math.round(heroH * 0.12) }}>{heroText}</Container>
        </View>
      ) : (
        <>
          <View style={{ aspectRatio: 1170 / 1080, backgroundColor: colors.sand, overflow: 'hidden' }}>
            <CinematicPhoto uri={isRTL ? '/images/hero-phone-rtl.jpg' : '/images/hero-phone.jpg'} label={t('heroImageAlt')} sweep={false} />
          </View>
          <Container style={{ paddingTop: 36, paddingBottom: 8 }}>{heroText}</Container>
        </>
      )}

      {/* Promise: one quiet line of capitals, gold diamonds between */}
      <Container style={{ paddingTop: wide ? 0 : 40 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'center', alignItems: 'center', gap: wide ? 28 : 12, paddingVertical: wide ? 26 : 22, borderBottomWidth: 1, borderTopWidth: wide ? 0 : 1, borderColor: colors.goldLine }}>
          {promise.map((k, i) => (
            <React.Fragment key={k}>
              {i > 0 && wide && <Dot />}
              <View {...reveal(i)}><T w={500} size={10.5} caps color={colors.body} center>{t(k)}</T></View>
            </React.Fragment>
          ))}
        </View>
      </Container>

      {/* 2 · Three doors into the marketplace */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead center kicker={t('doorsKicker')} title={t('doorsTitle')} reveal />
        {wide ? (
          <View style={{ flexDirection: 'row', gap: 32 }}>
            {DOORS.map((d, i) => (
              <Link key={d.title} href={d.href} asChild>
                <Pressable accessibilityRole="link" {...reveal(i + 1, { hover: 'door' })} style={{ flex: 1, gap: 14, alignItems: 'center' }}>
                  <View style={{ alignSelf: 'stretch', marginBottom: 12 }}><Framed uri={d.img} ratio={4 / 5} label={t(d.title)} /></View>
                  <Serif size={30} center>{t(d.title)}</Serif>
                  <T size={14} lh={1.6} color={colors.body} center style={{ maxWidth: 300 }}>{t(d.line)}</T>
                  {/* the gold underline draws in when the door is hovered (web) */}
                  <View {...data({ ul: 'center' })} style={{ marginTop: 4, paddingBottom: 4 }}>
                    <T w={600} size={11} caps color={colors.emerald}>{t('discover')}</T>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          <ScrollView horizontal {...reveal(1)} showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 16, paddingHorizontal: 20 }}>
            {DOORS.map((d) => (
              <Link key={d.title} href={d.href} asChild>
                <Pressable accessibilityRole="link" style={{ width: 282, gap: 10 }}>
                  <View style={{ marginBottom: 6 }}><Framed uri={d.img} ratio={4 / 5} label={t(d.title)} corners="none" /></View>
                  <Serif size={25}>{t(d.title)}</Serif>
                  <T size={13.5} lh={1.55} color={colors.body}>{t(d.line)}</T>
                  <T w={600} size={10.5} caps color={colors.emerald} style={{ marginTop: 2 }}>{t('discover')}</T>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        )}
      </Container>

      {/* 3 · The fragrance house, on stone */}
      <View style={{ marginTop: gap }}><FragranceHouse /></View>

      {/* 4 · A considered selection */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead center kicker={t('featuredKicker')} title={t('featured')} reveal />
        {featured === null ? <Loading /> : (
          <Grid cols={wide ? 4 : 2} gap={wide ? 28 : 14} rowGap={wide ? 56 : 32} reveal>
            {featured.filter((p) => !NOT_STUDIO.includes(p.slug)).slice(0, wide ? 8 : 6).map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        )}
        <View {...reveal(0)} style={{ marginTop: wide ? 8 : 4 }}><CapsLink label={t('viewAll')} href="/shop" center /></View>
      </Container>

      {/* 5 · Seasons of giving */}
      <Container style={{ paddingTop: gap }}>
        <View nativeID="occasions" />
        <SectionHead center kicker={t('occasionsKicker')} title={t('occasionTitle')} reveal />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 48 }}>
          {[
            { k: t('hajjKicker'), title: t('hajjTitle'), body: t('hajjBody'), tag: 'hajj', img: '/images/hajj.jpg' },
            { k: t('ramadanKicker'), title: t('ramadanTitle'), body: t('ramadanBody'), tag: 'ramadan', img: '/images/ramadan.jpg' },
          ].map((c, i) => (
            <Link key={c.tag} href={{ pathname: '/shop', params: { tag: c.tag } }} asChild>
              <Pressable accessibilityRole="link" {...reveal(wide ? i + 1 : 1, { hover: 'card' })} style={{ flex: 1, gap: 12 }}>
                <View style={{ marginBottom: 10 }}><Framed uri={c.img} ratio={16 / 10} label={c.title} corners={wide ? 'draw' : 'none'} /></View>
                <Eyebrow>{c.k}</Eyebrow>
                <Serif size={wide ? 36 : 28}>{c.title}</Serif>
                <T size={14.5} lh={1.65} color={colors.body} style={{ maxWidth: 500 }}>{c.body}</T>
                <View {...data({ ul: 'start' })} style={{ alignSelf: 'flex-start', marginTop: 2, paddingBottom: 4 }}>
                  <T w={600} size={11} caps color={colors.emerald}>{t('discover')}</T>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>

      {/* 6 · For makers: an invitation card, double-ruled in gold like letterpress stationery */}
      <Container style={{ paddingTop: gap }}>
        <View {...reveal(0)}>
          <DoubleFrame pad={wide ? 64 : 24} gap={wide ? 6 : 4} style={{ backgroundColor: colors.porcelain }}>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 80 : 28, alignItems: wide ? 'center' : 'stretch' }}>
              <View style={{ flex: 1.15, gap: wide ? 18 : 12 }}>
                <Eyebrow color={colors.emerald} rule>{t('sellKicker')}</Eyebrow>
                <Serif role="h2" size={wide ? 46 : 32}>{t('sellTitle')}</Serif>
                <T size={wide ? 16 : 14.5} lh={1.7} color={colors.body} style={{ maxWidth: 560 }}>{t('sellBody')}</T>
              </View>
              <View style={{ flex: 1, gap: 0 }}>
                {(['sellPoint1', 'sellPoint2', 'sellPoint3'] as const).map((k, i) => (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 18, paddingVertical: 16, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                    <Serif size={22} color={colors.brassText} style={{ width: 28 }}>{`0${i + 1}`}</Serif>
                    <T size={14.5} lh={1.5} color={colors.navy} style={{ flex: 1 }}>{t(k)}</T>
                  </View>
                ))}
                <Button label={t('sellCta')} href={SELL_HREF as Href} size="lg" style={{ marginTop: 16, alignSelf: wide ? 'flex-start' : 'stretch' }} />
              </View>
            </View>
          </DoubleFrame>
        </View>
      </Container>

      {/* 7 · Our story */}
      <Container style={{ paddingTop: gap }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 88 : 32, alignItems: wide ? 'center' : 'stretch' }}>
          <View {...reveal(0)} style={{ flex: wide ? 0.9 : undefined }}>
            <Framed uri="/images/madinah-minarets.jpg" ratio={wide ? 4 / 5 : 4 / 3} label={t('heritageTitle')} corners="on" />
          </View>
          <View {...reveal(wide ? 1 : 0)} style={{ flex: wide ? 1.1 : undefined, gap: wide ? 22 : 14 }}>
            <Eyebrow rule>{t('heritageKicker')}</Eyebrow>
            <Serif role="h2" size={wide ? 48 : 32}>{t('heritageTitle')}</Serif>
            <T size={wide ? 16.5 : 15} lh={1.75} color={colors.body}>{t('heritageBody')}</T>
            <View style={{ flexDirection: wide ? 'row' : 'column', borderTopWidth: 1, borderColor: colors.goldLine, marginTop: 14 }}>
              {(['h1', 'h2', 'h3'] as const).map((h, i) => (
                <View key={h} style={{ flex: 1, paddingTop: 22, paddingBottom: wide ? 0 : 6, paddingEnd: wide ? 24 : 0, paddingStart: wide && i ? 24 : 0, gap: 8, borderStartWidth: wide && i ? 1 : 0, borderColor: colors.line }}>
                  <Serif size={wide ? 34 : 28} color={colors.brassText}>{t(`${h}Label` as Key)}</Serif>
                  <T size={13.5} lh={1.6} color={colors.body} style={{ flexShrink: 1 }}>{t(`${h}Body` as Key)}</T>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Container>

      {/* Answers (also read by search engines and AI assistants) */}
      <Container style={{ paddingTop: gap }}>
        <View {...reveal(0)}><Faq title={t('faqTitle')} kicker={t('faqKicker')} items={homeFaqs} split={wide} /></View>
      </Container>

      {/* Reassurance: four quiet columns, gold line icons in fine rings */}
      <Container style={{ paddingTop: wide ? 112 : 64, paddingBottom: wide ? 112 : 56 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: wide ? 56 : 32, rowGap: 28 }}>
          {reassure.map(([ic, a, b], i) => (
            <View key={a} {...reveal(wide ? i : 0)} style={{ width: wide ? '25%' : '50%', alignItems: 'center', gap: 10, paddingHorizontal: wide ? 20 : 8 }}>
              <View style={{ width: 46, height: 46, borderRadius: 999, borderWidth: 1, borderColor: colors.goldLine, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                <Icon name={ic} size={19} color={colors.brass} stroke={1.2} />
              </View>
              <T w={500} size={13.5} color={colors.navy} center>{a}</T>
              <T size={12.5} lh={1.55} color={colors.muted} center style={{ maxWidth: 230 }}>{b}</T>
            </View>
          ))}
        </View>
      </Container>

      <DestinationSheet open={destOpen} onClose={() => setDestOpen(false)} />
    </Screen>
  );
}
