// /brands: our partner houses, each opening its own page (src/lib/partners.ts).
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Container, Eyebrow, Grid, Photo, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { PARTNERS, partnerCover, partnerHref } from '@/lib/partners';
import { snapshot } from '@/lib/snapshot';
import { colors } from '@/theme';

export default function Brands() {
  const { t, lang } = useI18n();
  const wide = useWide();
  return (
    <Screen>
      <Seo title={t('brandsTitle')} description={t('brandsBody')} path="/brands" noindex />
      <Container style={{ paddingTop: wide ? 48 : 24, paddingBottom: 24 }}>
        <Eyebrow rule>{t('brandKicker')}</Eyebrow>
        <Serif role="h1" size={wide ? 54 : 38} style={{ marginTop: 14 }}>{t('brandsTitle')}</Serif>
        <T size={wide ? 17 : 15.5} lh={1.7} color={colors.body} style={{ maxWidth: 640, marginTop: 14 }}>{t('brandsBody')}</T>
        <View style={{ marginTop: 40 }}>
        <Grid min={wide ? 260 : 150} gap={wide ? 28 : 14} rowGap={40}>
          {PARTNERS.map((p) => {
            const img = partnerCover(p) ?? snapshot.products.find((x) => x.brand === p.catalogueBrand)?.images?.[0];
            return (
              <Link key={p.slug} href={partnerHref(p.slug)} asChild>
                <Pressable accessibilityRole="link" {...{ dataSet: { hover: 'door' } }} style={{ gap: 10 }}>
                  <Photo uri={img} ratio={4 / 5} tone={colors.white} label={p.name} />
                  <Serif size={wide ? 26 : 21}>{lang === 'ar' ? p.nameAr : p.name}</Serif>
                  <T size={13.5} lh={1.55} color={colors.muted} numberOfLines={3}>{t(p.blurb)}</T>
                </Pressable>
              </Link>
            );
          })}
        </Grid>
        </View>
      </Container>
    </Screen>
  );
}
