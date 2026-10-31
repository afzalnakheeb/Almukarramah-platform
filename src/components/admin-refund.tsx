// Staff: one Refund button (owner, manager, finance, support). A fresh idempotency key per confirmed press, the reason
// required; the amount is worked out on the server (refund-order), never typed here. When Moyasar's answer does not
// come back the refund stays "processing" (review H2): the button says so and never offers to refund again; "Check
// with Moyasar" settles it.
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Notice } from '@/components/ui';
import { checkWithMoyasar, finishPendingWork, freshKey, refund, settlePaymentIssue, settleRefundByHand, type PaymentIssue } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';

/** One Refund button: a fresh key per confirmed press, the reason required, the result shown. */
export function RefundButton({ orderId, label, returnId, subOrderId, onDone }: { orderId: string; label: string; returnId?: string; subOrderId?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const key = useRef(freshKey('rf'));
  if (!open) return <Button size="sm" kind="danger" label={label} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />;
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
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
              setMsg({ tone: 'ok', text: `Refunded ${formatMoney(r.amount ?? 0, r.currency ?? 'SAR')}.${r.creditNote ? ` Credit note ${r.creditNote}.` : r.creditNotePending ? ' The credit note is pending: "Finish pending work" issues it.' : ''}` });
            }
            onDone();
          } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
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
export function SettleByHand({ refundId, onDone }: { refundId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  if (!open) return <Button size="sm" kind="text" label="Settle by hand" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />;
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
        <Button size="sm" kind="secondary" label="Moyasar shows no refund" busy={busy === 'failed'} disabled={reason.trim().length < 10} onPress={() => go('failed')} />
        <Button size="sm" kind="text" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const ISSUE: Record<PaymentIssue['kind'], string> = {
  order_not_waiting: 'paid after the order was cancelled or closed',
  second_payment: 'a second payment for an order already paid',
  amount_mismatch: 'an amount that does not match the order',
};

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
