// The seller handbook: what selling on Al Mukarramah involves, the five handbook pages and how approval works.
import React from 'react';
import { View } from 'react-native';
import { GuideCards, GuideLayout, GuideSectionView } from '@/components/guidelines';
import { APPROVAL } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';

export default function SellerHandbook() {
  const { t } = useI18n();
  return (
    <GuideLayout page="handbook" title={t('mkHandbook')} intro={t('mkHandbookIntro')}
      seoTitle="Seller handbook | Sell on Al Mukarramah"
      seoDescription="What you can sell on Al Mukarramah, the Islamic and premium standards every product meets, photo guidelines, prohibited and restricted items, and how approval works.">
      <GuideCards />
      <View>
        <GuideSectionView s={APPROVAL} />
      </View>
    </GuideLayout>
  );
}
