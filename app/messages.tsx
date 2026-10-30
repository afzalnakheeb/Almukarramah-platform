// The customer's conversations with sellers and with Al Mukarramah. Contact details are masked, and payments are never
// made outside the platform.
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Inbox } from '@/components/conversation';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, H1, Notice, T, useHydrated, useWide } from '@/components/ui';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function Messages() {
  const wide = useWide();
  const { t } = useI18n();
  const { session } = useSession();
  const hydrated = useHydrated();
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  const ready = hydrated && (session || MARKET_DEMO);
  return (
    <Screen style={{ maxWidth: 1180 }}>
      <Seo title="Messages | Al Mukarramah" description="Your messages." path="/messages" noindex />
      <Button kind="text" size="sm" label={t('backToAccount')} href="/account" style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
      <H1 size={wide ? 44 : 32}>{t('msTitle')}</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 14, maxWidth: 760 }}>{t('msCustomerIntro')}</T>
      {hydrated && !session && !MARKET_DEMO ? <Notice text={t('msSignIn')} /> : null}
      {ready ? <Inbox side="customer" initial={thread ?? null} emptyText={t('msNoneCustomer')} /> : null}
    </Screen>
  );
}
