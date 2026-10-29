// Seller's orders: only their own items from paid orders, the delivery details they need, and tracking updates.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, Notice, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { sellerOrders, updateShipment, type SellerOrder } from '@/lib/seller';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

const TONE = { pending: 'warn', packing: 'info', shipped: 'ok', delivered: 'ok', cancelled: 'err' } as const;

function OrderCard({ o, onSaved }: { o: SellerOrder; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const [carrier, setCarrier] = useState(o.carrier ?? '');
  const [tracking, setTracking] = useState(o.tracking_number ?? '');
  const [url, setUrl] = useState(o.tracking_url ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const a = o.ship_to ?? {};
  const go = async (status: 'packing' | 'shipped' | 'delivered') => {
    setBusy(true); setErr(null);
    try { await updateShipment(o.shipment_id, status, carrier, tracking, url); onSaved(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const subtotal = o.items.reduce((s, i) => s + i.line_total_minor, 0);
  const commission = o.items.reduce((s, i) => s + (i.commission_minor ?? 0), 0);
  return (
    <Card pad={wide ? 20 : 14} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <T w={700} size={16} color={colors.navy}>AM-{o.order_number}</T>
        <Tag label={t(`ship_status_${o.status}` as Key)} tone={TONE[o.status]} />
      </View>
      <T size={12.5} color={colors.muted}>{new Date(o.paid_at ?? o.created_at).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</T>
      {o.items.map((i, k) => (
        <View key={k} style={{ gap: 2, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T size={14} style={{ flex: 1 }}>{i.quantity} × {i.name_en}</T>
            <T size={14} w={600}>{formatMoney(i.line_total_minor, o.currency, lang)}</T>
          </View>
          {i.custom ? <T size={12.5} color={colors.body}>{JSON.stringify(i.custom)}</T> : null}
        </View>
      ))}
      <T size={12.5} color={colors.muted}>{t('soItems')}: {formatMoney(subtotal, o.currency, lang)} · {t('soCommission')}: {formatMoney(commission, o.currency, lang)} · {t('soYourShare')}: {formatMoney(subtotal - commission, o.currency, lang)}</T>
      <View style={{ backgroundColor: colors.sandSoft, borderRadius: 12, padding: 12, gap: 2 }}>
        <T w={700} size={13.5}>{t('soDeliverTo')}</T>
        <T size={13.5}>{a.recipient_name} · {a.phone}</T>
        <T size={13.5}>{[a.hotel_name, a.line1, a.line2, a.city, a.country].filter(Boolean).join(', ')}</T>
        {o.gift_message ? <T size={13} color={colors.brassText}>{t('giftMessage')}: “{o.gift_message}”</T> : null}
      </View>
      {o.status !== 'delivered' && o.status !== 'cancelled' && (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 10 : 0 }}>
            <View style={{ flex: 1 }}><Field label={t('soCarrier')} value={carrier} onChangeText={setCarrier} placeholder="DHL, Aramex…" /></View>
            <View style={{ flex: 1 }}><Field label={t('soTracking')} value={tracking} onChangeText={setTracking} dirLtr /></View>
            <View style={{ flex: 1.3 }}><Field label={t('soTrackingUrl')} value={url} onChangeText={setUrl} placeholder="https://" autoCapitalize="none" dirLtr /></View>
          </View>
          {err && <Notice tone="warn" text={err} />}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {o.status === 'pending' && <Button size="sm" kind="secondary" label={t('soMarkPacking')} busy={busy} onPress={() => go('packing')} />}
            <Button size="sm" label={t('soMarkShipped')} busy={busy} onPress={() => go('shipped')} />
            {o.status === 'shipped' && <Button size="sm" kind="secondary" label={t('soMarkDelivered')} busy={busy} onPress={() => go('delivered')} />}
          </View>
        </View>
      )}
    </Card>
  );
}

export default function SellerOrders() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const [rows, setRows] = useState<SellerOrder[] | null>(null);
  const [show, setShow] = useState<'open' | 'done'>('open');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => sellerOrders(me.seller.id).then(setRows).catch((e) => setErr(String(e.message ?? e))), [me.seller.id]);
  useEffect(() => { load(); }, [load]);
  const shown = (rows ?? []).filter((o) => (show === 'open' ? ['pending', 'packing'].includes(o.status) : !['pending', 'packing'].includes(o.status)));
  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Orders | Seller | Al Mukarramah" description="Seller orders." path="/seller/orders" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdOrders')}</Serif>
      <T size={13.5} color={colors.muted} lh={1.5} style={{ marginVertical: 8 }}>{t('soIntro')}</T>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip size="sm" label={t('soToShip')} active={show === 'open'} onPress={() => setShow('open')} />
        <Chip size="sm" label={t('soShipped')} active={show === 'done'} onPress={() => setShow('done')} />
      </View>
      {err && <Notice tone="warn" text={err} />}
      {rows && !shown.length && <T color={colors.muted}>{t('soNone')}</T>}
      <View style={{ gap: 12 }}>{shown.map((o) => <OrderCard key={o.shipment_id} o={o} onSaved={load} />)}</View>
    </Screen>
  );
}
