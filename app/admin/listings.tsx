// Staff: listings waiting for approval. Shows every photo (still private), the text in both languages,
// price, fashion options and the AI guideline check. Approving publishes the photos and puts the listing live.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, H1, Notice, Photo, T, Tag, useWide } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { photoUrls, type AiCheck } from '@/lib/seller';
import { callFunction, supabase } from '@/lib/supabase';
import type { SizeChart, Tailoring } from '@/lib/types';
import { colors } from '@/theme';

type Row = {
  id: string; slug: string; name_en: string; name_ar: string; description_en: string | null; description_ar: string | null;
  base_price_sar: number; stock: number; weight_g: number; ship_class: string; images: string[]; listing_status: string; submitted_at: string | null;
  ai_check: AiCheck | null; made_to_measure: boolean; garment: string | null; sizes: string[] | null; size_chart: SizeChart | null; tailoring: Tailoring | null;
  categories: { name_en: string } | null; sellers: { name_en: string; country: string; kind: string; status: string } | null;
};

function ListingCard({ r, urls, onDone }: { r: Row; urls: Record<string, string>; onDone: () => void }) {
  const wide = useWide();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (action: 'approve' | 'reject') => {
    setBusy(action); setMsg(null);
    try { await callFunction('review-listing', { productId: r.id, action, note }); onDone(); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  const ai = r.ai_check;
  return (
    <Card pad={16} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <T w={700} size={16} color={colors.navy} style={{ flexShrink: 1 }}>{r.name_en}</T>
        {ai ? <Tag label={`AI: ${ai.verdict}`} tone={ai.verdict === 'block' ? 'err' : ai.verdict === 'pass' ? 'ok' : 'warn'} /> : <Tag label="AI: not run" tone="warn" />}
        {r.made_to_measure ? <Tag label="Tailor-made" tone="info" /> : null}
      </View>
      <T size={13} color={colors.muted}>{r.sellers?.name_en} ({r.sellers?.kind}, {r.sellers?.country}) · {r.categories?.name_en ?? 'no category'} · {formatMoney(r.base_price_sar, 'SAR', 'en')} · stock {r.stock} · {r.weight_g} g · {r.ship_class}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {r.images.map((p, i) => (
          <View key={p} style={{ width: wide ? 150 : 104 }}>
            <Photo uri={urls[p]} ratio={1} tone={colors.sandSoft} fit="contain" style={{ borderRadius: 10, borderWidth: ai?.issues.some((x) => x.photo === i + 1) ? 2 : 1, borderColor: ai?.issues.some((x) => x.photo === i + 1) ? colors.danger : colors.line }} />
            <T size={11.5} color={colors.muted} center>Photo {i + 1}</T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}><T w={700} size={13}>English</T><T size={13.5} lh={1.55}>{r.description_en ?? '—'}</T></View>
        <View style={{ flex: 1, gap: 4 }}><T w={700} size={13}>العربية</T><T size={14} w={600} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.name_ar || '—'}</T><T size={13.5} lh={1.55} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.description_ar ?? '—'}</T></View>
      </View>
      {r.sizes?.length ? <T size={13}>Sizes: {r.sizes.join(', ')}{r.size_chart?.rows?.length ? ' · size chart given' : ' · no size chart'}</T> : null}
      {r.tailoring ? <T size={13}>Tailoring: {r.tailoring.production_days} days · {r.tailoring.options.map((o) => `${o.label.en} (${o.choices.length})`).join(', ')}</T> : null}
      {ai && (
        <View style={{ backgroundColor: colors.night, borderRadius: 12, padding: 12, gap: 6 }}>
          <T w={700} size={13.5} color={colors.goldBright}>AI check: {ai.summary_en}</T>
          {ai.issues.map((x, i) => <T key={i} size={13} color={colors.white}>[{x.severity}] {x.photo ? `Photo ${x.photo}: ` : ''}{x.en}</T>)}
        </View>
      )}
      <Field label="Note to the seller (required to reject; optional on approval)" value={note} onChangeText={setNote} multiline />
      {msg && <Notice tone="warn" text={msg} />}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button label="Approve and publish" busy={busy === 'approve'} disabled={ai?.verdict === 'block'} onPress={() => act('approve')} />
        <Button label="Reject with note" kind="danger" busy={busy === 'reject'} disabled={!note.trim()} onPress={() => act('reject')} />
        <Button label="Preview product page" kind="text" href={{ pathname: '/product/[slug]', params: { slug: r.slug } }} />
      </View>
    </Card>
  );
}

export default function AdminListings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [show, setShow] = useState<'pending_review' | 'rejected' | 'approved'>('pending_review');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('products')
      .select('id, slug, name_en, name_ar, description_en, description_ar, base_price_sar, stock, weight_g, ship_class, images, listing_status, submitted_at, ai_check, made_to_measure, garment, sizes, size_chart, tailoring, categories(name_en), sellers(name_en, country, kind, status)')
      .not('seller_id', 'is', null).eq('listing_status', show).order('submitted_at', { ascending: true }).limit(100);
    if (error) return setErr(error.message);
    const list = (data as unknown as Row[]) ?? [];
    setRows(list);
    setUrls(await photoUrls(list.flatMap((r) => r.images)));
  }, [show]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Listings to approve | Admin | Al Mukarramah" description="Staff only." path="/admin/listings" noindex />
      <H1>Listings to approve</H1>
      <T size={14} color={colors.muted} lh={1.6} style={{ marginBottom: 12 }}>Nothing a seller uploads is public until you approve it here. Check every photo for faces and the guidelines; the AI check is a helper, not the decision.</T>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip size="sm" label="Waiting" active={show === 'pending_review'} onPress={() => setShow('pending_review')} />
        <Chip size="sm" label="Rejected" active={show === 'rejected'} onPress={() => setShow('rejected')} />
        <Chip size="sm" label="Approved" active={show === 'approved'} onPress={() => setShow('approved')} />
      </View>
      {err && <Notice tone="warn" text={err} />}
      {rows && !rows.length && <T color={colors.muted}>Nothing waiting.</T>}
      <View style={{ gap: 14 }}>{(rows ?? []).map((r) => <ListingCard key={r.id} r={r} urls={urls} onDone={load} />)}</View>
    </Screen>
  );
}
