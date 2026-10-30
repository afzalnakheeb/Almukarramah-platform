// Help and contact: the support page linked from the App Store and Google Play listings and from the app.
// The only public contact is hello@almukarramah.com.
import { Link, type Href } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Card, Eyebrow, H1, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

const CONTACT = 'hello@almukarramah.com';

export default function Support() {
  const wide = useWide();
  const { t, isRTL } = useI18n();
  const links: { label: string; href: Href }[] = [
    { label: t('concierge'), href: '/concierge' },
    { label: t('account'), href: '/account' },
    { label: t('deleteTitle'), href: '/delete-account' },
    { label: t('privacyPolicy'), href: '/privacy' },
    { label: t('termsOfService'), href: '/terms' },
  ];
  return (
    <Screen>
      <Seo title="Help and contact | Al Mukarramah" path="/support"
        description="Contact Al Mukarramah at hello@almukarramah.com, in Arabic or English: orders, your account and help choosing a gift." />
      <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center', gap: 14 }}>
        <Eyebrow rule>{t('footerHelp')}</Eyebrow>
        <H1 size={wide ? 46 : 32}>{t('supportTitle')}</H1>
        <T size={15.5} lh={1.7} color={colors.body}>{t('supportIntro')}</T>
        <Card pad={wide ? 28 : 18} style={{ gap: 10, marginTop: 6, borderTopColor: colors.gold }}>
          <T w={600} size={10.5} caps color={colors.brassText}>{t('email')}</T>
          {/* the address reads left to right, and sits on the start side (the right in Arabic) */}
          <Link href={`mailto:${CONTACT}` as Href} accessibilityLabel={CONTACT} style={{ alignSelf: 'flex-start' }}>
            <Serif size={wide ? 32 : 26} style={{ writingDirection: 'ltr' }}>{CONTACT}</Serif>
          </Link>
          <T size={14} lh={1.6} color={colors.body}>{t('supportOrders')}</T>
          <T size={14} lh={1.6} color={colors.body}>{t('supportAssistant')}</T>
        </Card>
        <Card pad={wide ? 22 : 16} style={{ marginTop: 6 }}>
          <Serif size={24} style={{ marginBottom: 6 }}>{t('supportMore')}</Serif>
          {links.map((l, i) => (
            <Link key={l.label} href={l.href} asChild>
              <Pressable accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft }}>
                <T w={500} size={15} color={colors.navy} style={{ flex: 1 }}>{l.label}</T>
                <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={16} stroke={1.3} color={colors.brass} />
              </Pressable>
            </Link>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
