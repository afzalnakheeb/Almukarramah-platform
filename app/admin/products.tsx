import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Chip, H1, Screen } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

type Row = { id: string; slug: string; name_en: string; name_ar: string; base_price_sar: number; stock: number; is_active: boolean };

export default function AdminProducts() {
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const { data } = await supabase.from('products').select('id, slug, name_en, name_ar, base_price_sar, stock, is_active').order('name_en');
    setRows((data as Row[]) ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(id: string, patch: Partial<Row>) {
    await supabase.from('products').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    load();
  }

  return (
    <Screen>
      <H1>Products and stock</H1>
      <Text style={type.small}>New products, descriptions, photos and SEO are added from Claude. Use this screen for quick stock and on/off changes.</Text>
      {rows.map((r) => (
        <View key={r.id} style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space(2), marginTop: space(1.5) }}>
          <Text style={[type.body, { fontWeight: '700' }]}>{r.name_en} · {r.name_ar}</Text>
          <Text style={type.small}>{formatMoney(r.base_price_sar, 'SAR')} · {r.slug}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1), marginTop: space(1), flexWrap: 'wrap' }}>
            <Text style={type.small}>Stock</Text>
            <TextInput
              defaultValue={String(r.stock)}
              keyboardType="number-pad"
              onEndEditing={(e) => save(r.id, { stock: Number(e.nativeEvent.text) || 0 })}
              onBlur={(e) => {
                const v = (e.target as unknown as { value?: string }).value;
                if (v !== undefined) save(r.id, { stock: Number(v) || 0 });
              }}
              style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, minWidth: 70, minHeight: 40, paddingHorizontal: 8 }}
            />
            <Chip label={r.is_active ? 'On sale' : 'Hidden'} active={r.is_active} onPress={() => save(r.id, { is_active: !r.is_active })} />
          </View>
        </View>
      ))}
      <Button kind="secondary" label="Refresh" onPress={load} style={{ marginTop: space(2) }} />
    </Screen>
  );
}
