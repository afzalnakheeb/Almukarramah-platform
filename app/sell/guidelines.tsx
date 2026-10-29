// What sellers can and cannot sell, photo rules, quality standards and how approval works.
import React from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Ornament } from '@/components/decor';
import { GuidelinesView } from '@/components/guidelines';
import { Seo } from '@/components/seo';
import { Breadcrumb, Button, Eyebrow, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { openExternal } from '@/lib/links';
import { colors } from '@/theme';

export default function SellerGuidelines() {
  const wide = useWide();
  const { t } = useI18n();
  return (
    <Screen style={{ maxWidth: 1100 }}>
      <Seo title="Seller guidelines | Al Mukarramah" description="What can and cannot be sold on Al Mukarramah, photo rules, quality standards and how every listing is checked and approved." path="/sell/guidelines" />
      <Breadcrumb items={[{ label: t('home'), href: '/' }, { label: t('sellOnAM'), href: '/sell' }, { label: t('sellerGuidelines') }]} />
      <View style={{ gap: 10, marginBottom: 22, maxWidth: 820 }}>
        <Eyebrow size={12}>{t('sellOnAM')}</Eyebrow>
        <Serif role="h1" size={wide ? 54 : 36}>{t('sellerGuidelines')}</Serif>
        <Ornament color={colors.brass} width={96} />
        <T size={16} lh={1.6} color={colors.body}>{t('guidelinesIntro')}</T>
      </View>
      <GuidelinesView />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
        <Button label={t('sellApplyNow')} href="/sell" size="lg" />
        <Button label={t('askBeforeListing')} kind="secondary" size="lg" onPress={() => openExternal('mailto:hello@almukarramah.com?subject=Seller%20question')} />
      </View>
    </Screen>
  );
}
