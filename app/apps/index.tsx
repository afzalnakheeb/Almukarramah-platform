// Our apps: the Al Mukarramah family (Recite With Me, Seerah Trails, and more to come).
import React from 'react';
import { Platform, View } from 'react-native';
import { AppCard } from '@/components/apps';
import { Screen } from '@/components/chrome';
import { breadcrumbLd, Seo } from '@/components/seo';
import { Eyebrow, KiswahRule, Serif, T, useWide } from '@/components/ui';
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
      <View style={{ alignItems: 'center', maxWidth: 760, alignSelf: 'center', gap: wide ? 14 : 10, marginBottom: wide ? 48 : 28, marginTop: wide ? 8 : 0 }}>
        <Eyebrow center>{t('ourApps')}</Eyebrow>
        <Serif role="h1" size={wide ? 56 : 36} center>{t('appsTitle')}</Serif>
        <KiswahRule center width={wide ? 112 : 88} />
        <T size={wide ? 16.5 : 15} lh={1.65} color={colors.body} center style={{ marginTop: 4 }}>{t('appsBody')}</T>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 18, alignItems: 'stretch' }}>
        {APPS.map((a) => <AppCard key={a.slug} a={a} />)}
      </View>
      <View style={{ marginTop: wide ? 48 : 28, paddingTop: wide ? 32 : 24, borderTopWidth: 1, borderColor: colors.goldLine, flexDirection: wide ? 'row' : 'column', gap: wide ? 64 : 10 }}>
        <Serif size={wide ? 30 : 24} style={{ flex: wide ? 0.8 : undefined }}>{t('oneAccountTitle')}</Serif>
        <T size={14.5} lh={1.7} color={colors.body} style={{ flex: wide ? 1.2 : undefined }}>{t(Platform.OS === 'web' ? 'oneAccountBody' : 'oneAccountBodyNative')}</T>
      </View>
    </Screen>
  );
}
