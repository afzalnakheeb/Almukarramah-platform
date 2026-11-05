// A partner house's own page (/brands/luban …): who they are, their pieces in our store (priced, add to cart), and
// any further photographs of the house (src/lib/partners.ts). We never send customers to the house's own website. The whole site is behind the site passcode.
import { Link, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Breadcrumb, Container, Eyebrow, Grid, Photo, ProductTile, Serif, T, useWide } from '@/components/ui';
import { DEPARTMENTS, departmentHref } from '@/lib/departments';
import { useI18n } from '@/lib/i18n';
import { PARTNERS, houseIsShown, partnerCover, partnerHref } from '@/lib/partners';
import { snapshot } from '@/lib/snapshot';
import { colors } from '@/theme';

export function generateStaticParams(): { slug: string }[] {
  return PARTNERS.map((p) => ({ slug: p.slug }));
}

export default function BrandPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const wide = useWide();
  const p = PARTNERS.find((x) => x.slug === slug) ?? PARTNERS[0];
  const products = p.catalogueBrand ? snapshot.products.filter((x) => x.brand === p.catalogueBrand) : [];
  const cover = partnerCover(p) ?? products[0]?.images?.[0];
  const depts = DEPARTMENTS.filter((d) => !d.parent && p.items.some((i) => i.depts.includes(d.slug)));
  const name = lang === 'ar' ? p.nameAr : p.name;
  const others = PARTNERS.filter((x) => x.slug !== p.slug && houseIsShown(x));
  // Pieces we sell appear once, as products with price and add-to-cart; the gallery keeps only the house's photographs.
  const gallery = p.items.filter((it) => !it.product);

  return (
    <Screen>
      <Seo title={p.name} description={t(p.blurb)} path={`/brands/${p.slug}`} image={cover} noindex />
      <Container style={{ paddingTop: wide ? 28 : 16 }}>
        <Breadcrumb items={[{ label: t('navHouses'), href: '/brands' }, { label: name }]} />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 64 : 24, alignItems: wide ? 'center' : 'stretch', paddingTop: 20 }}>
          {cover ? (
            <View style={{ flex: wide ? 5 : undefined }}>
              <Photo uri={cover} ratio={4 / 5} label={p.name} />
            </View>
          ) : null}
          <View style={{ flex: wide ? 6 : undefined, gap: 18 }}>
            <Eyebrow rule>{t('brandKicker')}</Eyebrow>
            <Serif role="h1" size={wide ? 58 : 40}>{name}</Serif>
            <T size={wide ? 17 : 15.5} lh={1.75} color={colors.body} style={{ maxWidth: 560 }}>{t(p.blurb)}</T>
            {depts.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 }}>
                {depts.map((d) => (
                  <Link key={d.slug} href={departmentHref(d.slug)} asChild>
                    <Pressable accessibilityRole="link" style={{ borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingHorizontal: 14 }}>
                      <T w={500} size={13.5} color={colors.emerald}>{t(d.title)}</T>
                    </Pressable>
                  </Link>
                ))}
              </View>
            )}
          </View>
        </View>
      </Container>

      {products.length > 0 && (
        <Container style={{ paddingTop: 72 }}>
          <Serif size={wide ? 36 : 28} style={{ marginBottom: 24 }}>{t('brandShop')}</Serif>
          <Grid min={wide ? 230 : 150} gap={wide ? 24 : 14} rowGap={36}>
            {products.map((x) => <ProductTile key={x.id} product={x} compact={!wide} />)}
          </Grid>
        </Container>
      )}

      {gallery.length > 0 && (
        <Container style={{ paddingTop: 72 }}>
          <Serif size={wide ? 36 : 28}>{t('brandCollection')}</Serif>
          <T size={14} lh={1.65} color={colors.muted} style={{ maxWidth: 640, marginTop: 10, marginBottom: 28 }}>{t('brandCollectionNote')}</T>
          <Grid min={wide ? 240 : 150} gap={wide ? 28 : 14} rowGap={36}>
            {gallery.map((it) => (
              <View key={it.id} style={{ gap: 10 }}>
                <Photo uri={it.img} ratio={4 / 5} tone={colors.white} label={`${p.name}, ${it.en}`} />
                <Serif size={19}>{lang === 'ar' ? it.ar : it.en}</Serif>
                {it.onRequest ? <T size={13} color={colors.muted}>{t('priceOnRequest')}</T> : null}
              </View>
            ))}
          </Grid>
        </Container>
      )}

      <Container style={{ paddingTop: 80, paddingBottom: 24 }}>
        <Eyebrow rule>{t('navHouses')}</Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 24 : 14, marginTop: 18 }}>
          {others.map((o) => (
            <Link key={o.slug} href={partnerHref(o.slug)} asChild>
              <Pressable accessibilityRole="link" style={{ paddingVertical: 6 }}>
                <T w={500} size={15} color={colors.emerald}>{lang === 'ar' ? o.nameAr : o.name}</T>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>
    </Screen>
  );
}
