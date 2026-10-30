// Prohibited and restricted items, each with what is accepted and what is not.
import React from 'react';
import { View } from 'react-native';
import { GuideLayout, RuleRow } from '@/components/guidelines';
import { Serif, T, useWide } from '@/components/ui';
import { GUIDE_PAGES, ISLAMIC_LEVELS } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';
import { useGuidance } from '@/lib/market';
import { colors } from '@/theme';

export default function Prohibited() {
  const { lang } = useI18n();
  const wide = useWide();
  const g = useGuidance();
  const page = GUIDE_PAGES.find((p) => p.id === 'prohibited')!;
  const block = (level: 'prohibited' | 'restricted') => {
    const lv = ISLAMIC_LEVELS.find((l) => l.level === level)!;
    return (
      <View style={{ gap: 6 }}>
        <Serif role="h2" size={wide ? 34 : 26}>{lv.title[lang]}</Serif>
        <T size={15} lh={1.7} color={colors.body} style={{ marginBottom: 6 }}>{lv.body[lang]}</T>
        {g.rules.filter((r) => r.level === level).map((r) => <RuleRow key={r.code} rule={r} />)}
      </View>
    );
  };
  return (
    <GuideLayout page="prohibited" title={page.title[lang]} intro={page.line[lang]}
      seoTitle="Prohibited and restricted items | Al Mukarramah seller handbook"
      seoDescription="What is never sold on Al Mukarramah, and what our team decides case by case, with examples of what is accepted and what is not.">
      {block('prohibited')}
      {block('restricted')}
    </GuideLayout>
  );
}
