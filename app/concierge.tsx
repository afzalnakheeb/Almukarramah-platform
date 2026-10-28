import { Link } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Field, H1, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { callFunction } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

type Msg = { role: 'user' | 'assistant'; content: string };
type Reply = { reply: string; products: { slug: string; name: string }[] };

export default function Concierge() {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<Reply['products']>([]);

  async function send() {
    if (!input.trim()) return;
    const next: Msg[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await callFunction<Reply>('concierge', { messages: next, lang });
      setMessages([...next, { role: 'assistant', content: res.reply }]);
      setSuggested(res.products);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{t('concierge')}</H1>
      {messages.map((m, i) => (
        <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: m.role === 'user' ? colors.navy : colors.white, borderRadius: radius.md, padding: space(1.5), marginBottom: space(1), borderWidth: 1, borderColor: colors.line }}>
          <Text style={{ color: m.role === 'user' ? colors.white : colors.ink, fontSize: 15, lineHeight: 22 }}>{m.content}</Text>
        </View>
      ))}
      {suggested.map((p) => (
        <Link key={p.slug} href={{ pathname: '/product/[slug]', params: { slug: p.slug } }} style={[type.body, { color: colors.navy, fontWeight: '700', marginBottom: 4 }]}>
          {p.name} →
        </Link>
      ))}
      <Field label="" placeholder={t('askConcierge')} value={input} onChangeText={setInput} onSubmitEditing={send} />
      <Button label={t('send')} onPress={send} busy={busy} />
    </Screen>
  );
}
