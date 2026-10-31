// Staff: one Refund button (owner, manager, finance, support). A fresh idempotency key per confirmed press, the reason
// required; the amount is worked out on the server (refund-order), never typed here. When Moyasar's answer does not
// come back the refund stays "processing" (review H2): the button says so and never offers to refund again; "Check
// with Moyasar" settles it. Before the press it shows what will be refunded (a preview from the server): after goodwill
// given on the order, the last refund is what is left of the payment, and it says so (review R5-2).
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Chip, Field, Notice, T } from '@/components/ui';
import {
  checkWithMoyasar, finishPendingWork, freshKey, previewRefund, recordMoyasarRefund, refund, returnAction, settlePaymentIssue, settleRefundByHand, type PaymentIssue,
  type RefundPreview, type UnrecordedRefund,
} from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';
import { colors } from '@/theme';

/** What the refund will be, in a sentence: the amount, and the goodwill already given when it is counted. */
export function previewText(p: RefundPreview): string {
  const amount = formatMoney(p.amount_minor, p.currency);
  if (!p.goodwill_deducted_minor) return `This refunds ${amount}.`;
  return `This refunds ${amount}: what is left of the payment. The ${p.items_minor ? 'items' : 'refund'}${p.shipping_minor ? ' and delivery' : ''} come to `
    + `${formatMoney(p.lines_minor, p.currency)}, less ${formatMoney(p.goodwill_deducted_minor, p.currency)} of goodwill already given on this order.`;
}

/** One Refund button: what it will refund shown first, a fresh key per confirmed press, the reason required, the result shown. */
export function RefundButton({ orderId, label, returnId, subOrderId, onDone }: { orderId: string; label: string; returnId?: string; subOrderId?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ tone: 'info' | 'warn'; text: string } | null>(null);
  const key = useRef(freshKey('rf'));
  const start = () => {
    setOpen(true);
    setPreview(null);
    previewRefund({ orderId, returnId, subOrderId })
      .then((p) => setPreview({ tone: 'info', text: previewText(p) }))
      .catch((e) => setPreview({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }));
  };
  if (!open) return <Button size="sm" kind="danger" label={label} onPress={start} style={{ alignSelf: 'flex-start' }} />;
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      {preview ? <Notice tone={preview.tone} text={preview.text} /> : <T size={13} color={colors.muted}>Working out the amount…</T>}
      <Field label="Reason (on the credit note and the seller's statement)" value={reason} onChangeText={setReason} maxLength={500} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" kind="danger" label="Refund now" busy={busy} disabled={reason.trim().length < 3} onPress={async () => {
          if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is refunded here.' }); return; }
          setBusy(true); setMsg(null);
          try {
            const r = await refund({ orderId, reason: reason.trim(), key: key.current, returnId, subOrderId });
            key.current = freshKey('rf');
            if (r.pending || r.recorded === false) {
              setMsg({ tone: 'warn', text: r.error ?? 'Moyasar did not confirm the refund. It stays processing: do not refund again; use "Check with Moyasar".' });
            } else {
              const less = r.goodwillDeducted ? ` (less ${formatMoney(r.goodwillDeducted, r.currency ?? 'SAR')} of goodwill already given on this order)` : '';
              setMsg({ tone: 'ok', text: `Refunded ${formatMoney(r.amount ?? 0, r.currency ?? 'SAR')}${less}.${r.creditNote ? ` Credit note ${r.creditNote}.` : r.creditNotePending ? ' The credit note is pending: "Finish pending work" issues it.' : ''}` });
            }
            onDone();
          } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
        }} />
        <Button size="sm" kind="text" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

/**
 * Owner, manager, finance, support: close an approved return that will not be refunded through it, with the reason the
 * customer and the seller read (the goodwill already given covered it, the customer kept the item, it was refunded
 * another way). It then holds nothing: anything still due is refunded by line (review R5-2).
 */
export function CloseReturn({ returnId, onDone }: { returnId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <Button size="sm" kind="text" label="Close return" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />;
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <T size={13} color={colors.muted}>Closing it refunds nothing through this return. The customer and the seller are told, with your reason.</T>
      <Field label="Why it is closed (the customer and the seller read this)" value={reason} onChangeText={setReason} multiline maxLength={1000} />
      {msg ? <Notice tone="warn" text={msg} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" kind="secondary" label="Close return" busy={busy} disabled={reason.trim().length < 10} onPress={async () => {
          if (MARKET_DEMO) { setMsg('Example data: nothing is saved here.'); return; }
          setBusy(true); setMsg(null);
          try { await returnAction(returnId, 'close', reason.trim()); setOpen(false); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
        }} />
        <Button size="sm" kind="text" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const STATE: Record<string, string> = {
  succeeded: 'Moyasar shows the refund: it is recorded.',
  failed: 'Moyasar shows no refund: it is marked failed, and a new refund can be made.',
  waiting: 'Moyasar shows no refund yet. Check again in a few minutes (it is marked failed only after 15 minutes with no refund).',
  mismatch: 'Moyasar\'s refunded total does not match our records (a refund made outside Al Mukarramah?). Finance must check it in the Moyasar dashboard.',
  not_processing: 'This refund is already settled.',
  unreachable: 'Moyasar could not be reached. Try again in a few minutes.',
};

/** A refund still waiting for Moyasar's answer: read the payment back and settle it (never refund it again meanwhile). */
export function CheckWithMoyasar({ refundId, onDone }: { refundId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  return (
    <View style={{ gap: 6, alignSelf: 'stretch' }}>
      <Button size="sm" kind="secondary" label="Check with Moyasar" busy={busy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
        if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is checked here.' }); return; }
        setBusy(true); setMsg(null);
        try {
          const r = await checkWithMoyasar(refundId);
          setMsg({ tone: r.state === 'succeeded' || r.state === 'failed' || r.state === 'not_processing' ? 'ok' : 'warn',
            text: `${STATE[r.state] ?? r.state}${r.creditNote ? ` Credit note ${r.creditNote}.` : ''}` });
          onDone();
        } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
      }} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
    </View>
  );
}

/** Owner, manager, finance: a refund "Check with Moyasar" cannot settle (review N7). Record what Moyasar's dashboard
 *  shows, with what was checked; the server reads Moyasar back first and refuses an outcome Moyasar does not show. */
export function SettleByHand({ refundId, onDone, completedLate }: { refundId: string; onDone: () => void; completedLate?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  if (!open) return <Button size="sm" kind={completedLate ? 'secondary' : 'text'} label={completedLate ? 'Settle by hand: Moyasar completed it' : 'Settle by hand'} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />;
  const go = async (outcome: 'succeeded' | 'failed') => {
    if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is saved here.' }); return; }
    setBusy(outcome); setMsg(null);
    try {
      const r = await settleRefundByHand(refundId, outcome, reason.trim());
      setMsg({ tone: 'ok', text: `Recorded as ${r.status}.${r.creditNote ? ` Credit note ${r.creditNote}.` : ''}` });
      onDone();
    } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <Field label="What you checked in Moyasar's dashboard (at least 10 characters)" value={reason} onChangeText={setReason} maxLength={500} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" kind="secondary" label="Moyasar shows it refunded" busy={busy === 'succeeded'} disabled={reason.trim().length < 10} onPress={() => go('succeeded')} />
        {completedLate ? null : <Button size="sm" kind="secondary" label="Moyasar shows no refund" busy={busy === 'failed'} disabled={reason.trim().length < 10} onPress={() => go('failed')} />}
        <Button size="sm" kind="text" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const ISSUE: Record<PaymentIssue['kind'], string> = {
  order_not_waiting: 'paid after the order was cancelled or closed',
  second_payment: 'a second payment for an order already paid',
  amount_mismatch: 'an amount that does not match the order',
  order_not_found: 'paid for an order that no longer exists',
};

/**
 * Owner, manager, finance: a refund Moyasar made that we have no record of, made in its dashboard (review R3-2).
 * Recorded with its amount, Moyasar's reference and what it was for: goodwill (no items), items, or a parcel's
 * delivery. The server reads Moyasar first: never more than Moyasar shows refunded and we have not recorded.
 */
export function RecordMoyasarRefund({ u, onDone }: { u: UnrecordedRefund; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState<'goodwill' | 'items' | 'delivery'>('goodwill');
  const [amount, setAmount] = useState((u.unrecorded_minor / 100).toFixed(2));
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [parcel, setParcel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const key = useRef(freshKey('rm'));
  if (!open) return <Button size="sm" kind="secondary" label="Record a refund made in Moyasar" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />;
  const minor = Math.round(Number(amount.replace(/[^0-9.]/g, '')) * 100);
  const lines = u.lines.filter((l) => Number(qty[l.order_item_id] ?? 0) > 0).map((l) => ({ orderItemId: l.order_item_id, quantity: Math.floor(Number(qty[l.order_item_id])) }));
  const ready = minor > 0 && reference.trim().length >= 3 && reason.trim().length >= 10 && (what === 'goodwill' || (what === 'items' ? lines.length > 0 : parcel !== null));
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip size="sm" label="Goodwill (no items come back)" active={what === 'goodwill'} onPress={() => setWhat('goodwill')} />
        <Chip size="sm" label="Items" active={what === 'items'} onPress={() => setWhat('items')} />
        <Chip size="sm" label="A parcel's delivery" active={what === 'delivery'} onPress={() => setWhat('delivery')} />
      </View>
      {what === 'items' ? u.lines.filter((l) => l.refundable > 0).map((l) => (
        <Field key={l.order_item_id} label={`${l.name_en}: how many (up to ${l.refundable})`} value={qty[l.order_item_id] ?? ''} keyboardType="number-pad"
          onChangeText={(v) => setQty({ ...qty, [l.order_item_id]: v.replace(/[^0-9]/g, '') })} />
      )) : null}
      {what === 'delivery' ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {u.parcels.filter((x) => x.shipping_left > 0).map((x) => (
            <Chip key={x.sub_order_id} size="sm" label={`${x.number}: ${formatMoney(x.shipping_left, u.currency)}`} active={parcel === x.sub_order_id} onPress={() => setParcel(x.sub_order_id)} />
          ))}
        </View>
      ) : null}
      <Field label={`Amount Moyasar refunded (${u.currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" dirLtr />
      <Field label="Moyasar's reference (the date and amount in its dashboard)" value={reference} onChangeText={setReference} maxLength={120} />
      <Field label="What it was for (on the credit note and the audit log)" value={reason} onChangeText={setReason} maxLength={300} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" label="Record it" busy={busy} disabled={!ready} onPress={async () => {
          if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is saved here.' }); return; }
          setBusy(true); setMsg(null);
          try {
            const r = await recordMoyasarRefund({ orderId: u.order_id, key: key.current, amount: minor, reference: reference.trim(), reason: reason.trim(),
              ...(what === 'goodwill' ? { goodwill: true } : what === 'items' ? { lines } : { shipping: [parcel!] }) });
            key.current = freshKey('rm');
            setMsg({ tone: 'ok', text: `Recorded ${formatMoney(r.amount, r.currency)}.${r.creditNote ? ` Credit note ${r.creditNote}.` : ''}` });
            onDone();
          } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
        }} />
        <Button size="sm" kind="text" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

/** One order with refunds Moyasar made that we have not recorded: the failed refunds it may have completed, and the form. */
export function UnrecordedRow({ u, onDone }: { u: UnrecordedRefund; onDone: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <T size={14}>AM-{u.order_number}: Moyasar shows {formatMoney(u.moyasar_refunded_minor, u.currency)} refunded; we recorded {formatMoney(u.refunded_minor, u.currency)}.
        {' '}{formatMoney(u.unrecorded_minor, u.currency)} is not recorded, and no new refund can be made on this order until it is.</T>
      {u.failed.map((f) => (
        <View key={f.id} style={{ gap: 6 }}>
          <T size={13} color={colors.muted}>Marked failed: {formatMoney(f.amount_minor, f.currency)} on {f.created_at.slice(0, 10)} ({f.reason}). If Moyasar completed it later, settle it here.</T>
          <SettleByHand refundId={f.id} onDone={onDone} completedLate />
        </View>
      ))}
      <RecordMoyasarRefund u={u} onDone={onDone} />
    </View>
  );
}

/** Owner, manager, finance: a payment Moyasar took for an order no longer waiting (review N2). Refund it in full,
 *  attach it to its order (the order is paid with it and invoiced), or close it with a reason. */
export function PaymentIssueRow({ issue, onDone }: { issue: PaymentIssue; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const go = async (action: 'refund' | 'attach' | 'dismiss') => {
    if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is saved here.' }); return; }
    setBusy(action); setMsg(null);
    try {
      const r = await settlePaymentIssue(issue.id, action, reason.trim());
      if (r.pending || r.error) setMsg({ tone: 'warn', text: r.error ?? 'Moyasar did not confirm the refund. Press "Refund in full" again in a few minutes to check it.' });
      else { setMsg({ tone: 'ok', text: `Done: ${r.status}.${r.invoice ? ` Invoice ${r.invoice}.` : ''}` }); onDone(); }
    } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  };
  // the server checks the rest (unpaid, same amount, no parcel cancelled on its own)
  const canAttach = issue.status === 'open' && issue.kind === 'order_not_waiting' && issue.order_id !== null && issue.orders?.status === 'cancelled';
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <Field label="Reason (kept with the payment and in the audit log)" value={reason} onChangeText={setReason} maxLength={500} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button size="sm" kind="danger" label={issue.status === 'refund_pending' ? 'Check the refund with Moyasar' : 'Refund in full'} busy={busy === 'refund'}
          disabled={reason.trim().length < 3} onPress={() => go('refund')} />
        {canAttach ? <Button size="sm" kind="secondary" label="Attach to the order" busy={busy === 'attach'} disabled={reason.trim().length < 3} onPress={() => go('attach')} /> : null}
        {issue.status === 'open' ? <Button size="sm" kind="text" label="Close (settled elsewhere)" busy={busy === 'dismiss'} disabled={reason.trim().length < 3} onPress={() => go('dismiss')} /> : null}
      </View>
    </View>
  );
}
export const issueLabel = (i: PaymentIssue) =>
  `${i.orders ? `AM-${i.orders.number}` : 'No order'} · ${formatMoney(i.amount_minor, i.currency)} · ${ISSUE[i.kind]} · Moyasar ${i.payment_id}${i.status === 'refund_pending' ? ' · refund waiting for Moyasar' : ''}${i.error ? ` · last error: ${i.error}` : ''}`;

/** Owner, manager, finance: finish what a failure left half done (the scheduler also runs it every 15 minutes; review H3). */
export function FinishPendingButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  return (
    <View style={{ gap: 6, alignSelf: 'stretch' }}>
      <Button size="sm" kind="secondary" label="Finish pending work now" busy={busy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
        if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is run here.' }); return; }
        setBusy(true); setMsg(null);
        try {
          const r = await finishPendingWork();
          const done = `${r.handed_on.length} orders handed on, ${r.invoices.length} invoices, ${r.credit_notes.length} credit notes, ${r.refunds.length} refunds checked with Moyasar.`;
          setMsg(r.left.length ? { tone: 'warn', text: `${done} Still to finish: ${r.left.map((x) => `${x.step}: ${x.error}`).join('; ')}` } : { tone: 'ok', text: done });
          onDone();
        } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
      }} />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
    </View>
  );
}
