// Shared layout for the privacy policy and terms pages (Arabic and English).
import React from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Card, H1, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export type LegalDoc = {
  title: string;
  updated: string;
  intro: string;
  sections: { h: string; p: string[] }[];
};

export function LegalPage({ path, seoTitle, seoDescription, en, ar }: {
  path: string; seoTitle: string; seoDescription: string; en: LegalDoc; ar: LegalDoc;
}) {
  const wide = useWide();
  const { lang } = useI18n();
  const d = lang === 'ar' ? ar : en;
  return (
    <Screen>
      <Seo title={seoTitle} description={seoDescription} path={path} />
      <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
        <H1 size={wide ? 46 : 32}>{d.title}</H1>
        <T size={13} color={colors.muted} style={{ marginBottom: 14 }}>{d.updated}</T>
        <T size={15.5} lh={1.7} color={colors.body} style={{ marginBottom: 18 }}>{d.intro}</T>
        <Card pad={wide ? 28 : 18} style={{ borderRadius: 22, gap: 20 }}>
          {d.sections.map((s) => (
            <View key={s.h} style={{ gap: 8 }}>
              <Serif role="h2" size={wide ? 26 : 22}>{s.h}</Serif>
              {s.p.map((p, i) => <T key={i} size={15} lh={1.7} color={colors.body}>{p}</T>)}
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
