import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { H1, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, space, type } from '@/theme';

type Entry = { id: number; at: string; actor_label: string | null; table_name: string; row_id: string; action: string };

export default function Audit() {
  const [rows, setRows] = useState<Entry[]>([]);
  useEffect(() => {
    supabase.from('audit_log').select('id, at, actor_label, table_name, row_id, action').order('at', { ascending: false }).limit(200)
      .then(({ data }) => setRows((data as Entry[]) ?? []));
  }, []);
  return (
    <Screen>
      <H1>Audit log</H1>
      <Text style={type.small}>Every change by staff, by Claude and by the server, newest first.</Text>
      {rows.map((r) => (
        <View key={r.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: space(1) }}>
          <Text style={type.body}>{r.action} · {r.table_name} · {r.row_id.slice(0, 8)}</Text>
          <Text style={type.small}>{new Date(r.at).toLocaleString('en-GB')} · {r.actor_label ?? 'system'}</Text>
        </View>
      ))}
    </Screen>
  );
}
