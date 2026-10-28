// Gift assistant — follows AppConcierge.dc.html. Suggestions come from the live catalogue (concierge function).
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Card, H1, Notice, Photo, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { callFunction } from '@/lib/supabase';
import { colors, sans, toneFor } from '@/theme';
import { Seo } from '@/components/seo';

type Msg = { role: 'user' | 'assistant'; content: string };
type Reply = { reply: string; products: { slug: string; name: string }[] };

export default function Concierge() {
  const wide = useWide();
  const { t, lang, isRTL } = useI18n();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<Reply['products']>([]);

  async function send() {
    if (!input.trim() || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: input.trim() }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const res = await callFunction<Reply>('concierge', { messages: next, lang });
      setMessages([...next, { role: 'assistant', content: res.reply }]);
      setSuggested(res.products);
    } catch {
      setError(t('conciergeError'));
    } finally {
      setBusy(false);
    }
  }

  const bubble = (m: Msg, i: number) => (
    <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: m.role === 'user' ? colors.navy : colors.white, borderRadius: 18, borderBottomRightRadius: m.role === 'user' ? 6 : 18, borderBottomLeftRadius: m.role === 'user' ? 18 : 6, paddingVertical: 12, paddingHorizontal: 14, borderWidth: m.role === 'user' ? 0 : 1, borderColor: colors.line }}>
      <T size={15} lh={1.5} color={m.role === 'user' ? colors.white : colors.ink}>{m.content}</T>
    </View>
  );

  return (
    <Screen>
      <Seo title="Gift assistant | Al Mukarramah" description="Tell us who the gift is for, the occasion and your budget, and the assistant suggests gifts from the current Al Mukarramah catalogue." path="/concierge" />
      <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <H1 size={wide ? 48 : 34}>{t('concierge')}</H1>
        <T color={colors.muted} style={{ marginBottom: 20 }}>{t('conciergeSub')}</T>

        <Card pad={wide ? 20 : 14} style={{ borderRadius: 24, backgroundColor: '#F7F3EC', gap: 10 }}>
          {bubble({ role: 'assistant', content: t('conciergeHello') }, -1)}
          {messages.map(bubble)}
          {busy && <View style={{ alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line }}><T color={colors.muted}>…</T></View>}
          {suggested.map((p) => (
            <Pressable key={p.slug} accessibilityRole="link" onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: p.slug } })}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 10 }}>
              <View style={{ width: 56 }}><Photo ratio={1} tone={toneFor(p.slug)} style={{ borderRadius: 12 }} /></View>
              <T w={700} size={14} style={{ flex: 1 }}>{p.name}</T>
              <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={18} />
            </Pressable>
          ))}
          {suggested.length > 0 && <T size={12.5} color={colors.muted}>{t('conciergeNote')}</T>}
          {error && <Notice tone="warn" text={error} />}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 999, paddingStart: 18, paddingEnd: 6, minHeight: 54, marginTop: 6 }}>
            <TextInput
              accessibilityLabel={t('askConcierge')}
              placeholder={t('askConcierge')}
              placeholderTextColor={colors.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
              style={[sans(400, isRTL), { flex: 1, fontSize: 16, color: colors.ink, minHeight: 44, textAlign: isRTL ? 'right' : 'left' }]}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={t('send')} onPress={send} disabled={busy || !input.trim()}
              style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: input.trim() ? colors.navy : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}><Icon name="send" size={18} color={colors.white} /></View>
            </Pressable>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
