// Homepage — follows Main.dc.html (desktop) and MobileHome.dc.html (phone) in the AlMukarramah Platform Design.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { DestinationSheet, destIcon, Logo, Screen } from '@/components/chrome';
import { ArchMotif, Icon } from '@/components/icons';
import { Button, Card, Container, Eyebrow, Grid, Loading, OptionCard, Photo, ProductTile, SectionHead, Serif, T, useWide } from '@/components/ui';
import { getFeatured } from '@/lib/catalogue';
import { useI18n, type Key } from '@/lib/i18n';
import { convertFromSar, formatWhole } from '@/lib/money';
import { DESTINATIONS, usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import type { Product } from '@/lib/types';
import { colors, space } from '@/theme';

const shop = (params: Record<string, string> = {}): Href => ({ pathname: '/shop', params });

const OCCASIONS: { key: Key; tag?: string; tone: string }[] = [
  { key: 'occ_eid', tag: 'eid', tone: '#F3E6DF' },
  { key: 'occ_nikah', tag: 'nikah', tone: '#F2E8EC' },
  { key: 'occ_baby', tag: 'new-baby', tone: '#E6EBE2' },
  { key: 'occ_hifz', tone: '#E8E4EE' },
  { key: 'occ_home', tone: '#EDE5D6' },
  { key: 'occ_thanks', tone: '#F6F1E8' },
];
const CATEGORIES: { key: Key; tone: string }[] = [
  { key: 'cat_dates', tone: '#EDE5D6' }, { key: 'cat_perfume', tone: '#F3E6DF' }, { key: 'cat_prayer', tone: '#E8E4EE' },
  { key: 'cat_fashion', tone: '#F2E8EC' }, { key: 'cat_books', tone: '#E6EBE2' }, { key: 'cat_sets', tone: '#EDE5D6' },
];
const RECIPIENTS: { key: string; tag?: string; tone: string }[] = [
  { key: 'rec_her', tag: 'her', tone: '#F2E8EC' }, { key: 'rec_him', tag: 'him', tone: '#E8E4EE' }, { key: 'rec_parents', tone: '#EDE5D6' },
  { key: 'rec_kids', tag: 'kids', tone: '#E6EBE2' }, { key: 'rec_home', tone: '#F3E6DF' },
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
  const { t, lang, currency } = useI18n();
  const { session } = useSession();
  const { destination, setDestination } = usePrefs();
  const params = useLocalSearchParams<{ s?: string }>();
  const [featured, setFeatured] = useState<Product[] | null>(null);
  const [destOpen, setDestOpen] = useState(false);

  useEffect(() => {
    getFeatured().then(setFeatured).catch(() => setFeatured([]));
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

  return (
    <Screen padded={false}>
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

      {/* 1 · Proposition */}
      <Container style={{ paddingTop: wide ? 48 : 20, flexDirection: wide ? 'row' : 'column-reverse', gap: wide ? 48 : 18, alignItems: wide ? 'center' : 'stretch' }}>
        <View style={{ flex: wide ? 1 : undefined, gap: wide ? 22 : 14 }}>
          {session && !wide ? <T size={14} color={colors.muted}>{t('greeting')}</T> : null}
          <Eyebrow size={wide ? 13 : 11}>{t('heroKicker')}</Eyebrow>
          <Serif role="h1" size={wide ? 66 : 38}>{t('heroTitle')}</Serif>
          {wide ? <T size={18} lh={1.65} color={colors.body} style={{ maxWidth: 500 }}>{t('heroBody')}</T> : null}
          <Button label={t('exploreGifts')} href="/shop" size={wide ? 'lg' : 'md'} style={{ alignSelf: wide ? 'flex-start' : 'stretch' }} />
        </View>
        <View style={{ flex: wide ? 1.2 : undefined, height: wide ? 560 : 300, borderTopLeftRadius: wide ? 260 : 150, borderTopRightRadius: wide ? 260 : 150, borderBottomLeftRadius: wide ? 24 : 18, borderBottomRightRadius: wide ? 24 : 18, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <ArchMotif width={wide ? 230 : 130} />
        </View>
      </Container>

      {/* What's the occasion */}
      <Container style={{ paddingTop: wide ? 64 : 30 }}>
        <View nativeID="occasions" />
        <SectionHead kicker={t('occasionsKicker')} title={t('occasionTitle')} link={wide ? t('allOccasions') : t('all')} href="/shop" size={wide ? 48 : 32} />
        <View style={{ flexDirection: 'row', gap: wide ? 20 : 10 }}>
          {[
            { k: t('hajjKicker'), title: t('hajjTitle'), body: t('hajjBody'), tone: colors.sand, tag: 'hajj' },
            { k: t('ramadanKicker'), title: t('ramadanTitle'), body: t('ramadanBody'), tone: '#E8E4EE', tag: 'ramadan' },
          ].map((c) => (
            <Link key={c.tag} href={shop({ tag: c.tag })} asChild>
              <Pressable accessibilityRole="link" style={{ flex: 1, minHeight: wide ? 380 : 200, borderRadius: wide ? 26 : 18, backgroundColor: c.tone, justifyContent: 'flex-end', padding: wide ? 30 : 14, gap: 6 }}>
                <Eyebrow size={wide ? 13 : 10}>{c.k}</Eyebrow>
                <Serif size={wide ? 44 : 25}>{c.title}</Serif>
                {wide ? <T size={15} color={colors.body} lh={1.5} style={{ maxWidth: 440 }}>{c.body}</T> : null}
              </Pressable>
            </Link>
          ))}
        </View>
        <View style={{ marginTop: wide ? 20 : 12 }}>
          <Grid cols={wide ? 6 : 3} gap={wide ? 16 : 10}>
            {OCCASIONS.map((o) => (
              <Link key={o.key} href={shop(o.tag ? { tag: o.tag } : {})} asChild>
                <Pressable accessibilityRole="link" style={{ gap: wide ? 10 : 6 }}>
                  <Photo shape="arch" ratio={3 / 4} tone={o.tone} />
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
      </Container>

      {/* Who is it for + budget */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead title={t('forWhom')} sub={wide ? t('forWhomBody') : undefined} link={wide ? t('giftFinder') : undefined} href="/concierge" size={wide ? 44 : 28} />
        {wide ? (
          <Grid cols={5} gap={18}>
            {RECIPIENTS.map((r) => (
              <Link key={r.key} href={shop(r.tag ? { tag: r.tag } : {})} asChild>
                <Pressable accessibilityRole="link" style={{ gap: 10 }}>
                  <Photo shape="arch" ratio={3 / 4} tone={r.tone} />
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
                  <Photo shape="arch" ratio={92 / 116} tone={r.tone} />
                  <T w={700} size={13} color={colors.navy}>{t(r.key as Key)}</T>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
        )}
        <View style={wide ? { marginTop: 34, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 24, padding: 22, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 } : { marginTop: 18, gap: 8 }}>
          <T w={700} size={wide ? 16 : 14} color={colors.navy} style={wide ? { marginEnd: 8 } : null}>{t('byBudget')}</T>
          <View style={{ flex: wide ? 1 : undefined, flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 14 : 8 }}>
            {BUDGETS.map((b) => (
              <Link key={b.min} href={shop({ ...(b.min ? { min: String(b.min) } : {}), ...(b.max ? { max: String(b.max) } : {}) })} asChild>
                <Pressable accessibilityRole="link" style={{ flexGrow: 1, flexBasis: wide ? 180 : '45%', borderWidth: 1, borderColor: colors.line, backgroundColor: wide ? colors.ivory : colors.white, borderRadius: wide ? 16 : 14, paddingVertical: wide ? 14 : 10, paddingHorizontal: wide ? 18 : 12, gap: 2 }}>
                  <T w={700} size={wide ? 17 : 14} color={colors.navy}>{band(b)}</T>
                  <T size={wide ? 12.5 : 11.5} color={colors.muted}>{t(b.hint)}</T>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>
      </Container>

      {/* 4 · Curated selection */}
      <Container style={{ paddingTop: gap }}>
        <SectionHead title={t('featured')} link={wide ? t('viewAll') : t('all')} href="/shop" size={wide ? 44 : 28} />
        {featured === null ? <Loading /> : (
          <Grid min={wide ? 240 : 150} gap={wide ? 22 : 12} cols={wide ? undefined : 2}>
            {featured.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        )}
      </Container>

      {/* Membership: Quran Trail and Seerah Trail */}
      <Container style={{ paddingTop: wide ? 40 : 20 }}>
        <View style={{ backgroundColor: colors.navy, borderRadius: wide ? 28 : 22, padding: wide ? 36 : 18, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 32 : 10 }}>
          <View style={{ flex: wide ? 1 : undefined, gap: 10 }}>
            <Eyebrow color={colors.champagne} size={11}>{t('membership')}</Eyebrow>
            <Serif size={wide ? 40 : 28} color={colors.white}>{t('circleTitle')}</Serif>
            <T size={wide ? 16 : 14} lh={1.6} color="#D6D8EA" style={{ maxWidth: 560 }}>{t('circleBody')}</T>
          </View>
          <Button label={t('circleCta')} kind="light" href="/membership" style={{ alignSelf: wide ? 'center' : 'flex-start' }} />
        </View>
      </Container>

      {/* 6 · Heritage */}
      <View style={{ marginTop: wide ? 80 : 36, backgroundColor: colors.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
        <Container style={{ paddingVertical: wide ? 72 : 28, flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 12, alignItems: wide ? 'center' : 'stretch' }}>
          {wide && <View style={{ flex: 1, height: 480, borderRadius: 24, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' }}><Logo height={60} /></View>}
          <View style={{ flex: wide ? 1.2 : undefined, gap: wide ? 20 : 12 }}>
            <Eyebrow size={wide ? 13 : 11}>{t('heritageKicker')}</Eyebrow>
            <Serif role="h2" size={wide ? 50 : 32}>{t('heritageTitle')}</Serif>
            <T size={wide ? 17 : 14} lh={1.7} color={colors.body}>{t('heritageBody')}</T>
            <View style={wide ? { flexDirection: 'row', borderTopWidth: 2, borderColor: colors.brass, marginTop: 8 } : { borderStartWidth: 2, borderColor: colors.brass, paddingStart: 14, gap: 10, marginTop: 4 }}>
              {(['h1', 'h2', 'h3'] as const).map((h) => (
                <View key={h} style={wide ? { flex: 1, paddingTop: 14, paddingEnd: 16, gap: 4 } : { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {wide ? <Serif size={30}>{t(`${h}Label` as Key)}</Serif> : <T w={700} size={13.5} color={colors.navy}>{t(`${h}Label` as Key)} —</T>}
                  <T size={13.5} lh={1.5} color={colors.body} style={{ flexShrink: 1 }}>{t(`${h}Body` as Key)}</T>
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
          {(['svc1', 'svc2', 'svc3', 'svc4'] as const).map((k) => (
            <Card key={k} pad={wide ? 22 : 14} style={{ flexGrow: 1, flexBasis: wide ? 240 : '100%', gap: 8 }}>
              <T w={700} size={16} color={colors.navy}>{t(`${k}t` as Key)}</T>
              <T size={14} lh={1.55} color={colors.body}>{t(`${k}b` as Key)}</T>
            </Card>
          ))}
        </View>
        <Button label={t('helpChoose')} kind="secondary" href="/concierge" style={{ marginTop: wide ? 22 : 12, alignSelf: wide ? 'flex-start' : 'stretch' }} />
      </Container>

      {/* 8 · Reassurance */}
      <Container style={{ paddingTop: wide ? 56 : 28, paddingBottom: wide ? 80 : 40 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.sandSoft, borderRadius: 20 }}>
          {[
            [t('re1t'), t('re1b')], [t('re2t'), t('payNote')], [t('re3t'), t('re3b')], [t('re4t'), t('re4b')],
          ].map(([a, b]) => (
            <View key={a} style={{ flexGrow: 1, flexBasis: wide ? 230 : '100%', paddingVertical: wide ? 18 : 12, paddingHorizontal: wide ? 22 : 14, gap: 2 }}>
              <T w={700} size={15} color={colors.navy}>{a}</T>
              <T size={13} color={colors.body}>{b}</T>
            </View>
          ))}
        </View>
      </Container>

      <DestinationSheet open={destOpen} onClose={() => setDestOpen(false)} />
    </Screen>
  );
}
