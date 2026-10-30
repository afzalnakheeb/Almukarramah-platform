// Modest fashion on the product page:
//  * SizePicker: ready-made sizes with the seller's size chart.
//  * TailorConfigurator: tailor-made design choices (fabric, collar, sleeve, pocket...) then the customer's
//    measurements (saved profile or the step-by-step guide), then a summary and "Add to bag".
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { unitPriceWith } from '@/lib/cart';
import { useI18n, type Key } from '@/lib/i18n';
import { GARMENT_STEPS, type Garment, type Measurements, type Unit } from '@/lib/measurements';
import { formatMoney, priceIn } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { LineCustom, Product } from '@/lib/types';
import { colors } from '@/theme';
import { Icon } from './icons';
import { MeasureFigure, MeasureGuide } from './measure';
import { Button, Card, Chip, Field, Notice, Photo, Serif, T, useWide } from './ui';

type Profile = { id: string; name: string; garment: string; measures: Measurements };

export function SizePicker({ product, value, onChange }: { product: Product; value?: string; onChange: (s: string) => void }) {
  const { t } = useI18n();
  const [chart, setChart] = useState(false);
  const sizes = product.sizes ?? [];
  if (!sizes.length) return null;
  const c = product.size_chart;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T w={700} size={14}>{t('size')}</T>
        {c?.rows?.length ? <Pressable onPress={() => setChart(!chart)}><T w={700} size={13} color={colors.brassText} style={{ textDecorationLine: 'underline' }}>{t('sizeChart')}</T></Pressable> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {sizes.map((s) => <Chip key={s} label={s} active={value === s} onPress={() => onChange(s)} />)}
      </View>
      {chart && c && (
        <View style={{ borderWidth: 1, borderColor: colors.champagne, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.goldSoft }}>
            <T w={700} size={12.5} style={{ flex: 1, padding: 8 }}>{t('size')}</T>
            {c.columns.map((k) => <T key={k} w={700} size={12.5} style={{ flex: 1, padding: 8 }}>{t(`m_${k}` as Key)} ({c.unit})</T>)}
          </View>
          {c.rows.map((r) => (
            <View key={String(r.size)} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.lineSoft }}>
              <T w={700} size={13} style={{ flex: 1, padding: 8 }}>{r.size}</T>
              {c.columns.map((k) => <T key={k} size={13} style={{ flex: 1, padding: 8 }}>{r[k] ?? '–'}</T>)}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function TailorConfigurator({ product, onAdd }: { product: Product; onAdd: (custom: LineCustom) => void }) {
  const wide = useWide();
  const { t, lang, currency } = useI18n();
  const { session } = useSession();
  const options = product.tailoring?.options ?? [];
  const garment: Garment = product.garment === 'abaya' ? 'abaya' : 'thobe';
  const [choices, setChoices] = useState<Record<string, string>>(() => Object.fromEntries(options.map((o) => [o.key, o.choices[0]?.id ?? ''])));
  const [step, setStep] = useState(0);                 // 0..options.length-1 design; options.length = measurements; +1 = summary
  const [values, setValues] = useState<Measurements>({});
  const [unit, setUnit] = useState<Unit>('cm');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileName, setProfileName] = useState('');
  const [usingProfile, setUsingProfile] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase.from('measurement_profiles').select('id, name, garment, measures').eq('garment', garment).order('updated_at', { ascending: false })
      .then(({ data }) => setProfiles((data as Profile[]) ?? []));
  }, [session?.user.id, garment]);

  const custom: LineCustom = { options: choices, measurements: values, profileName: profileName || undefined };
  const unitPrice = unitPriceWith(product, custom);
  const shownPrice = formatMoney(Math.round(priceIn({ ...product, base_price_sar: unitPrice, product_prices: [] }, currency)), currency, lang);
  const required = GARMENT_STEPS[garment].map((s) => s.key);
  const complete = required.every((k) => typeof values[k] === 'number');
  const designStep = step < options.length;
  const total = options.length + 2;

  async function saveProfile() {
    if (!session || !profileName.trim()) return;
    const existing = profiles.find((p) => p.name.toLowerCase() === profileName.trim().toLowerCase());
    const row = { name: profileName.trim().slice(0, 40), garment, measures: values, updated_at: new Date().toISOString() };
    const { error } = existing
      ? await supabase.from('measurement_profiles').update(row).eq('id', existing.id)
      : await supabase.from('measurement_profiles').insert(row);
    setMsg(error ? error.message : t('tmProfileSaved'));
  }

  const progress = (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: i <= step ? colors.gold : colors.line }} />)}
    </View>
  );

  return (
    <Card pad={wide ? 22 : 14} style={{ gap: 12, borderColor: colors.gold, borderRadius: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Serif size={wide ? 30 : 24}>{t('tmDesignYours')}</Serif>
        <T w={700} size={16} color={colors.navy}>{shownPrice}</T>
      </View>
      <T size={13} color={colors.muted}>{t('tmMadeIn')} {product.tailoring?.production_days ?? '–'} {t('tmDays')}</T>
      {progress}

      {designStep && options[step] ? (
        <View style={{ gap: 10 }}>
          <T w={700} size={15} color={colors.navy}>{step + 1}. {options[step].label[lang] || options[step].label.en}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {options[step].choices.map((c) => {
              const on = choices[options[step].key] === c.id;
              return (
                <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setChoices({ ...choices, [options[step].key]: c.id })}
                  style={{ width: wide ? 150 : '47%', borderWidth: on ? 2 : 1, borderColor: on ? colors.gold : colors.line, borderRadius: 14, padding: 8, gap: 6, backgroundColor: on ? colors.goldSoft : colors.white }}>
                  {c.image ? <Photo uri={c.image} ratio={1} tone={colors.white} style={{ borderRadius: 10 }} /> : null}
                  <T w={700} size={13.5}>{c.label[lang] || c.label.en}</T>
                  {c.price_minor ? <T size={12.5} color={colors.brassText}>+ {formatMoney(Math.round(priceIn({ ...product, base_price_sar: c.price_minor, product_prices: [] }, currency)), currency, lang)}</T> : <T size={12.5} color={colors.muted}>{t('tmIncluded')}</T>}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : step === options.length ? (
        <View style={{ gap: 10 }}>
          <T w={700} size={15} color={colors.navy}>{options.length + 1}. {t('tmMeasurements')}</T>
          {profiles.length > 0 && !measuring && (
            <View style={{ gap: 6 }}>
              <T size={13.5}>{t('tmUseSaved')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {profiles.map((p) => <Chip key={p.id} label={p.name} active={usingProfile === p.id} onPress={() => { setUsingProfile(p.id); setValues(p.measures); setProfileName(p.name); }} />)}
              </View>
            </View>
          )}
          {!measuring ? (
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14, alignItems: wide ? 'center' : 'stretch' }}>
              <View style={{ alignItems: 'center' }}><MeasureFigure garment={garment} size={wide ? 150 : 120} /></View>
              <View style={{ flex: 1, gap: 8 }}>
                <T size={14} lh={1.6} color={colors.body}>{t('tmMeasureIntro')}</T>
                <Button label={complete ? t('tmEditMeasurements') : t('tmStartMeasuring')} kind="secondary" onPress={() => setMeasuring(true)} icon={<Icon name="sparkle" size={16} />} />
                {complete && <T size={13} color={colors.success} w={600}>{t('tmMeasurementsReady')}</T>}
              </View>
            </View>
          ) : (
            <MeasureGuide garment={garment} values={values} onChange={(v) => { setValues(v); setUsingProfile(null); }} unit={unit} onUnitChange={setUnit} onDone={() => setMeasuring(false)} />
          )}
          {complete && session && !measuring && (
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: 8, alignItems: wide ? 'flex-end' : 'stretch' }}>
              <View style={{ flex: 1 }}><Field label={t('tmSaveAs')} value={profileName} onChangeText={setProfileName} placeholder={t('tmSaveAsHint')} maxLength={40} /></View>
              <Button label={t('save')} kind="secondary" size="sm" onPress={saveProfile} disabled={!profileName.trim()} style={{ marginBottom: 14 }} />
            </View>
          )}
          {!session && <T size={12.5} color={colors.muted}>{t('tmSignInToSave')}</T>}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <T w={700} size={15} color={colors.navy}>{t('tmSummary')}</T>
          {options.map((o) => {
            const c = o.choices.find((x) => x.id === choices[o.key]);
            return (
              <View key={o.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderColor: colors.lineSoft, paddingVertical: 6 }}>
                <T size={13.5} color={colors.muted}>{o.label[lang] || o.label.en}</T>
                <T size={13.5} w={600}>{c ? c.label[lang] || c.label.en : '–'}</T>
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <T size={13.5} color={colors.muted}>{t('tmMeasurements')}</T>
            <T size={13.5} w={600}>{complete ? (profileName || t('tmMeasured')) : t('tmMissing')}</T>
          </View>
          <Notice text={t('tmFinalNote')} />
        </View>
      )}

      {msg && <Notice tone="ok" text={msg} />}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {step > 0 && <Button label={t('back')} kind="secondary" onPress={() => { setStep(step - 1); setMeasuring(false); }} />}
        {step < total - 1 ? (
          <Button label={t('next')} onPress={() => setStep(step + 1)} disabled={step === options.length && !complete} />
        ) : (
          <Button label={`${t('addToBag')} · ${shownPrice}`} kind="gold" size="lg" disabled={!complete} onPress={() => onAdd(custom)} />
        )}
      </View>
    </Card>
  );
}
