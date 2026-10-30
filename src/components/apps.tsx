// App card used on /apps and in the account.
import { router } from 'expo-router';
import React from 'react';
import { Image, Platform, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Button, Card, Serif, T, useWide } from '@/components/ui';
import type { PlatformApp } from '@/lib/apps';
import { useI18n, type Key } from '@/lib/i18n';
import { openExternal } from '@/lib/links';
import { colors } from '@/theme';

export function AppCard({ a, compact }: { a: PlatformApp; compact?: boolean }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const ar = lang === 'ar';
  const statusOf: Record<PlatformApp['status'], [Key, 'ok' | 'info' | 'mute']> = {
    live_web: ['appLiveWeb', 'ok'], beta: ['appBeta', 'info'], coming_soon: ['appComingSoon', 'mute'],
  };
  const [label, tone] = statusOf[a.status];
  // status: a fine dot and small capitals, not a box (beside the name on desktop, under it on phones)
  const status = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', marginTop: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: tone === 'ok' ? colors.emerald : tone === 'info' ? colors.gold : colors.line }} />
      <T w={600} size={10} caps color={tone === 'ok' ? colors.emerald : tone === 'info' ? colors.brassText : colors.muted}>{t(label)}</T>
    </View>
  );
  return (
    <Card pad={compact ? 18 : wide ? 32 : 20} style={{ gap: 14, flex: 1, minWidth: wide ? 320 : undefined, borderTopColor: colors.gold }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: compact ? 52 : 68, height: compact ? 52 : 68, borderRadius: 12, overflow: 'hidden', backgroundColor: a.accent }}>
          <Image source={{ uri: a.icon }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Serif size={compact ? 22 : 26}>{ar ? a.name_ar : a.name_en}</Serif>
          {/* the name in the other script sits under the first, aligned with it */}
          <T size={13} color={colors.muted} style={{ textAlign: ar ? 'right' : 'left' }}>{ar ? a.name_en : a.name_ar}</T>
          {!wide && status}
        </View>
        {wide && status}
      </View>
      <T w={500} size={compact ? 14 : 15} color={colors.navy} lh={1.55}>{ar ? a.tagline_ar : a.tagline_en}</T>
      {!compact && <T size={14.5} lh={1.65} color={colors.body}>{ar ? a.description_ar : a.description_en}</T>}
      {!compact && (
        <View style={{ gap: 8, marginTop: 2 }}>
          {(ar ? a.features_ar : a.features_en).map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={15} stroke={1.6} color={colors.emerald} />
              <T size={14} lh={1.55} color={colors.body} style={{ flex: 1 }}>{f}</T>
            </View>
          ))}
          <T size={13} color={colors.muted} style={{ marginTop: 4 }}>{t('appFor')}: {ar ? a.audience_ar : a.audience_en}</T>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
        {a.url && <Button label={t('openApp')} size={compact ? 'sm' : undefined} onPress={() => openExternal(a.url!)} />}
        <Button label={t('learnMore')} kind="secondary" size={compact ? 'sm' : undefined} onPress={() => router.push({ pathname: '/apps/[slug]', params: { slug: a.slug } })} />
        {a.ios && Platform.OS !== 'android' && <Button label="App Store" kind="secondary" size={compact ? 'sm' : undefined} onPress={() => openExternal(a.ios!)} />}
        {a.android && Platform.OS !== 'ios' && <Button label="Google Play" kind="secondary" size={compact ? 'sm' : undefined} onPress={() => openExternal(a.android!)} />}
        {!a.ios && !a.android && <T size={12.5} color={colors.muted} style={{ alignSelf: 'center' }}>{t(Platform.OS === 'web' ? 'appStoresSoon' : 'appStoresSoonNative')}</T>}
      </View>
    </Card>
  );
}

