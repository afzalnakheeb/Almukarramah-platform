// Staff: the notifications outbox. Every service message is queued here with its English and Arabic text; nothing is
// sent until an email or push provider is connected (in-app notifications are shown from here already). Marketing is
// never queued here, and marketing consent is never switched on automatically.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Card, Chip, H1, Notice, T, Tag, useWide } from '@/components/ui';
import { outbox, type OutboxRow } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { colors } from '@/theme';

export default function AdminNotifications() {
  const wide = useWide();
  const [audience, setAudience] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<OutboxRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => outbox({ audience }).then(setRows).catch((e) => setErr(String(e.message ?? e))), [audience]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Notifications" description="Staff only." path="/admin/notifications" noindex />
      <H1>Notifications outbox</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12, maxWidth: 820 }}>
        Queued, not sent: no email or push provider is connected yet. Customers and sellers already see their in-app updates. Each message is written in English
        and Arabic; it goes out in the recipient's language once sending is switched on.
      </T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real or saved." /> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[undefined, 'customer', 'seller', 'staff'].map((a) => <Chip key={a ?? 'all'} label={a ?? 'all'} active={audience === a} onPress={() => setAudience(a)} />)}
      </View>
      {err ? <Notice tone="warn" text={err} /> : null}
      <View style={{ gap: 10 }}>
        {rows && !rows.length ? <T color={colors.muted}>Nothing queued.</T> : null}
        {(rows ?? []).map((r) => (
          <Card key={r.id} pad={16} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <T w={700} size={13.5}>{r.template_key}</T>
              <Tag label={r.channel} tone="info" />
              <Tag label={r.audience} tone="mute" />
              <Tag label={r.status} tone={r.status === 'queued' ? 'warn' : 'ok'} />
              <T size={12} color={colors.muted}>{new Date(r.send_after).toLocaleString('en-GB')} · {r.lang === 'ar' ? 'reads Arabic' : 'reads English'}</T>
            </View>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T w={600} size={13.5}>{r.subject_en}</T>
                <T size={13} lh={1.5} color={colors.body}>{r.body_en}</T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T w={600} size={13.5} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.subject_ar}</T>
                <T size={13} lh={1.6} color={colors.body} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.body_ar}</T>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
