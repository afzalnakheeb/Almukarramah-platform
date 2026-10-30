// A seller's shop on Al Mukarramah: banner and logo (once our team has published them), their story, where they
// ship from, how fast they pack, returns, rating, what they make, a search within the shop and their approved products.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName } from '@/components/country';
import { Glow, Ornament, StarLattice } from '@/components/decor';
import { Icon } from '@/components/icons';
import { breadcrumbLd, itemListLd, Seo } from '@/components/seo';
import { Card, Chip, Container, Eyebrow, Grid, Notice, ProductTile, Serif, T, useWide } from '@/components/ui';
import { getSellerBySlug, getSellerProducts, getStorefront, type PublicSeller, type Storefront } from '@/lib/catalogue';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n } from '@/lib/i18n';
import { imageUrl, SITE_URL } from '@/lib/images';
import { guidanceSnapshot } from '@/lib/market';
import { DEMO_LISTINGS, DEMO_SELLER, demoListing } from '@/lib/market-demo';
import { snapshotBySeller, snapshotSeller, snapshotSellers } from '@/lib/snapshot';
import type { Product } from '@/lib/types';
import { colors, sans } from '@/theme';

export function generateStaticParams() {
  return [...snapshotSellers().map((s) => ({ slug: s.slug })), ...(MARKET_DEMO ? [{ slug: DEMO_SELLER.seller.slug }] : [])];
}

/** The example shop in the screenshot build. */
function demoShop(): { front: Storefront; items: Product[] } {
  const catId = (slug: string) => guidanceSnapshot.categories.find((c) => c.slug === slug)?.id ?? null;
  const items = DEMO_LISTINGS.filter((l) => ['demo-live', 'demo-queue-oud', 'demo-review'].includes(l.id)).map((l) => {
    const d = demoListing(l.id, catId)!;
    const c = guidanceSnapshot.categories.find((x) => x.id === d.category_id);
    return { ...d, restricted_countries: [], is_featured: false, brand: null, categories: c ? { slug: c.slug, name_en: c.name_en, name_ar: c.name_ar } : null,
      sellers: { slug: DEMO_SELLER.seller.slug, name_en: DEMO_SELLER.seller.name_en, name_ar: DEMO_SELLER.seller.name_ar, country: 'SA', kind: 'marketplace' } } as unknown as Product;
  });
  return {
    front: { seller: { ...DEMO_SELLER.seller, since: '2026-09-05T09:00:00Z' }, listings: items.length, rating_avg: 4.8, rating_count: 23,
      categories: [{ slug: 'oud-oils', name_en: 'Oud and Perfume Oils', name_ar: 'دهن العود والعطور الزيتية', count: 2 }, { slug: 'prayer-mats', name_en: 'Prayer Mats', name_ar: 'سجادات الصلاة', count: 1 }] },
    items,
  };
}

export default function SellerShop() {
  const wide = useWide();
  const { t, lang, isRTL } = useI18n();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [s, setS] = useState<(PublicSeller & { since?: string | null }) | null | undefined>(() => snapshotSeller(slug) ?? undefined);
  const [front, setFront] = useState<Storefront | null>(null);
  const [items, setItems] = useState<Product[]>(() => { const x = snapshotSeller(slug); return x ? snapshotBySeller(x.id) : []; });
  const [q, setQ] = useState('');
  useEffect(() => {
    if (MARKET_DEMO && slug === DEMO_SELLER.seller.slug) {
      const d = demoShop();
      setS(d.front.seller); setFront(d.front); setItems(d.items);
      return;
    }
    getStorefront(slug).then((f) => { if (f) { setFront(f); setS(f.seller); } }).catch(() => undefined);
    getSellerBySlug(slug).then((r) => {
      setS((cur) => (r ? { ...r, since: cur?.since } : cur ?? null));
      if (r) getSellerProducts(r.id).then(setItems).catch(() => undefined);
    }).catch(() => setS((cur) => cur ?? null));
  }, [slug]);

  if (s === undefined) return <Screen><T color={colors.muted}>…</T></Screen>;
  if (s === null || s.status !== 'approved') return <Screen><Seo title="Seller not found | Al Mukarramah" description="" path={`/sellers/${slug}`} noindex /><Notice text={t('notFound')} /></Screen>;
  const name = lang === 'ar' && s.name_ar ? s.name_ar : s.name_en;
  const about = lang === 'ar' ? s.about_ar || s.about_en : s.about_en || s.about_ar;
  const returns = lang === 'ar' ? s.returns_ar || s.returns_en : s.returns_en || s.returns_ar;
  const tagline = lang === 'ar' ? s.tagline_ar || s.tagline_en : s.tagline_en;
  const logo = s.logo && /^https:\/\//.test(s.logo) ? s.logo : null;
  const banner = s.banner && /^https:\/\//.test(s.banner) ? s.banner : null;
  const since = s.since ? new Date(s.since).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' }) : null;
  const searchShop = () => router.push({ pathname: '/search', params: { seller: s.slug, ...(q.trim() ? { q: q.trim() } : {}) } });
  const ld = {
    '@context': 'https://schema.org', '@type': 'Organization', name: s.name_en, alternateName: s.name_ar ?? undefined,
    url: `${SITE_URL}/sellers/${s.slug}`, description: s.about_en ?? s.tagline_en ?? undefined, logo: logo ?? undefined,
    address: { '@type': 'PostalAddress', addressCountry: s.country, addressLocality: s.city ?? undefined },
    ...(front?.rating_count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: front.rating_avg, reviewCount: front.rating_count } } : {}),
  };

  return (
    <Screen padded={false}>
      <Seo title={`${s.name_en} | Sold on Al Mukarramah`} description={(s.tagline_en ?? s.about_en ?? `${s.name_en}, an independent seller on Al Mukarramah.`).slice(0, 158)} path={`/sellers/${s.slug}`} image={banner ?? items[0]?.images[0]}
        jsonLd={[ld, itemListLd(s.name_en, items), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Our sellers', path: '/sellers' }, { name: s.name_en, path: `/sellers/${s.slug}` }])]} />
      <View style={{ backgroundColor: colors.night, overflow: 'hidden' }}>
        {banner ? <Image source={{ uri: imageUrl(banner) }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }} resizeMode="cover" /> : <StarLattice opacity={0.07} size={64} />}
        <Glow cx="85%" cy="20%" r="55%" opacity={0.2} />
        <Container style={{ paddingVertical: wide ? 56 : 28, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {logo ? <Image source={{ uri: imageUrl(logo) }} accessibilityLabel={s.name_en} style={{ width: wide ? 76 : 56, height: wide ? 76 : 56, borderRadius: 999, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.ivory }} resizeMode="cover" /> : null}
            <View style={{ flex: 1, gap: 6 }}>
              <Eyebrow size={12} color={colors.gold}>{t('sellerOnAM')} · {countryName(s.country, lang)}{s.city ? `, ${s.city}` : ''}</Eyebrow>
              <Serif role="h1" size={wide ? 56 : 36} color={colors.white}>{name}</Serif>
            </View>
          </View>
          <Ornament width={96} />
          {tagline ? <T size={wide ? 18 : 15} lh={1.6} color={colors.onNight} style={{ maxWidth: 720 }}>{tagline}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
            {front?.rating_count ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T w={600} size={14} color={colors.goldBright}>★ {Number(front.rating_avg).toFixed(1)}</T>
                <T size={13} color={colors.onNight}>{t('sfRating').replace('{avg}', Number(front.rating_avg).toFixed(1)).replace('{n}', String(front.rating_count))}</T>
              </View>
            ) : null}
            {front ? <T size={13} color={colors.onNight}>{t('sfListings').replace('{n}', String(front.listings))}</T> : null}
            {since ? <T size={13} color={colors.onNight}>{t('sfSince').replace('{date}', since)}</T> : null}
          </View>
        </Container>
      </View>
      <Container style={{ paddingVertical: wide ? 40 : 22, gap: 22 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
          {about ? <T size={15.5} lh={1.7} color={colors.body} style={{ flex: 1.4 }}>{about}</T> : null}
          <Card pad={18} style={{ flex: 1, gap: 6, borderColor: colors.champagne, alignSelf: 'stretch' }}>
            <T w={700} size={15} color={colors.navy}>{t('deliveryAndReturns')}</T>
            <T size={13.5} color={colors.body}>{t('shipsFrom')} {countryName(s.country, lang)}{s.city ? `, ${s.city}` : ''}</T>
            <T size={13.5} color={colors.body}>{t('shipsWithin')} {s.handling_days} {t('businessDays')}</T>
            {returns ? <T size={13} lh={1.55} color={colors.muted}>{returns}</T> : null}
          </Card>
        </View>
        {front?.categories.length ? (
          <View style={{ gap: 8 }}>
            <T w={600} size={10.5} caps color={colors.brassText}>{t('sfCategories')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {front.categories.map((c) => <Chip key={c.slug} size="sm" label={`${lang === 'ar' ? c.name_ar : c.name_en} (${c.count})`}
                onPress={() => router.push({ pathname: '/search', params: { seller: s.slug, cat: c.slug } })} />)}
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', alignItems: wide ? 'flex-end' : 'stretch', gap: 12 }}>
          <Serif role="h2" size={wide ? 36 : 26}>{t('productsFrom')} {name}</Serif>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: colors.navy, minWidth: wide ? 320 : undefined }}>
            <Icon name="search" size={17} stroke={1.3} color={colors.navy} />
            <TextInput value={q} onChangeText={setQ} onSubmitEditing={searchShop} returnKeyType="search" placeholder={t('sfSearchShop')} placeholderTextColor={colors.muted}
              accessibilityLabel={t('sfSearchShop')} style={[sans(400, isRTL), { flex: 1, fontSize: 15, paddingVertical: 10, color: colors.ink, textAlign: isRTL ? 'right' : 'left' }]} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('sfSearchShop')} onPress={searchShop} style={{ padding: 6 }}><Icon name={isRTL ? 'arrowLeft' : 'arrowRight'} size={16} color={colors.navy} /></Pressable>
          </View>
        </View>
        {items.length ? (
          <Grid min={wide ? 240 : 150} gap={wide ? 22 : 12} cols={wide ? undefined : 2}>
            {items.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        ) : <T color={colors.muted}>{t('sellerNoProducts')}</T>}
      </Container>
    </Screen>
  );
}
