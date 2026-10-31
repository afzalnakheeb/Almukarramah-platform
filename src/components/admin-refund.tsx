// Staff: one Refund button (owner, manager, finance, support). A fresh idempotency key per confirmed press, the reason
// required; the amount is worked out on the server (refund-order), never typed here. When Moyasar's answer does not
// come back the refund stays "processing" (review H2): the button says so and never offers to refund again; "Check
// with Moyasar" settles it.
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Notice } from '@/components/ui';
import { checkWithMoyasar, finishPendingWork, freshKey, refund } from '@/lib/aftersale';
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
