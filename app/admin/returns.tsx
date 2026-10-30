// Staff: returns and refunds. Refunds are only ever made here (owner, manager, finance, support), through refund-order:
// the amount is worked out on the server from the lines, Moyasar refunds it and a ZATCA credit note is issued for the
// part we invoiced. Each Refund press carries its own key, so a double press never refunds twice. Disputes (a customer
// who disagrees with the seller) are decided here, with a note both sides see.
import React, { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { RefundButton } from '@/components/admin-refund';
import { Button, Card, Chip, Field, H1, Notice, T, Tag, useWide } from '@/components/ui';
import { adminRefundQueue, adminReturns, customerPhotoUrls, returnAction, type RefundQueue, type ReturnRequest, type ReturnStatus } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';
import { colors } from '@/theme';

const REASON: Record<string, string> = {
  changed_mind: 'Changed their mind', not_as_described: 'Not as described', faulty: 'Faulty', damaged: 'Arrived damaged', wrong_item: 'Wrong item',
  missing_item: 'Item missing', not_received: 'Parcel not received',
};
const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err' | 'mute'> = {
  requested: 'warn', accepted: 'info', declined: 'err', escalated: 'warn', approved: 'ok', refunded: 'ok', rejected: 'err', withdrawn: 'mute',
};
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

function ReturnRow({ r, onDone }: { r: ReturnRequest; onDone: () => void }) {
  const wide = useWide();
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (r.photos.length) customerPhotoUrls(r.photos).then(setPhotos).catch(() => undefined); }, [r.id]);
  const act = async (a: 'approve' | 'reject' | 'accept' | 'received', restock?: boolean) => {
    if (MARKET_DEMO) { setMsg('Example data: nothing is saved here.'); return; }
    setBusy(a); setMsg(null);
    try { await returnAction(r.id, a, note.trim() || undefined, restock); setNote(''); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const open = ['requested', 'accepted', 'declined', 'escalated'].includes(r.status);
  return (
    <Card pad={wide ? 20 : 14} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <T w={700} size={15}>{r.number}</T>
          <Tag label={r.status} tone={TONE[r.status] ?? 'mute'} />
          <Tag label={r.kind === 'refund_only' ? 'refund only' : 'send back'} tone="info" />
          {r.flags?.length ? <Tag label={r.flags.join(', ')} tone="warn" /> : null}
        </View>
        <T size={13.5}>{formatMoney(r.value_minor, r.currency)}</T>
      </View>
      <T size={12.5} color={colors.muted}>{r.sub_order_number} · {r.seller ? r.seller.name_en : 'Al Mukarramah (our products)'} · customer {r.customer ?? ''} · {day(r.created_at)}</T>
      {r.lines.map((l) => <T key={l.order_item_id} size={13.5}>{l.quantity} of {l.bought} × {l.name_en}{l.variant ? ` · ${l.variant}` : ''} · return policy: {(l.return_policy ?? 'standard').replace(/_/g, ' ')}{l.custom ? ' · made to measure' : ''}</T>)}
      <T size={13}><T w={600} size={13}>Reason:</T> {REASON[r.reason]}{r.unopened ? ' · says unopened' : ''}</T>
      {r.details ? <T size={13} lh={1.5} color={colors.body}>Customer: “{r.details}”</T> : null}
      {r.seller_note ? <T size={13} lh={1.5} color={colors.body}>Seller: “{r.seller_note}”</T> : null}
      {r.escalation_note ? <T size={13} lh={1.5} color={colors.brassText}>Customer disagrees: “{r.escalation_note}”</T> : null}
      {r.staff_note ? <T size={13} lh={1.5} color={colors.emerald}>Our decision: “{r.staff_note}”</T> : null}
      {r.photos.length ? <View style={{ flexDirection: 'row', gap: 8 }}>{r.photos.map((p) => photos[p.path] ? <Image key={p.id} source={{ uri: photos[p.path] }} style={{ width: 96, height: 96, borderRadius: 6 }} /> : null)}</View> : null}
      {msg ? <Notice tone="warn" text={msg} /> : null}
      {open ? (
        <View style={{ gap: 8 }}>
          <Field label="Note to the customer and the seller (needed to reject)" value={note} onChangeText={setNote} multiline maxLength={1000} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button size="sm" label="Approve for refund" busy={busy === 'approve'} onPress={() => act('approve', r.kind === 'return')} />
            {r.status === 'requested' && !r.seller ? <Button size="sm" kind="secondary" label={r.kind === 'refund_only' ? 'Accept' : 'Accept: customer sends it back'} busy={busy === 'accept'} onPress={() => act('accept')} /> : null}
            {r.status === 'accepted' && !r.seller ? <Button size="sm" kind="secondary" label="It came back (back in stock)" busy={busy === 'received'} onPress={() => act('received', true)} /> : null}
            <Button size="sm" kind="text" label="Reject" busy={busy === 'reject'} disabled={note.trim().length < 5} onPress={() => act('reject')} />
          </View>
        </View>
      ) : null}
      {r.status === 'approved' ? <RefundButton orderId={r.order_id} returnId={r.id} label="Refund this return" onDone={onDone} /> : null}
      {r.refund ? <T size={12.5} color={colors.muted}>Refund {r.refund.status}: {formatMoney(r.refund.amount_minor, r.currency)}</T> : null}
    </Card>
  );
}

const TABS: { key: ReturnStatus | 'queue'; label: string }[] = [
  { key: 'queue', label: 'To refund' }, { key: 'escalated', label: 'Disputes' }, { key: 'requested', label: 'Waiting for an answer' },
  { key: 'accepted', label: 'On the way back' }, { key: 'refunded', label: 'Refunded' }, { key: 'rejected', label: 'Rejected' },
];

export default function AdminReturns() {
  const [tab, setTab] = useState<ReturnStatus | 'queue'>('queue');
  const [rows, setRows] = useState<ReturnRequest[]>([]);
  const [queue, setQueue] = useState<RefundQueue | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    setErr(null);
    if (tab === 'queue') adminRefundQueue().then(setQueue).catch((e) => setErr(String(e.message ?? e)));
    else adminReturns(tab).then(setRows).catch((e) => setErr(String(e.message ?? e)));
  }, [tab]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Returns and refunds" description="Staff only." path="/admin/returns" noindex />
      <H1>Returns and refunds</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12, maxWidth: 820 }}>
        Refunds are made only here. The amount comes from the server (items, and the delivery when a whole parcel comes back); Moyasar refunds it, a credit note is
        issued for what we invoiced, stock goes back when the items can be sold again, and the seller's statement follows.
      </T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real or saved." /> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {TABS.map((x) => <Chip key={x.key} label={x.label} active={tab === x.key} onPress={() => setTab(x.key)} />)}
      </View>
      {err ? <Notice tone="warn" text={err} /> : null}
      {tab === 'queue' && queue ? (
        <View style={{ gap: 16 }}>
          <T w={700} size={17}>Approved returns</T>
          {!queue.returns.length ? <T color={colors.muted}>None waiting.</T> : queue.returns.map((r) => <ReturnRow key={r.id} r={r} onDone={load} />)}
          <T w={700} size={17}>Parcels a seller cancelled after payment</T>
          {!queue.cancelled.length ? <T color={colors.muted}>None waiting.</T> : queue.cancelled.map((c) => (
            <Card key={c.sub_order_id} pad={16} style={{ gap: 6 }}>
              <T w={700} size={15}>{c.number} · {formatMoney(c.amount_minor, c.currency)}</T>
              <T size={13} color={colors.muted}>{c.seller ?? ''} · cancelled {day(c.cancelled_at)}: “{c.cancel_reason ?? ''}”</T>
              <RefundButton orderId={c.order_id} subOrderId={c.sub_order_id} label="Refund this parcel" onDone={load} />
            </Card>
          ))}
          {queue.credit_notes.length ? (
            <>
              <T w={700} size={17}>Credit notes still to issue</T>
              {queue.credit_notes.map((f) => <Notice key={f.id} tone="warn" text={`AM-${f.order_number}: refunded ${formatMoney(f.amount_minor, f.currency)} on ${day(f.completed_at)}; the credit note for ${formatMoney(f.platform_minor, f.currency)} was not issued (see the audit history, CREDIT_NOTE_PENDING).`} />)}
            </>
          ) : null}
          {queue.stuck.length ? (
            <>
              <T w={700} size={17}>Refunds still processing</T>
              {queue.stuck.map((f) => <Notice key={f.id} tone="warn" text={`AM-${f.order_number}: ${formatMoney(f.amount_minor, f.currency)} since ${day(f.created_at)}. Check the payment in Moyasar before doing anything else.`} />)}
            </>
          ) : null}
          <T w={700} size={17}>Recent refunds</T>
          {queue.recent.map((f) => (
            <T key={f.id} size={13} color={colors.body}>{day(f.created_at)} · AM-{f.order_number} · {formatMoney(f.amount_minor, f.currency)} · {f.status}{f.credit_note ? ` · ${f.credit_note}` : ''} · {f.reason}</T>
          ))}
        </View>
      ) : null}
      {tab !== 'queue' ? (
        <View style={{ gap: 12 }}>
          {!rows.length ? <T color={colors.muted}>Nothing here.</T> : rows.map((r) => <ReturnRow key={r.id} r={r} onDone={load} />)}
        </View>
      ) : null}
    </Screen>
  );
}
