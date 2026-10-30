// A seller's shop on Al Mukarramah: their story, where they ship from, delivery and returns, and their approved products.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName } from '@/components/country';
import { Glow, Ornament, StarLattice } from '@/components/decor';
import { breadcrumbLd, itemListLd, Seo } from '@/components/seo';
import { Card, Container, Eyebrow, Grid, Notice, ProductTile, Serif, T, useWide } from '@/components/ui';
import { getSellerBySlug, getSellerProducts } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { SITE_URL } from '@/lib/images';
import { snapshotBySeller, snapshotSeller, snapshotSellers } from '@/lib/snapshot';
import type { Product, Seller } from '@/lib/types';
import { colors } from '@/theme';

export function generateStaticParams() {
  return snapshotSellers().map((s) => ({ slug: s.slug }));
}

export default function SellerShop() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [s, setS] = useState<Seller | null | undefined>(() => snapshotSeller(slug) ?? undefined);
  const [items, setItems] = useState<Product[]>(() => { const x = snapshotSeller(slug); return x ? snapshotBySeller(x.id) : []; });
  useEffect(() => {
    getSellerBySlug(slug).then((r) => {
      setS(r);
      if (r) getSellerProducts(r.id).then(setItems).catch(() => undefined);
    }).catch(() => setS((cur) => cur ?? null));
  }, [slug]);

  if (s === undefined) return <Screen><T color={colors.muted}>…</T></Screen>;
  if (s === null || s.status !== 'approved') return <Screen><Seo title="Seller not found | Al Mukarramah" description="" path={`/sellers/${slug}`} noindex /><Notice text={t('notFound')} /></Screen>;
  const name = lang === 'ar' && s.name_ar ? s.name_ar : s.name_en;
  const about = lang === 'ar' ? s.about_ar || s.about_en : s.about_en || s.about_ar;
  const returns = lang === 'ar' ? s.returns_ar || s.returns_en : s.returns_en || s.returns_ar;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Organization', name: s.name_en, alternateName: s.name_ar ?? undefined,
    url: `${SITE_URL}/sellers/${s.slug}`, description: s.about_en ?? s.tagline_en ?? undefined,
    address: { '@type': 'PostalAddress', addressCountry: s.country, addressLocality: s.city ?? undefined },
  };

  return (
    <Screen padded={false}>
      <Seo title={`${s.name_en} | Sold on Al Mukarramah`} description={(s.tagline_en ?? s.about_en ?? `${s.name_en}, an independent seller on Al Mukarramah.`).slice(0, 158)} path={`/sellers/${s.slug}`} image={s.banner ?? items[0]?.images[0]}
        jsonLd={[ld, itemListLd(s.name_en, items), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Our sellers', path: '/sellers' }, { name: s.name_en, path: `/sellers/${s.slug}` }])]} />
      <View style={{ backgroundColor: colors.night, overflow: 'hidden' }}>
        <StarLattice opacity={0.07} size={64} />
        <Glow cx="85%" cy="20%" r="55%" opacity={0.2} />
        <Container style={{ paddingVertical: wide ? 56 : 28, gap: 10 }}>
          <Eyebrow size={12} color={colors.gold}>{t('sellerOnAM')} · {countryName(s.country, lang)}</Eyebrow>
          <Serif role="h1" size={wide ? 56 : 36} color={colors.white}>{name}</Serif>
          <Ornament width={96} />
          {(lang === 'ar' ? s.tagline_ar || s.tagline_en : s.tagline_en) ? <T size={wide ? 18 : 15} lh={1.6} color={colors.onNight} style={{ maxWidth: 720 }}>{lang === 'ar' ? s.tagline_ar || s.tagline_en : s.tagline_en}</T> : null}
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
        <Serif role="h2" size={wide ? 36 : 26}>{t('productsFrom')} {name}</Serif>
        {items.length ? (
          <Grid min={wide ? 240 : 150} gap={wide ? 22 : 12} cols={wide ? undefined : 2}>
            {items.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        ) : <T color={colors.muted}>{t('sellerNoProducts')}</T>}
      </Container>
    </Screen>
  );
}
