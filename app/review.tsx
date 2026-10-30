// Review an item you bought (verified purchases only). Our team reads every review before it appears; photos are
// checked like every photo on Al Mukarramah, and contact details are removed.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { StarPicker } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { PickFiles } from '@/components/pick-files';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, H1, Loading, Notice, T, useHydrated, useWide } from '@/components/ui';
import { reviewItem, submitReview, uploadCustomerPhoto, type CustomerPhoto, type ReviewItem } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n, type Key } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function ReviewPage() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { session } = useSession();
  const hydrated = useHydrated();
  const { item } = useLocalSearchParams<{ item?: string }>();
  const [data, setData] = useState<ReviewItem | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [name, setName] = useState('');
  const [inLang, setInLang] = useState<'ar' | 'en'>(lang);
  const [photos, setPhotos] = useState<CustomerPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!hydrated || !item || (!session && !MARKET_DEMO)) return;
    reviewItem(item).then((d) => {
      setData(d);
      if (d.review) { setRating(d.review.rating); setTitle(d.review.title ?? ''); setBody(d.review.body); setInLang(d.review.lang); }
    }).catch((e) => setErr(String(e.message ?? e)));
  }, [hydrated, item, session]);

  const add = async (files: File[]) => {
    setUploading(true); setErr(null);
    try {
      for (const f of files.slice(0, 3 - photos.length)) {
        const r = await uploadCustomerPhoto(f, 'review_photo');
        if (r.asset && ['passed', 'review', 'pending'].includes(r.asset.status)) setPhotos((p) => [...p, r.asset!]);
        else setErr(r.reasons.map((x) => (lang === 'ar' ? x.ar : x.en)).join(' ') || t('rvPhotoRefused'));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setUploading(false); }
  };
  const send = async () => {
    if (MARKET_DEMO) { setErr(t('lfDemo')); return; }
    setBusy(true); setErr(null);
    try {
      const r = await submitReview({ orderItemId: item!, rating, title: title.trim(), body: body.trim(), lang: inLang, name: name.trim(), photos: photos.map((p) => p.id) });
      setDone(r.status);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <Screen style={{ maxWidth: 760 }}>
      <Seo title="Write a review | Al Mukarramah" description="Review an item you bought." path="/review" noindex />
      <Button kind="text" size="sm" label={t('backToAccount')} href="/account" style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
      <H1 size={wide ? 40 : 30}>{t('rvWrite')}</H1>
      {hydrated && !session && !MARKET_DEMO ? <Notice text={t('rvSignIn')} /> : null}
      {err ? <Notice tone="warn" text={err} /> : null}
      {!data && !err && hydrated && (session || MARKET_DEMO) ? <Loading /> : null}
      {data ? (
        <Card pad={wide ? 24 : 16} style={{ gap: 14, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {data.product?.image ? <Image source={{ uri: data.product.image }} style={{ width: 72, height: 72, borderRadius: 6, backgroundColor: colors.sand }} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={15}>{lang === 'ar' ? data.item.name_ar : data.item.name_en}</T>
              <T size={12.5} color={colors.muted} num>AM-{data.item.order_number}{data.item.variant ? ` · ${data.item.variant}` : ''}</T>
            </View>
          </View>
          {done ? <Notice tone="ok" text={t(done === 'published' ? 'rvThanksLive' : 'rvThanksPending')} /> : null}
          {data.review && !done ? (
            <Notice tone={data.review.status === 'rejected' || data.review.status === 'hidden' ? 'warn' : 'info'}
              text={`${t(`rvStatus_${data.review.status}` as Key)}${data.review.moderation_note ? ` ${data.review.moderation_note}` : ''}`} />
          ) : null}
          {!data.can_review ? <Notice tone="warn" text={t(data.delivered_at ? 'rvTooLate' : 'rvNotYet')} /> : null}
          {data.can_review && data.review?.status !== 'hidden' && !done ? (
            <>
              <View style={{ gap: 6 }}>
                <T w={600} size={14}>{t('rvRating')}</T>
                <StarPicker value={rating} onChange={setRating} />
              </View>
              <Field label={t('rvTitleLabel')} value={title} onChangeText={setTitle} maxLength={120} />
              <Field label={t('rvBodyLabel')} value={body} onChangeText={setBody} multiline maxLength={2000} hint={t('rvBodyHint')} />
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <T size={13} color={colors.muted}>{t('rvWrittenIn')}</T>
                <Chip size="sm" label="العربية" active={inLang === 'ar'} onPress={() => setInLang('ar')} />
                <Chip size="sm" label="English" active={inLang === 'en'} onPress={() => setInLang('en')} />
              </View>
              <Field label={t('rvNameLabel')} value={name} onChangeText={setName} maxLength={40} hint={t('rvNameHint')} />
              <View style={{ gap: 8 }}>
                <T w={600} size={14}>{t('rvPhotos')}</T>
                <T size={12.5} lh={1.5} color={colors.muted}>{t('rvPhotosHint')}</T>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {photos.map((p) => (
                    <View key={p.id} style={{ width: 84, height: 84, borderRadius: 6, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center' }}>
                      <T size={11} color={colors.muted} center>{t(p.status === 'passed' ? 'rvPhotoOk' : 'rvPhotoChecking')}</T>
                    </View>
                  ))}
                </View>
                {photos.length < 3 ? <PickFiles label={uploading ? t('rvUploading') : t('rvAddPhotos')} disabled={uploading} onFiles={add} /> : null}
              </View>
              <Button label={data.review ? t('rvUpdate') : t('rvSubmit')} busy={busy} disabled={!rating} onPress={send} style={{ alignSelf: 'flex-start' }} />
              <T size={12} lh={1.5} color={colors.muted}>{t('rvModerationNote')}</T>
            </>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
