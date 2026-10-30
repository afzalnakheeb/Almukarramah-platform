// Return requests on the seller's orders: accept (and say how to send it back) or decline with a reason; confirm the
// items arrived and whether they can be sold again. Our team refunds the customer; a declined return can be taken to
// our team by the customer.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ReturnCard } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Chip, Loading, Notice, Serif, T, useWide } from '@/components/ui';
import { sellerReturns, type ReturnRequest, type ReturnStatus } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n, type Key } from '@/lib/i18n';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

const TABS: { key: string; statuses: ReturnStatus[] }[] = [
  { key: 'rtTabOpen', statuses: ['requested', 'escalated'] },
  { key: 'rtTabComing', statuses: ['accepted'] },
  { key: 'rtTabRefund', statuses: ['approved'] },
  { key: 'rtTabClosed', statuses: ['refunded', 'rejected', 'withdrawn', 'declined'] },
];

export default function SellerReturns() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const [rows, setRows] = useState<ReturnRequest[] | null>(null);
  const [tab, setTab] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => sellerReturns(me.seller.id).then(setRows).catch((e) => setErr(String(e.message ?? e))), [me.seller.id]);
  useEffect(() => { load(); }, [load]);
  const shown = (rows ?? []).filter((r) => TABS[tab].statuses.includes(r.status));
  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Returns | Seller | Al Mukarramah" description="Seller returns." path="/seller/returns" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdReturns')}</Serif>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('rtSellerIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {TABS.map((x, i) => <Chip key={x.key} size="sm" label={`${t(x.key as Key)} (${(rows ?? []).filter((r) => x.statuses.includes(r.status)).length})`} active={tab === i} onPress={() => setTab(i)} />)}
      </View>
      {err ? <Notice tone="warn" text={err} /> : null}
      {!rows && !err ? <Loading /> : null}
      {rows && !shown.length ? <T color={colors.muted}>{t('rtNone')}</T> : null}
      <View style={{ gap: 12 }}>
        {shown.map((r) => <ReturnCard key={r.id} r={r} side="seller" onDone={load} messagesHref={r.thread_id ? { pathname: '/seller/messages', params: { thread: r.thread_id } } : undefined} />)}
      </View>
    </Screen>
  );
}
