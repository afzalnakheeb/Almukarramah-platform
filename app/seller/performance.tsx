// The shop's standards over the last 90 days (setting): late shipments, cancellations, returns for a problem, rating
// and how quickly customers get an answer, against our thresholds. Warnings come first; a shop is paused only by our
// team (automatic pausing is off).
import React, { useEffect, useState } from 'react';
import { PerformanceView } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Loading, Notice, Serif, T, useWide } from '@/components/ui';
import { sellerPerformance, type Performance } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n } from '@/lib/i18n';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

export default function SellerPerformance() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const [p, setP] = useState<Performance | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { sellerPerformance(me.seller.id).then(setP).catch((e) => setErr(String(e.message ?? e))); }, [me.seller.id]);
  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Performance | Seller | Al Mukarramah" description="Seller performance." path="/seller/performance" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdPerformance')}</Serif>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('pfIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      {err ? <Notice tone="warn" text={err} /> : null}
      {!p && !err ? <Loading /> : null}
      {p ? <PerformanceView p={p} /> : null}
    </Screen>
  );
}
