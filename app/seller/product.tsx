// Seller product editor: details in English and Arabic, private photo uploads, modest-fashion options
// (ready-made sizes or tailor-made design choices), the AI guideline check, and submission for approval.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, Notice, Photo, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import {
  deleteListing, getListing, photoUrls, runGuidelineCheck, saveListing, slugify, submitForReview, uploadPhotos,
  type AiCheck, type Listing,
} from '@/lib/seller';
import { LISTING_TONE, useSeller } from '@/lib/seller-context';
import { supabase } from '@/lib/supabase';
import type { Category, SizeChart, Tailoring, TailoringOption } from '@/lib/types';
import { colors } from '@/theme';

type Form = {
  name_en: string; name_ar: string; description_en: string; description_ar: string; category_id: string | null;
  price: string; stock: string; weight_g: string; ship_class: Listing['ship_class']; images: string[];
  made_to_measure: boolean; garment: Listing['garment']; sizes: string[]; size_chart: SizeChart | null; tailoring: Tailoring | null;
};
const EMPTY: Form = {
  name_en: '', name_ar: '', description_en: '', description_ar: '', category_id: null, price: '', stock: '1', weight_g: '500',
  ship_class: 'standard', images: [], made_to_measure: false, garment: null, sizes: [], size_chart: null, tailoring: null,
};
const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '52', '54', '56', '58', '60', '62'];
const CHART_COLUMNS = ['chest', 'shoulder', 'sleeve', 'length'];
const OPTION_PRESETS: { key: string; en: string; ar: string }[] = [
  { key: 'fabric', en: 'Fabric and colour', ar: 'القماش واللون' },
  { key: 'collar', en: 'Collar', ar: 'الياقة' },
  { key: 'sleeve', en: 'Sleeve and cuff', ar: 'الكم والكبك' },
  { key: 'pocket', en: 'Pocket', ar: 'الجيب' },
  { key: 'buttons', en: 'Buttons and placket', ar: 'الأزرار والمرد' },
];

const toForm = (l: Listing): Form => ({
  name_en: l.name_en ?? '', name_ar: l.name_ar ?? '', description_en: l.description_en ?? '', description_ar: l.description_ar ?? '',
  category_id: l.category_id, price: l.base_price_sar ? (l.base_price_sar / 100).toFixed(2) : '', stock: String(l.stock ?? 0),
  weight_g: String(l.weight_g ?? 500), ship_class: l.ship_class ?? 'standard', images: l.images ?? [],
  made_to_measure: !!l.made_to_measure, garment: l.garment, sizes: l.sizes ?? [], size_chart: l.size_chart, tailoring: l.tailoring,
});

/** Web file picker (photos only). */
function PickPhotos({ onFiles, label, disabled }: { onFiles: (f: File[]) => void; label: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement | null>(null);
  if (Platform.OS !== 'web') return null;
  return (
    <View>
      {React.createElement('input', {
        ref, type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, style: { display: 'none' },
        onChange: (e: { target: HTMLInputElement }) => { const fl = Array.from(e.target.files ?? []); e.target.value = ''; if (fl.length) onFiles(fl); },
      })}
      <Button label={label} kind="secondary" size="sm" disabled={disabled} onPress={() => ref.current?.click()} icon={<Icon name="plus" size={16} />} />
    </View>
  );
}

export default function SellerProduct() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { me } = useSeller();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | undefined>(params.id);
  const [listing, setListing] = useState<Listing | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<string>(JSON.stringify(EMPTY));
  const [cats, setCats] = useState<Category[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'check' | 'submit' | 'upload' | 'delete' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    // Every category a seller may list in, including departments not live yet (e.g. fashion before its first product).
    supabase.from('categories').select('*').order('sort').then(({ data }) =>
      setCats(((data as (Category & { is_active: boolean })[]) ?? []).filter((c) => c.is_active || c.department === 'fashion' || ['bakhoor'].includes(c.slug))));
  }, []);
  async function load(pid: string) {
    const l = await getListing(pid);
    if (!l) return setMsg({ tone: 'warn', text: t('notFound') });
    setListing(l);
    const form = toForm(l);
    setF(form);
    setSaved(JSON.stringify(form));
    const paths = [...form.images, ...(form.tailoring?.options ?? []).flatMap((o) => o.choices.map((c) => c.image).filter(Boolean) as string[])];
    setUrls(await photoUrls(paths));
  }
  useEffect(() => { if (id) load(id).catch((e) => setMsg({ tone: 'warn', text: String(e.message ?? e) })); }, [id]);

  const dirty = JSON.stringify(f) !== saved;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const cat = cats.find((c) => c.id === f.category_id);
  const fashion = cat?.department === 'fashion';
  const status = listing?.listing_status ?? 'draft';
  const check: AiCheck | null = !dirty ? listing?.ai_check ?? null : null;
  const canSubmit = !!id && !dirty && !!check && check.verdict !== 'block' && (status === 'draft' || status === 'rejected') && me.seller.status === 'approved';

  async function save(): Promise<string | undefined> {
    setMsg(null);
    const price = Math.round(Number(f.price.replace(',', '.')) * 100);
    if (!f.name_en.trim()) { setMsg({ tone: 'warn', text: t('pfNameRequired') }); return; }
    if (!f.category_id) { setMsg({ tone: 'warn', text: t('pfCategoryRequired') }); return; }
    if (!(price > 0)) { setMsg({ tone: 'warn', text: t('pfPriceRequired') }); return; }
    if (f.made_to_measure && !(f.tailoring?.production_days && f.tailoring.production_days > 0)) { setMsg({ tone: 'warn', text: t('pfDaysRequired') }); return; }
    setBusy('save');
    try {
      const pid = await saveListing(me.seller.slug, {
        id, seller_id: me.seller.id, name_en: f.name_en.trim(), name_ar: f.name_ar.trim(), description_en: f.description_en.trim() || null,
        description_ar: f.description_ar.trim() || null, category_id: f.category_id, base_price_sar: price,
        stock: Math.max(0, Math.floor(Number(f.stock) || 0)), weight_g: Math.max(1, Math.floor(Number(f.weight_g) || 500)),
        ship_class: f.ship_class, images: f.images, made_to_measure: fashion ? f.made_to_measure : false,
        garment: fashion ? f.garment : null, sizes: fashion && !f.made_to_measure ? f.sizes : null,
        size_chart: fashion && !f.made_to_measure ? f.size_chart : null, tailoring: fashion && f.made_to_measure ? f.tailoring : null,
        is_active: true,
      });
      if (!id) { setId(pid); router.setParams({ id: pid }); } else await load(pid);
      setMsg({ tone: 'ok', text: t('pfSaved') });
      return pid;
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function runCheck() {
    let pid = id;
    if (!pid || dirty) pid = await save();
    if (!pid) return;
    setBusy('check');
    setMsg({ tone: 'info', text: t('pfChecking') });
    try {
      await runGuidelineCheck(pid);
      await load(pid);
      setMsg(null);
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!id) return;
    setBusy('submit');
    try {
      await submitForReview(id);
      await load(id);
      setMsg({ tone: 'ok', text: t('pfSubmitted') });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function addPhotos(files: File[]) {
    if (f.images.length + files.length > 8) return setMsg({ tone: 'warn', text: t('pfMaxPhotos') });
    setBusy('upload');
    try {
      const paths = await uploadPhotos(me.seller.id, files);
      set('images', [...f.images, ...paths]);
      setUrls({ ...urls, ...(await photoUrls(paths)) });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  const movePhoto = (i: number, d: -1 | 1) => {
    const a = [...f.images]; const j = i + d; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; set('images', a);
  };

  // ---------- tailoring options
  const tailoring: Tailoring = f.tailoring ?? { production_days: 10, options: [] };
  const setTailoring = (tl: Tailoring) => set('tailoring', tl);
  const setOption = (i: number, o: TailoringOption) => setTailoring({ ...tailoring, options: tailoring.options.map((x, j) => (j === i ? o : x)) });
  const addOption = (preset?: (typeof OPTION_PRESETS)[number]) => setTailoring({
    ...tailoring,
    options: [...tailoring.options, { key: preset?.key ?? `opt-${tailoring.options.length + 1}`, label: { en: preset?.en ?? '', ar: preset?.ar ?? '' }, choices: [] }],
  });
  async function choiceImage(oi: number, ci: number, files: File[]) {
    setBusy('upload');
    try {
      const [path] = await uploadPhotos(me.seller.id, files.slice(0, 1));
      const o = tailoring.options[oi];
      setOption(oi, { ...o, choices: o.choices.map((c, j) => (j === ci ? { ...c, image: path } : c)) });
      setUrls({ ...urls, ...(await photoUrls([path])) });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  // ---------- size chart
  const chart: SizeChart = f.size_chart ?? { unit: 'cm', columns: CHART_COLUMNS, rows: [] };
  const chartRows = useMemo(() => f.sizes.map((s) => chart.rows.find((r) => r.size === s) ?? { size: s }), [f.sizes, chart.rows]);
  const setChartCell = (size: string, col: string, v: string) => {
    const rows = chartRows.map((r) => (r.size === size ? { ...r, [col]: v.replace(/[^\d.]/g, '') } : r));
    set('size_chart', { ...chart, rows });
  };

  const section = (title: string, children: React.ReactNode, hint?: string) => (
    <Card pad={wide ? 22 : 14} style={{ gap: 8, borderRadius: 18 }}>
      <T w={700} size={16} color={colors.navy}>{title}</T>
      {hint ? <T size={13} color={colors.muted} lh={1.5}>{hint}</T> : null}
      {children}
    </Card>
  );
  const row = (children: React.ReactNode) => <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 0 }}>{children}</View>;
  const col = (children: React.ReactNode) => <View style={{ flex: 1 }}>{children}</View>;

  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Product | Seller | Al Mukarramah" description="Seller product editor." path="/seller/product" noindex />
      <Button label={`${lang === 'ar' ? '→' : '←'} ${t('sdProducts')}`} kind="text" href="/seller/products" style={{ alignSelf: 'flex-start' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Serif role="h1" size={wide ? 38 : 28}>{id ? (f.name_en || t('pfUntitled')) : t('sdAddProduct')}</Serif>
        <Tag label={t(`listing_${status}` as Key)} tone={LISTING_TONE[status]} />
        {dirty && <Tag label={t('pfUnsaved')} tone="warn" />}
      </View>
      {status === 'approved' && <Notice text={t('pfLiveEditNote')} />}
      {status === 'pending_review' && <Notice text={t('pfWaitingNote')} />}
      {status === 'rejected' && listing?.review_note ? <Notice tone="warn" text={`${t('pfRejectedNote')} ${listing.review_note}`} /> : null}

      <View style={{ gap: 14, marginTop: 8 }}>
        {section(t('pfBasics'), <>
          {row(<>{col(<Field label={`${t('pfNameEn')} *`} value={f.name_en} onChangeText={(v) => set('name_en', v)} maxLength={120} />)}
            {col(<Field label={t('pfNameAr')} value={f.name_ar} onChangeText={(v) => set('name_ar', v)} maxLength={120} style={{ writingDirection: 'rtl', textAlign: 'right' }} />)}</>)}
          <T w={600} size={13}>{t('pfCategory')} *</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {cats.map((c) => <Chip key={c.id} size="sm" label={lang === 'ar' ? c.name_ar : c.name_en} active={f.category_id === c.id} onPress={() => set('category_id', c.id)} />)}
          </View>
          {row(<>{col(<Field label={`${t('pfPrice')} *`} value={f.price} onChangeText={(v) => set('price', v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" hint={t('pfPriceHint')} dirLtr />)}
            {col(<Field label={t('sdStock')} value={f.stock} onChangeText={(v) => set('stock', v.replace(/\D/g, ''))} keyboardType="number-pad" dirLtr />)}
            {col(<Field label={t('pfWeight')} value={f.weight_g} onChangeText={(v) => set('weight_g', v.replace(/\D/g, ''))} keyboardType="number-pad" hint={t('pfWeightHint')} dirLtr />)}</>)}
          <T w={600} size={13}>{t('pfShipClass')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['standard', 'perfume_oil', 'perfume_spray'] as const).map((k) => <Chip key={k} size="sm" label={t(`ship_${k}` as Key)} active={f.ship_class === k} onPress={() => set('ship_class', k)} />)}
          </View>
        </>)}

        {section(t('pfDescription'), <>
          <Field label={t('pfDescEn')} value={f.description_en} onChangeText={(v) => set('description_en', v)} multiline maxLength={4000} hint={t('pfDescHint')} />
          <Field label={t('pfDescAr')} value={f.description_ar} onChangeText={(v) => set('description_ar', v)} multiline maxLength={4000} style={{ writingDirection: 'rtl', textAlign: 'right' }} />
        </>)}

        {section(t('pfPhotos'), <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {f.images.map((p, i) => (
              <View key={p} style={{ width: 120, gap: 4 }}>
                <Photo uri={urls[p]} ratio={1} tone={colors.sandSoft} style={{ borderRadius: 12, borderWidth: i === 0 ? 2 : 1, borderColor: i === 0 ? colors.gold : colors.line }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Pressable accessibilityLabel="←" onPress={() => movePhoto(i, -1)} style={{ padding: 6 }}><Icon name="chevronLeft" size={16} /></Pressable>
                  <Pressable accessibilityLabel={t('remove')} onPress={() => set('images', f.images.filter((x) => x !== p))} style={{ padding: 6 }}><Icon name="close" size={16} color={colors.danger} /></Pressable>
                  <Pressable accessibilityLabel="→" onPress={() => movePhoto(i, 1)} style={{ padding: 6 }}><Icon name="chevronRight" size={16} /></Pressable>
                </View>
                {check?.issues.some((x) => x.photo === i + 1) ? <Tag label={t('pfPhotoFlagged')} tone="err" /> : null}
              </View>
            ))}
          </View>
          <PickPhotos label={busy === 'upload' ? t('pfUploading') : t('pfAddPhotos')} disabled={busy === 'upload' || f.images.length >= 8} onFiles={addPhotos} />
          {Platform.OS !== 'web' && <T size={13} color={colors.muted}>{t('pfPhotosOnWeb')}</T>}
        </>, t('pfPhotosHint'))}

        {fashion && section(t('pfFashion'), <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label={t('readyMade')} active={!f.made_to_measure} onPress={() => set('made_to_measure', false)} />
            <Chip label={t('tailorMade')} active={f.made_to_measure} onPress={() => { set('made_to_measure', true); if (!f.tailoring) set('tailoring', { production_days: 10, options: [] }); }} />
          </View>
          <T w={600} size={13} style={{ marginTop: 6 }}>{t('pfGarment')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['thobe', 'abaya', 'other'] as const).map((g) => <Chip key={g} size="sm" label={t(`garment_${g}` as Key)} active={f.garment === g} onPress={() => set('garment', g)} />)}
          </View>

          {!f.made_to_measure ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <T w={600} size={13}>{t('pfSizes')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {SIZE_PRESETS.map((s) => <Chip key={s} size="sm" label={s} active={f.sizes.includes(s)} onPress={() => set('sizes', f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s])} />)}
              </View>
              {f.sizes.length > 0 && (
                <View style={{ gap: 6, marginTop: 6 }}>
                  <T w={600} size={13}>{t('pfSizeChart')}</T>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <T w={700} size={12} style={{ width: 54 }}>{t('size')}</T>
                    {CHART_COLUMNS.map((c) => <T key={c} w={700} size={12} style={{ flex: 1 }}>{t(`m_${c}` as Key)}</T>)}
                  </View>
                  {chartRows.map((r) => (
                    <View key={String(r.size)} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <T w={700} size={13} style={{ width: 54 }}>{r.size}</T>
                      {CHART_COLUMNS.map((c) => (
                        <View key={c} style={{ flex: 1 }}>
                          <Field label="" value={String(r[c] ?? '')} onChangeText={(v) => setChartCell(String(r.size), c, v)} keyboardType="decimal-pad" placeholder="cm" dirLtr />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              <Field label={`${t('pfProductionDays')} *`} value={String(tailoring.production_days || '')} onChangeText={(v) => setTailoring({ ...tailoring, production_days: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" hint={t('pfProductionDaysHint')} dirLtr />
              <T w={600} size={13}>{t('pfDesignOptions')}</T>
              <T size={12.5} color={colors.muted}>{t('pfDesignOptionsHint')}</T>
              {tailoring.options.map((o, oi) => (
                <Card key={oi} pad={12} style={{ gap: 6, borderColor: colors.champagne, backgroundColor: colors.ivory }}>
                  {row(<>{col(<Field label={t('pfOptionNameEn')} value={o.label.en} onChangeText={(v) => setOption(oi, { ...o, label: { ...o.label, en: v }, key: o.key.startsWith('opt-') && v ? slugify(v) || o.key : o.key })} />)}
                    {col(<Field label={t('pfOptionNameAr')} value={o.label.ar} onChangeText={(v) => setOption(oi, { ...o, label: { ...o.label, ar: v } })} style={{ writingDirection: 'rtl', textAlign: 'right' }} />)}</>)}
                  {o.choices.map((c, ci) => (
                    <View key={ci} style={{ flexDirection: wide ? 'row' : 'column', gap: 8, alignItems: wide ? 'flex-end' : 'stretch', borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}>
                      <View style={{ width: 64 }}>
                        <Photo uri={c.image ? urls[c.image] : undefined} ratio={1} tone={colors.white} style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.line }} />
                        <PickPhotos label={t('pfPicture')} onFiles={(fl) => choiceImage(oi, ci, fl)} />
                      </View>
                      <View style={{ flex: 1 }}><Field label={t('pfChoiceEn')} value={c.label.en} onChangeText={(v) => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, label: { ...x.label, en: v }, id: x.id || slugify(v) } : x)) })} /></View>
                      <View style={{ flex: 1 }}><Field label={t('pfChoiceAr')} value={c.label.ar} onChangeText={(v) => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, label: { ...x.label, ar: v } } : x)) })} style={{ writingDirection: 'rtl', textAlign: 'right' }} /></View>
                      <View style={{ width: wide ? 120 : undefined }}><Field label={t('pfAddOn')} value={c.price_minor ? (c.price_minor / 100).toString() : ''} placeholder="0" onChangeText={(v) => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, price_minor: Math.round((Number(v.replace(/[^\d.]/g, '')) || 0) * 100) } : x)) })} keyboardType="decimal-pad" dirLtr /></View>
                      <Button label={t('remove')} kind="text" size="sm" onPress={() => setOption(oi, { ...o, choices: o.choices.filter((_, j) => j !== ci) })} />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                    <Button label={t('pfAddChoice')} kind="secondary" size="sm" onPress={() => setOption(oi, { ...o, choices: [...o.choices, { id: `c${Date.now().toString(36)}`, label: { en: '', ar: '' }, price_minor: 0 }] })} />
                    <Button label={t('pfRemoveOption')} kind="text" size="sm" onPress={() => setTailoring({ ...tailoring, options: tailoring.options.filter((_, j) => j !== oi) })} />
                  </View>
                </Card>
              ))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {OPTION_PRESETS.filter((p) => !tailoring.options.some((o) => o.key === p.key)).map((p) => (
                  <Chip key={p.key} size="sm" label={`+ ${lang === 'ar' ? p.ar : p.en}`} onPress={() => addOption(p)} />
                ))}
                <Chip size="sm" label={`+ ${t('pfOtherOption')}`} onPress={() => addOption()} />
              </View>
              <Notice text={t('pfMeasureNote')} />
            </View>
          )}
        </>)}

        {/* AI guideline check and submission */}
        <Card pad={wide ? 22 : 14} style={{ gap: 10, borderRadius: 18, backgroundColor: colors.night, borderColor: colors.gold }}>
          <T w={700} size={16} color={colors.goldBright}>{t('pfCheckTitle')}</T>
          <T size={13.5} lh={1.55} color={colors.onNight}>{t('pfCheckBody')}</T>
          {check ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Tag label={t(`ai_${check.verdict}` as Key)} tone={check.verdict === 'block' ? 'err' : check.verdict === 'pass' ? 'ok' : 'warn'} />
                <T size={14} color={colors.white} style={{ flex: 1 }}>{lang === 'ar' ? check.summary_ar : check.summary_en}</T>
              </View>
              {check.issues.map((x, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.nightSoft, borderRadius: 10, padding: 10 }}>
                  <Icon name={x.severity === 'block' ? 'close' : x.severity === 'fix' ? 'help' : 'check'} size={16} color={x.severity === 'block' ? '#FF9B90' : colors.goldBright} />
                  <T size={13.5} lh={1.5} color={colors.white} style={{ flex: 1 }}>{x.photo ? `${t('pfPhoto')} ${x.photo}: ` : ''}{lang === 'ar' ? x.ar : x.en}</T>
                </View>
              ))}
              {check.suggested_ar && (check.suggested_ar.name || check.suggested_ar.description) ? (
                <View style={{ gap: 6, borderWidth: 1, borderColor: colors.goldLine, borderRadius: 10, padding: 10 }}>
                  <T w={700} size={13} color={colors.goldBright}>{t('pfSuggestedAr')}</T>
                  {check.suggested_ar.name ? <T size={14} color={colors.white} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{check.suggested_ar.name}</T> : null}
                  {check.suggested_ar.description ? <T size={13} color={colors.onNight} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{check.suggested_ar.description}</T> : null}
                  <Button label={t('pfUseArabic')} kind="outlineLight" size="sm" style={{ alignSelf: 'flex-start' }}
                    onPress={() => setF((x) => ({ ...x, name_ar: check.suggested_ar?.name || x.name_ar, description_ar: check.suggested_ar?.description || x.description_ar }))} />
                </View>
              ) : null}
            </View>
          ) : (
            <T size={13} color={colors.champagne}>{dirty && listing?.ai_check ? t('pfCheckAgain') : t('pfNotChecked')}</T>
          )}
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, marginTop: 4 }}>
            <Button label={t('pfSaveDraft')} kind="outlineLight" busy={busy === 'save'} onPress={save} />
            <Button label={t('pfRunCheck')} kind="gold" busy={busy === 'check'} onPress={runCheck} disabled={me.seller.status !== 'approved'} />
            <Button label={t('pfSubmit')} kind="gold" busy={busy === 'submit'} onPress={submit} disabled={!canSubmit} />
          </View>
          {check?.verdict === 'block' && <T size={13} color="#FFB4AA">{t('pfBlockedNote')}</T>}
        </Card>

        {msg && <Notice tone={msg.tone === 'info' ? 'info' : msg.tone} text={msg.text} />}

        {id && (status === 'draft' || status === 'rejected') && (
          confirmDelete ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <T size={14}>{t('pfDeleteConfirm')}</T>
              <Button label={t('pfDeleteYes')} kind="danger" size="sm" busy={busy === 'delete'} onPress={async () => { setBusy('delete'); try { await deleteListing(id); router.replace('/seller/products'); } catch (e) { setMsg({ tone: 'warn', text: String((e as Error).message) }); setBusy(null); } }} />
              <Button label={t('cancel')} kind="text" size="sm" onPress={() => setConfirmDelete(false)} />
            </View>
          ) : <Button label={t('pfDelete')} kind="text" onPress={() => setConfirmDelete(true)} style={{ alignSelf: 'flex-start' }} />
        )}
      </View>
    </Screen>
  );
}
