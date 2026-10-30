// The seller's file: everything our team needs to approve the shop. The checklist comes from the server (the same
// one that decides whether the file can be sent). Details and documents are private to the seller and our team.
// Portfolio photos are screened like every upload. Messages from our team (requests for more information,
// decisions) appear here, and the seller answers by sending the file again.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { PickFiles } from '@/components/pick-files';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, Notice, Photo, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { MARKET_DEMO, departments, leavesUnder, useGuidance } from '@/lib/market';
import {
  LEGAL_ENTITIES, RELATIONSHIPS, mediaFor, mySellerFile, photoUrls, requestCategory, submitApplication, updateApplication, updateSellerPrivate,
  uploadMedia, uploadSellerDocument, withdrawCategory, type MediaAsset, type Reason, type SellerFile, type SellerPrivate,
} from '@/lib/seller';
import { STATUS_TONE, useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

const GCC = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM'];
const CAT_TONE = { requested: 'info', approved: 'ok', declined: 'err' } as const;
const DOC_TONE = { pending: 'info', accepted: 'ok', rejected: 'err' } as const;
const PHOTO_TONE = { pending: 'info', passed: 'ok', review: 'warn', rejected: 'err', blocked: 'err' } as const;

export default function SellerApplication() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { me, reload } = useSeller();
  const g = useGuidance();
  const s = me.seller;
  const [file, setFile] = useState<SellerFile | null>(null);
  const [media, setMedia] = useState<Record<string, MediaAsset>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [story, setStory] = useState({ relationship: '', years: '', brand_story: '', links: '', monthly: '' });
  const [biz, setBiz] = useState<Partial<SellerPrivate>>({});
  const [dept, setDept] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'info'; text: string } | null>(null);
  const [refused, setRefused] = useState<{ name: string; reasons: Reason[] }[]>([]);
  const decided = ['approved', 'suspended', 'rejected'].includes(s.status);
  const editable = !decided && !MARKET_DEMO;
  const gcc = GCC.includes(s.country);

  const load = useCallback(async () => {
    const f = await mySellerFile(s.id);
    setFile(f);
    const a = f.application;
    setStory({ relationship: a?.relationship ?? '', years: a?.years_in_business?.toString() ?? '', brand_story: a?.brand_story ?? '', links: (a?.links ?? []).join('\n'), monthly: a?.monthly_orders_estimate?.toString() ?? '' });
    setBiz({ legal_entity_type: me.private?.legal_entity_type ?? null, legal_name: me.private?.legal_name ?? '', registration_no: me.private?.registration_no ?? '',
      tax_registration_no: me.private?.tax_registration_no ?? '', iban: me.private?.iban ?? '', bank_name: me.private?.bank_name ?? '', account_holder: me.private?.account_holder ?? '' });
    const pics = a?.portfolio ?? [];
    const [m, u] = await Promise.all([mediaFor(pics), photoUrls(pics)]);
    setMedia(m); setUrls(u);
  }, [s.id, me.private]);
  useEffect(() => { load().catch((e) => setMsg({ tone: 'warn', text: String(e.message ?? e) })); }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); await load(); if (ok) setMsg({ tone: 'ok', text: ok }); }
    catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  };

  const saveDetails = () => run('save', async () => {
    const links = story.links.split(/\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
    await updateApplication(s.id, {
      relationship: (story.relationship || null) as never, years_in_business: story.years ? Number(story.years) : null, brand_story: story.brand_story.trim() || null,
      links, monthly_orders_estimate: story.monthly ? Number(story.monthly) : null,
    });
    await updateSellerPrivate(s.id, {
      legal_entity_type: biz.legal_entity_type ?? null, legal_name: biz.legal_name?.trim() || null, registration_no: biz.registration_no?.trim() || null,
      tax_registration_no: biz.tax_registration_no?.trim() || null, iban: biz.iban?.replace(/\s/g, '').toUpperCase() || null,
      bank_name: biz.bank_name?.trim() || null, account_holder: biz.account_holder?.trim() || null,
    });
    await reload();
  }, t('pfSaved'));

  async function addPortfolio(files: File[]) {
    const out: { name: string; reasons: Reason[] }[] = [];
    await run('portfolio', async () => {
      const pics = [...(file?.application?.portfolio ?? [])];
      for (const f of files.slice(0, 12 - pics.length)) {
        const r = await uploadMedia(s.id, f, 'portfolio');
        if (r.asset?.path && !['rejected', 'blocked'].includes(r.asset.status)) pics.push(r.asset.path);
        else out.push({ name: f.name, reasons: r.reasons });
      }
      await updateApplication(s.id, { portfolio: pics });
    });
    setRefused(out);
  }

  if (!file) return <Screen chrome="none"><T color={colors.muted}>…</T>{msg ? <Notice tone="warn" text={msg.text} /> : null}</Screen>;
  const a = file.application;
  const items = file.checklist.items;
  const doneCount = items.filter((x) => x.done).length;
  const minStory = g.settings.min_story_chars ?? 100;
  const minPhotos = g.settings.min_portfolio_photos ?? 3;
  const catStatus = new Map(file.categories.map((c) => [c.category_id, c]));
  const depts = departments(g);
  const deptNode = depts.find((d) => d.id === dept) ?? null;
  const docFor = (code: string) => file.documents.find((d) => d.doc_type === code && d.status !== 'rejected') ?? file.documents.find((d) => d.doc_type === code);
  const required = [...file.requirements, ...(gcc ? [] : g.documents.filter((d) => d.code === 'bank_letter').map((d) => ({ doc_type: d.code, label_en: d.label_en, label_ar: d.label_ar, required: true })))];
  const brandDocs = file.documents.filter((d) => ['authorised_distributor_letter', 'brand_registration'].includes(d.doc_type));
  const canSend = (s.status === 'pending' || s.status === 'info_requested') && file.checklist.complete && !MARKET_DEMO;
  const again = s.status === 'info_requested' || !!a?.submitted_at;

  const section = (title: string, children: React.ReactNode, hint?: string, done?: boolean) => (
    <Card pad={wide ? 24 : 16} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Serif size={wide ? 24 : 21} style={{ flexShrink: 1 }}>{title}</Serif>
        {done === undefined ? null : <Tag label={t(done ? 'apDone' : 'apToDo')} tone={done ? 'ok' : 'warn'} />}
      </View>
      {hint ? <T size={13} color={colors.muted} lh={1.55}>{hint}</T> : null}
      {children}
    </Card>
  );
  const isDone = (key: string) => items.find((x) => x.key === key)?.done;
  const rtl = { writingDirection: 'rtl' as const, textAlign: 'right' as const };
  const row = (children: React.ReactNode) => <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 0 }}>{children}</View>;
  const col = (children: React.ReactNode) => <View style={{ flex: 1 }}>{children}</View>;

  const side = (
    <View style={{ gap: 14 }}>
      <Card pad={wide ? 22 : 16} style={{ gap: 10, borderColor: colors.goldLine }}>
        <T w={600} size={10.5} caps color={colors.navy}>{t('apChecklist')}</T>
        <T size={13} color={colors.muted}>{t('sdFileProgress').replace('{done}', String(doneCount)).replace('{total}', String(items.length))}</T>
        {items.map((x) => (
          <View key={x.key} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Icon name={x.done ? 'check' : 'close'} size={15} color={x.done ? colors.success : colors.brass} stroke={2} />
            <T size={13.5} lh={1.5} color={x.done ? colors.body : colors.ink} style={{ flex: 1 }}>{lang === 'ar' ? x.ar : x.en}</T>
          </View>
        ))}
      </Card>
      {file.messages.length ? (
        <Card pad={wide ? 22 : 16} style={{ gap: 10 }}>
          <T w={600} size={10.5} caps color={colors.navy}>{t('apMessages')}</T>
          {file.messages.map((m, i) => (
            <View key={i} style={{ gap: 2, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft, paddingTop: i ? 8 : 0 }}>
              <T w={600} size={13} color={m.kind === 'info_requested' ? colors.brassText : colors.navy}>{t(`apEvent_${m.kind}` as Key)} · <T size={12} color={colors.muted} num>{m.at.slice(0, 10)}</T></T>
              {m.message ? <T size={13.5} lh={1.5} color={colors.body}>{m.message}</T> : null}
            </View>
          ))}
        </Card>
      ) : null}
      {!decided ? (
        <Card pad={wide ? 22 : 16} style={{ gap: 10, backgroundColor: colors.porcelain }}>
          <Field label={t('apSendNote')} value={note} onChangeText={setNote} multiline maxLength={2000} editable={!MARKET_DEMO} />
          <Button label={t(again ? 'apSendAgain' : 'apSend')} size="lg" full busy={busy === 'send'} disabled={!canSend}
            onPress={() => run('send', () => submitApplication(s.id, note.trim()).then(() => { setNote(''); return reload(); }), t('apSent'))} />
          {!file.checklist.complete ? <T size={12.5} color={colors.muted}>{t('apNotComplete')}</T> : null}
        </Card>
      ) : null}
    </View>
  );

  const main = (
    <View style={{ gap: 14 }}>
      {section(t('apStory'), <>
        <T w={500} size={12.5} color={colors.body}>{t('apRelationship')} *</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {RELATIONSHIPS.map((r) => <Chip key={r} size="sm" label={t(`apRel_${r}` as Key)} active={story.relationship === r} onPress={() => editable && setStory({ ...story, relationship: r })} />)}
        </View>
        {row(<>{col(<Field label={`${t('apYears')} *`} value={story.years} onChangeText={(v) => setStory({ ...story, years: v.replace(/\D/g, '').slice(0, 3) })} keyboardType="number-pad" dirLtr editable={editable} />)}
          {col(<Field label={t('apMonthly')} value={story.monthly} onChangeText={(v) => setStory({ ...story, monthly: v.replace(/\D/g, '').slice(0, 7) })} keyboardType="number-pad" dirLtr editable={editable} />)}</>)}
        <Field label={`${t('apStoryLabel')} *`} value={story.brand_story} onChangeText={(v) => setStory({ ...story, brand_story: v })} multiline maxLength={3000} editable={editable}
          hint={`${t('apStoryHint').replace('{n}', String(minStory))} (${story.brand_story.trim().length})`} />
        <Field label={t('apLinks')} value={story.links} onChangeText={(v) => setStory({ ...story, links: v })} multiline autoCapitalize="none" dirLtr editable={editable} />
      </>, undefined, isDone('story'))}

      {section(t('apCategories'), <>
        {file.categories.length ? (
          <View style={{ gap: 6 }}>
            {file.categories.map((c) => (
              <View key={c.category_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T size={14} w={500}>{lang === 'ar' ? c.name_ar : c.name_en}</T>
                <Tag label={t(`apCat_${c.status}` as Key)} tone={CAT_TONE[c.status]} />
                {c.note ? <T size={12.5} color={colors.muted}>{c.note}</T> : null}
                {c.status === 'requested' && !MARKET_DEMO ? <Button label={t('apWithdraw')} kind="text" size="sm" onPress={() => run(`w-${c.category_id}`, () => withdrawCategory(s.id, c.category_id))} /> : null}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
          {depts.map((d) => <Chip key={d.id} size="sm" label={lang === 'ar' ? d.name_ar : d.name_en} active={dept === d.id} onPress={() => setDept(dept === d.id ? null : d.id)} />)}
        </View>
        {deptNode ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[deptNode, ...leavesUnder(g, deptNode).filter((c) => c.listable)].map((c) => {
              const st = catStatus.get(c.id);
              return (
                <Chip key={c.id} size="sm" label={`${c.id === deptNode.id ? `${t('all')}: ` : ''}${lang === 'ar' ? c.name_ar : c.name_en}${st ? ` · ${t(`apCat_${st.status}` as Key)}` : ''}`}
                  active={!!st} onPress={() => { if (!st && !MARKET_DEMO) run(`c-${c.id}`, () => requestCategory(s.id, c.id)); }} />
              );
            })}
          </View>
        ) : null}
      </>, t('apCategoriesHint'), isDone('categories'))}

      {section(t('apPortfolio'), <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(a?.portfolio ?? []).map((p) => {
            const st = media[p]?.status ?? 'pending';
            return (
              <View key={p} style={{ width: wide ? 120 : 96, gap: 4 }}>
                <Photo uri={urls[p]} ratio={1} tone={colors.sandSoft} />
                <Tag label={t(`lfPhotoStatus_${st}` as Key)} tone={PHOTO_TONE[st]} />
                {editable ? (
                  <Pressable accessibilityRole="button" onPress={() => run('portfolio', () => updateApplication(s.id, { portfolio: (a?.portfolio ?? []).filter((x) => x !== p) }))}>
                    <T size={12} color={colors.danger} style={{ textDecorationLine: 'underline' }}>{t('remove')}</T>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
        {refused.map((r) => <Notice key={r.name} tone="warn" text={`${r.name}: ${r.reasons.map((x) => (lang === 'ar' ? x.ar : x.en)).join(' ')}`} />)}
        <PickFiles label={busy === 'portfolio' ? t('lfChecking') : t('pfAddPhotos')} disabled={!editable || busy === 'portfolio' || (a?.portfolio.length ?? 0) >= 12} onFiles={addPortfolio} />
      </>, t('apPortfolioHint').replace('{n}', String(minPhotos)), isDone('portfolio'))}

      {section(t('apBusiness'), <>
        <T w={500} size={12.5} color={colors.body}>{t('apEntityType')} *</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {LEGAL_ENTITIES.map((x) => <Chip key={x} size="sm" label={t(`apEntity_${x}` as Key)} active={biz.legal_entity_type === x} onPress={() => editable && setBiz({ ...biz, legal_entity_type: x })} />)}
        </View>
        {row(<>{col(<Field label={`${t('legalName')} *`} value={biz.legal_name ?? ''} onChangeText={(v) => setBiz({ ...biz, legal_name: v })} editable={editable} />)}
          {col(<Field label={`${t('registrationNo')} *`} value={biz.registration_no ?? ''} onChangeText={(v) => setBiz({ ...biz, registration_no: v })} dirLtr editable={editable} />)}</>)}
        {row(<>{col(<Field label={t('apTaxNo')} value={biz.tax_registration_no ?? ''} onChangeText={(v) => setBiz({ ...biz, tax_registration_no: v })} dirLtr editable={editable} />)}
          {col(<Field label={`${t('apBankName')} *`} value={biz.bank_name ?? ''} onChangeText={(v) => setBiz({ ...biz, bank_name: v })} editable={editable} />)}</>)}
        {row(<>{col(<Field label={`${t('apAccountHolder')} *`} value={biz.account_holder ?? ''} onChangeText={(v) => setBiz({ ...biz, account_holder: v })} editable={editable} />)}
          {gcc ? col(<Field label={`${t('apIban')} *`} value={biz.iban ?? ''} onChangeText={(v) => setBiz({ ...biz, iban: v.toUpperCase() })} autoCapitalize="characters" dirLtr editable={editable} />) : null}</>)}
        {editable ? <Button label={t('apSaveDetails')} busy={busy === 'save'} onPress={saveDetails} style={{ alignSelf: 'flex-start' }} /> : null}
        {decided ? <T size={12.5} color={colors.muted}>{t('apDecided')}</T> : null}
      </>, t('apBusinessHint'), isDone('business') && isDone('bank') !== false && isDone('tax') !== false)}

      {section(t('apDocuments'), <>
        {required.map((r) => {
          const d = docFor(r.doc_type);
          return (
            <View key={r.doc_type} style={{ flexDirection: wide ? 'row' : 'column', gap: 8, alignItems: wide ? 'center' : 'flex-start', borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 10 }}>
              <T w={500} size={14} style={{ flex: 1 }}>{lang === 'ar' ? r.label_ar : r.label_en}{r.required ? ' *' : ''}</T>
              <Tag label={t(d ? (d.status === 'accepted' ? 'lfDocAccepted' : d.status === 'pending' ? 'lfDocPending' : 'lfDocRejected') : 'lfDocMissing')} tone={d ? DOC_TONE[d.status] : 'warn'} />
              {d?.note ? <T size={12.5} color={colors.muted}>{d.note}</T> : null}
              <PickFiles label={t('lfUpload')} accept="application/pdf,image/jpeg,image/png" multiple={false} disabled={!editable || d?.status === 'accepted'}
                onFiles={(fl) => run(`d-${r.doc_type}`, () => uploadSellerDocument(s.id, r.doc_type, 'kyc', fl[0]))} />
            </View>
          );
        })}
        <View style={{ gap: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, marginTop: 4 }}>
          <T w={600} size={14}>{t('apBrandPapers')}</T>
          <T size={12.5} lh={1.5} color={colors.muted}>{t('apBrandPapersHint')}</T>
          {brandDocs.map((d) => (
            <View key={d.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <T size={13.5}>{d.subject ?? '—'} · {g.documents.find((x) => x.code === d.doc_type)?.[lang === 'ar' ? 'label_ar' : 'label_en'] ?? d.doc_type}</T>
              <Tag label={t(d.status === 'accepted' ? 'lfDocAccepted' : d.status === 'pending' ? 'lfDocPending' : 'lfDocRejected')} tone={DOC_TONE[d.status]} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <View style={{ width: wide ? 240 : '100%' }}><Field label={t('apBrandName')} value={brand} onChangeText={setBrand} maxLength={120} editable={!MARKET_DEMO} /></View>
            <View style={{ marginBottom: 18, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(['authorised_distributor_letter', 'brand_registration'] as const).map((code) => (
                <PickFiles key={code} label={g.documents.find((x) => x.code === code)?.[lang === 'ar' ? 'label_ar' : 'label_en'] ?? code} accept="application/pdf,image/jpeg,image/png" multiple={false}
                  disabled={!brand.trim() || MARKET_DEMO} onFiles={(fl) => run(`b-${code}`, () => uploadSellerDocument(s.id, code, 'brand', fl[0], brand).then(() => setBrand('')))} />
              ))}
            </View>
          </View>
        </View>
      </>, t('apDocumentsHint'), isDone('documents'))}

      {section(t('apPickup'), <>
        {file.locations.map((l) => <T key={l.id} size={14}>{l.label} · {l.line1}, {l.city} · {l.pickup_from.slice(0, 5)}–{l.pickup_to.slice(0, 5)}</T>)}
        <Button label={t('apManageAddresses')} kind="secondary" size="sm" href="/seller/shop" style={{ alignSelf: 'flex-start' }} />
      </>, t('apPickupHint'), isDone('pickup'))}

      {section(t('apSample'), <>
        <Tag label={t(`apSample_${a?.sample_status ?? 'not_requested'}` as Key)} tone={a?.sample_status === 'passed' || a?.sample_status === 'not_needed' ? 'ok' : a?.sample_status === 'failed' ? 'err' : 'info'} />
        {a?.sample_note ? <T size={14} lh={1.55} color={colors.body}>{a.sample_note}</T> : null}
      </>)}
    </View>
  );

  return (
    <Screen chrome="none" style={{ maxWidth: 1240 }}>
      <Seo title="Your seller file | Seller | Al Mukarramah" description="Seller application." path="/seller/application" noindex />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Serif role="h1" size={wide ? 40 : 30}>{t('apTitle')}</Serif>
        <Tag label={t(`sellerStatus_${s.status}` as Key)} tone={STATUS_TONE[s.status]} />
      </View>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('apIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      {s.review_note && !decided ? <Notice tone={s.status === 'info_requested' ? 'warn' : 'info'} text={s.review_note} /> : null}
      {msg ? <Notice tone={msg.tone === 'info' ? 'info' : msg.tone} text={msg.text} /> : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 14, alignItems: 'flex-start', marginTop: 8 }}>
        <View style={{ flex: 1, alignSelf: 'stretch' }}>{main}</View>
        <View style={{ width: wide ? 360 : '100%' }}>{side}</View>
      </View>
    </Screen>
  );
}
