// Our sellers: every approved independent brand on the marketplace.
import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName } from '@/components/country';
import { Ornament } from '@/components/decor';
import { breadcrumbLd, Seo } from '@/components/seo';
import { Button, Card, Eyebrow, Grid, Photo, Serif, T, useWide } from '@/components/ui';
import { getSellers } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { snapshotSellers } from '@/lib/snapshot';
import type { Seller } from '@/lib/types';
import { colors } from '@/theme';

export default function Sellers() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Seller[]>(() => snapshotSellers());
  useEffect(() => { getSellers().then((r) => setRows(r)).catch(() => undefined); }, []);
  return (
    <Screen>
      <Seo title="Our sellers | Al Mukarramah marketplace" description="Independent Islamic and modest brands from around the world, each approved by Al Mukarramah." path="/sellers" jsonLd={[breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Our sellers', path: '/sellers' }])]} />
      <View style={{ alignItems: 'center', gap: 10, marginBottom: 26, maxWidth: 760, alignSelf: 'center' }}>
        <Eyebrow size={12}>{t('marketplace')}</Eyebrow>
        <Serif role="h1" size={wide ? 54 : 36} center>{t('ourSellers')}</Serif>
        <Ornament color={colors.brass} align="center" width={100} />
        <T size={16} lh={1.6} color={colors.body} center>{t('ourSellersBody')}</T>
      </View>
      {rows.length ? (
        <Grid cols={wide ? 3 : 1} gap={18}>
          {rows.map((s) => (
            <Link key={s.id} href={{ pathname: '/sellers/[slug]', params: { slug: s.slug } }} asChild>
              <Pressable accessibilityRole="link" style={{ backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.champagne, overflow: 'hidden' }}>
                <View style={{ height: 120, backgroundColor: colors.night }}>
                  {s.banner ? <Photo uri={s.banner} ratio={3} style={{ borderRadius: 0, height: 120, aspectRatio: undefined }} /> : null}
                </View>
                <View style={{ padding: 16, gap: 4 }}>
                  <T w={700} size={17} color={colors.navy}>{lang === 'ar' && s.name_ar ? s.name_ar : s.name_en}</T>
                  <T size={13} color={colors.brassText}>{countryName(s.country, lang)}</T>
                  {(lang === 'ar' ? s.tagline_ar : s.tagline_en) ? <T size={13.5} lh={1.5} color={colors.body} numberOfLines={2}>{lang === 'ar' ? s.tagline_ar : s.tagline_en}</T> : null}
                </View>
              </Pressable>
            </Link>
          ))}
        </Grid>
      ) : (
        <Card pad={wide ? 28 : 18} style={{ alignItems: 'center', gap: 10, borderColor: colors.champagne }}>
          <Serif size={28} center>{t('sellersSoonTitle')}</Serif>
          <T color={colors.body} center>{t('sellersSoonBody')}</T>
          <Button label={t('sellOnAM')} href="/sell" />
        </Card>
      )}
    </Screen>
  );
}
