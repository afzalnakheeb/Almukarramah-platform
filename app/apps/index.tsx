// Our apps: the Al Mukarramah family (Recite With Me, Seerah Trails, and more to come).
import React from 'react';
import { View } from 'react-native';
import { AppCard } from '@/components/apps';
import { Screen } from '@/components/chrome';
import { breadcrumbLd, Seo } from '@/components/seo';
import { Card, Eyebrow, Serif, T, useWide } from '@/components/ui';
import { appLd, APPS } from '@/lib/apps';
import { useI18n } from '@/lib/i18n';
import { SITE_URL } from '@/lib/images';
import { colors } from '@/theme';

export default function Apps() {
  const wide = useWide();
  const { t } = useI18n();
  return (
    <Screen>
      <Seo
        title="Our apps | Al Mukarramah"
        description="The Al Mukarramah family of apps: Recite With Me for Quran memorisation and tajweed, and Seerah Trails, a 3D Seerah journey for children."
        path="/apps"
        jsonLd={[...APPS.map((a) => appLd(a, SITE_URL)), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Our apps', path: '/apps' }])]}
      />
      <View style={{ alignItems: 'center', maxWidth: 760, alignSelf: 'center', gap: 10, marginBottom: 28, marginTop: wide ? 16 : 0 }}>
        <Eyebrow size={12}>{t('ourApps')}</Eyebrow>
        <Serif role="h1" size={wide ? 52 : 34} center>{t('appsTitle')}</Serif>
        <T size={wide ? 17 : 15} lh={1.6} color={colors.body} center>{t('appsBody')}</T>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, alignItems: 'stretch' }}>
        {APPS.map((a) => <AppCard key={a.slug} a={a} />)}
      </View>
      <Card pad={wide ? 22 : 16} style={{ marginTop: 22, borderRadius: 20, backgroundColor: colors.lavender, gap: 6 }}>
        <T w={700} size={16} color={colors.navy}>{t('oneAccountTitle')}</T>
        <T size={14} lh={1.6} color={colors.body}>{t('oneAccountBody')}</T>
      </Card>
    </Screen>
  );
}
