import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Card, Serif, T, Tag, useWide } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Entry = { id: number; at: string; actor_label: string | null; table_name: string; row_id: string; action: string };

export default function Audit() {
  const wide = useWide();
  const [rows, setRows] = useState<Entry[]>([]);
  useEffect(() => {
    supabase.from('audit_log').select('id, at, actor_label, table_name, row_id, action').order('at', { ascending: false }).limit(200)
      .then(({ data }) => setRows((data as Entry[]) ?? []));
  }, []);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Serif role="h1" size={wide ? 40 : 32}>Audit history</Serif>
      <T size={13} color={colors.muted} style={{ marginBottom: 18 }}>Every change by staff, by Claude and by the server, newest first. Times in your local timezone.</T>
      <Card pad={0} style={{ overflow: 'hidden' }}>
        {rows.length === 0 && <T color={colors.muted} style={{ padding: 18 }}>No changes recorded yet.</T>}
        {rows.map((r, i) => (
          <View key={r.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft }}>
            <Tag label={r.action} tone={r.action === 'DELETE' ? 'err' : r.action === 'INSERT' ? 'ok' : 'info'} />
            <T w={600} size={14} style={{ minWidth: 140 }}>{r.table_name}</T>
            <T size={13} color={colors.muted} style={{ flex: 1 }}>{r.row_id.slice(0, 8)} · {r.actor_label ?? 'system'}</T>
            <T size={13} color={colors.muted}>{new Date(r.at).toLocaleString('en-GB')}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
