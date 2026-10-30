// Homepage: light and calm. Hero in arched afternoon light, three doors, the fragrance house in black, a short
// selection, seasons of giving, the invitation to makers, our story, answers and reassurance.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { DestinationSheet, destIcon, Logo, Screen, SELL_HREF } from '@/components/chrome';
import { CinematicPhoto } from '@/components/decor';
import { data, prefersReducedMotion, reveal } from '@/components/motion';
import { Icon } from '@/components/icons';
import { Button, Container, Eyebrow, Grid, Loading, ProductTile, SectionHead, Serif, T, useWide } from '@/components/ui';
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
  const shown = rows[tab].slice(0, 4);
  const tabBtn = (k: FragTab, label: string) => (
    <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} {...data({ tab: 1 })}
      style={{ minHeight: 40, paddingHorizontal: 4, justifyContent: 'center', borderBottomWidth: 1, borderColor: tab === k ? colors.gold : 'transparent' }}>
      <T w={500} size={13} color={tab === k ? colors.white : colors.onNightFaint} style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>{label} · {rows[k].length}</T>
    </Pressable>
  );
  return (
    <View nativeID="perfumes" style={{ marginTop: wide ? 72 : 32, backgroundColor: colors.kiswah, overflow: 'hidden' }}>
      <Container style={{ paddingVertical: wide ? 104 : 44, gap: wide ? 36 : 18 }}>
        <View {...reveal(0)} style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', alignItems: wide ? 'flex-end' : 'flex-start', gap: 16 }}>
          <View style={{ gap: 10, maxWidth: 680 }}>
            <Eyebrow size={wide ? 12 : 11} color={colors.gold}>{t('fragKicker')}</Eyebrow>
            <Serif role="h2" size={wide ? 52 : 32} color={colors.white}>{t('fragTitle')}</Serif>
            <T size={wide ? 16 : 14} lh={1.6} color={colors.onNight}>{t('fragBody')}</T>
          </View>
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 28 }}>
            {tabBtn('perfumes', t('fragTabPerfumes'))}
            {tabBtn('oud-oils', t('fragTabOils'))}
          </View>
        </View>
        {wide ? (
          <Grid cols={4} gap={24} reveal>
            {shown.map((p) => <ProductTile key={p.id} product={p} />)}
          </Grid>
        ) : (
          <ScrollView horizontal {...reveal(1)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingEnd: 16 }}>
            {shown.map((p) => <View key={p.id} style={{ width: 168 }}><ProductTile product={p} compact /></View>)}
          </ScrollView>
        )}
        <View {...reveal(1)} style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 12, flexWrap: 'wrap' }}>
          <Button label={`${t('fragAll')} · ${rows.perfumes.length}`} kind="outlineLight" size="lg" href={{ pathname: '/collections/[slug]', params: { slug: 'perfumes' } }} />
          <Button label={`${t('fragAllOils')} · ${rows['oud-oils'].length}`} kind="outlineLight" size="lg" href={{ pathname: '/collections/[slug]', params: { slug: 'oud-oils' } }} />
          <T size={13} color={colors.champagne} style={{ flexShrink: 1, marginStart: wide ? 8 : 0 }}>{t('fragShipNote')}</T>
        </View>
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

/** Small capitals link with a fine gold underline. */
function CapsLink({ label, href, light }: { label: string; href: Href; light?: boolean }) {
  const { isRTL } = useI18n();
  return (
    <Link href={href} {...data({ caps: 1 })} style={{ alignSelf: 'flex-start', borderBottomWidth: 1, borderColor: colors.goldLine, paddingBottom: 4 }}>
      <T w={600} size={isRTL ? 14 : 12} color={light ? colors.white : colors.navy} style={!isRTL && { letterSpacing: 1.8, textTransform: 'uppercase' }}>{label}</T>
    </Link>
  );
}

export default function Home() {
  const wide = useWide();
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

  const gap = wide ? 128 : 56;
  const heroText = (
    <View style={{ gap: wide ? 22 : 14, maxWidth: 520 }}>
      <Eyebrow size={wide ? 12 : 11}>{t('heroKicker')}</Eyebrow>
      <Serif role="h1" size={wide ? 74 : 42}>{t('heroTitle')}</Serif>
      <T size={wide ? 18 : 15} lh={1.6} color={colors.body}>{t('heroBody')}</T>
      <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 28 : 16, marginTop: wide ? 10 : 4 }}>
        <Button label={t('exploreGifts')} href="/shop" size="lg" />
        <CapsLink label={t('helpChoose')} href="/concierge" />
      </View>
    </View>
  );

  const homeFaqs = [1, 2, 3, 4].map((n) => ({ q: t(`hfaq${n}q` as Key), a: t(`hfaq${n}a` as Key) }));
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
            <Icon name={destIcon(destination)} size={16} stroke={1.5} />
            <T w={600} size={12} color={colors.navy}>{t(`dest_${destination}` as Key)}</T>
            <Icon name="chevronDown" size={12} stroke={2} />
          </Pressable>
        </Container>
      )}

      {/* 1 · Hero: real products from the marketplace in arched afternoon light; the headline sits on the quiet wall */}
      {wide ? (
        <View style={{ minHeight: 680, justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.sand }}>
          <CinematicPhoto uri={isRTL ? '/images/hero-light-rtl.jpg' : '/images/hero-light.jpg'} label={t('heroImageAlt')} sweep={false} />
          <Container style={{ paddingVertical: 96 }}>{heroText}</Container>
        </View>
      ) : (
        <>
          <View style={{ height: 360, backgroundColor: colors.sand }}>
            <CinematicPhoto uri={isRTL ? '/images/hero-light-rtl.jpg' : '/images/hero-light.jpg'} position={isRTL ? 'left' : 'right'} label={t('heroImageAlt')} sweep={false} />
          </View>
          <Container style={{ paddingTop: 28, paddingBottom: 8 }}>{heroText}</Container>
        </>
      )}

      {/* Promise: three quiet lines between fine gold rules */}
      <Container style={{ paddingTop: wide ? 0 : 28 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', borderBottomWidth: 1, borderColor: colors.goldLine }}>
          {(['heroTrust1', 'heroTrust2', 'heroTrust3'] as const).map((k, i) => (
            <View key={k} {...reveal(i)} style={{ flex: 1, paddingVertical: wide ? 22 : 12, alignItems: wide ? 'center' : 'flex-start', borderStartWidth: wide && i ? 1 : 0, borderColor: colors.goldLine }}>
              <T size={13} w={500} color={colors.body} style={!isRTL && { letterSpacing: 0.4 }}>{t(k)}</T>
            </View>
          ))}
        </View>
      </Container>

      {/* 2 · Three doors into the marketplace */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead kicker={t('doorsKicker')} title={t('doorsTitle')} reveal />
        {wide ? (
          <View style={{ flexDirection: 'row', gap: 28 }}>
            {DOORS.map((d, i) => (
              <Link key={d.title} href={d.href} asChild>
                <Pressable accessibilityRole="link" {...reveal(i + 1, { hover: 'door' })} style={{ flex: 1, gap: 16 }}>
                  <View style={{ aspectRatio: 4 / 5, overflow: 'hidden', borderWidth: 1, borderColor: colors.hair, backgroundColor: colors.sand }}>
                    <View {...data({ zoom: 1 })} style={StyleSheet.absoluteFill}>
                      <Image source={{ uri: imageUrl(d.img) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={t(d.title)} />
                    </View>
                  </View>
                  <Serif size={30}>{t(d.title)}</Serif>
                  <T size={14.5} lh={1.55} color={colors.body}>{t(d.line)}</T>
                  {/* the gold underline draws in from the start edge when the door is hovered (web) */}
                  <View {...data({ ul: 'start' })} style={{ alignSelf: 'flex-start' }}>
                    <T w={600} size={isRTL ? 14 : 12} color={colors.emerald} style={!isRTL && { letterSpacing: 1.8, textTransform: 'uppercase' }}>{t('discover')}</T>
                  </View>
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          <ScrollView horizontal {...reveal(1)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingEnd: 16 }}>
            {DOORS.map((d) => (
              <Link key={d.title} href={d.href} asChild>
                <Pressable accessibilityRole="link" style={{ width: 260, gap: 10 }}>
                  <View style={{ aspectRatio: 4 / 5, overflow: 'hidden', borderWidth: 1, borderColor: colors.hair, backgroundColor: colors.sand }}>
                    <Image source={{ uri: imageUrl(d.img) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={t(d.title)} />
                  </View>
                  <Serif size={24}>{t(d.title)}</Serif>
                  <T size={13.5} lh={1.5} color={colors.body}>{t(d.line)}</T>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        )}
      </Container>

      {/* 3 · The fragrance house, in Kiswah black */}
      <View style={{ marginTop: gap }}><FragranceHouse /></View>

      {/* 4 · A considered selection */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead kicker={t('doorsKicker')} title={t('featured')} link={wide ? t('viewAll') : t('all')} href="/shop" reveal />
        {featured === null ? <Loading /> : (
          <Grid cols={wide ? 3 : 2} gap={wide ? 28 : 12} reveal>
            {featured.filter((p) => !NOT_STUDIO.includes(p.slug)).slice(0, 6).map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        )}
      </Container>

      {/* 5 · Seasons of giving */}
      <Container style={{ paddingTop: gap }}>
        <View nativeID="occasions" />
        <SectionHead kicker={t('occasionsKicker')} title={t('occasionTitle')} link={wide ? t('allOccasions') : t('all')} href="/shop" reveal />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 24 }}>
          {[
            { k: t('hajjKicker'), title: t('hajjTitle'), body: t('hajjBody'), tag: 'hajj', img: '/images/hajj.jpg' },
            { k: t('ramadanKicker'), title: t('ramadanTitle'), body: t('ramadanBody'), tag: 'ramadan', img: '/images/ramadan.jpg' },
          ].map((c, i) => (
            <Link key={c.tag} href={{ pathname: '/shop', params: { tag: c.tag } }} asChild>
              <Pressable accessibilityRole="link" {...reveal(wide ? i + 1 : 1, { hover: 'card' })} style={{ flex: 1, gap: 14 }}>
                <View style={{ aspectRatio: 16 / 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.hair, backgroundColor: colors.sand }}>
                  <View {...data({ zoom: 1 })} style={StyleSheet.absoluteFill}>
                    <Image source={{ uri: imageUrl(c.img) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={c.title} />
                  </View>
                </View>
                <Eyebrow size={11}>{c.k}</Eyebrow>
                <Serif size={wide ? 36 : 26}>{c.title}</Serif>
                <T size={14.5} lh={1.55} color={colors.body} style={{ maxWidth: 520 }}>{c.body}</T>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>

      {/* 6 · For makers: invitation to sell, between fine gold and green rules */}
      <Container style={{ paddingTop: gap }}>
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.goldLine, paddingVertical: wide ? 72 : 36, flexDirection: wide ? 'row' : 'column', gap: wide ? 72 : 18, alignItems: wide ? 'center' : 'stretch' }}>
          <View {...reveal(0)} style={{ flex: 1.2, gap: wide ? 16 : 10 }}>
            <Eyebrow size={wide ? 12 : 11} color={colors.emerald}>{t('sellKicker')}</Eyebrow>
            <Serif role="h2" size={wide ? 50 : 32}>{t('sellTitle')}</Serif>
            <T size={wide ? 17 : 15} lh={1.7} color={colors.body} style={{ maxWidth: 620 }}>{t('sellBody')}</T>
          </View>
          <View {...reveal(wide ? 1 : 0)} style={{ flex: 1, gap: 14 }}>
            {(['sellPoint1', 'sellPoint2', 'sellPoint3'] as const).map((k) => (
              <View key={k} style={{ paddingBottom: 12, borderBottomWidth: 1, borderColor: colors.hair }}>
                <T size={15} color={colors.navy}>{t(k)}</T>
              </View>
            ))}
            <Button label={t('sellCta')} href={SELL_HREF as Href} size="lg" style={{ marginTop: 10, alignSelf: wide ? 'flex-start' : 'stretch' }} />
          </View>
        </View>
      </Container>

      {/* 7 · Our story */}
      <Container style={{ paddingTop: gap }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 72 : 22, alignItems: wide ? 'center' : 'stretch' }}>
          <View {...reveal(0)} style={{ flex: 1, aspectRatio: wide ? 4 / 5 : 4 / 3, overflow: 'hidden', borderWidth: 1, borderColor: colors.hair, backgroundColor: colors.sand }}>
            <View {...data({ zoom: 1 })} style={StyleSheet.absoluteFill}>
              <Image source={{ uri: imageUrl('/images/madinah-minarets.jpg') }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityLabel={t('heritageTitle')} />
            </View>
          </View>
          <View {...reveal(wide ? 1 : 0)} style={{ flex: wide ? 1.1 : undefined, gap: wide ? 20 : 12 }}>
            <Eyebrow size={wide ? 12 : 11}>{t('heritageKicker')}</Eyebrow>
            <Serif role="h2" size={wide ? 50 : 32}>{t('heritageTitle')}</Serif>
            <T size={wide ? 17 : 15} lh={1.7} color={colors.body}>{t('heritageBody')}</T>
            <View style={{ flexDirection: wide ? 'row' : 'column', borderTopWidth: 1, borderColor: colors.goldLine, marginTop: 10 }}>
              {(['h1', 'h2', 'h3'] as const).map((h) => (
                <View key={h} style={{ flex: 1, paddingTop: 18, paddingEnd: 18, gap: 6 }}>
                  <Serif size={wide ? 32 : 24} color={colors.brassText}>{t(`${h}Label` as Key)}</Serif>
                  <T size={13.5} lh={1.55} color={colors.body} style={{ flexShrink: 1 }}>{t(`${h}Body` as Key)}</T>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Container>

      {/* Answers (also read by search engines and AI assistants) */}
      <Container style={{ paddingTop: gap }}>
        <View {...reveal(0)} style={{ maxWidth: 860 }}>
          <Faq title={t('faqTitle')} items={homeFaqs} />
        </View>
      </Container>

      {/* Reassurance, as a quiet row of four */}
      <Container style={{ paddingTop: wide ? 96 : 40, paddingBottom: wide ? 104 : 48 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderColor: colors.goldLine }}>
          {([
            ['bag', t('re1t'), t('re1b')], ['lock', t('re2t'), t('payNote')], ['shield', t('re3t'), t('re3b')], ['check', t('re4t'), t('re4b')],
          ] as const).map(([ic, a, b], i) => (
            <View key={a} {...reveal(wide ? i : 0)} style={{ flexGrow: 1, flexBasis: wide ? 230 : '100%', flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: wide ? 24 : 14, paddingEnd: 20 }}>
              <Icon name={ic} size={20} color={colors.brass} stroke={1.4} />
              <View style={{ flex: 1, gap: 3 }}>
                <T w={600} size={14} color={colors.navy}>{a}</T>
                <T size={13} lh={1.5} color={colors.body}>{b}</T>
              </View>
            </View>
          ))}
        </View>
      </Container>

      <DestinationSheet open={destOpen} onClose={() => setDestOpen(false)} />
    </Screen>
  );
}
