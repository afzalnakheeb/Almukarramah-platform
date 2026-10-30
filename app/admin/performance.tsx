// Staff: each seller's standards over the window (late shipments, seller cancellations, returns for a problem, rating,
// time to answer), against the thresholds in the marketplace settings. "Warn sellers below the standard" sends each one
// a warning (weekly at most) and tells owner and manager about any below the suspension line; it suspends only if
// automatic suspension is switched on (it is off).
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, H1, Notice, T, Tag, useWide } from '@/components/ui';
import { adminPerformance, runPerformanceReview, type Performance } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { colors } from '@/theme';

type Row = Performance & { name_en: string; slug: string; seller_status: string; kind: string };
const TONE: Record<string, 'ok' | 'warn' | 'err' | 'info'> = { ok: 'ok', warn: 'warn', suspend: 'err', new: 'info' };
const pct = (b: number | null) => (b === null ? '—' : `${(b / 100).toFixed(1)}%`);

export default function AdminPerformance() {
  const wide = useWide();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => adminPerformance().then(setRows).catch((e) => setMsg({ tone: 'warn', text: String(e.message ?? e) })), []);
  useEffect(() => { load(); }, [load]);
  const cell = (label: string, value: string, status?: string) => (
    <View style={{ minWidth: wide ? 120 : 100, gap: 2 }}>
      <T size={11.5} color={colors.muted}>{label}</T>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <T w={700} size={14}>{value}</T>
        {status && status !== 'ok' ? <Tag label={status} tone={TONE[status]} /> : null}
      </View>
    </View>
  );
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Seller performance" description="Staff only." path="/admin/performance" noindex />
      <H1>Seller performance</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12, maxWidth: 820 }}>
        Over the last {rows?.[0]?.window_days ?? 90} days. A shop with fewer than {rows?.[0]?.min_orders ?? 10} orders is "new" and is not judged yet. Automatic
        suspension is {rows?.[0]?.auto_suspend ? 'ON' : 'off'} (marketplace settings).
      </T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real or saved." /> : null}
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <Button size="sm" kind="secondary" label="Warn sellers below the standard" busy={busy} style={{ alignSelf: 'flex-start', marginBottom: 12 }} onPress={async () => {
        if (MARKET_DEMO) { setMsg({ tone: 'warn', text: 'Example data: nothing is sent here.' }); return; }
        setBusy(true);
        try { const r = await runPerformanceReview(); setMsg({ tone: 'ok', text: `${r.warned} warned, ${r.suspended} suspended.` }); load(); }
        catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
      }} />
      <View style={{ gap: 10 }}>
        {(rows ?? []).map((r) => (
          <Card key={r.seller_id} pad={16} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <T w={700} size={15}>{r.name_en}</T>
              <Tag label={r.status} tone={TONE[r.status]} />
              {r.seller_status !== 'approved' ? <Tag label={r.seller_status} tone="err" /> : null}
              <T size={12.5} color={colors.muted}>{r.orders} orders</T>
            </View>
            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
              {cell('Late shipments', pct(r.metrics.late_shipment.bps), r.metrics.late_shipment.status)}
              {cell('Seller cancellations', pct(r.metrics.cancellation.bps), r.metrics.cancellation.status)}
              {cell('Returns for a problem', pct(r.metrics.returns.bps), r.metrics.returns.status)}
              {cell('Rating', r.metrics.rating.x100 === null ? '—' : `${(r.metrics.rating.x100 / 100).toFixed(2)} (${r.metrics.rating.count})`, r.metrics.rating.status)}
              {cell('Median answer', r.metrics.response_hours.median === null ? '—' : `${r.metrics.response_hours.median} h`)}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
