// Reviews of the seller's products (verified purchases, published after our team reads them) and one reply each.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stars } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Field, Loading, Notice, Serif, T, Tag, useWide } from '@/components/ui';
import { replyToReview, sellerReviews, type SellerReview } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n, type Key } from '@/lib/i18n';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

function ReviewRow({ r, onDone }: { r: SellerReview; onDone: () => void }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(r.reply?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Card pad={18} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Stars value={r.rating} />
        {r.title ? <T w={700} size={14.5}>{r.title}</T> : null}
      </View>
      <T size={12.5} color={colors.muted}>{r.author} · {lang === 'ar' ? r.product.name_ar : r.product.name_en} · {new Date(r.published_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')}</T>
      {r.body ? <T size={14} lh={1.6} color={colors.body}>{r.body}</T> : null}
      {r.reply && !open ? (
        <View style={{ paddingStart: 14, borderStartWidth: 2, borderColor: colors.goldLine, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <T size={12.5} w={700} color={colors.brassText}>{t('rvYourReply')}</T>
            <Tag label={t(`rvReply_${r.reply.status}` as Key)} tone={r.reply.status === 'published' ? 'ok' : r.reply.status === 'pending' ? 'info' : 'err'} />
          </View>
          <T size={13.5} lh={1.6} color={colors.body}>{r.reply.body}</T>
          {r.reply.moderation_note ? <Notice tone="warn" text={r.reply.moderation_note} /> : null}
        </View>
      ) : null}
      {open ? (
        <View style={{ gap: 8 }}>
          <Field label={t('rvReplyLabel')} value={body} onChangeText={setBody} multiline maxLength={1500} hint={t('rvReplyHint')} />
          {msg ? <Notice tone="warn" text={msg} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="sm" label={t('rvSendReply')} busy={busy} disabled={body.trim().length < 2} onPress={async () => {
              if (MARKET_DEMO) { setMsg(t('lfDemo')); return; }
              setBusy(true); setMsg(null);
              try { await replyToReview(r.id, body.trim()); setOpen(false); onDone(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
            }} />
            <Button size="sm" kind="text" label={t('cancel')} onPress={() => setOpen(false)} />
          </View>
        </View>
      ) : r.reply?.status !== 'hidden' ? (
        <Button size="sm" kind="secondary" label={r.reply ? t('rvEditReply') : t('rvReply')} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
      ) : null}
    </Card>
  );
}

export default function SellerReviews() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const [rows, setRows] = useState<SellerReview[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => sellerReviews(me.seller.id).then(setRows).catch((e) => setErr(String(e.message ?? e))), [me.seller.id]);
  useEffect(() => { load(); }, [load]);
  const avg = rows?.length ? rows.reduce((n, r) => n + r.rating, 0) / rows.length : null;
  return (
    <Screen chrome="none" style={{ maxWidth: 900 }}>
      <Seo title="Reviews | Seller | Al Mukarramah" description="Seller reviews." path="/seller/reviews" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdReviews')}</Serif>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('rvSellerIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      {err ? <Notice tone="warn" text={err} /> : null}
      {!rows && !err ? <Loading /> : null}
      {avg !== null ? <View style={{ marginBottom: 12 }}><Stars value={avg} size={18} count={rows!.length} /></View> : null}
      {rows && !rows.length ? <T color={colors.muted}>{t('rvNoneSeller')}</T> : null}
      <View style={{ gap: 12 }}>{(rows ?? []).map((r) => <ReviewRow key={r.id} r={r} onDone={load} />)}</View>
    </Screen>
  );
}
