// Staff: the marketplace at a glance. What needs doing now (each queue links to its page) and how the last 30 days went:
// sales by sellers and our own products (SAR), commission, refunds, what we owe sellers, the busiest sellers with their
// standards, and where parcels went.
import { Link, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName } from '@/components/country';
import { Seo } from '@/components/seo';
import { FinishPendingButton } from '@/components/admin-refund';
import { Card, H1, Notice, T, Tag, useWide } from '@/components/ui';
import { adminOverview, type Overview } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';
import { colors } from '@/theme';

const sar = (m: number) => formatMoney(m, 'SAR');
const QUEUES: { key: keyof Overview['queues']; label: string; href: Href; urgent?: boolean }[] = [
  { key: 'refunds_to_make', label: 'Refunds to make', href: '/admin/returns', urgent: true },
  { key: 'disputes', label: 'Disputes to decide', href: '/admin/returns', urgent: true },
  { key: 'refunds_stuck', label: 'Refunds still processing', href: '/admin/returns', urgent: true },
  { key: 'payments_to_resolve', label: 'Payments to resolve', href: '/admin/returns', urgent: true },
  { key: 'moyasar_unrecorded', label: 'Refunds in Moyasar not recorded', href: '/admin/returns', urgent: true },
  { key: 'credit_notes_pending', label: 'Credit notes to issue', href: '/admin/returns', urgent: true },
  { key: 'late_to_ship', label: 'Parcels late to ship', href: '/admin/orders', urgent: true },
  { key: 'delivery_failed', label: 'Deliveries failed', href: '/admin/orders', urgent: true },
  { key: 'sellers_to_review', label: 'Sellers to review', href: '/admin/sellers' },
  { key: 'shop_pages_to_approve', label: 'Shop page changes to approve', href: '/admin/sellers' },
  { key: 'listings_waiting', label: 'Listings to approve', href: '/admin/listings' },
  { key: 'reviews_to_publish', label: 'Reviews to publish', href: '/admin/reviews' },
  { key: 'conversations_flagged', label: 'Conversations flagged', href: '/admin/messages' },
  { key: 'returns_to_answer', label: 'Returns waiting for a seller', href: '/admin/returns' },
  { key: 'awaiting_acceptance', label: 'Orders not accepted in 24 h', href: '/admin/orders' },
  { key: 'not_collected', label: 'Labels not collected in 2 days', href: '/admin/orders' },
  { key: 'listings_checking', label: 'Listings being checked', href: '/admin/listings' },
  { key: 'photos_checking', label: 'Photos being checked', href: '/admin/listings' },
];

export default function AdminMarketplace() {
  const wide = useWide();
  const [v, setV] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { adminOverview(30).then(setV).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(() => { load(); }, [load]);
  const pending = v?.pending_work;
  const old = pending?.orders_without_invoice_old ?? 0;
  const left = pending ? pending.orders_without_invoice + pending.orders_not_handed_on + pending.credit_notes_pending + pending.refunds_processing + old : 0;
  const sw = v?.switches;
  const tile = (label: string, value: string, note?: string) => (
    <Card key={label} pad={18} style={{ flexGrow: 1, flexBasis: wide ? 250 : '100%', gap: 4 }}>
      <T size={12.5} color={colors.muted}>{label}</T>
      <T w={700} size={wide ? 22 : 20} color={colors.navy} numberOfLines={1}>{value}</T>
      {note ? <T size={12} color={colors.muted}>{note}</T> : null}
    </Card>
  );
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Marketplace" description="Staff only." path="/admin/marketplace" noindex />
      <H1>Marketplace</H1>
      <T size={13} color={colors.muted} style={{ marginBottom: 16 }}>What needs doing now, and the last {v?.days ?? 30} days. Amounts in SAR at each order's checkout rate.</T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real." /> : null}
      {err ? <Notice tone="warn" text={err} /> : null}
      {v ? (
        <View style={{ gap: 18 }}>
          <Card pad={wide ? 20 : 14} style={{ gap: 6 }}>
            <T w={700} size={17} color={colors.navy}>To do</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {QUEUES.filter((q) => v.queues[q.key] > 0).map((q) => (
                <Link key={q.key} href={q.href} asChild>
                  <Pressable accessibilityRole="link" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 1, borderColor: q.urgent ? colors.danger : colors.line,
                    backgroundColor: q.urgent ? colors.dangerBg : colors.porcelain, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}>
                    <T w={700} size={16} color={q.urgent ? colors.danger : colors.navy}>{v.queues[q.key]}</T>
                    <T size={13}>{q.label}</T>
                  </Pressable>
                </Link>
              ))}
              {QUEUES.every((q) => !v.queues[q.key]) ? <T color={colors.muted}>Nothing waiting.</T> : null}
            </View>
          </Card>
          {pending && left > 0 ? (
            <Card pad={wide ? 20 : 14} style={{ gap: 6, borderColor: colors.danger }}>
              <T w={700} size={17} color={colors.navy}>Half-done work</T>
              <T size={13.5} lh={1.55}>
                {pending.orders_not_handed_on} paid orders not handed to their sellers · {pending.orders_without_invoice} paid orders without a tax invoice ·
                {' '}{pending.credit_notes_pending} credit notes to issue · {pending.refunds_processing} refunds waiting for Moyasar's answer.
                {' '}The scheduler finishes these every 15 minutes; you can run it now.
                {old ? ` ${old} orders paid more than 7 days ago still have no tax invoice: the scheduler leaves them for our team to settle with the accountant.` : ''}
              </T>
              <FinishPendingButton onDone={load} />
            </Card>
          ) : null}
          {sw ? (
            <Card pad={wide ? 20 : 14} style={{ gap: 6 }}>
              <T w={700} size={17} color={colors.navy}>Switches (Afzal decides; see DECISIONS.md)</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Tag label={`Marketplace ${sw.marketplace_open ? 'open' : 'closed'}`} tone={sw.marketplace_open ? 'ok' : 'mute'} />
                <Tag label={`Seller applications ${sw.sellers_open ? 'open' : 'closed'}`} tone={sw.sellers_open ? 'ok' : 'mute'} />
                <Tag label={`Payouts ${sw.payouts_enabled ? 'on' : 'off'}`} tone={sw.payouts_enabled ? 'ok' : 'mute'} />
                <Tag label={`Test courier ${sw.sandbox_carrier ? 'on' : 'off'}`} tone={sw.sandbox_carrier ? 'warn' : 'mute'} />
                <Tag label={`Support refunds up to ${sar(sw.support_refund_limit_minor)}`} tone="info" />
              </View>
            </Card>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tile('Sellers\' sales', sar(v.sales.marketplace_sar_minor), `${v.sales.marketplace_parcels} parcels`)}
            {tile('Our own products', sar(v.sales.house_sar_minor), `${v.sales.orders} orders in all`)}
            {tile('Commission earned', sar(v.sales.commission_sar_minor), v.sales.marketplace_sar_minor ? `${((v.sales.commission_sar_minor / v.sales.marketplace_sar_minor) * 100).toFixed(1)}% of sellers' sales` : undefined)}
            {tile('Refunded', sar(v.sales.refunded_sar_minor), `${v.sales.cancelled_by_sellers} parcels cancelled by sellers`)}
            {tile('Payable to sellers now', sar(v.owed_to_sellers.available_sar_minor), `${sar(v.owed_to_sellers.held_sar_minor)} held for returns`)}
            {tile('Paid to sellers', sar(v.paid_out_sar_minor), 'bank transfers recorded')}
          </View>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
            <Card pad={wide ? 20 : 14} style={{ flex: 1.4, alignSelf: 'stretch', gap: 4 }}>
              <T w={700} size={17} color={colors.navy} style={{ marginBottom: 6 }}>Busiest sellers</T>
              {!v.top_sellers.length ? <T color={colors.muted}>No seller sales yet.</T> : v.top_sellers.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderColor: colors.lineSoft, flexWrap: 'wrap' }}>
                  <T w={600} size={14} style={{ flex: 1, minWidth: 160 }}>{s.name_en}</T>
                  <T size={13} color={colors.muted}>{s.parcels} parcels</T>
                  <T size={13}>{sar(s.sales_sar_minor)}</T>
                  <T size={13} color={colors.muted}>{s.rating_avg ? `${Number(s.rating_avg).toFixed(1)}★` : '—'}</T>
                  <Tag label={s.standard} tone={s.standard === 'ok' ? 'ok' : s.standard === 'new' ? 'info' : s.standard === 'warn' ? 'warn' : 'err'} />
                </View>
              ))}
            </Card>
            <Card pad={wide ? 20 : 14} style={{ flex: 1, alignSelf: 'stretch', gap: 4 }}>
              <T w={700} size={17} color={colors.navy} style={{ marginBottom: 6 }}>Where parcels went</T>
              {v.destinations.map((d) => (
                <View key={d.country} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: colors.lineSoft }}>
                  <T size={14}>{countryName(d.country, 'en')}</T>
                  <T size={14} color={colors.muted}>{d.parcels}</T>
                </View>
              ))}
              <T size={12.5} color={colors.muted} style={{ marginTop: 8 }}>
                {v.sellers.approved} sellers and {v.sellers.partners} partners live · {v.sellers.applying} applying · {v.listings.live} listings live · {v.notifications_queued} notifications queued (not sent)
              </T>
            </Card>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
