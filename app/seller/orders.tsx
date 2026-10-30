// Seller's orders, one card per order: accept it (or cancel with a reason), make made-to-measure pieces, then pack it
// and print our label (our courier collects from your pickup address), and follow the tracking. The customer is a
// first name and a city: the label carries the address, and messages go through Al Mukarramah.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, Notice, Serif, T, Tag, useWide } from '@/components/ui';
import { countryName } from '@/components/country';
import { useI18n, type Key } from '@/lib/i18n';
import { MARKET_DEMO } from '@/lib/market';
import { formatMoney } from '@/lib/money';
import {
  acceptSubOrder, cancelLabel, cancelSubOrder, createLabel, labelLink, mySellerFile, productionDone, sellerSubOrders,
  type SellerLocation, type SellerSubOrder, type SubOrderStatus,
} from '@/lib/seller';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

const TABS: SubOrderStatus[] = ['awaiting_acceptance', 'in_production', 'accepted', 'ready_to_ship', 'shipped', 'delivered', 'cancelled'];
const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err' | 'mute'> = {
  awaiting_acceptance: 'warn', in_production: 'info', accepted: 'info', ready_to_ship: 'info', shipped: 'ok', delivered: 'ok', delivery_failed: 'err', cancelled: 'mute', returned: 'err',
};
const newKey = () => `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

function OrderCard({ o, locations, onDone }: { o: SellerSubOrder; locations: SellerLocation[]; onDone: () => void }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [loc, setLoc] = useState(locations.find((l) => l.is_default)?.id ?? locations[0]?.id ?? '');
  const [weight, setWeight] = useState(String(o.weight_g || ''));
  const key = useRef(newKey());   // one label per press, even if the network retries
  const money = (m: number) => formatMoney(m, o.currency, lang);
  const day = (s: string) => new Date(s).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const time = (s: string) => new Date(s).toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  const late = o.ship_by && ['accepted', 'in_production'].includes(o.status) && o.ship_by < new Date().toISOString().slice(0, 10);
  const run = async (k: string, fn: () => Promise<unknown>, ok?: string) => {
    if (MARKET_DEMO) return setMsg({ tone: 'warn', text: t('lfDemo') });
    setBusy(k); setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }); onDone(); } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };
  const openLabel = async () => { if (o.shipment?.label_path) { const u = await labelLink(o.shipment.label_path); if (u) Linking.openURL(u); } };

  return (
    <Card pad={wide ? 20 : 14} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <T w={700} size={16} color={colors.navy}>{o.number}</T>
          <Tag label={t(`so_${o.status}` as Key)} tone={TONE[o.status] ?? 'mute'} />
          {late ? <Tag label={t('soLate')} tone="err" /> : null}
        </View>
        <T w={600} size={15} num>{money(o.items_minor)}</T>
      </View>
      <T size={13} color={colors.muted}>
        {t('soFor')} {o.recipient || '—'} · {o.city ?? ''}, {countryName(o.to_country, lang)} · {t('soPaid')} {o.paid_at ? day(o.paid_at) : '—'}
        {o.ship_by ? ` · ${t('soShipBy')} ${day(o.ship_by)}` : ''}
      </T>
      {o.lines.map((l) => (
        <View key={l.id} style={{ gap: 3, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <T size={14} style={{ flex: 1 }}>{l.quantity} × {lang === 'ar' ? l.name_ar : l.name_en}{l.variant ? ` · ${l.variant}` : ''}</T>
            <T size={13.5} num>{money(l.line_total_minor)}</T>
          </View>
          {l.custom?.size ? <T size={12.5} color={colors.body}>{t('size')}: {l.custom.size}</T> : null}
          {l.custom?.options ? <T size={12.5} color={colors.body}>{Object.entries(l.custom.options).map(([k, v]) => `${k}: ${v}`).join(' · ')}</T> : null}
          {l.custom?.measurements ? <T size={12.5} color={colors.body} num>{t('soMeasurements')}: {Object.entries(l.custom.measurements).map(([k, v]) => `${k} ${v}`).join(' · ')} cm</T> : null}
          {l.production_days ? <T size={12.5} color={colors.brassText}>{t('soMakeIn').replace('{n}', String(l.production_days))}</T> : null}
        </View>
      ))}
      <T size={12.5} color={colors.muted}>{t('soCommission')} {money(o.commission_minor)} · {t('soYouReceive')} {money(o.items_minor - o.commission_minor)}</T>
      {o.gift_message ? <Notice text={`${t('soGiftNote')} “${o.gift_message}”`} /> : null}
      {o.cancel_reason ? <Notice tone="warn" text={`${t('soCancelled')}: ${o.cancel_reason}`} /> : null}

      {o.shipment ? (
        <View style={{ gap: 6, backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.lineSoft, padding: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <T w={600} size={13.5}>{o.service ? (lang === 'ar' ? o.service.service_ar ?? o.service.service : o.service.service) : ''}</T>
            <T size={13} num>{t('tracking')}: {o.shipment.tracking_number}</T>
          </View>
          {o.shipment.pickup_from && o.status === 'ready_to_ship' ? (
            <T size={13} color={colors.emerald}>{t('soPickup')} {day(o.shipment.pickup_from)}, {time(o.shipment.pickup_from)}–{time(o.shipment.pickup_to ?? o.shipment.pickup_from)}</T>
          ) : null}
          {o.shipment.events.slice(0, 4).map((e, i) => (
            <T key={i} size={12.5} color={i ? colors.muted : colors.body}>{day(e.at)} {time(e.at)} · {(lang === 'ar' ? e.ar : e.en) ?? e.status}</T>
          ))}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            {o.shipment.label_path ? <Button label={t('soPrintLabel')} kind="secondary" size="sm" onPress={openLabel} /> : null}
            {o.status === 'ready_to_ship' ? <Button label={t('soCancelLabel')} kind="text" size="sm" busy={busy === 'cl'} onPress={() => run('cl', () => cancelLabel(o.id))} /> : null}
          </View>
        </View>
      ) : null}

      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      {o.status === 'awaiting_acceptance' ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button label={o.production_days ? t('soAcceptMake') : t('soAccept')} busy={busy === 'accept'} onPress={() => run('accept', () => acceptSubOrder(o.id))} />
          <Button label={t('soCannot')} kind="text" onPress={() => setCancelling(true)} />
        </View>
      ) : null}
      {o.status === 'in_production' ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button label={t('soMade')} busy={busy === 'made'} onPress={() => run('made', () => productionDone(o.id))} />
          <Button label={t('soCannot')} kind="text" onPress={() => setCancelling(true)} />
        </View>
      ) : null}
      {o.status === 'accepted' ? (
        <View style={{ gap: 8 }}>
          <T w={600} size={13.5}>{t('soPackTitle')}</T>
          <T size={12.5} lh={1.5} color={colors.muted}>{t('soPackHint')}</T>
          {locations.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {locations.map((l) => <Chip key={l.id} size="sm" label={`${l.label} · ${l.city}`} active={loc === l.id} onPress={() => setLoc(l.id)} />)}
            </View>
          ) : null}
          {!locations.length ? <Notice tone="warn" text={t('soNoPickup')} /> : null}
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <View style={{ width: 170 }}><Field label={t('soWeight')} value={weight} onChangeText={(v) => setWeight(v.replace(/\D/g, ''))} keyboardType="number-pad" dirLtr /></View>
            <Button label={t('soCreateLabel')} busy={busy === 'label'} disabled={!locations.length} style={{ marginBottom: 18 }}
              onPress={() => run('label', async () => { const r = await createLabel(o.id, key.current, loc || undefined, Number(weight) || undefined); key.current = newKey(); if (r.label_url) Linking.openURL(r.label_url); }, t('soLabelReady'))} />
            <Button label={t('soCannot')} kind="text" onPress={() => setCancelling(true)} style={{ marginBottom: 18 }} />
          </View>
        </View>
      ) : null}
      {cancelling ? (
        <View style={{ gap: 8 }}>
          <Field label={t('soCancelWhy')} value={reason} onChangeText={setReason} multiline maxLength={1000} hint={t('soCancelHint')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={t('soCancelConfirm')} kind="danger" size="sm" busy={busy === 'cancel'} disabled={reason.trim().length < 5} onPress={() => run('cancel', () => cancelSubOrder(o.id, reason.trim()))} />
            <Button label={t('cancel')} kind="text" size="sm" onPress={() => setCancelling(false)} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export default function SellerOrders() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const [rows, setRows] = useState<SellerSubOrder[] | null>(null);
  const [tab, setTab] = useState<SubOrderStatus>('awaiting_acceptance');
  const [locations, setLocations] = useState<SellerLocation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => sellerSubOrders(me.seller.id).then(setRows).catch((e) => setErr(String(e.message ?? e))), [me.seller.id]);
  useEffect(() => { load(); mySellerFile(me.seller.id).then((f) => setLocations(f.locations)).catch(() => undefined); }, [load, me.seller.id]);
  const counts = (s: SubOrderStatus) => (rows ?? []).filter((r) => r.status === s).length;
  useEffect(() => { if (rows && !counts(tab)) { const first = TABS.find((s) => counts(s)); if (first) setTab(first); } }, [rows]);
  const shown = (rows ?? []).filter((r) => r.status === tab || (tab === 'shipped' && r.status === 'delivery_failed') || (tab === 'cancelled' && r.status === 'returned'));

  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Orders | Seller | Al Mukarramah" description="Seller orders." path="/seller/orders" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdOrders')}</Serif>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('soIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {TABS.map((s) => <Chip key={s} size="sm" label={`${t(`so_${s}` as Key)} (${counts(s)})`} active={tab === s} onPress={() => setTab(s)} />)}
      </View>
      {err ? <Notice tone="warn" text={err} /> : null}
      {rows && !shown.length ? <T color={colors.muted}>{t('soNone')}</T> : null}
      <View style={{ gap: 12 }}>{shown.map((o) => <OrderCard key={o.id} o={o} locations={locations} onDone={load} />)}</View>
    </Screen>
  );
}
