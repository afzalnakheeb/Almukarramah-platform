// Staff: reviews and sellers' replies to publish. Contact details were masked when they were written; what the check
// found is shown as flags and highlighted. Publishing a review publishes its screened photos to the catalogue.
import React, { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Stars } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, H1, Notice, T, Tag, useWide } from '@/components/ui';
import { adminReviews, customerPhotoUrls, moderate, type AdminReply, type AdminReview } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { colors } from '@/theme';
import { findContacts } from '../../supabase/functions/_shared/contact';

function Body({ text }: { text: string }) {
  // what still looks like contact details or an invitation to deal outside, highlighted
  const hits = findContacts(text);
  if (!hits.length) return <T size={14} lh={1.6} color={colors.body}>{text}</T>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.index > at) parts.push(text.slice(at, h.index));
    parts.push(<T key={i} size={14} w={700} color={colors.brassText} style={{ backgroundColor: colors.goldSoft }}>{h.match}</T>);
    at = Math.max(at, h.index + h.match.length);
  });
  parts.push(text.slice(at));
  return <T size={14} lh={1.6} color={colors.body}>{parts}</T>;
}

function Moderate({ id, target, onDone }: { id: string; target: 'review' | 'reply'; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const go = async (a: 'publish' | 'reject') => {
    if (MARKET_DEMO) { setMsg('Example data: nothing is saved here.'); return; }
    setBusy(a); setMsg(null);
    try { await moderate(id, target, a, note.trim() || undefined); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  return (
    <View style={{ gap: 8 }}>
      <Field label="Note to the author (needed to reject)" value={note} onChangeText={setNote} maxLength={500} />
      {msg ? <Notice tone="warn" text={msg} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" label="Publish" busy={busy === 'publish'} onPress={() => go('publish')} />
        <Button size="sm" kind="text" label="Reject" busy={busy === 'reject'} disabled={note.trim().length < 5} onPress={() => go('reject')} />
      </View>
    </View>
  );
}

function ReviewCard({ r, onDone }: { r: AdminReview; onDone: () => void }) {
  const wide = useWide();
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { const ph = r.photos.filter((p) => p.path) as { bucket: string; path: string }[]; if (ph.length) customerPhotoUrls(ph).then(setUrls).catch(() => undefined); }, [r.id]);
  return (
    <Card pad={wide ? 20 : 14} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stars value={r.rating} />
        {r.title ? <T w={700} size={15}>{r.title}</T> : null}
        {r.flags.map((f) => <Tag key={f} label={f.replace('contact_', 'contact: ')} tone="warn" />)}
      </View>
      <T size={12.5} color={colors.muted}>{r.author} · {r.product.name_en}{r.seller ? ` · ${r.seller}` : ' · our product'} · written in {r.lang === 'ar' ? 'Arabic' : 'English'}</T>
      <Body text={r.body} />
      {r.photos.length ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {r.photos.map((p) => (p.path && (urls[p.path] || MARKET_DEMO) ? (
            <View key={p.id} style={{ gap: 2 }}>
              <Image source={{ uri: urls[p.path] ?? p.path }} style={{ width: 96, height: 96, borderRadius: 6 }} />
              <T size={11} color={p.status === 'passed' ? colors.emerald : colors.brassText}>{p.status}</T>
            </View>
          ) : null))}
        </View>
      ) : null}
      {r.status === 'pending' ? <Moderate id={r.id} target="review" onDone={onDone} /> : <T size={12.5} color={colors.muted}>{r.status}{r.moderation_note ? `: ${r.moderation_note}` : ''}</T>}
    </Card>
  );
}

function ReplyCard({ y, onDone }: { y: AdminReply; onDone: () => void }) {
  return (
    <Card pad={16} style={{ gap: 6 }}>
      <T size={12.5} color={colors.muted}>{y.seller ?? 'Al Mukarramah'} replying to {y.review.author} ({y.review.rating}★) on {y.product}</T>
      <T size={13} color={colors.muted} style={{ fontStyle: 'italic' }}>“{y.review.title ? `${y.review.title}. ` : ''}{y.review.body}”</T>
      <Body text={y.body} />
      {y.flags.length ? <View style={{ flexDirection: 'row', gap: 6 }}>{y.flags.map((f) => <Tag key={f} label={f} tone="warn" />)}</View> : null}
      {y.status === 'pending' ? <Moderate id={y.review_id} target="reply" onDone={onDone} /> : null}
    </Card>
  );
}

export default function AdminReviews() {
  const [status, setStatus] = useState<string>('pending');
  const [data, setData] = useState<{ reviews: AdminReview[]; replies: AdminReply[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => adminReviews(status).then(setData).catch((e) => setErr(String(e.message ?? e))), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Admin | Reviews" description="Staff only." path="/admin/reviews" noindex />
      <H1>Reviews to publish</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12, maxWidth: 820 }}>
        Every review is from a delivered order. Publish what is honest and about the product; reject (with a note the author sees) anything abusive, off topic or
        trying to take a sale elsewhere. Photos show the item only.
      </T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real or saved." /> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {['pending', 'published', 'rejected', 'hidden'].map((s) => <Chip key={s} label={s} active={status === s} onPress={() => setStatus(s)} />)}
      </View>
      {err ? <Notice tone="warn" text={err} /> : null}
      <View style={{ gap: 12 }}>
        {data && !data.reviews.length && !data.replies.length ? <T color={colors.muted}>Nothing here.</T> : null}
        {data?.reviews.map((r) => <ReviewCard key={r.id} r={r} onDone={load} />)}
        {data?.replies.length ? <T w={700} size={17} style={{ marginTop: 8 }}>Sellers' replies</T> : null}
        {data?.replies.map((y) => <ReplyCard key={y.review_id} y={y} onDone={load} />)}
      </View>
    </Screen>
  );
}
