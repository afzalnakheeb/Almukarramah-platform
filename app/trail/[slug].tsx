// Quran Trail and Seerah Trail. Quran text comes from the Quran Foundation API and is shown exactly as received.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Button, Card, Eyebrow, H1, Loading, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { openExternal, SEERAH_TRAIL_URL } from '@/lib/links';
import { callFunction, supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { Seo } from '@/components/seo';

type Lesson = { id: string; day: number; title_en: string; title_ar: string; body_en: string | null; body_ar: string | null; quran_ref: string | null };
type Verse = { verse_key: string; text_uthmani: string };

export function generateStaticParams(): { slug: string }[] {
  return [{ slug: 'quran-trail' }, { slug: 'seerah-trail' }];
}

export default function Trail() {
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, pick, isRTL } = useI18n();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [open, setOpen] = useState<Lesson | null>(null);
  const [verses, setVerses] = useState<Verse[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const title = slug === 'quran-trail' ? t('quranTrail') : t('seerahTrail');

  useEffect(() => {
    setOpen(null);
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
      callFunction<{ verses: Verse[] }>('quran', { ref: open.quran_ref }).then((r) => setVerses(r.verses)).catch(() => setVerses([]));
    }
  }, [open]);

  async function markDone(l: Lesson) {
    await supabase.from('lesson_progress').upsert({ lesson_id: l.id });
    setDone((s) => new Set(s).add(l.id));
  }

  if (slug === 'seerah-trail') {
    return (
      <Screen>
      <Seo title={`${slug === 'quran-trail' ? 'Quran Trail' : 'Seerah Trail'} | Al Mukarramah`} description={slug === 'quran-trail' ? 'Daily Quran lessons for Al Mukarramah members, with the Quran text shown exactly as published by the Quran Foundation.' : 'The Seerah Trail: learn the life of the Prophet ﷺ through the places of Madinah.'} path={`/trail/${slug}`} />
        <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
          <Eyebrow size={12}>{t('learning')}</Eyebrow>
          <H1 size={wide ? 52 : 36}>{title}</H1>
          <View style={{ backgroundColor: colors.navy, borderRadius: 24, padding: wide ? 32 : 20, gap: 12, marginTop: 10 }}>
            <Serif size={wide ? 32 : 24} color={colors.white}>{t('seerahExternal')}</Serif>
            <Button label={t('openSeerah')} kind="light" onPress={() => openExternal(SEERAH_TRAIL_URL)} style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          </View>
        </View>
      </Screen>
    );
  }

  if (lessons === null) return <Screen>
      <Seo title={`${slug === 'quran-trail' ? 'Quran Trail' : 'Seerah Trail'} | Al Mukarramah`} description={slug === 'quran-trail' ? 'Daily Quran lessons for Al Mukarramah members, with the Quran text shown exactly as published by the Quran Foundation.' : 'The Seerah Trail: learn the life of the Prophet ﷺ through the places of Madinah.'} path={`/trail/${slug}`} /><Loading /></Screen>;

  if (open) {
    return (
      <Screen>
      <Seo title={`${slug === 'quran-trail' ? 'Quran Trail' : 'Seerah Trail'} | Al Mukarramah`} description={slug === 'quran-trail' ? 'Daily Quran lessons for Al Mukarramah members, with the Quran text shown exactly as published by the Quran Foundation.' : 'The Seerah Trail: learn the life of the Prophet ﷺ through the places of Madinah.'} path={`/trail/${slug}`} />
        <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
          <Pressable accessibilityRole="button" onPress={() => setOpen(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}>
            <Icon name={isRTL ? 'chevronRight' : 'chevronLeft'} size={18} />
            <T w={700} color={colors.navy}>{title}</T>
          </Pressable>
          <Eyebrow size={12}>{t('day')} {open.day}</Eyebrow>
          <H1 size={wide ? 48 : 32}>{pick(open, 'title')}</H1>
          {open.quran_ref && (verses === null ? <Loading /> : (
            <Card pad={wide ? 32 : 20} style={{ borderRadius: 24, marginTop: 10 }}>
              {verses.map((v) => (
                <Text key={v.verse_key} style={{ fontFamily: fonts.quran, fontSize: wide ? 30 : 25, lineHeight: wide ? 64 : 54, textAlign: 'right', writingDirection: 'rtl', color: colors.ink }}>
                  {v.text_uthmani} ﴿{v.verse_key.split(':')[1]}﴾
                </Text>
              ))}
              <T size={12} color={colors.muted} style={{ marginTop: 16 }}>{t('quranSource')}</T>
            </Card>
          ))}
          {pick(open, 'body') ? <T size={16} lh={1.75} color={colors.body} style={{ marginTop: 20 }}>{pick(open, 'body')}</T> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 28 }}>
            <Button label={done.has(open.id) ? t('done') : t('lessonDone')} onPress={() => markDone(open)} disabled={done.has(open.id)} icon={<Icon name="check" size={18} color={done.has(open.id) ? colors.muted : colors.white} />} />
            <Button label={t('back')} kind="secondary" onPress={() => setOpen(null)} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Seo title={`${slug === 'quran-trail' ? 'Quran Trail' : 'Seerah Trail'} | Al Mukarramah`} description={slug === 'quran-trail' ? 'Daily Quran lessons for Al Mukarramah members, with the Quran text shown exactly as published by the Quran Foundation.' : 'The Seerah Trail: learn the life of the Prophet ﷺ through the places of Madinah.'} path={`/trail/${slug}`} />
      <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
        <Eyebrow size={12}>{t('learning')}</Eyebrow>
        <H1 size={wide ? 52 : 36}>{title}</H1>
        {lessons.length === 0 ? (
          <View style={{ backgroundColor: colors.navy, borderRadius: 24, padding: wide ? 32 : 20, gap: 10, marginTop: 10 }}>
            <Eyebrow size={11} color={colors.champagne}>{t('membersOnly')}</Eyebrow>
            <Serif size={wide ? 34 : 26} color={colors.white}>{t('membersOnlyBody')}</Serif>
            <Button label={t('circleCta')} kind="light" href="/membership" style={{ alignSelf: 'flex-start', marginTop: 6 }} />
          </View>
        ) : (
          <Card pad={0} style={{ borderRadius: 20, overflow: 'hidden', marginTop: 10 }}>
            {lessons.map((l, i) => (
              <Pressable key={l.id} accessibilityRole="button" onPress={() => setOpen(l)}
                style={({ hovered }: { hovered?: boolean }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft }, hovered && { backgroundColor: colors.lavender }]}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: done.has(l.id) ? colors.successBg : colors.ivory, alignItems: 'center', justifyContent: 'center' }}>
                  {done.has(l.id) ? <Icon name="check" size={18} color={colors.success} /> : <T w={700} size={13} color={colors.navy}>{l.day}</T>}
                </View>
                <T w={600} style={{ flex: 1 }}>{pick(l, 'title')}</T>
                <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={18} color={colors.muted} />
              </Pressable>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
