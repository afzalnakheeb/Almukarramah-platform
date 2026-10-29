// How to measure for a tailor-made thobe or abaya: step by step, with drawings (and videos when recorded).
// Signed-in customers can save the result as a measurement profile to use on any tailor-made product.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Ornament } from '@/components/decor';
import { MeasureGuide } from '@/components/measure';
import { breadcrumbLd, Seo } from '@/components/seo';
import { Breadcrumb, Button, Card, Chip, Eyebrow, Field, Notice, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { GARMENT_STEPS, MEASURE_INTRO, type Garment, type Measurements, type Unit } from '@/lib/measurements';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export default function MeasurePage() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { session } = useSession();
  const [garment, setGarment] = useState<Garment>('thobe');
  const [values, setValues] = useState<Measurements>({});
  const [unit, setUnit] = useState<Unit>('cm');
  const [name, setName] = useState('');
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const complete = GARMENT_STEPS[garment].every((s) => typeof values[s.key] === 'number');

  async function save() {
    if (!name.trim()) return;
    const { error } = await supabase.from('measurement_profiles').insert({ name: name.trim().slice(0, 40), garment, measures: values });
    setMsg(error ? { tone: 'warn', text: error.message } : { tone: 'ok', text: t('tmProfileSaved') });
  }

  const howTo = {
    '@context': 'https://schema.org', '@type': 'HowTo', name: 'How to measure yourself for a tailor-made thobe',
    step: GARMENT_STEPS.thobe.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title.en, text: s.how.en.join(' ') })),
  };

  return (
    <Screen style={{ maxWidth: 1100 }}>
      <Seo title="How to measure for a tailor-made thobe or abaya | Al Mukarramah" description="Step-by-step guide to measuring your collar, shoulder, chest, sleeve, cuff and length for a tailor-made thobe or abaya."
        path="/tailoring/measure" jsonLd={[howTo, breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Modest fashion', path: '/fashion' }, { name: 'How to measure', path: '/tailoring/measure' }])]} />
      <Breadcrumb items={[{ label: t('home'), href: '/' }, { label: t('fashionTitle'), href: '/fashion' }, { label: t('measureGuideTitle') }]} />
      <View style={{ gap: 10, marginBottom: 18, maxWidth: 820 }}>
        <Eyebrow size={12}>{t('tailorMade')}</Eyebrow>
        <Serif role="h1" size={wide ? 52 : 34}>{t('measureGuideTitle')}</Serif>
        <Ornament color={colors.brass} width={96} />
        <T size={16} lh={1.6} color={colors.body}>{t('measureGuideBody')}</T>
      </View>
      <Card pad={wide ? 20 : 14} style={{ gap: 6, marginBottom: 16, borderColor: colors.champagne, backgroundColor: colors.goldSoft }}>
        {MEASURE_INTRO[lang].map((l) => <T key={l} size={14} lh={1.55} color={colors.brassText}>• {l}</T>)}
      </Card>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Chip label={t('garment_thobe')} active={garment === 'thobe'} onPress={() => { setGarment('thobe'); setDone(false); }} />
        <Chip label={t('garment_abaya')} active={garment === 'abaya'} onPress={() => { setGarment('abaya'); setDone(false); }} />
      </View>
      <MeasureGuide garment={garment} values={values} onChange={setValues} unit={unit} onUnitChange={setUnit} onDone={() => setDone(true)} />
      {done && complete && (
        <Card pad={wide ? 20 : 14} style={{ marginTop: 16, gap: 8, borderColor: colors.gold }}>
          <T w={700} size={16} color={colors.navy}>{t('tmSaveTitle')}</T>
          {session ? (
            <>
              <Field label={t('tmSaveAs')} value={name} onChangeText={setName} placeholder={t('tmSaveAsHint')} maxLength={40} />
              <Button label={t('save')} onPress={save} disabled={!name.trim()} style={{ alignSelf: 'flex-start' }} />
            </>
          ) : (
            <Button label={t('tmSignInToSave')} kind="secondary" href={{ pathname: '/account', params: { next: '/tailoring/measure' } }} style={{ alignSelf: 'flex-start' }} />
          )}
          {msg && <Notice tone={msg.tone} text={msg.text} />}
          <Button label={t('fashionBrowseTailored')} kind="text" href="/fashion" style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}
    </Screen>
  );
}
