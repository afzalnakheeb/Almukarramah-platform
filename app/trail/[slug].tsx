import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, H1, Loading, Notice, Screen } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { callFunction, supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

type Lesson = { id: string; day: number; title_en: string; title_ar: string; body_en: string | null; body_ar: string | null; quran_ref: string | null };
type Verse = { verse_key: string; text_uthmani: string };

export default function Trail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, pick, lang } = useI18n();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [open, setOpen] = useState<Lesson | null>(null);
  const [verses, setVerses] = useState<Verse[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from('lessons')
      .select('id, day, title_en, title_ar, body_en, body_ar, quran_ref, programmes!inner(slug)')
      .eq('programmes.slug', slug)
      .order('day')
      .then(({ data }) => setLessons((data as unknown as Lesson[]) ?? []));
    supabase.from('lesson_progress').select('lesson_id').then(({ data }) => setDone(new Set((data ?? []).map((r) => r.lesson_id))));
  }, [slug]);

  useEffect(() => {
    setVerses(null);
    if (open?.quran_ref) {
      // The Quran text comes from the Quran Foundation API through our server function and is shown exactly as received.
      callFunction<{ verses: Verse[] }>('quran', { ref: open.quran_ref }).then((r) => setVerses(r.verses)).catch(() => setVerses([]));
    }
  }, [open]);

  async function markDone(l: Lesson) {
    await supabase.from('lesson_progress').upsert({ lesson_id: l.id });
    setDone((s) => new Set(s).add(l.id));
  }

  if (lessons === null) return <Screen><Loading /></Screen>;

  if (open) {
    return (
      <Screen>
        <H1>{pick(open, 'title')}</H1>
        {open.quran_ref && (verses === null ? <Loading /> : (
          <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: space(3), borderWidth: 1, borderColor: colors.line }}>
            {verses.map((v) => (
              <Text key={v.verse_key} style={{ fontSize: 24, lineHeight: 48, textAlign: 'right', writingDirection: 'rtl', color: colors.ink }}>
                {v.text_uthmani} ﴿{v.verse_key.split(':')[1]}﴾
              </Text>
            ))}
            <Text style={[type.small, { marginTop: space(2) }]}>Quran text: Quran Foundation</Text>
          </View>
        ))}
        {pick(open, 'body') ? <Text style={[type.body, { marginTop: space(2) }]}>{pick(open, 'body')}</Text> : null}
        <View style={{ flexDirection: 'row', gap: space(1), marginTop: space(3) }}>
          <Button label="✓" onPress={() => markDone(open)} disabled={done.has(open.id)} />
          <Button label="←" kind="secondary" onPress={() => setOpen(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{slug === 'quran-trail' ? t('quranTrail') : t('seerahTrail')}</H1>
      {lessons.length === 0 && <Notice text={t('membersOnly')} />}
      {lessons.map((l) => (
        <Pressable key={l.id} onPress={() => setOpen(l)} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space(2), marginBottom: space(1) }}>
          <Text style={type.body}>{pick(l, 'title')}</Text>
          <Text style={{ color: done.has(l.id) ? colors.success : colors.muted }}>{done.has(l.id) ? '✓' : lang === 'ar' ? '‹' : '›'}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
