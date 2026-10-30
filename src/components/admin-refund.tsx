// Staff: one Refund button (owner, manager, finance, support). A fresh idempotency key per confirmed press, the reason
// required; the amount is worked out on the server (refund-order), never typed here.
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Notice } from '@/components/ui';
import { freshKey, refund } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';

/** One Refund button: a fresh key per confirmed press, the reason required, the result shown. */
export function RefundButton({ orderId, label, returnId, subOrderId, onDone }: { orderId: string; label: string; returnId?: string; subOrderId?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const key = useRef(freshKey('rf'));
  if (!open) return <Button size="sm" kind="danger" label={label} onPress={() => setOpen(true)} />;
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
            setMsg({ tone: 'ok', text: `Refunded ${formatMoney(r.amount, r.currency)}.${r.creditNote ? ` Credit note ${r.creditNote}.` : r.creditNotePending ? ' The credit note is pending: see below.' : ''}` });
            onDone();
          } catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
        }} />
        <Button size="sm" kind="text" label="Cancel" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

