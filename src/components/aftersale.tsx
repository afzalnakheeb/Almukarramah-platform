// After-sale pieces shared by the customer's order page and the seller dashboard: stars, a return (with what each side
// can do next), the monthly statement, the shop's standards, and in-app notifications.
import { Link, type Href } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { PickFiles } from '@/components/pick-files';
import { Button, Card, Chip, Field, Notice, Row, T, Tag, useWide } from '@/components/ui';
import {
  customerPhotoUrls, requestReturn, returnAction, uploadCustomerPhoto, type CustomerPhoto, type Notice as AppNotice, type Performance, type ReturnReason,
  type ReturnRequest, type Statement,
} from '@/lib/aftersale';
import type { ParcelTracking } from '@/lib/orders';
import { returnReasons } from '../../supabase/functions/_shared/returns';
import { useI18n, type Key } from '@/lib/i18n';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';
import { colors } from '@/theme';

// ---------------------------------------------------------------- stars
export function Stars({ value, size = 14, count }: { value: number; size?: number; count?: number }) {
  const full = Math.round(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityLabel={`${value.toFixed(1)} / 5`}>
      <T size={size} color={colors.brass} style={{ letterSpacing: 1 }}>{'★★★★★'.slice(0, full)}<T size={size} color={colors.line}>{'★★★★★'.slice(full)}</T></T>
      {count !== undefined ? <T size={size - 1} color={colors.muted} num>({count})</T> : null}
    </View>
  );
}
export function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="radiogroup" accessibilityLabel={t('rvRating')}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ checked: value === n }} hitSlop={6}
          style={{ paddingHorizontal: 2 }}>
          <T size={32} color={n <= value ? colors.brass : colors.line}>★</T>
        </Pressable>
      ))}
    </View>
  );
}

const dateOf = (s: string | null, lang: 'ar' | 'en', withYear = false) =>
  s ? new Date(s.length === 10 ? `${s}T12:00:00Z` : s).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }) : '';

// ---------------------------------------------------------------- a return
const RETURN_TONE: Record<string, 'ok' | 'warn' | 'info' | 'err' | 'mute'> = {
  requested: 'warn', accepted: 'info', declined: 'err', escalated: 'warn', approved: 'ok', refunded: 'ok', rejected: 'err', withdrawn: 'mute',
};

export function ReturnCard({ r, side, onDone, messagesHref }: { r: ReturnRequest; side: 'customer' | 'seller'; onDone: () => void; messagesHref?: Href }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<null | 'accept' | 'decline' | 'received' | 'escalate'>(null);
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (r.photos.length) customerPhotoUrls(r.photos).then(setPhotos).catch(() => undefined); }, [r.id]);
  const money = (m: number) => formatMoney(m, r.currency, lang);
  const act = async (action: Parameters<typeof returnAction>[1]) => {
    if (MARKET_DEMO) { setMsg(t('lfDemo')); return; }
    setBusy(true); setMsg(null);
    try { await returnAction(r.id, action, note.trim() || undefined, action === 'received' ? restock : undefined); setMode(null); setNote(''); onDone(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const open = ['requested', 'accepted', 'declined', 'escalated'].includes(r.status);

  return (
    <Card pad={wide ? 20 : 14} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <T w={700} size={15.5} color={colors.navy} num>{r.number}</T>
          <Tag label={t(`rt_${r.status}` as Key)} tone={RETURN_TONE[r.status] ?? 'mute'} />
          {r.kind === 'refund_only' ? <Tag label={t('rtNoSendBack')} tone="info" /> : null}
        </View>
        <T size={13.5} num>{money(r.value_minor)}</T>
      </View>
      <T size={12.5} color={colors.muted}>
        {r.sub_order_number} · {dateOf(r.created_at, lang)}{side === 'seller' && r.customer ? ` · ${t('soFor')} ${r.customer}` : ''}
        {r.status === 'requested' && r.respond_by ? ` · ${t('rtAnswerBy')} ${dateOf(r.respond_by, lang)}` : ''}
      </T>
      {r.lines.map((l) => (
        <T key={l.order_item_id} size={13.5}>{l.quantity} × {lang === 'ar' ? l.name_ar : l.name_en}{l.variant ? ` · ${l.variant}` : ''}</T>
      ))}
      <T size={13} color={colors.body}><T w={600} size={13}>{t('rtReason')}:</T> {t(`rtReason_${r.reason}` as Key)}{r.unopened ? ` · ${t('rtUnopened')}` : ''}</T>
      {r.details ? <T size={13.5} lh={1.55} color={colors.body} style={{ fontStyle: 'italic' }}>“{r.details}”</T> : null}
      {r.photos.length ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {r.photos.map((p) => photos[p.path] ? <Image key={p.id} source={{ uri: photos[p.path] }} style={{ width: 84, height: 84, borderRadius: 6, backgroundColor: colors.sand }} /> : null)}
        </View>
      ) : null}
      {r.seller_note ? <Notice text={`${side === 'seller' ? t('rtYourAnswer') : t('rtSellerSays')} ${r.seller_note}`} /> : null}
      {r.escalation_note ? <Notice tone="warn" text={`${side === 'customer' ? t('rtYouAsked') : t('rtCustomerAsked')} ${r.escalation_note}`} /> : null}
      {r.staff_note ? <Notice tone={r.status === 'rejected' ? 'warn' : 'ok'} text={`${t('rtOurDecision')} ${r.staff_note}`} /> : null}
      {r.status === 'accepted' && side === 'customer' ? <T size={13} lh={1.5} color={colors.emerald}>{t('rtSendBackHint')}</T> : null}
      {r.status === 'approved' ? <T size={13} color={colors.emerald}>{t('rtRefundSoon')}</T> : null}
      {r.refund?.status === 'succeeded' ? <T size={13} color={colors.emerald}>{t('rtRefunded').replace('{amount}', money(r.refund.amount_minor))}</T> : null}

      {msg ? <Notice tone="warn" text={msg} /> : null}
      {mode ? (
        <View style={{ gap: 8 }}>
          <Field label={t(mode === 'decline' ? 'rtDeclineWhy' : mode === 'escalate' ? 'rtEscalateWhy' : mode === 'accept' ? 'rtAcceptNote' : 'rtReceivedNote')}
            value={note} onChangeText={setNote} multiline maxLength={1000} hint={t('msMaskedHint')} />
          {mode === 'received' ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip size="sm" label={t('rtRestockYes')} active={restock} onPress={() => setRestock(true)} />
              <Chip size="sm" label={t('rtRestockNo')} active={!restock} onPress={() => setRestock(false)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button size="sm" kind={mode === 'decline' ? 'danger' : 'primary'} busy={busy}
              disabled={(mode === 'decline' || mode === 'escalate') && note.trim().length < 5}
              label={t(mode === 'decline' ? 'rtDecline' : mode === 'escalate' ? 'rtEscalate' : mode === 'accept' ? 'rtAccept' : 'rtReceived')} onPress={() => act(mode)} />
            <Button size="sm" kind="text" label={t('cancel')} onPress={() => { setMode(null); setNote(''); }} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {side === 'seller' && r.status === 'requested' ? <Button size="sm" label={t('rtAccept')} onPress={() => setMode('accept')} /> : null}
          {side === 'seller' && r.status === 'requested' ? <Button size="sm" kind="text" label={t('rtDecline')} onPress={() => setMode('decline')} /> : null}
          {side === 'seller' && r.status === 'accepted' ? <Button size="sm" label={t('rtReceived')} onPress={() => setMode('received')} /> : null}
          {side === 'customer' && r.can_escalate ? <Button size="sm" kind="secondary" label={t('rtEscalate')} onPress={() => setMode('escalate')} /> : null}
          {side === 'customer' && open ? <Button size="sm" kind="text" label={t('rtWithdraw')} busy={busy} onPress={() => act('withdraw')} /> : null}
          {messagesHref ? <Link href={messagesHref}><T size={13} w={600} color={colors.emerald}>{t('rtMessages')}</T></Link> : null}
        </View>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- the statement
const KIND_KEY: Record<string, Key> = {
  sale: 'stKind_sale', commission: 'stKind_commission', refund: 'stKind_refund', commission_refund: 'stKind_commission_refund',
  adjustment: 'stKind_adjustment', payout: 'stKind_payout', payout_reversal: 'stKind_payout_reversal',
};
export function BalanceCards({ b, lang }: { b: Statement['balance']; lang: 'ar' | 'en' }) {
  const { t } = useI18n();
  const wide = useWide();
  const money = (m: number) => formatMoney(m, 'SAR', lang);
  const cell = (label: string, value: string, hint?: string, strong?: boolean) => (
    <Card pad={16} style={{ flex: 1, minWidth: wide ? 180 : 140, gap: 4 }}>
      <T size={12} color={colors.muted} caps>{label}</T>
      <T size={strong ? 24 : 20} w={700} color={strong ? colors.emerald : colors.navy} num>{value}</T>
      {hint ? <T size={12} color={colors.muted}>{hint}</T> : null}
    </Card>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {cell(t('stAvailable'), money(b.available_sar_minor), t('stAvailableHint'), true)}
      {cell(t('stHeld'), money(b.held_sar_minor), b.next_available_on ? t('stHeldUntil').replace('{date}', dateOf(b.next_available_on, lang)) : t('stHeldHint'))}
      {cell(t('stBalance'), money(b.balance_sar_minor))}
    </View>
  );
}

export function StatementView({ s, onMonth }: { s: Statement; onMonth: (m: string) => void }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const money = (m: number) => formatMoney(m, 'SAR', lang);
  const month = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' });
  return (
    <View style={{ gap: 14 }}>
      {s.months.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {s.months.map((m) => <Chip key={m} size="sm" label={month(m)} active={m === s.month} onPress={() => onMonth(m)} />)}
        </View>
      ) : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14, alignItems: 'flex-start' }}>
        <Card pad={wide ? 20 : 14} style={{ width: wide ? 320 : '100%', gap: 8 }}>
          <T w={700} size={16} color={colors.navy}>{month(s.month)}</T>
          <Row label={t('stOpening')} value={money(s.opening_sar_minor)} />
          <Row label={`${t('stSales')} (${s.totals.orders})`} value={money(s.totals.sales)} />
          <Row label={t('stCommission')} value={money(s.totals.commission)} />
          {s.totals.refunds ? <Row label={t('stRefunds')} value={money(s.totals.refunds)} /> : null}
          {s.totals.adjustments ? <Row label={t('stAdjustments')} value={money(s.totals.adjustments)} /> : null}
          <Row label={t('stPayouts')} value={money(s.totals.payouts)} />
          <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 2 }} />
          <Row label={t('stClosing')} value={money(s.closing_sar_minor)} bold />
          <T size={11.5} lh={1.5} color={colors.muted}>{t('stVatNote')}</T>
        </Card>
        <Card pad={wide ? 20 : 14} style={{ flex: 1, alignSelf: 'stretch', gap: 2 }}>
          <T w={700} size={16} color={colors.navy} style={{ marginBottom: 6 }}>{t('stEntries')}</T>
          {!s.entries.length ? <T size={13} color={colors.muted}>{t('stNoEntries')}</T> : null}
          {s.entries.map((e) => (
            <View key={e.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.lineSoft, alignItems: 'flex-start' }}>
              <T size={12.5} color={colors.muted} num style={{ width: 54 }}>{dateOf(e.booked_on, lang)}</T>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={13.5} w={600}>{t(KIND_KEY[e.kind])}{e.note && e.kind !== 'adjustment' ? <T size={12.5} color={colors.muted} num> · {e.note}</T> : null}</T>
                {(lang === 'ar' ? e.items_ar : e.items_en) ? <T size={12.5} color={colors.body}>{lang === 'ar' ? e.items_ar : e.items_en}</T> : null}
                {e.kind === 'adjustment' && e.note ? <T size={12.5} color={colors.body}>{e.note}</T> : null}
                {e.kind === 'sale' && e.available_on > new Date().toISOString().slice(0, 10) ? (
                  <T size={12} color={colors.brassText}>{t('stPayableFrom').replace('{date}', dateOf(e.available_on, lang))}</T>
                ) : null}
                {e.currency !== 'SAR' ? <T size={12} color={colors.muted} num>{formatMoney(e.amount_minor, e.currency, lang)}</T> : null}
              </View>
              <T size={13.5} w={600} num color={e.amount_sar_minor < 0 ? colors.body : colors.navy}>{money(e.amount_sar_minor)}</T>
            </View>
          ))}
          {s.payouts.length ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <T w={700} size={14} color={colors.navy}>{t('stTransfers')}</T>
              {s.payouts.map((p) => (
                <T key={p.id} size={13} color={p.status === 'reversed' ? colors.muted : colors.body} num>
                  {dateOf(p.paid_on, lang, true)} · {money(p.amount_sar_minor)} · {t('stToAccount').replace('{last4}', p.iban_last4 ?? '····')} · {p.reference}
                  {p.status === 'reversed' ? ` · ${t('stReversed')}` : ''}
                </T>
              ))}
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- the shop's standards
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'err' | 'info' | 'mute'> = { ok: 'ok', warn: 'warn', suspend: 'err', new: 'info' };
export function PerformanceView({ p }: { p: Performance }) {
  const { t } = useI18n();
  const wide = useWide();
  const pct = (bps: number | null) => (bps === null ? '—' : `${(bps / 100).toFixed(1)}%`);
  const metric = (key: Key, value: string, sub: string, status: string, target: string) => (
    <Card key={key} pad={18} style={{ flex: 1, minWidth: wide ? 220 : 150, gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <T size={12.5} color={colors.muted} caps>{t(key)}</T>
        <Tag label={t(`pf_${status}` as Key)} tone={STATUS_TONE[status] ?? 'mute'} />
      </View>
      <T size={26} w={700} color={colors.navy} num>{value}</T>
      <T size={12.5} color={colors.body}>{sub}</T>
      <T size={12} color={colors.muted}>{target}</T>
    </Card>
  );
  const m = p.metrics;
  return (
    <View style={{ gap: 14 }}>
      <Notice tone={p.status === 'ok' ? 'ok' : p.status === 'new' ? 'info' : 'warn'}
        text={(t(`pfSummary_${p.status}` as Key)).replace('{n}', String(p.orders)).replace('{min}', String(p.min_orders)).replace('{days}', String(p.window_days))} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {metric('pfLate', pct(m.late_shipment.bps), t('pfOf').replace('{n}', String(m.late_shipment.count)).replace('{of}', String(m.late_shipment.of)), m.late_shipment.status, t('pfTarget').replace('{x}', pct(m.late_shipment.warn)))}
        {metric('pfCancel', pct(m.cancellation.bps), t('pfOf').replace('{n}', String(m.cancellation.count)).replace('{of}', String(m.cancellation.of)), m.cancellation.status, t('pfTarget').replace('{x}', pct(m.cancellation.warn)))}
        {metric('pfReturns', pct(m.returns.bps), t('pfOf').replace('{n}', String(m.returns.count)).replace('{of}', String(m.returns.of)), m.returns.status, t('pfTarget').replace('{x}', pct(m.returns.warn)))}
        {metric('pfRating', m.rating.x100 === null ? '—' : (m.rating.x100 / 100).toFixed(2), t('pfReviews').replace('{n}', String(m.rating.count)), m.rating.status, t('pfRatingTarget').replace('{x}', (m.rating.warn / 100).toFixed(1)))}
      </View>
      <T size={13} color={colors.body}>{m.response_hours.median === null ? t('pfResponseNone') : t('pfResponse').replace('{h}', String(m.response_hours.median))}</T>
      <T size={12.5} lh={1.6} color={colors.muted}>{p.auto_suspend ? t('pfAutoOn') : t('pfAutoOff')}</T>
    </View>
  );
}

// ---------------------------------------------------------------- in-app notifications
export function NoticeList({ items, empty }: { items: AppNotice[]; empty: string }) {
  const { lang } = useI18n();
  if (!items.length) return <T size={13} color={colors.muted}>{empty}</T>;
  return (
    <View style={{ gap: 2 }}>
      {items.map((n) => {
        const body = (
          <View style={{ paddingVertical: 10, borderTopWidth: 1, borderColor: colors.lineSoft, gap: 2, flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, marginEnd: 10, backgroundColor: n.read ? 'transparent' : colors.emerald }} />
            <View style={{ flex: 1, gap: 2 }}>
              <T size={13.5} w={n.read ? 500 : 700}>{lang === 'ar' ? n.subject_ar : n.subject_en}</T>
              <T size={12.5} lh={1.5} color={colors.body}>{lang === 'ar' ? n.body_ar : n.body_en}</T>
              <T size={11.5} color={colors.muted}>{dateOf(n.at, lang)}</T>
            </View>
          </View>
        );
        return n.link ? <Link key={n.id} href={n.link as Href} asChild><Pressable accessibilityRole="link">{body}</Pressable></Link> : <View key={n.id}>{body}</View>;
      })}
    </View>
  );
}

// ---------------------------------------------------------------- asking for a return (the customer)
export function ReturnForm({ parcel, onDone, onCancel }: { parcel: ParcelTracking; onDone: () => void; onCancel: () => void }) {
  const { t, lang } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const delivered = parcel.status === 'delivered';
  const overdue = !!parcel.not_received_from && today >= parcel.not_received_from;
  const lines = parcel.lines.filter((l) => l.returnable_quantity > 0);
  const reasons = returnReasons({
    delivered, overdue, policies: lines.map((l) => l.return_policy),
    changeMindOpen: lines.some((l) => l.change_mind_until && l.change_mind_until >= today), problemOpen: !!parcel.problem_until && parcel.problem_until >= today,
  }) as ReturnReason[];
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [details, setDetails] = useState('');
  const [unopened, setUnopened] = useState(false);
  const [photos, setPhotos] = useState<CustomerPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const eligible = lines.filter((l) => reason !== 'changed_mind' || (['standard', 'unopened_only', null].includes(l.return_policy) && !!l.change_mind_until && l.change_mind_until >= today));
  const chosen = eligible.filter((l) => (qty[l.id] ?? 0) > 0);
  const needsUnopened = reason === 'changed_mind' && chosen.some((l) => l.return_policy === 'unopened_only');
  const needsDetails = reason !== null && ['not_as_described', 'faulty', 'damaged', 'wrong_item'].includes(reason);

  if (!reasons.length) return <Notice text={t('rtNotNow')} />;
  const add = async (files: File[]) => {
    setUploading(true); setMsg(null);
    try {
      for (const f of files.slice(0, 4 - photos.length)) {
        const r = await uploadCustomerPhoto(f, 'return_photo');
        if (r.asset && ['passed', 'review', 'pending'].includes(r.asset.status)) setPhotos((p) => [...p, r.asset!]);
        else setMsg(r.reasons.map((x) => (lang === 'ar' ? x.ar : x.en)).join(' ') || t('rvPhotoRefused'));
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setUploading(false); }
  };
  const send = async () => {
    if (MARKET_DEMO) { setMsg(t('lfDemo')); return; }
    setBusy(true); setMsg(null);
    try {
      await requestReturn({ subOrderId: parcel.id, reason: reason!, lines: chosen.map((l) => ({ orderItemId: l.id, quantity: qty[l.id] })), details: details.trim(), unopened, photos: photos.map((p) => p.id) });
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 12, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 12 }}>
      <T w={700} size={15} color={colors.navy}>{t('rtFormTitle')}</T>
      <View style={{ gap: 6 }}>
        <T w={600} size={13.5}>{t('rtWhy')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {reasons.map((x) => <Chip key={x} size="sm" label={t(`rtReason_${x}` as Key)} active={reason === x} onPress={() => { setReason(x); setQty({}); }} />)}
        </View>
      </View>
      {reason ? (
        <View style={{ gap: 8 }}>
          <T w={600} size={13.5}>{t('rtWhich')}</T>
          {!eligible.length ? <Notice tone="warn" text={t('rtNothingFor')} /> : null}
          {eligible.map((l) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <T size={13.5} style={{ flex: 1 }}>{lang === 'ar' ? l.name_ar : l.name_en}{l.variant ? ` · ${l.variant}` : ''}</T>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {Array.from({ length: l.returnable_quantity + 1 }, (_, n) => n).map((n) => (
                  <Chip key={n} size="sm" label={String(n)} active={(qty[l.id] ?? 0) === n} onPress={() => setQty((q) => ({ ...q, [l.id]: n }))} />
                ))}
              </View>
            </View>
          ))}
          {needsUnopened ? (
            <View style={{ gap: 6 }}>
              <T size={13} color={colors.body}>{t('rtUnopenedOnly')}</T>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Chip size="sm" label={t('rtUnopenedYes')} active={unopened} onPress={() => setUnopened(true)} />
                <Chip size="sm" label={t('rtUnopenedNo')} active={!unopened} onPress={() => setUnopened(false)} />
              </View>
            </View>
          ) : null}
          <Field label={t(needsDetails ? 'rtDetailsNeeded' : 'rtDetails')} value={details} onChangeText={setDetails} multiline maxLength={2000} hint={t('msMaskedHint')} />
          {reason !== 'changed_mind' && reason !== 'not_received' ? (
            <View style={{ gap: 6 }}>
              <T size={12.5} lh={1.5} color={colors.muted}>{t('rtPhotosHint')}</T>
              <T size={12.5} color={colors.body}>{photos.length ? t('rtPhotosAdded').replace('{n}', String(photos.length)) : ''}</T>
              {photos.length < 4 ? <PickFiles label={uploading ? t('rvUploading') : t('rvAddPhotos')} disabled={uploading} onFiles={add} /> : null}
            </View>
          ) : null}
          <T size={12.5} lh={1.5} color={colors.muted}>{t(reason === 'not_received' || reason === 'missing_item' ? 'rtRefundOnlyNote' : reason === 'changed_mind' ? 'rtChangedMindNote' : 'rtProblemNote')}</T>
        </View>
      ) : null}
      {msg ? <Notice tone="warn" text={msg} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" label={t('rtSend')} busy={busy}
          disabled={!reason || !chosen.length || (needsUnopened && !unopened) || (needsDetails && details.trim().length < 10)} onPress={send} />
        <Button size="sm" kind="text" label={t('cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}
