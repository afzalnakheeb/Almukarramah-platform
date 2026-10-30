// Staff (owner, manager, finance): sellers' balances and payouts. Payouts are bank transfers made outside this system
// and RECORDED here (amount, bank reference, date), never more than is available: sales past their return window and
// hold, with no open return. Adjustments always need a reason; nothing is ever edited. Each seller's monthly statement
// is the same one the seller sees.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatementView } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Field, H1, Notice, T, Tag, useWide } from '@/components/ui';
import { adminPayouts, ledgerAdjust, recordPayout, sellerStatement, type PayoutRow, type Statement } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { formatMoney } from '@/lib/money';
import { colors } from '@/theme';

const sar = (m: number) => formatMoney(m, 'SAR');
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);   // Saudi date

function SellerRow({ s, onDone }: { s: PayoutRow; onDone: () => void }) {
  const wide = useWide();
  const [mode, setMode] = useState<null | 'pay' | 'adjust' | 'statement'>(null);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [st, setSt] = useState<Statement | null>(null);
  const halalas = Math.round(Number(amount.replace(/[^0-9.-]/g, '')) * 100);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is saved here.' }); return; }
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ tone: 'ok', text: ok }); setMode(null); setAmount(''); setRef(''); setNote(''); onDone(); }
    catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  };
  return (
    <Card pad={wide ? 20 : 14} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <T w={700} size={15.5}>{s.name_en}</T>
          <Tag label={s.status} tone={s.status === 'approved' ? 'ok' : 'warn'} />
          <Tag label={`KYC ${s.kyc_status ?? '—'}`} tone={s.kyc_status === 'approved' ? 'ok' : 'warn'} />
        </View>
        <T size={13} color={colors.muted}>IBAN ending {s.iban_last4 ?? '—'}</T>
      </View>
      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
        <T size={13.5}>Available <T w={700} size={13.5} color={colors.emerald}>{sar(s.available_sar_minor)}</T></T>
        <T size={13.5}>Held {sar(s.held_sar_minor)}{s.next_available_on ? ` (next on ${s.next_available_on})` : ''}</T>
        <T size={13.5}>Balance {sar(s.balance_sar_minor)}</T>
        <T size={13} color={colors.muted}>{s.last_payout ? `Last paid ${sar(s.last_payout.amount_sar_minor)} on ${s.last_payout.paid_on} (${s.last_payout.reference})` : 'No payouts yet'}</T>
      </View>
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      {mode === 'pay' ? (
        <View style={{ gap: 8 }}>
          <Notice text="Make the bank transfer first, then record it here with the bank's reference." />
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="Amount paid (SAR)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" dirLtr /></View>
            <View style={{ flex: 1 }}><Field label="Bank transfer reference" value={ref} onChangeText={setRef} maxLength={100} dirLtr /></View>
            <View style={{ flex: 1 }}><Field label="Date of the transfer (YYYY-MM-DD)" value={date} onChangeText={setDate} dirLtr /></View>
          </View>
          <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={500} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="sm" label="Record the payout" busy={busy} disabled={!(halalas > 0) || ref.trim().length < 3 || !/^\d{4}-\d\d-\d\d$/.test(date)}
              onPress={() => run(() => recordPayout(s.id, halalas, ref.trim(), date, note.trim() || undefined), 'Payout recorded; the seller has been told.')} />
            <Button size="sm" kind="text" label="Cancel" onPress={() => setMode(null)} />
          </View>
        </View>
      ) : mode === 'adjust' ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
            <View style={{ flex: 1 }}><Field label="Amount (SAR; negative takes off)" value={amount} onChangeText={setAmount} dirLtr /></View>
            <View style={{ flex: 2 }}><Field label="Reason (the seller sees it)" value={note} onChangeText={setNote} maxLength={500} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="sm" label="Record the adjustment" busy={busy} disabled={!halalas || note.trim().length < 5} onPress={() => run(() => ledgerAdjust(s.id, halalas, note.trim()), 'Adjustment recorded.')} />
            <Button size="sm" kind="text" label="Cancel" onPress={() => setMode(null)} />
          </View>
        </View>
      ) : mode === 'statement' && st ? (
        <View style={{ gap: 10 }}>
          <StatementView s={st} onMonth={(m) => sellerStatement(s.id, m).then(setSt)} />
          <Button size="sm" kind="text" label="Close the statement" onPress={() => setMode(null)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button size="sm" label="Record a payout" disabled={s.available_sar_minor <= 0} onPress={() => setMode('pay')} />
          <Button size="sm" kind="secondary" label="Statement" onPress={() => sellerStatement(s.id).then((x) => { setSt(x); setMode('statement'); }).catch((e) => setMsg({ tone: 'warn', text: String(e.message ?? e) }))} />
          <Button size="sm" kind="text" label="Adjustment" onPress={() => setMode('adjust')} />
        </View>
      )}
    </Card>
  );
}

export default function AdminPayouts() {
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => adminPayouts().then(setRows).catch((e) => setErr(String(e.message ?? e))), []);
  useEffect(() => { load(); }, [load]);
  const total = (k: 'available_sar_minor' | 'held_sar_minor') => (rows ?? []).reduce((n, r) => n + r[k], 0);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Seller payouts" description="Staff only." path="/admin/payouts" noindex />
      <H1>Seller payouts</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12, maxWidth: 820 }}>
        Statements are in SAR. A sale becomes payable after its return window and a {3}-day hold, unless a return is open on it. Before the first payout: confirm the
        tax treatment of seller statements with the adviser and the seller agreement's payout terms.
      </T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real or saved." /> : null}
      {err ? <Notice tone="warn" text={err} /> : null}
      {rows ? <T size={14} style={{ marginBottom: 10 }}>Payable now {sar(total('available_sar_minor'))} · held {sar(total('held_sar_minor'))}</T> : null}
      <View style={{ gap: 12 }}>{(rows ?? []).map((s) => <SellerRow key={s.id} s={s} onDone={load} />)}</View>
    </Screen>
  );
}
