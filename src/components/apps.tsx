// App card used on /apps and in the account.
import React from 'react';
import { Image, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Button, Card, T, Tag, useWide } from '@/components/ui';
import type { PlatformApp } from '@/lib/apps';
import { useI18n, type Key } from '@/lib/i18n';
import { openExternal } from '@/lib/links';
import { colors } from '@/theme';

export function AppCard({ a, compact }: { a: PlatformApp; compact?: boolean }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const ar = lang === 'ar';
  const status: Record<PlatformApp['status'], [Key, 'ok' | 'info' | 'mute']> = {
    live_web: ['appLiveWeb', 'ok'], beta: ['appBeta', 'info'], coming_soon: ['appComingSoon', 'mute'],
  };
  const [label, tone] = status[a.status];
  return (
    <Card pad={compact ? 16 : wide ? 26 : 18} style={{ borderRadius: 24, gap: 12, flex: 1, minWidth: wide ? 320 : undefined }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: compact ? 56 : 72, height: compact ? 56 : 72, borderRadius: 18, overflow: 'hidden', backgroundColor: a.accent }}>
          <Image source={{ uri: a.icon }} style={{ width: '100%', height: '100%' }} accessibilityIgnoresInvertColors />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w={700} size={compact ? 17 : 20} color={colors.navy}>{ar ? a.name_ar : a.name_en}</T>
          <T size={13} color={colors.muted}>{ar ? a.name_en : a.name_ar}</T>
        </View>
        <Tag label={t(label)} tone={tone} />
      </View>
      <T w={600} size={compact ? 14 : 15.5} color={colors.ink} lh={1.5}>{ar ? a.tagline_ar : a.tagline_en}</T>
      {!compact && <T size={14.5} lh={1.65} color={colors.body}>{ar ? a.description_ar : a.description_en}</T>}
      {!compact && (
        <View style={{ gap: 8, marginTop: 2 }}>
          {(ar ? a.features_ar : a.features_en).map((f) => (
            <View key={f} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <Icon name="check" size={16} color={colors.success} />
              <T size={14} style={{ flex: 1 }}>{f}</T>
            </View>
          ))}
          <T size={13} color={colors.muted} style={{ marginTop: 4 }}>{t('appFor')}: {ar ? a.audience_ar : a.audience_en}</T>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 'auto', paddingTop: 6 }}>
        {a.url && <Button label={t('openApp')} size={compact ? 'sm' : undefined} onPress={() => openExternal(a.url!)} />}
        {a.ios && <Button label="App Store" kind="secondary" size={compact ? 'sm' : undefined} onPress={() => openExternal(a.ios!)} />}
        {a.android && <Button label="Google Play" kind="secondary" size={compact ? 'sm' : undefined} onPress={() => openExternal(a.android!)} />}
        {!a.ios && !a.android && <T size={12.5} color={colors.muted} style={{ alignSelf: 'center' }}>{t('appStoresSoon')}</T>}
      </View>
    </Card>
  );
}

