// Visible questions and answers. Kept fully open in the HTML so people, search engines and AI assistants can read them.
import React from 'react';
import { View } from 'react-native';
import { colors } from '@/theme';
import { Eyebrow, Serif, T, useWide } from './ui';

/** Answers as a list between fine hairlines. `split` (desktop): the title on the start side, the answers beside it. */
export function Faq({ title, items, kicker, split }: { title: string; items: { q: string; a: string }[]; kicker?: string; split?: boolean }) {
  const wide = useWide();
  const head = (
    <View style={{ gap: 12, marginBottom: split ? 0 : 18 }}>
      {kicker ? <Eyebrow rule>{kicker}</Eyebrow> : null}
      <Serif role="h2" size={split ? 44 : wide ? 34 : 28}>{title}</Serif>
    </View>
  );
  const list = (
    <View style={{ borderTopWidth: 1, borderColor: colors.goldLine }}>
      {items.map((f) => (
        <View key={f.q} style={{ paddingVertical: wide ? 22 : 18, borderBottomWidth: 1, borderColor: colors.line, gap: 8 }}>
          <T w={500} size={wide ? 16 : 15} lh={1.45} color={colors.navy}>{f.q}</T>
          <T size={14.5} lh={1.7} color={colors.body}>{f.a}</T>
        </View>
      ))}
    </View>
  );
  if (!split) return <View>{head}{list}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: 88, alignItems: 'flex-start' }}>
      <View style={{ flex: 0.75 }}>{head}</View>
      <View style={{ flex: 1.25 }}>{list}</View>
    </View>
  );
}

/** Key facts as a quiet two-column list between hairlines. */
export function Facts({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <View>
      <T w={600} size={10.5} caps color={colors.navy} style={{ paddingBottom: 12 }}>{title}</T>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', gap: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line }}>
          <T size={13} color={colors.muted} style={{ width: 128 }}>{k}</T>
          <T size={13.5} w={500} color={colors.navy} style={{ flex: 1 }}>{v}</T>
        </View>
      ))}
      <View style={{ height: 1, backgroundColor: colors.line }} />
    </View>
  );
}
