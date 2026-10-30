// Conversations with customers, always through Al Mukarramah (contact details are masked).
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Inbox } from '@/components/conversation';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Notice, Serif, T, useHydrated, useWide } from '@/components/ui';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n } from '@/lib/i18n';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

export default function SellerMessages() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const hydrated = useHydrated();
  const { thread } = useLocalSearchParams<{ thread?: string }>();
  return (
    <Screen chrome="none" style={{ maxWidth: 1100 }}>
      <Seo title="Messages | Seller | Al Mukarramah" description="Seller messages." path="/seller/messages" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdMessages')}</Serif>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('msSellerIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      {hydrated ? <Inbox side="seller" sellerId={me.seller.id} initial={thread ?? null} emptyText={t('msNoneSeller')} /> : null}
    </Screen>
  );
}
