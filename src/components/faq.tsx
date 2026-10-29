// Visible questions and answers. Kept fully open in the HTML so people, search engines and AI assistants can read them.
import React from 'react';
import { View } from 'react-native';
import { colors } from '@/theme';
import { Serif, T, useWide } from './ui';

export function Faq({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  const wide = useWide();
  return (
    <View style={{ gap: 4 }}>
      <Serif role="h2" size={wide ? 34 : 26} style={{ marginBottom: 8 }}>{title}</Serif>
      {items.map((f, i) => (
        <View key={f.q} style={{ paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.line, gap: 6 }}>
          <T w={700} size={15} color={colors.navy}>{f.q}</T>
          <T size={14.5} lh={1.65} color={colors.body}>{f.a}</T>
        </View>
      ))}
    </View>
  );
}

export function Facts({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
      <T w={700} size={14} color={colors.navy} style={{ paddingVertical: 8 }}>{title}</T>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.lineSoft }}>
          <T size={13.5} color={colors.muted} style={{ width: 120 }}>{k}</T>
          <T size={13.5} w={600} style={{ flex: 1 }}>{v}</T>
        </View>
      ))}
    </View>
  );
}
