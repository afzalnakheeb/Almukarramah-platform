// "The app" on the account screen, in the iPhone and Android apps only (the website has these in its header and
// footer): language, help and contact, the privacy policy and terms (Apple asks for an easy link to the privacy
// policy inside the app), and the version.
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import React from 'react';
import { Platform, Pressable } from 'react-native';
import { Icon } from '@/components/icons';
import { Card, Serif, T } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export function AppSettings() {
  const { t, lang, setLang, isRTL } = useI18n();
  if (Platform.OS === 'web') return null;
  const version = Constants.expoConfig?.version;
  const rows: { label: string; value?: string; onPress: () => void }[] = [
    { label: t('languageRow'), value: t('language'), onPress: () => setLang(lang === 'ar' ? 'en' : 'ar') },
    { label: t('helpContact'), onPress: () => router.push('/support' as Href) },
    { label: t('privacyPolicy'), onPress: () => router.push('/privacy') },
    { label: t('termsOfService'), onPress: () => router.push('/terms') },
  ];
  return (
    <Card pad={16} style={{ marginTop: 28 }}>
      <Serif size={26} style={{ marginBottom: 6 }}>{t('appSection')}</Serif>
      {rows.map((r, i) => (
        <Pressable key={r.label} accessibilityRole="button" onPress={r.onPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft }}>
          <T w={500} size={15} color={colors.navy} style={{ flex: 1 }}>{r.label}</T>
          {r.value ? <T size={14} color={colors.muted}>{r.value}</T> : null}
          <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={16} stroke={1.3} color={colors.brass} />
        </Pressable>
      ))}
      {version ? <T size={12} num color={colors.muted} style={{ marginTop: 10 }}>{`${t('appVersion')} ${version}`}</T> : null}
    </Card>
  );
}
