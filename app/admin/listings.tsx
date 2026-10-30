// Staff: seller listings. Only listings that passed the automatic checks reach the queue ("Waiting"); listings the
// check rejected are kept apart ("Rejected by the check") and come back only through an override with a reason.
// Each card shows every photo (still private) with its screening result, the AI notes for the reviewer, the quality
// score, the details, documents and made-to-measure options. Approving publishes the photos and puts the listing live.
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, H1, Notice, Photo, T, Tag, useWide } from '@/components/ui';
import { MARKET_DEMO, guidanceSnapshot } from '@/lib/market';
import { DEMO_MEDIA, demoQueue } from '@/lib/market-demo';
import { formatMoney } from '@/lib/money';
import { mediaFor, photoUrls, type AiCheck, type MediaAsset, type ProductDocument, type Reason } from '@/lib/seller';
import { callFunction, supabase } from '@/lib/supabase';
import type { SizeChart, Tailoring } from '@/lib/types';
import { colors } from '@/theme';

type Row = {
  id: string; slug: string; name_en: string; name_ar: string; description_en: string | null; description_ar: string | null;
  base_price_sar: number; stock: number; weight_g: number; ship_class: string; images: string[]; listing_status: string; submitted_at: string | null;
  review_note: string | null; ai_check: (AiCheck & { run_id?: number }) | null; attributes: Record<string, unknown>; seller_id: string;
  made_to_measure: boolean; garment: string | null; garment_style: string | null; sizes: string[] | null; size_chart: SizeChart | null; tailoring: Tailoring | null;
  hs_code: string | null; origin_country: string | null;
  categories: { name_en: string } | null; sellers: { name_en: string; country: string; kind: string; status: string } | null;
};
type Run = { id: number; stage: string; model: string | null; prompt_version: string | null; verdict: string; confidence: number | null; reasons: Reason[]; created_at: string };
type Doc = ProductDocument & { path: string };
type Tab = 'pending_review' | 'auto' | 'check_pending' | 'rejected' | 'approved' | 'suspended';

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending_review', label: 'Waiting' },
  { key: 'auto', label: 'Rejected by the check' },
  { key: 'check_pending', label: 'Being checked' },
  { key: 'rejected', label: 'Rejected by staff' },
  { key: 'approved', label: 'Live' },
  { key: 'suspended', label: 'Suspended' },
];
const COLUMNS = 'id, slug, seller_id, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, ship_class, images, listing_status, submitted_at, review_note, ai_check, attributes, made_to_measure, garment, garment_style, sizes, size_chart, tailoring, hs_code, origin_country, categories(name_en), sellers(name_en, country, kind, status)';
const VERDICT: Record<string, { label: string; tone: 'ok' | 'warn' | 'err' | 'info' }> = {
  pass: { label: 'AI: no concerns', tone: 'ok' }, review: { label: 'AI: notes for you', tone: 'warn' },
  block: { label: 'AI: rejected', tone: 'err' }, error: { label: 'AI: not checked yet', tone: 'info' },
};
const PHOTO_TONE = { pending: 'info', passed: 'ok', review: 'warn', rejected: 'err', blocked: 'err' } as const;
const isAuto = (r: Row) => r.listing_status === 'rejected' && r.ai_check?.verdict === 'block' && !r.ai_check?.override;
const show = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v));

function ListingCard({ r, urls, media, strikes, onDone }: { r: Row; urls: Record<string, string>; media: Record<string, MediaAsset>; strikes: number; onDone: () => void }) {
  const wide = useWide();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const ai = r.ai_check;
  const auto = isAuto(r);

  useEffect(() => {
    if (MARKET_DEMO) return;
    supabase.from('product_documents').select('id, doc_type, status, file_name, note, path').eq('product_id', r.id).order('uploaded_at', { ascending: false })
      .then(({ data }: { data: Doc[] | null }) => setDocs(data ?? []), () => undefined);
  }, [r.id]);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    if (MARKET_DEMO) return setMsg('Demonstration only: nothing is changed.');
    setBusy(key); setMsg(null);
    try { await fn(); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const review = (action: 'approve' | 'reject') => run(action, () => callFunction('review-listing', { productId: r.id, action, note }));
  const override = (outcome: 'pending_review' | 'rejected') => run(`o-${outcome}`, () => callFunction('review-screening', { subject: 'listing', id: r.id, outcome, reason: note }));
  const rejectPhoto = (assetId: string) => run(`p-${assetId}`, () => callFunction('review-screening', { subject: 'image', id: assetId, outcome: 'rejected', reason: note }));
  const decideDoc = (d: Doc, status: 'accepted' | 'rejected') => run(`d-${d.id}`, async () => {
    const { error } = await supabase.from('product_documents').update({ status, note: note.trim() || null }).eq('id', d.id);
    if (error) throw new Error(error.message);
  });
  const openDoc = async (d: Doc) => {
    const { data } = await supabase.storage.from('seller-kyc').createSignedUrl(d.path, 300);
    if (data?.signedUrl) Linking.openURL(data.signedUrl);
  };
  const loadRuns = async () => {
    if (MARKET_DEMO) return setRuns([{ id: 1, stage: 'fast', model: 'fast model', prompt_version: 'lst-2026-10.1', verdict: ai?.verdict ?? 'pass', confidence: 0.82, reasons: ai?.reasons ?? [], created_at: ai?.checked_at ?? '' }]);
    const { data } = await supabase.from('screening_runs').select('id, stage, model, prompt_version, verdict, confidence, reasons, created_at').eq('product_id', r.id).order('id', { ascending: false }).limit(12);
    setRuns((data as Run[] | null) ?? []);
  };
  const flagged = new Set((ai?.reasons ?? []).map((x) => x.photo).filter(Boolean));
  const noteOk = note.trim().length >= 5;
  const blockedPhoto = r.images.some((p) => !['passed', 'review'].includes(media[p]?.status ?? (/^https:/.test(p) ? 'passed' : '')));

  return (
    <Card pad={16} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <T w={700} size={16} color={colors.navy} style={{ flexShrink: 1 }}>{r.name_en}</T>
        {ai ? <Tag label={VERDICT[ai.verdict]?.label ?? ai.verdict} tone={VERDICT[ai.verdict]?.tone ?? 'info'} /> : <Tag label="AI: not run" tone="warn" />}
        {typeof ai?.quality_score === 'number' ? <Tag label={`Quality ${ai.quality_score}`} tone={ai.quality_score >= 80 ? 'ok' : 'info'} /> : null}
        {ai?.override ? <Tag label={`Override: ${ai.override.outcome}`} tone="info" /> : null}
        {r.made_to_measure ? <Tag label="Made to measure" tone="info" /> : null}
        {strikes ? <Tag label={`${strikes} active strike${strikes > 1 ? 's' : ''}`} tone="err" /> : null}
      </View>
      <T size={13} color={colors.muted}>
        {r.sellers?.name_en} ({r.sellers?.kind}, {r.sellers?.country}{r.sellers?.status !== 'approved' ? `, seller ${r.sellers?.status}` : ''}) · {r.categories?.name_en ?? 'no category'} · {formatMoney(r.base_price_sar, 'SAR', 'en')} · stock {r.stock} · {r.weight_g} g · {r.ship_class}
        {r.hs_code ? ` · HS ${r.hs_code}` : ''}{r.origin_country ? ` · made in ${r.origin_country}` : ''}
      </T>

      {ai ? (
        <View style={{ backgroundColor: auto ? colors.dangerBg : colors.night, padding: 14, gap: 6 }}>
          <T w={700} size={13.5} color={auto ? colors.danger : colors.goldBright}>{auto ? 'Rejected by the automatic check' : 'Notes from the automatic check'}: {ai.summary_en}</T>
          {(ai.reasons ?? []).map((x, i) => (
            <View key={i} style={{ gap: 2 }}>
              <T size={13} color={auto ? colors.ink : colors.white} lh={1.5}>{x.photo ? `Photo ${x.photo}: ` : ''}{x.en}</T>
              <T size={12} color={auto ? colors.muted : colors.onNight} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{x.ar}</T>
            </View>
          ))}
          {!ai.reasons?.length ? <T size={13} color={auto ? colors.ink : colors.white}>No concerns found. Check the photos and text yourself: the check helps, you decide.</T> : null}
          {ai.override ? <T size={12.5} color={auto ? colors.muted : colors.onNight}>Override ({ai.override.outcome}): {ai.override.reason}</T> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {r.images.map((p, i) => {
          const a = media[p];
          const st = a?.status ?? (/^https:/.test(p) ? 'passed' : 'pending');
          const warn = flagged.has(i + 1) || st === 'review' || (a?.flags?.length ?? 0) > 0;
          return (
            <View key={p} style={{ width: wide ? 168 : 132, gap: 4 }}>
              <Photo uri={urls[p]} ratio={1} tone={colors.sandSoft} fit="contain" style={{ borderWidth: warn || st !== 'passed' ? 2 : 1, borderColor: st === 'rejected' || st === 'blocked' ? colors.danger : warn ? colors.gold : colors.line }} />
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <T size={11.5} w={600}>Photo {i + 1}</T>
                <Tag label={st} tone={PHOTO_TONE[st]} />
                {a?.width ? <T size={11} num color={colors.muted}>{Math.max(a.width, a.height ?? 0)} px</T> : null}
              </View>
              {a?.flags?.length ? <T size={11} color={colors.brassText}>{a.flags.join(', ')}</T> : null}
              {(a?.reasons ?? []).slice(0, 2).map((x, k) => <T key={k} size={11.5} lh={1.4} color={colors.body}>{x.en}</T>)}
              {a && ['passed', 'review'].includes(st) && r.listing_status !== 'approved' ? (
                <Pressable accessibilityRole="button" disabled={!noteOk || !!busy} onPress={() => rejectPhoto(a.id)} style={{ opacity: noteOk ? 1 : 0.4 }}>
                  <T size={11.5} color={colors.danger} style={{ textDecorationLine: 'underline' }}>Reject this photo (uses the note)</T>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
        <View style={{ flex: 1, gap: 4 }}><T w={700} size={13}>English</T><T size={13.5} lh={1.55}>{r.description_en ?? '—'}</T></View>
        <View style={{ flex: 1, gap: 4 }}>
          <T w={700} size={13}>العربية</T>
          <T size={14} w={600} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.name_ar || '—'}</T>
          <T size={13.5} lh={1.55} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.description_ar ?? '—'}</T>
        </View>
      </View>
      {Object.keys(r.attributes ?? {}).length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(r.attributes).filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
            <View key={k} style={{ borderWidth: 1, borderColor: colors.lineSoft, paddingHorizontal: 8, paddingVertical: 4 }}>
              <T size={12} color={colors.body}><T size={12} w={600}>{k.replace(/_/g, ' ')}</T>: {show(v)}</T>
            </View>
          ))}
        </View>
      ) : null}
      {r.sizes?.length ? <T size={13}>Sizes: {r.sizes.join(', ')}{r.size_chart?.rows?.length ? ' · size chart given' : ' · no size chart'}</T> : null}
      {r.tailoring ? (
        <View style={{ gap: 3 }}>
          <T size={13}>Made to measure: {r.garment_style ?? r.tailoring.style ?? 'style not set'} · {r.tailoring.production_days} days to make</T>
          {r.tailoring.measurements?.length ? <T size={12.5} color={colors.body}>Measurements: {r.tailoring.measurements.map((m) => `${m.key}${m.min_cm || m.max_cm ? ` ${m.min_cm ?? ''}–${m.max_cm ?? ''} cm` : ''}`).join(', ')}</T> : null}
          {r.tailoring.options.map((o) => (
            <T key={o.key} size={12.5} color={colors.body}>{o.label.en}: {o.choices.map((c) => `${c.label.en}${c.price_minor ? ` +${formatMoney(c.price_minor, 'SAR', 'en')}` : ''}${c.season ? ` (${c.season})` : ''}`).join(', ')}</T>
          ))}
        </View>
      ) : null}

      {docs.length ? (
        <View style={{ gap: 6 }}>
          <T w={700} size={13}>Documents</T>
          {docs.map((d) => (
            <View key={d.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <T size={13}>{d.doc_type.replace(/_/g, ' ')}{d.file_name ? ` · ${d.file_name}` : ''}</T>
              <Tag label={d.status} tone={d.status === 'accepted' ? 'ok' : d.status === 'rejected' ? 'err' : 'info'} />
              <Button label="Open" kind="text" size="sm" onPress={() => openDoc(d)} />
              {d.status !== 'accepted' ? <Button label="Accept" kind="secondary" size="sm" busy={busy === `d-${d.id}`} onPress={() => decideDoc(d, 'accepted')} /> : null}
              {d.status !== 'rejected' ? <Button label="Reject (uses the note)" kind="text" size="sm" disabled={!noteOk} onPress={() => decideDoc(d, 'rejected')} /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {runs ? (
        <View style={{ gap: 4, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 8 }}>
          <T w={700} size={13}>Screening record</T>
          {runs.map((x) => (
            <T key={x.id} size={12} color={colors.body} num>
              {x.created_at.slice(0, 16).replace('T', ' ')} · {x.stage} · {x.verdict}{x.confidence !== null ? ` (${Number(x.confidence).toFixed(2)})` : ''} · {x.model ?? 'staff'} · {x.prompt_version ?? ''}{x.reasons?.length ? ` · ${x.reasons.map((y) => y.en).join(' / ')}` : ''}
            </T>
          ))}
          {!runs.length ? <T size={12} color={colors.muted}>No records.</T> : null}
        </View>
      ) : <Button label="Show the screening record" kind="text" size="sm" onPress={loadRuns} style={{ alignSelf: 'flex-start' }} />}

      <Field label={auto ? 'Reason for the override (required, at least 5 characters; recorded in the audit history)' : 'Note to the seller (required to reject; optional on approval). Also used as the reason for photo and document decisions.'}
        value={note} onChangeText={setNote} multiline />
      {msg && <Notice tone="warn" text={msg} />}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {r.listing_status === 'pending_review' ? (
          <>
            <Button label="Approve and publish" busy={busy === 'approve'} disabled={blockedPhoto || r.sellers?.status !== 'approved'} onPress={() => review('approve')} />
            <Button label="Reject with note" kind="danger" busy={busy === 'reject'} disabled={!note.trim()} onPress={() => review('reject')} />
          </>
        ) : null}
        {auto || r.listing_status === 'suspended' ? (
          <>
            <Button label="Send to the queue (override)" kind="secondary" busy={busy === 'o-pending_review'} disabled={!noteOk} onPress={() => override('pending_review')} />
            {r.listing_status === 'suspended' ? <Button label="Keep rejected" kind="text" busy={busy === 'o-rejected'} disabled={!noteOk} onPress={() => override('rejected')} /> : null}
          </>
        ) : null}
        {r.listing_status === 'approved' || r.listing_status === 'check_pending' ? (
          <Button label={r.listing_status === 'approved' ? 'Take down with note' : 'Reject with note'} kind="danger" busy={busy === 'reject'} disabled={!note.trim()} onPress={() => review('reject')} />
        ) : null}
        {r.listing_status === 'approved' ? <Button label="View product page" kind="text" href={{ pathname: '/product/[slug]', params: { slug: r.slug } }} /> : null}
      </View>
      {blockedPhoto && r.listing_status === 'pending_review' ? <T size={12.5} color={colors.danger}>A photo has not passed the photo check: reject the listing or ask the seller to replace it.</T> : null}
    </Card>
  );
}

export default function AdminListings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [media, setMedia] = useState<Record<string, MediaAsset>>({});
  const [strikes, setStrikes] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>('pending_review');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    if (MARKET_DEMO) {
      const catId = (slug: string) => guidanceSnapshot.categories.find((c) => c.slug === slug)?.id ?? null;
      const catName = (id: string | null) => guidanceSnapshot.categories.find((c) => c.id === id)?.name_en ?? '';
      const all = demoQueue(catId, catName) as unknown as Row[];
      const list = all.filter((r) => (tab === 'auto' ? isAuto(r) : tab === 'rejected' ? r.listing_status === 'rejected' && !isAuto(r) : r.listing_status === tab));
      setRows(list);
      setUrls(Object.fromEntries(list.flatMap((r) => r.images).map((p) => [p, p])));
      setMedia(DEMO_MEDIA);
      return;
    }
    const status = tab === 'auto' ? 'rejected' : tab;
    const { data, error } = await supabase.from('products').select(COLUMNS).not('seller_id', 'is', null).eq('listing_status', status)
      .order('submitted_at', { ascending: tab === 'pending_review' }).limit(100);
    if (error) return setErr(error.message);
    let list = (data as unknown as Row[]) ?? [];
    if (tab === 'auto') list = list.filter(isAuto);
    if (tab === 'rejected') list = list.filter((r) => !isAuto(r));
    setRows(list);
    const paths = list.flatMap((r) => r.images);
    const [u, m] = await Promise.all([photoUrls(paths), mediaFor(paths)]);
    setUrls(u); setMedia(m);
    const sellers = [...new Set(list.map((r) => r.seller_id))];
    if (sellers.length) {
      const { data: s } = await supabase.from('seller_strikes').select('seller_id').in('seller_id', sellers).is('voided_at', null);
      const n: Record<string, number> = {};
      ((s as { seller_id: string }[] | null) ?? []).forEach((x) => { n[x.seller_id] = (n[x.seller_id] ?? 0) + 1; });
      setStrikes(n);
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Seller listings | Admin | Al Mukarramah" description="Staff only." path="/admin/listings" noindex />
      <H1>Seller listings</H1>
      <T size={14} color={colors.muted} lh={1.6} style={{ marginBottom: 12 }}>
        Nothing a seller uploads is public until you approve it here. Every listing in the queue passed the automatic checks; their notes point you to what to look at, but you decide.
        Listings the check rejected never enter the queue: the seller sees the reasons and can fix them, or you can override with a reason.
      </T>
      {MARKET_DEMO ? <Notice text="Demonstration: example listings only, nothing is saved." /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {TABS.map((x) => <Chip key={x.key} size="sm" label={x.label} active={tab === x.key} onPress={() => setTab(x.key)} />)}
      </View>
      {err && <Notice tone="warn" text={err} />}
      {rows && !rows.length && <T color={colors.muted}>Nothing here.</T>}
      <View style={{ gap: 14 }}>{(rows ?? []).map((r) => <ListingCard key={r.id} r={r} urls={urls} media={media} strikes={strikes[r.seller_id] ?? 0} onDone={load} />)}</View>
    </Screen>
  );
}
