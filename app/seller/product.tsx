// Seller listing form. The category comes first and drives everything: the details to give, the documents, the photo
// rules, returns and shipping limits. Photos are screened as they are uploaded (private, metadata removed). A live
// quality score shows what to fix; on submission the server checks the premium standard and runs the AI screening:
// listings that need changes come straight back here with reasons in English and Arabic; the rest go to our team.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { CountryPicker } from '@/components/country';
import { Examples } from '@/components/guidelines';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, Notice, Photo, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import {
  attributesOf, departments, guidanceOf, leavesUnder, MARKET_DEMO, pathOf, useGuidance,
  type CategoryAttribute, type CategoryNode,
} from '@/lib/market';
import {
  categoryRequirements, deleteListing, draftTranslation, getListing, mediaFor, photoUrls, productDocuments, saveListing, submitListing,
  uploadMedia, uploadProductDocument, type AiCheck, type ListingDecision, type Listing, type MediaAsset, type ProductDocument, type Reason,
} from '@/lib/seller';
import { LISTING_TONE, useSeller } from '@/lib/seller-context';
import { slugify } from '@/lib/seller';
import type { SizeChart, Tailoring, TailoringOption } from '@/lib/types';
import { colors } from '@/theme';
import { scoreListing } from '../../supabase/functions/_shared/quality';

type Form = {
  name_en: string; name_ar: string; description_en: string; description_ar: string; category_id: string | null;
  price: string; stock: string; weight_g: string; images: string[]; attributes: Record<string, unknown>;
  made_to_measure: boolean; garment_style: string | null; sizes: string[]; size_chart: SizeChart | null; tailoring: Tailoring | null;
  hs_code: string; origin_country: string;
};
const EMPTY: Form = {
  name_en: '', name_ar: '', description_en: '', description_ar: '', category_id: null, price: '', stock: '1', weight_g: '500', images: [],
  attributes: {}, made_to_measure: false, garment_style: null, sizes: [], size_chart: null, tailoring: null, hs_code: '', origin_country: '',
};
const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '52', '54', '56', '58', '60', '62'];
const CHART_COLUMNS = ['chest', 'shoulder', 'sleeve', 'length'];
const MAX_PHOTOS = 10;

type Extra = Listing & { garment_style?: string | null; hs_code?: string | null; origin_country?: string | null };
const toForm = (l: Extra): Form => ({
  name_en: l.name_en ?? '', name_ar: l.name_ar ?? '', description_en: l.description_en ?? '', description_ar: l.description_ar ?? '',
  category_id: l.category_id, price: l.base_price_sar ? (l.base_price_sar / 100).toFixed(2) : '', stock: String(l.stock ?? 0),
  weight_g: String(l.weight_g ?? 500), images: l.images ?? [], attributes: l.attributes ?? {}, made_to_measure: !!l.made_to_measure,
  garment_style: l.garment_style ?? l.tailoring?.style ?? null, sizes: l.sizes ?? [], size_chart: l.size_chart, tailoring: l.tailoring,
  hs_code: l.hs_code ?? '', origin_country: l.origin_country ?? '',
});
/** The parcel type follows the category: alcohol-based sprays are dangerous goods; oils and everything else are not. */
const shipClassFor = (path: CategoryNode[]) => (path.some((c) => c.slug === 'perfumes') ? 'perfume_spray' : path.some((c) => ['attar', 'oud-oils'].includes(c.slug)) ? 'perfume_oil' : 'standard');

/** Web file picker. */
function PickFiles({ onFiles, label, disabled, accept = 'image/jpeg,image/png,image/webp', multiple = true }: { onFiles: (f: File[]) => void; label: string; disabled?: boolean; accept?: string; multiple?: boolean }) {
  const ref = useRef<HTMLInputElement | null>(null);
  if (Platform.OS !== 'web') return null;
  return (
    <View>
      {React.createElement('input', {
        ref, type: 'file', accept, multiple, style: { display: 'none' },
        onChange: (e: { target: HTMLInputElement }) => { const fl = Array.from(e.target.files ?? []); e.target.value = ''; if (fl.length) onFiles(fl); },
      })}
      <Button label={label} kind="secondary" size="sm" disabled={disabled} onPress={() => ref.current?.click()} icon={<Icon name="plus" size={16} />} />
    </View>
  );
}

const STATUS_TONE = { pending: 'info', passed: 'ok', review: 'warn', rejected: 'err', blocked: 'err' } as const;

export default function SellerProduct() {
  const wide = useWide();
  const { t, lang, isRTL } = useI18n();
  const { me } = useSeller();
  const g = useGuidance();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | undefined>(params.id);
  const [listing, setListing] = useState<Extra | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<string>(JSON.stringify(EMPTY));
  const [media, setMedia] = useState<Record<string, MediaAsset>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<{ name: string; reasons: Reason[] }[]>([]);
  const [docs, setDocs] = useState<ProductDocument[]>([]);
  const [live, setLive] = useState<{ attributes: CategoryAttribute[] } | null>(null);
  const [decision, setDecision] = useState<ListingDecision | AiCheck | null>(null);
  const [busy, setBusy] = useState<'save' | 'submit' | 'upload' | 'delete' | 'draft' | 'doc' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const [draft, setDraft] = useState<{ to: 'ar' | 'en'; name: string; description: string; quran: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dept, setDept] = useState<string | null>(null);

  async function load(pid: string) {
    const l = (await getListing(pid)) as Extra | null;
    if (!l) return setMsg({ tone: 'warn', text: t('notFound') });
    setListing(l);
    const form = toForm(l);
    setF(form);
    setSaved(JSON.stringify(form));
    setDecision(l.ai_check);
    const paths = [...form.images, ...(form.tailoring?.options ?? []).flatMap((o) => o.choices.map((c) => c.image).filter(Boolean) as string[])];
    const [m, u, d] = await Promise.all([mediaFor(form.images), photoUrls(paths), productDocuments(pid)]);
    setMedia(m); setUrls(u); setDocs(d);
  }
  useEffect(() => { if (id) load(id).catch((e) => setMsg({ tone: 'warn', text: String(e.message ?? e) })); }, [id]);

  const cat = g.categories.find((c) => c.id === f.category_id) ?? null;
  const path = cat ? pathOf(g, cat) : [];
  useEffect(() => { if (cat) setDept(path[0]?.id ?? null); }, [cat?.id]);
  useEffect(() => { if (f.category_id) categoryRequirements(f.category_id).then((r) => setLive(r)).catch(() => setLive(null)); else setLive(null); }, [f.category_id]);
  const attrs = live?.attributes ?? (cat ? attributesOf(g, cat) : []);
  const policy = cat?.policy ?? null;
  const fashion = cat?.department === 'fashion';
  const dirty = JSON.stringify(f) !== saved;
  const status = listing?.listing_status ?? 'draft';
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setAttr = (k: string, v: unknown) => setF((x) => ({ ...x, attributes: { ...x.attributes, [k]: v } }));
  const editable = !['check_pending', 'suspended'].includes(status) && !MARKET_DEMO;

  // ---------- the live quality score (the server recomputes it on submission)
  const quality = useMemo(() => scoreListing({
    nameEn: f.name_en, nameAr: f.name_ar, descriptionEn: f.description_en, descriptionAr: f.description_ar,
    priceMinor: Math.round(Number(f.price.replace(',', '.')) * 100) || 0,
    photos: f.images.map((p) => ({ longSidePx: media[p]?.width && media[p]?.height ? Math.max(media[p].width!, media[p].height!) : null, status: media[p]?.status ?? 'pending', flags: (media[p]?.flags ?? []) as never })),
    attributes: f.attributes, categoryAttributes: attrs.map((a) => ({ key: a.key, label_en: a.label_en, label_ar: a.label_ar, type: a.type, required: a.required })),
    policy: { min_photos: policy?.min_photos ?? 3, min_long_side_px: policy?.min_long_side_px ?? 1600, min_price_minor: policy?.min_price_minor ?? null,
      min_shelf_days: policy?.min_shelf_days ?? null, required_documents: policy?.required_documents ?? [], allow_made_to_measure: policy?.allow_made_to_measure },
    documents: docs.filter((d) => d.status !== 'rejected').map((d) => d.doc_type), madeToMeasure: f.made_to_measure,
    tailoring: f.made_to_measure ? { ...(f.tailoring ?? { production_days: 0, options: [] }), style: f.garment_style ?? undefined } : null,
    weights: g.settings.quality_weights, minScore: g.settings.min_quality_score,
  }), [f, media, attrs, policy, docs, g.settings]);

  async function save(): Promise<string | undefined> {
    setMsg(null);
    const price = Math.round(Number(f.price.replace(',', '.')) * 100);
    if (!f.category_id || !cat?.listable) { setMsg({ tone: 'warn', text: t('pfCategoryRequired') }); return; }
    if (!f.name_en.trim()) { setMsg({ tone: 'warn', text: t('pfNameRequired') }); return; }
    if (!(price > 0)) { setMsg({ tone: 'warn', text: t('pfPriceRequired') }); return; }
    if (f.hs_code && !/^\d{6,12}$/.test(f.hs_code)) { setMsg({ tone: 'warn', text: t('lfHsCodeInvalid') }); return; }
    setBusy('save');
    try {
      const tailoring = fashion && f.made_to_measure ? { ...(f.tailoring ?? { production_days: 0, options: [] }), style: f.garment_style ?? undefined } : null;
      const pid = await saveListing(me.seller.slug, {
        id, seller_id: me.seller.id, name_en: f.name_en.trim(), name_ar: f.name_ar.trim(), description_en: f.description_en.trim() || null,
        description_ar: f.description_ar.trim() || null, category_id: f.category_id, base_price_sar: price,
        stock: Math.max(0, Math.floor(Number(f.stock) || 0)), weight_g: Math.max(1, Math.floor(Number(f.weight_g) || 500)),
        ship_class: shipClassFor(path) as Listing['ship_class'], images: f.images, attributes: f.attributes,
        made_to_measure: fashion ? f.made_to_measure : false, garment: fashion ? (g.styles.find((s) => s.code === f.garment_style)?.garment ?? null) : null,
        sizes: fashion && !f.made_to_measure ? f.sizes : null, size_chart: fashion && !f.made_to_measure ? f.size_chart : null, tailoring,
        ...({ garment_style: fashion && f.made_to_measure ? f.garment_style : null, hs_code: f.hs_code.replace(/\D/g, '') || null, origin_country: f.origin_country || null } as object),
        is_active: true,
      } as Partial<Listing> & { seller_id: string });
      if (!id) { setId(pid); router.setParams({ id: pid }); } else await load(pid);
      setMsg({ tone: 'ok', text: t('pfSaved') });
      return pid;
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    let pid = id;
    if (!pid || dirty) pid = await save();
    if (!pid) return;
    setBusy('submit');
    setMsg({ tone: 'info', text: t('lfSubmitting') });
    try {
      const r = await submitListing(pid);
      await load(pid);
      if (r.decision) setDecision(r.decision);
      setMsg(!r.submitted ? { tone: 'warn', text: t('lfNotYet') } : r.status === 'rejected' ? { tone: 'warn', text: t('lfDecision_block') }
        : r.status === 'pending_review' ? { tone: 'ok', text: t('pfSubmitted') } : { tone: 'info', text: t('lfDecision_error') });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function addPhotos(files: File[]) {
    if (f.images.length + files.length > MAX_PHOTOS) return setMsg({ tone: 'warn', text: t('lfMaxPhotos') });
    setBusy('upload');
    const out: { name: string; reasons: Reason[] }[] = [];
    try {
      for (const file of files) {
        const r = await uploadMedia(me.seller.id, file, 'listing_photo', { productId: id, categoryId: f.category_id ?? undefined });
        if (r.asset?.path && !['rejected', 'blocked'].includes(r.asset.status)) {
          const a = r.asset;
          setF((x) => ({ ...x, images: x.images.includes(a.path!) ? x.images : [...x.images, a.path!] }));
          setMedia((m) => ({ ...m, [a.path!]: a }));
          const u = await photoUrls([a.path!]);
          setUrls((x) => ({ ...x, ...u }));
        } else {
          out.push({ name: file.name, reasons: r.reasons });
        }
      }
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRefused(out);
      setBusy(null);
    }
  }
  const movePhoto = (i: number, d: -1 | 1) => {
    const a = [...f.images]; const j = i + d; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; set('images', a);
  };

  async function draftFrom(to: 'ar' | 'en') {
    setBusy('draft');
    try {
      const r = await draftTranslation(me.seller.id, to, to === 'ar' ? f.name_en : f.name_ar, to === 'ar' ? f.description_en : f.description_ar);
      setDraft({ to, name: r.name, description: r.description, quran: r.quran_text_present });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  const applyDraft = (d: { name?: string; description?: string }, to: 'ar' | 'en') =>
    setF((x) => ({ ...x, ...(to === 'ar' ? { name_ar: d.name || x.name_ar, description_ar: d.description || x.description_ar } : { name_en: d.name || x.name_en, description_en: d.description || x.description_en }) }));

  async function addDocument(docType: string, files: File[]) {
    if (!id) { setMsg({ tone: 'warn', text: t('lfSaveFirst') }); return; }
    setBusy('doc');
    try { await uploadProductDocument(me.seller.id, id, docType, files[0]); setDocs(await productDocuments(id)); }
    catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  }

  // ---------- made to measure (the tailoring seam: no measurement keys are fixed here; each brand declares its own)
  const tailoring: Tailoring = f.tailoring ?? { production_days: 0, options: [], measurements: [] };
  const setTailoring = (tl: Tailoring) => set('tailoring', tl);
  const setOption = (i: number, o: TailoringOption) => setTailoring({ ...tailoring, options: tailoring.options.map((x, j) => (j === i ? o : x)) });
  const measurements = tailoring.measurements ?? [];
  const style = g.styles.find((s) => s.code === f.garment_style);
  const chart: SizeChart = f.size_chart ?? { unit: 'cm', columns: CHART_COLUMNS, rows: [] };
  const chartRows = f.sizes.map((s) => chart.rows.find((r) => r.size === s) ?? { size: s });
  const setChartCell = (size: string, col: string, v: string) =>
    set('size_chart', { ...chart, rows: chartRows.map((r) => (r.size === size ? { ...r, [col]: v.replace(/[^\d.]/g, '') } : r)) });

  const section = (title: string, children: React.ReactNode, hint?: string) => (
    <Card pad={wide ? 24 : 16} style={{ gap: 10 }}>
      <Serif size={wide ? 24 : 21}>{title}</Serif>
      {hint ? <T size={13} color={colors.muted} lh={1.55}>{hint}</T> : null}
      {children}
    </Card>
  );
  const row = (children: React.ReactNode) => <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 0 }}>{children}</View>;
  const col = (children: React.ReactNode) => <View style={{ flex: 1 }}>{children}</View>;
  const rtl = { writingDirection: 'rtl' as const, textAlign: 'right' as const };
  const label = (a: CategoryAttribute) => `${lang === 'ar' ? a.label_ar : a.label_en}${a.unit ? ` (${a.unit})` : ''}${a.required ? ' *' : ''}`;

  const attrInput = (a: CategoryAttribute) => {
    const v = f.attributes[a.key];
    if (a.type === 'select' || a.type === 'multiselect') {
      const list = Array.isArray(v) ? (v as string[]) : [];
      return (
        <View key={a.key} style={{ gap: 6, marginBottom: 12 }}>
          <T w={500} size={12.5} color={colors.body}>{label(a)}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(a.options ?? []).map((o) => (
              <Chip key={o.value} size="sm" label={lang === 'ar' ? o.ar : o.en} active={a.type === 'select' ? v === o.value : list.includes(o.value)}
                onPress={() => setAttr(a.key, a.type === 'select' ? o.value : list.includes(o.value) ? list.filter((x) => x !== o.value) : [...list, o.value])} />
            ))}
          </View>
        </View>
      );
    }
    if (a.type === 'boolean') {
      return (
        <View key={a.key} style={{ gap: 6, marginBottom: 12 }}>
          <T w={500} size={12.5} color={colors.body}>{label(a)}</T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip size="sm" label={t('lfYes')} active={v === true} onPress={() => setAttr(a.key, true)} />
            <Chip size="sm" label={t('lfNo')} active={v === false} onPress={() => setAttr(a.key, false)} />
          </View>
        </View>
      );
    }
    if (a.type === 'country') {
      return <View key={a.key} style={{ marginBottom: 4 }}><CountryPicker label={label(a)} value={String(v ?? '')} onChange={(c) => setAttr(a.key, c)} /></View>;
    }
    return (
      <Field key={a.key} label={label(a)} value={v === undefined || v === null ? '' : String(v)} multiline={a.type === 'textarea'}
        keyboardType={a.type === 'number' ? 'decimal-pad' : 'default'} placeholder={a.type === 'date' ? 'YYYY-MM-DD' : undefined}
        dirLtr={a.type === 'number' || a.type === 'date'} maxLength={a.max_length ?? (a.type === 'textarea' ? 2000 : 200)}
        onChangeText={(x) => setAttr(a.key, a.type === 'number' ? (x.trim() === '' ? null : Number(x.replace(',', '.').replace(/[^\d.]/g, '')) || 0) : x)} />
    );
  };

  // ---------- the side panel: score, what to fix, the last decision and submission
  const shown = decision && !dirty ? decision : null;
  const required = quality.tips.filter((x) => x.level === 'required');
  const improve = quality.tips.filter((x) => x.level === 'improve');
  const reasonList = (list: Reason[], tone: 'err' | 'info') => list.map((x, i) => (
    <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Icon name={tone === 'err' ? 'close' : 'help'} size={15} color={tone === 'err' ? colors.danger : colors.brass} stroke={2} />
      <T size={13.5} lh={1.5} color={colors.ink} style={{ flex: 1 }}>{x.photo ? `${t('pfPhoto')} ${x.photo}: ` : ''}{lang === 'ar' ? x.ar : x.en}</T>
    </View>
  ));
  const panel = (
    <View style={{ gap: 14 }}>
      <Card pad={wide ? 22 : 16} style={{ gap: 12, borderColor: colors.goldLine }}>
        <T w={600} size={10.5} caps color={colors.navy}>{t('lfReadyTitle')}</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Serif size={46} color={quality.canSubmit ? colors.emerald : colors.navy}>{quality.score}</Serif>
          <T size={13} color={colors.muted}>/ 100 · {t('lfScore')} · {t('lfMin')} {quality.minScore}</T>
        </View>
        <View style={{ height: 4, backgroundColor: colors.lineSoft }}>
          <View style={{ height: 4, width: `${quality.score}%`, backgroundColor: quality.canSubmit ? colors.emerald : colors.gold }} />
        </View>
        {required.length ? (
          <View style={{ gap: 8 }}>
            <T w={600} size={10.5} caps color={colors.danger}>{t('lfMustFix')}</T>
            {reasonList(required.slice(0, 8).map((x) => ({ code: x.code, en: x.en, ar: x.ar })), 'err')}
          </View>
        ) : <T size={13.5} color={colors.success}>{t('lfAllGood')}</T>}
        {improve.length ? (
          <View style={{ gap: 8 }}>
            <T w={600} size={10.5} caps color={colors.brassText}>{t('lfImprove')}</T>
            {reasonList(improve.slice(0, 5).map((x) => ({ code: x.code, en: x.en, ar: x.ar })), 'info')}
          </View>
        ) : null}
      </Card>
      {shown ? (
        <Card pad={wide ? 22 : 16} style={{ gap: 10, borderColor: shown.verdict === 'block' ? 'rgba(158,44,34,0.35)' : colors.line, backgroundColor: shown.verdict === 'block' ? colors.dangerBg : colors.porcelain }}>
          <T w={600} size={10.5} caps color={shown.verdict === 'block' ? colors.danger : colors.navy}>{t('lfLastCheck')}</T>
          <T w={600} size={15} color={colors.navy}>{t(`lfDecision_${shown.verdict}` as Key)}</T>
          <T size={13.5} lh={1.5} color={colors.body}>{lang === 'ar' ? shown.summary_ar : shown.summary_en}</T>
          {reasonList(shown.reasons ?? [], shown.verdict === 'block' ? 'err' : 'info')}
          {shown.draft && (shown.draft.name_ar || shown.draft.description_ar) ? (
            <Button label={t('lfUseDraft')} kind="secondary" size="sm" onPress={() => applyDraft({ name: shown.draft?.name_ar, description: shown.draft?.description_ar }, 'ar')} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </Card>
      ) : null}
      <View style={{ gap: 10 }}>
        <Button label={t('pfSubmit')} size="lg" busy={busy === 'submit'} onPress={submit}
          disabled={!editable || !quality.canSubmit || me.seller.status !== 'approved' || !['draft', 'rejected'].includes(status)} full />
        <Button label={t('pfSaveDraft')} kind="secondary" busy={busy === 'save'} onPress={save} disabled={!editable} full />
        <T size={12.5} lh={1.55} color={colors.muted}>{t('lfSubmitNote')}</T>
      </View>
    </View>
  );

  const depts = departments(g);
  const deptNode = depts.find((d) => d.id === dept) ?? null;
  const guide = cat ? guidanceOf(g, cat) : null;

  const form = (
    <View style={{ gap: 14 }}>
      {section(t('pfCategory'), <>
        <T w={500} size={12.5} color={colors.body}>{t('lfChooseDepartment')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {depts.map((d) => <Chip key={d.id} size="sm" label={lang === 'ar' ? d.name_ar : d.name_en} active={dept === d.id} onPress={() => editable && setDept(d.id)} />)}
        </View>
        {deptNode ? (
          <>
            <T w={500} size={12.5} color={colors.body} style={{ marginTop: 6 }}>{t('lfChooseCategory')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {leavesUnder(g, deptNode).filter((c) => c.listable).map((c) => (
                <Chip key={c.id} size="sm" label={lang === 'ar' ? c.name_ar : c.name_en} active={f.category_id === c.id} onPress={() => editable && set('category_id', c.id)} />
              ))}
            </View>
          </>
        ) : null}
        {cat && guide ? (
          <View style={{ gap: 8, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 12, marginTop: 4 }}>
            <T w={600} size={10.5} caps color={colors.navy}>{t('lfCategoryGuidance')}</T>
            {(lang === 'ar' ? guide.ar : guide.en).map((x) => <T key={x} size={13.5} lh={1.6} color={colors.body}>{x}</T>)}
            <Examples accepted={guide.accepted.slice(0, 2)} rejected={guide.rejected.slice(0, 2)} />
          </View>
        ) : null}
      </>)}

      {section(t('pfBasics'), <>
        {row(<>{col(<Field label={`${t('pfNameEn')} *`} value={f.name_en} onChangeText={(v) => set('name_en', v)} maxLength={120} editable={editable} />)}
          {col(<Field label={`${t('pfNameAr')} *`} value={f.name_ar} onChangeText={(v) => set('name_ar', v)} maxLength={120} style={rtl} editable={editable} />)}</>)}
        {row(<>{col(<Field label={`${t('pfPrice')} *`} value={f.price} onChangeText={(v) => set('price', v.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" hint={t('pfPriceHint')} dirLtr editable={editable} />)}
          {col(<Field label={t('sdStock')} value={f.stock} onChangeText={(v) => set('stock', v.replace(/\D/g, ''))} keyboardType="number-pad" dirLtr editable={editable} />)}
          {col(<Field label={t('pfWeight')} value={f.weight_g} onChangeText={(v) => set('weight_g', v.replace(/\D/g, ''))} keyboardType="number-pad" hint={t('pfWeightHint')} dirLtr editable={editable} />)}</>)}
        {cat ? <T size={13} color={colors.muted}>{t('pfShipClass')}: {t(`ship_${shipClassFor(path)}` as Key)}</T> : null}
      </>)}

      {cat && attrs.length ? section(t('lfDetails'), <>{attrs.map(attrInput)}</>, t('lfDetailsHint')) : null}

      {section(t('pfDescription'), <>
        <Field label={`${t('pfDescEn')} *`} value={f.description_en} onChangeText={(v) => set('description_en', v)} multiline maxLength={4000} hint={t('pfDescHint')} editable={editable} />
        <Field label={`${t('pfDescAr')} *`} value={f.description_ar} onChangeText={(v) => set('description_ar', v)} multiline maxLength={4000} style={rtl} editable={editable} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Button label={t('lfDraftFromEn')} kind="quiet" size="sm" busy={busy === 'draft'} disabled={!editable || !f.name_en.trim()} onPress={() => draftFrom('ar')} />
          <Button label={t('lfDraftFromAr')} kind="quiet" size="sm" busy={busy === 'draft'} disabled={!editable || !f.name_ar.trim()} onPress={() => draftFrom('en')} />
        </View>
        {draft ? (
          <View style={{ gap: 6, borderWidth: 1, borderColor: colors.goldLine, padding: 12, backgroundColor: colors.ivory }}>
            <T w={600} size={10.5} caps color={colors.brassText}>{t('lfDraftTitle')}</T>
            <T size={14} w={500} style={draft.to === 'ar' ? rtl : undefined}>{draft.name}</T>
            <T size={13.5} lh={1.6} color={colors.body} style={draft.to === 'ar' ? rtl : undefined}>{draft.description}</T>
            {draft.quran ? <Notice text={t('lfQuranOmitted')} /> : null}
            <T size={12} color={colors.muted}>{t('lfDraftNote')}</T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label={t('lfUseDraft')} kind="secondary" size="sm" onPress={() => { applyDraft(draft, draft.to); setDraft(null); }} />
              <Button label={t('cancel')} kind="text" size="sm" onPress={() => setDraft(null)} />
            </View>
          </View>
        ) : null}
      </>)}

      {section(t('pfPhotos'), <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {f.images.map((p, i) => {
            const a = media[p];
            const st = a?.status ?? 'pending';
            return (
              <View key={p} style={{ width: wide ? 132 : 108, gap: 4 }}>
                <Photo uri={urls[p]} ratio={1} tone={colors.sandSoft} fit="cover" style={{ borderWidth: i === 0 ? 2 : 1, borderColor: i === 0 ? colors.gold : colors.line }} />
                <Tag label={t(`lfPhotoStatus_${st}` as Key)} tone={STATUS_TONE[st]} />
                {a?.width ? <T size={11} num color={colors.muted}>{Math.max(a.width, a.height ?? 0)} px</T> : null}
                {(a?.reasons ?? []).slice(0, 2).map((x, k) => <T key={k} size={11.5} lh={1.4} color={st === 'review' ? colors.brassText : colors.danger}>{lang === 'ar' ? x.ar : x.en}</T>)}
                {editable ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('lfMoveEarlier')} onPress={() => movePhoto(i, -1)} style={{ padding: 6 }}><Icon name={isRTL ? 'chevronRight' : 'chevronLeft'} size={16} /></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('remove')} onPress={() => set('images', f.images.filter((x) => x !== p))} style={{ padding: 6 }}><Icon name="close" size={16} color={colors.danger} /></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={t('lfMoveLater')} onPress={() => movePhoto(i, 1)} style={{ padding: 6 }}><Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={16} /></Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        {refused.map((r) => (
          <Notice key={r.name} tone="warn" text={`${r.name}: ${r.reasons.map((x) => (lang === 'ar' ? x.ar : x.en)).join(' ')}`} />
        ))}
        <PickFiles label={busy === 'upload' ? t('lfChecking') : t('pfAddPhotos')} disabled={!editable || busy === 'upload' || f.images.length >= MAX_PHOTOS || !cat} onFiles={addPhotos} />
        {Platform.OS !== 'web' ? <T size={13} color={colors.muted}>{t('pfPhotosOnWeb')}</T> : null}
      </>, `${t('lfPhotosHint')} ${t('mkPhotos')}: ${policy?.min_photos ?? 3}+ · ${policy?.min_long_side_px ?? 1600} ${t('mkPx')}.`)}

      {cat && policy?.required_documents?.length ? section(t('lfDocuments'), <>
        {policy.required_documents.map((code) => {
          const d = g.documents.find((x) => x.code === code);
          const have = docs.filter((x) => x.doc_type === code);
          const best = have.find((x) => x.status === 'accepted') ?? have.find((x) => x.status === 'pending') ?? have[0];
          return (
            <View key={code} style={{ flexDirection: wide ? 'row' : 'column', gap: 10, alignItems: wide ? 'center' : 'flex-start', borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 10 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T w={500} size={14}>{d ? (lang === 'ar' ? d.label_ar : d.label_en) : code}</T>
                {d?.help_en ? <T size={12.5} color={colors.muted}>{lang === 'ar' ? d.help_ar : d.help_en}</T> : null}
              </View>
              <Tag label={t(best ? (best.status === 'accepted' ? 'lfDocAccepted' : best.status === 'pending' ? 'lfDocPending' : 'lfDocRejected') : 'lfDocMissing')}
                tone={best?.status === 'accepted' ? 'ok' : best?.status === 'pending' ? 'info' : 'warn'} />
              <PickFiles label={t('lfUpload')} accept="application/pdf,image/jpeg,image/png" multiple={false} disabled={!editable || busy === 'doc'} onFiles={(fl) => addDocument(code, fl)} />
            </View>
          );
        })}
      </>, t('lfDocumentsHint')) : null}

      {fashion ? section(t('pfFashion'), <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('readyMade')} active={!f.made_to_measure} onPress={() => editable && set('made_to_measure', false)} />
          {policy?.allow_made_to_measure ? <Chip label={t('tailorMade')} active={f.made_to_measure} onPress={() => editable && set('made_to_measure', true)} /> : null}
        </View>
        {!f.made_to_measure ? (
          <View style={{ gap: 8, marginTop: 8 }}>
            <T w={500} size={12.5} color={colors.body}>{t('pfSizes')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SIZE_PRESETS.map((s) => <Chip key={s} size="sm" label={s} active={f.sizes.includes(s)} onPress={() => editable && set('sizes', f.sizes.includes(s) ? f.sizes.filter((x) => x !== s) : [...f.sizes, s])} />)}
            </View>
            {f.sizes.length > 0 && (
              <View style={{ gap: 6, marginTop: 6 }}>
                <T w={500} size={12.5} color={colors.body}>{t('pfSizeChart')}</T>
                {chartRows.map((r) => (
                  <View key={String(r.size)} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <T w={600} size={13} style={{ width: 54 }}>{r.size}</T>
                    {CHART_COLUMNS.map((c) => (
                      <View key={c} style={{ flex: 1 }}><Field label={t(`m_${c}` as Key)} value={String(r[c] ?? '')} onChangeText={(v) => setChartCell(String(r.size), c, v)} keyboardType="decimal-pad" placeholder="cm" dirLtr /></View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 10, marginTop: 8 }}>
            <T w={500} size={12.5} color={colors.body}>{t('lfMtmStyle')} *</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {g.styles.map((s) => <Chip key={s.code} size="sm" label={lang === 'ar' ? s.label_ar : s.label_en} active={f.garment_style === s.code}
                onPress={() => { if (!editable) return; set('garment_style', s.code); if (!measurements.length && s.default_measurements.length) setTailoring({ ...tailoring, measurements: s.default_measurements }); }} />)}
            </View>
            <Field label={`${t('pfProductionDays')} *`} value={String(tailoring.production_days || '')} onChangeText={(v) => setTailoring({ ...tailoring, production_days: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" hint={t('pfProductionDaysHint')} dirLtr />
            <T w={500} size={12.5} color={colors.body}>{t('lfMtmMeasurements')} *</T>
            <T size={12.5} lh={1.5} color={colors.muted}>{t('lfMtmMeasurementsHint')}</T>
            {measurements.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <View style={{ flex: 2 }}><Field label={t('lfMtmKey')} value={m.key} onChangeText={(v) => setTailoring({ ...tailoring, measurements: measurements.map((x, j) => (j === i ? { ...x, key: slugify(v).replace(/-/g, '_') } : x)) })} dirLtr /></View>
                <View style={{ flex: 1 }}><Field label={t('lfMtmMin')} value={m.min_cm ? String(m.min_cm) : ''} keyboardType="decimal-pad" onChangeText={(v) => setTailoring({ ...tailoring, measurements: measurements.map((x, j) => (j === i ? { ...x, min_cm: Number(v) || undefined } : x)) })} dirLtr /></View>
                <View style={{ flex: 1 }}><Field label={t('lfMtmMax')} value={m.max_cm ? String(m.max_cm) : ''} keyboardType="decimal-pad" onChangeText={(v) => setTailoring({ ...tailoring, measurements: measurements.map((x, j) => (j === i ? { ...x, max_cm: Number(v) || undefined } : x)) })} dirLtr /></View>
                <Button label={t('remove')} kind="text" size="sm" onPress={() => setTailoring({ ...tailoring, measurements: measurements.filter((_, j) => j !== i) })} style={{ marginBottom: 18 }} />
              </View>
            ))}
            <Button label={t('lfMtmAdd')} kind="secondary" size="sm" onPress={() => setTailoring({ ...tailoring, measurements: [...measurements, { key: '', required: true }] })} style={{ alignSelf: 'flex-start' }} />
            {style ? <T size={12} color={colors.muted}>{lang === 'ar' ? style.label_ar : style.label_en}</T> : null}
            <T w={500} size={12.5} color={colors.body} style={{ marginTop: 6 }}>{t('pfDesignOptions')}</T>
            <T size={12.5} lh={1.5} color={colors.muted}>{t('pfDesignOptionsHint')} {t('lfFabricsHint')}</T>
            {tailoring.options.map((o, oi) => (
              <View key={oi} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 10 }}>
                {row(<>{col(<Field label={t('pfOptionNameEn')} value={o.label.en} onChangeText={(v) => setOption(oi, { ...o, label: { ...o.label, en: v }, key: o.key.startsWith('opt-') && v ? slugify(v) || o.key : o.key })} />)}
                  {col(<Field label={t('pfOptionNameAr')} value={o.label.ar} onChangeText={(v) => setOption(oi, { ...o, label: { ...o.label, ar: v } })} style={rtl} />)}</>)}
                {o.choices.map((c, ci) => (
                  <View key={ci} style={{ flexDirection: wide ? 'row' : 'column', gap: 8, alignItems: wide ? 'flex-end' : 'stretch' }}>
                    <View style={{ flex: 1 }}><Field label={t('pfChoiceEn')} value={c.label.en} onChangeText={(v) => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, label: { ...x.label, en: v }, id: x.id || slugify(v) } : x)) })} /></View>
                    <View style={{ flex: 1 }}><Field label={t('pfChoiceAr')} value={c.label.ar} onChangeText={(v) => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, label: { ...x.label, ar: v } } : x)) })} style={rtl} /></View>
                    <View style={{ width: wide ? 110 : undefined }}><Field label={t('pfAddOn')} value={c.price_minor ? (c.price_minor / 100).toString() : ''} placeholder="0" onChangeText={(v) => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, price_minor: Math.round((Number(v.replace(/[^\d.]/g, '')) || 0) * 100) } : x)) })} keyboardType="decimal-pad" dirLtr /></View>
                    {o.key === 'fabric' ? (
                      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 18 }}>
                        {(['summer', 'winter', 'all'] as const).map((s) => <Chip key={s} size="sm" label={t(`lfSeason_${s}` as Key)} active={c.season === s} onPress={() => setOption(oi, { ...o, choices: o.choices.map((x, j) => (j === ci ? { ...x, season: s } : x)) })} />)}
                      </View>
                    ) : null}
                    <Button label={t('remove')} kind="text" size="sm" onPress={() => setOption(oi, { ...o, choices: o.choices.filter((_, j) => j !== ci) })} style={{ marginBottom: 18 }} />
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Button label={t('pfAddChoice')} kind="secondary" size="sm" onPress={() => setOption(oi, { ...o, choices: [...o.choices, { id: `c${Date.now().toString(36)}`, label: { en: '', ar: '' }, price_minor: 0 }] })} />
                  <Button label={t('pfRemoveOption')} kind="text" size="sm" onPress={() => setTailoring({ ...tailoring, options: tailoring.options.filter((_, j) => j !== oi) })} />
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[{ key: 'fabric', en: 'Fabric', ar: 'القماش' }, { key: 'collar', en: 'Collar', ar: 'الياقة' }, { key: 'sleeve', en: 'Sleeve and cuff', ar: 'الكم والكبك' }, { key: 'pocket', en: 'Pocket', ar: 'الجيب' }]
                .filter((p) => !tailoring.options.some((o) => o.key === p.key)).map((p) => (
                  <Chip key={p.key} size="sm" label={`+ ${lang === 'ar' ? p.ar : p.en}`} onPress={() => setTailoring({ ...tailoring, options: [...tailoring.options, { key: p.key, label: { en: p.en, ar: p.ar }, choices: [] }] })} />
                ))}
            </View>
          </View>
        )}
      </>) : null}

      {cat ? section(t('lfCompliance'), <>
        {row(<>{col(<Field label={t('lfHsCode')} value={f.hs_code} onChangeText={(v) => set('hs_code', v.replace(/\D/g, '').slice(0, 12))} keyboardType="number-pad" dirLtr editable={editable} />)}
          {col(<CountryPicker label={t('lfOrigin')} value={f.origin_country} onChange={(c) => set('origin_country', c)} />)}</>)}
      </>, t('lfComplianceHint')) : null}

      {id && (status === 'draft' || status === 'rejected') && editable ? (
        confirmDelete ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <T size={14}>{t('pfDeleteConfirm')}</T>
            <Button label={t('pfDeleteYes')} kind="danger" size="sm" busy={busy === 'delete'} onPress={async () => { setBusy('delete'); try { await deleteListing(id); router.replace('/seller/products'); } catch (e) { setMsg({ tone: 'warn', text: String((e as Error).message) }); setBusy(null); } }} />
            <Button label={t('cancel')} kind="text" size="sm" onPress={() => setConfirmDelete(false)} />
          </View>
        ) : <Button label={t('pfDelete')} kind="text" onPress={() => setConfirmDelete(true)} style={{ alignSelf: 'flex-start' }} />
      ) : null}
    </View>
  );

  return (
    <Screen chrome="none" style={{ maxWidth: 1240 }}>
      <Seo title="Product | Seller | Al Mukarramah" description="Seller product editor." path="/seller/product" noindex />
      <Button label={`${isRTL ? '→' : '←'} ${t('sdProducts')}`} kind="text" href="/seller/products" style={{ alignSelf: 'flex-start' }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Serif role="h1" size={wide ? 38 : 28}>{id ? ((lang === 'ar' && f.name_ar) || f.name_en || t('pfUntitled')) : t('sdAddProduct')}</Serif>
        <Tag label={t(`listing_${status}` as Key)} tone={LISTING_TONE[status]} />
        {dirty && <Tag label={t('pfUnsaved')} tone="warn" />}
      </View>
      {cat ? <T size={13} color={colors.muted} style={{ marginBottom: 8 }}>{path.map((c) => (lang === 'ar' ? c.name_ar : c.name_en)).join(' · ')}</T> : null}
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      {status === 'approved' && <Notice text={t('pfLiveEditNote')} />}
      {status === 'pending_review' && <Notice text={t('pfWaitingNote')} />}
      {status === 'check_pending' && <Notice text={t('lfCheckPendingNote')} />}
      {status === 'suspended' && <Notice tone="warn" text={t('lfSuspendedNote')} />}
      {status === 'rejected' && listing?.review_note && !(listing.ai_check?.verdict === 'block') ? <Notice tone="warn" text={`${t('pfRejectedNote')} ${listing.review_note}`} /> : null}
      {msg && <Notice tone={msg.tone === 'info' ? 'info' : msg.tone} text={msg.text} />}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 14, alignItems: 'flex-start', marginTop: 8 }}>
        <View style={{ flex: 1, alignSelf: 'stretch' }}>{form}</View>
        <View style={{ width: wide ? 360 : '100%' }}>{panel}</View>
      </View>
    </Screen>
  );
}
