// One page per app (Recite With Me, Seerah Trails, …): what it is, what it does, and a clear way to open it.
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, View } from 'react-native';
import { AppCard } from '@/components/apps';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { breadcrumbLd, Seo } from '@/components/seo';
import { Button, Card, Container, Eyebrow, Serif, T, Tag, useWide } from '@/components/ui';
import { appLd, APPS } from '@/lib/apps';
import { useI18n, type Key } from '@/lib/i18n';
import { SITE_URL } from '@/lib/images';
import { openExternal } from '@/lib/links';
import { colors } from '@/theme';

export function generateStaticParams() {
  return APPS.map((a) => ({ slug: a.slug }));
}

export default function AppPage() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const a = APPS.find((x) => x.slug === slug) ?? APPS[0];
  const ar = lang === 'ar';
  const others = APPS.filter((x) => x.slug !== a.slug);
  const status: Record<string, [Key, 'ok' | 'info' | 'mute']> = { live_web: ['appLiveWeb', 'ok'], beta: ['appBeta', 'info'], coming_soon: ['appComingSoon', 'mute'] };
  const [statusLabel, tone] = status[a.status];

  return (
    <Screen padded={false}>
      <Seo
        title={`${a.name_en} (${a.name_ar}) | Al Mukarramah`}
        description={`${a.tagline_en}. ${a.description_en}`.slice(0, 158)}
        path={`/apps/${a.slug}`}
        image={a.icon}
        jsonLd={[appLd(a, SITE_URL), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Our apps', path: '/apps' }, { name: a.name_en, path: `/apps/${a.slug}` }])]}
      />

      {/* Hero on stone: the app's own colour lives in its icon and one fine rule */}
      <View style={{ backgroundColor: colors.stone, borderBottomWidth: 1, borderColor: colors.goldLine }}>
        <Container style={{ paddingVertical: wide ? 72 : 36, flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start', gap: wide ? 48 : 22 }}>
          <View style={{ width: wide ? 160 : 104, height: wide ? 160 : 104, borderRadius: wide ? 36 : 24, overflow: 'hidden', backgroundColor: a.accent }}>
            <Image source={{ uri: a.icon }} style={{ width: '100%', height: '100%' }} accessibilityLabel={a.name_en} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Eyebrow rule>{t('ourApps')}</Eyebrow>
              <Tag label={t(statusLabel)} tone={tone} />
            </View>
            <Serif role="h1" size={wide ? 60 : 40}>{ar ? a.name_ar : a.name_en}</Serif>
            <T size={wide ? 18 : 16} color={colors.muted}>{ar ? a.name_en : a.name_ar}</T>
            <View style={{ width: 40, height: 2, backgroundColor: a.accent, marginVertical: 4 }} />
            <T size={wide ? 18 : 16} lh={1.55} color={colors.navy} w={500} style={{ maxWidth: 640 }}>{ar ? a.tagline_ar : a.tagline_en}</T>
            {a.url && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, alignItems: 'center' }}>
                <Button label={t('openApp')} size="lg" onPress={() => openExternal(a.url!)} icon={<Icon name={ar ? 'arrowLeft' : 'arrowRight'} size={16} stroke={1.4} color={colors.ivory} />} />
                <T size={13} color={colors.muted}>{a.url.replace('https://', '')} · {t('appOpensNew')}</T>
              </View>
            )}
          </View>
        </Container>
      </View>

      <Container style={{ paddingVertical: wide ? 48 : 28, gap: 22 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 22, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.3, gap: 14 }}>
            <T size={wide ? 18 : 16} lh={1.7} color={colors.body}>{ar ? a.description_ar : a.description_en}</T>
            <T size={14} color={colors.muted}>{t('appFor')}: {ar ? a.audience_ar : a.audience_en}</T>
          </View>
          <Card pad={wide ? 24 : 18} style={{ flex: 1, gap: 12, alignSelf: 'stretch' }}>
            <Serif size={24}>{t('appFeatures')}</Serif>
            {(ar ? a.features_ar : a.features_en).map((f) => (
              <View key={f} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="check" size={15} stroke={1.6} color={colors.emerald} />
                <T size={14.5} lh={1.55} color={colors.body} style={{ flex: 1 }}>{f}</T>
              </View>
            ))}
          </Card>
        </View>

        <Card pad={wide ? 24 : 18} style={{ gap: 10, borderTopColor: colors.gold }}>
          <Serif size={24}>{t('installTitle')}</Serif>
          <T size={14.5} lh={1.6} color={colors.body}>{t('installIphone')}</T>
          <T size={14.5} lh={1.6} color={colors.body}>{t('installAndroid')}</T>
          <T size={13} color={colors.muted}>{t('appStoresSoon')}</T>
        </Card>

        {others.length > 0 && (
          <View style={{ gap: 14, marginTop: 8 }}>
            <Serif role="h2" size={wide ? 32 : 26}>{t('allApps')}</Serif>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
              {others.map((o) => <AppCard key={o.slug} a={o} compact />)}
            </View>
          </View>
        )}
      </Container>
    </Screen>
  );
}
