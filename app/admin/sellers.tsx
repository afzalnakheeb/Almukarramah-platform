// Staff: seller applications and accounts. Owner and manager review the file (story, portfolio, KYC and documents,
// categories, sample), ask for more information, approve (KYC, sample and corridor are checked by the database),
// reject, suspend or reinstate; set the margin (25% to 50%); open partner accounts; give people dashboard access.
// Every decision and note goes into the seller's review history; the audit log records every change.
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName, CountryPicker } from '@/components/country';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, H1, Notice, Photo, T, Tag, useWide } from '@/components/ui';
import { MARKET_DEMO } from '@/lib/market';
import { demoAdminSellers } from '@/lib/market-demo';
import { STATUS_TONE } from '@/lib/seller-context';
import { mediaFor, photoUrls, type Checklist, type MediaAsset, type SellerApplication, type SellerCategory, type SellerPrivate } from '@/lib/seller';
import { callFunction, fromDb, supabase } from '@/lib/supabase';
import type { Seller } from '@/lib/types';
import { colors } from '@/theme';

type Doc = { id: string; doc_type: string; status: 'pending' | 'accepted' | 'rejected'; note: string | null; file_name: string | null; subject: string | null; path: string; expires_on: string | null };
type Row = {
  seller: Seller & { agreed_guidelines_at: string | null; flagged_at?: string | null; flag_reason?: string | null; suspended_reason?: string | null };
  private: (SellerPrivate & { internal_notes: string | null }) | null;
  application: SellerApplication | null;
  live: number; waiting: number; documents: Doc[]; required: { doc_type: string; label_en: string; required: boolean }[];
  categories: SellerCategory[]; locations: number; strikes: number;
  events: { kind: string; message: string | null; at: string; visible: boolean }[]; checklist: Checklist;
};
type Tab = 'review' | 'shop_pages' | 'info_requested' | 'in_progress' | 'approved' | 'suspended' | 'rejected';
const TABS: { key: Tab; label: string; test: (r: Row) => boolean }[] = [
  { key: 'review', label: 'To review', test: (r) => r.seller.status === 'pending' && !!r.application?.submitted_at },
  { key: 'shop_pages', label: 'Shop page changes', test: (r) => !!r.seller.profile_pending },
  { key: 'info_requested', label: 'Waiting for the seller', test: (r) => r.seller.status === 'info_requested' },
  { key: 'in_progress', label: 'Still filling in', test: (r) => r.seller.status === 'pending' && !r.application?.submitted_at },
  { key: 'approved', label: 'Approved', test: (r) => r.seller.status === 'approved' },
  { key: 'suspended', label: 'Suspended', test: (r) => r.seller.status === 'suspended' },
  { key: 'rejected', label: 'Rejected', test: (r) => r.seller.status === 'rejected' },
];
const SAMPLE = ['not_requested', 'requested', 'received', 'passed', 'failed', 'not_needed'] as const;
const KYC_TONE: Record<string, 'ok' | 'warn' | 'err' | 'info' | 'mute'> = { approved: 'ok', submitted: 'info', info_requested: 'warn', rejected: 'err', expired: 'err', not_started: 'mute' };
const mask = (iban?: string | null) => (iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : '—');

function SellerCard({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const wide = useWide();
  const s = r.seller;
  const a = r.application;
  const [note, setNote] = useState('');
  const [pct, setPct] = useState(s.commission_bps === null ? '' : String(s.commission_bps / 100));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [pics, setPics] = useState<{ urls: Record<string, string>; media: Record<string, MediaAsset> }>({ urls: {}, media: {} });
  const [chosen, setChosen] = useState<string[]>(r.categories.filter((c) => c.status === 'requested').map((c) => c.category_id));
  const [open, setOpen] = useState(r.seller.status === 'pending' && !!a?.submitted_at);

  useEffect(() => {
    if (!open || !a?.portfolio?.length) return;
    if (MARKET_DEMO) return setPics({ urls: Object.fromEntries(a.portfolio.map((p) => [p, p])), media: {} });
    Promise.all([photoUrls(a.portfolio), mediaFor(a.portfolio)]).then(([urls, media]) => setPics({ urls, media }), () => undefined);
  }, [open, a?.portfolio?.join()]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    if (MARKET_DEMO) return setMsg({ tone: 'warn', text: 'Demonstration only: nothing is changed.' });
    setBusy(key); setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }); onChanged(); }
    catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  };
  const rpc = async (name: string, args: Record<string, unknown>) => { const { error } = await supabase.rpc(name, args); if (error) throw fromDb(error); };
  const table = async (name: string, patch: Record<string, unknown>, col: string, val: string) => {
    const { error } = await supabase.from(name).update(patch).eq(col, val);
    if (error) throw new Error(error.message);
  };
  const review = (action: string) => run(action, () => rpc('mp_review_seller', { p_seller: s.id, p_action: action, p_message: note || null, p_categories: null }).then(() => setNote('')));
  const approve = () => run('approve', () => callFunction('review-seller', { sellerId: s.id, action: 'approve', message: note || undefined, categories: chosen }).then(() => setNote('')));
  const kyc = (status: 'approved' | 'info_requested' | 'rejected') => run(`kyc-${status}`, () => table('seller_private', { kyc_status: status, kyc_note: note.trim() || null }, 'seller_id', s.id));
  const doc = (d: Doc, status: 'accepted' | 'rejected') => run(`d-${d.id}`, () => table('seller_documents', { status, note: status === 'rejected' ? note.trim() || null : null }, 'id', d.id));
  const openDoc = async (d: Doc) => { const { data } = await supabase.storage.from('seller-kyc').createSignedUrl(d.path, 300); if (data?.signedUrl) Linking.openURL(data.signedUrl); };
  const decideCat = (c: SellerCategory, status: 'approved' | 'declined') =>
    run(`c-${c.category_id}`, async () => { const { error } = await supabase.from('seller_categories').update({ status, note: status === 'declined' ? note.trim() || null : null }).eq('seller_id', s.id).eq('category_id', c.category_id); if (error) throw new Error(error.message); });
  const sample = (st: (typeof SAMPLE)[number]) => run(`s-${st}`, () => table('seller_applications', { sample_status: st, sample_note: note.trim() || a?.sample_note || null }, 'seller_id', s.id));
  const saveMargin = () => {
    const bps = Math.round(Number(pct) * 100);
    if (!(bps >= 2500 && bps <= 5000)) return setMsg({ tone: 'warn', text: 'Margin must be between 25% and 50%.' });
    run('margin', () => table('sellers', { commission_bps: bps }, 'id', s.id), 'Margin saved.');
  };
  const addMember = () => run('member', () => rpc('staff_add_seller_member', { p_seller: s.id, p_email: email }).then(() => setEmail('')), `${email} can now open the seller dashboard.`);
  const waitingMedia = [s.logo, s.banner].some((x) => x && !/^https:\/\//.test(x));
  const pendingText = Object.entries(s.profile_pending ?? {});
  const missing = r.checklist.items.filter((x) => !x.done);

  return (
    <Card pad={16} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <T w={700} size={16} color={colors.navy}>{s.name_en}{s.name_ar ? ` · ${s.name_ar}` : ''}</T>
        <Tag label={s.status} tone={STATUS_TONE[s.status]} />
        <Tag label={s.kind === 'partner' ? 'Partner (hidden, sold as Al Mukarramah)' : 'Marketplace seller'} tone="info" />
        {r.private?.kyc_status ? <Tag label={`KYC: ${r.private.kyc_status}`} tone={KYC_TONE[r.private.kyc_status] ?? 'info'} /> : null}
        {a ? <Tag label={`Sample: ${a.sample_status.replace(/_/g, ' ')}`} tone={a.sample_status === 'passed' || a.sample_status === 'not_needed' ? 'ok' : a.sample_status === 'failed' ? 'err' : 'info'} /> : null}
        {r.strikes ? <Tag label={`${r.strikes} active strike${r.strikes > 1 ? 's' : ''}`} tone="err" /> : null}
        {s.flagged_at ? <Tag label={`Flagged: ${s.flag_reason ?? ''}`} tone="err" /> : null}
      </View>
      <T size={13} color={colors.muted}>
        {countryName(s.country, 'en')}{s.city ? `, ${s.city}` : ''} · applied {s.created_at.slice(0, 10)}{a?.submitted_at ? ` · sent ${a.submitted_at.slice(0, 10)}` : ' · not sent yet'} · {r.live} live · {r.waiting} waiting · {r.locations} pickup address{r.locations === 1 ? '' : 'es'}
      </T>
      {missing.length ? <T size={12.5} color={colors.brassText}>Missing: {missing.map((x) => x.key).join(', ')}</T> : <T size={12.5} color={colors.success}>File complete</T>}
      {pendingText.length ? (
        <View style={{ backgroundColor: colors.sandSoft, padding: 12, gap: 4 }}>
          <T w={700} size={13.5}>Shop page changes waiting for approval{s.profile_submitted_at ? ` (sent ${s.profile_submitted_at.slice(0, 10)})` : ''}</T>
          <T size={12.5} color={colors.muted}>The public page keeps showing the approved text until you approve. Check for contact details, links and claims.</T>
          {pendingText.map(([k, v]) => (
            <T key={k} size={13} lh={1.5}><T w={600} size={13}>{k.replace(/_/g, ' ')}:</T> {v ?? '(removed)'}{'  '}<T size={12} color={colors.muted}>was: {String((s as unknown as Record<string, unknown>)[k] ?? '—')}</T></T>
          ))}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <Button size="sm" label="Approve the changes" busy={busy === 'approve_profile'} onPress={() => review('approve_profile')} />
            <Button size="sm" kind="danger" label="Send back (message required)" busy={busy === 'reject_profile'} disabled={!note.trim()} onPress={() => review('reject_profile')} />
          </View>
        </View>
      ) : null}
      {!open ? <Button label="Open the file" kind="text" size="sm" onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} /> : (
        <View style={{ gap: 12 }}>
          {a ? (
            <View style={{ backgroundColor: colors.sandSoft, padding: 12, gap: 4 }}>
              <T size={13.5}><T w={600} size={13.5}>Relationship:</T> {a.relationship?.replace(/_/g, ' ') ?? '—'} · <T w={600} size={13.5}>Years:</T> {a.years_in_business ?? '—'} · <T w={600} size={13.5}>Orders a month:</T> {a.monthly_orders_estimate ?? '—'}</T>
              {a.brand_story ? <T size={13.5} lh={1.55} color={colors.body}>{a.brand_story}</T> : null}
              {r.private?.product_summary ? <T size={13} color={colors.body}>Plans to sell: {r.private.product_summary}</T> : null}
              {a.links.length ? <T size={13} color={colors.navy}>{a.links.join('  ·  ')}</T> : null}
            </View>
          ) : null}
          {a?.portfolio?.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {a.portfolio.map((p) => (
                <View key={p} style={{ width: wide ? 120 : 92, gap: 2 }}>
                  <Photo uri={pics.urls[p]} ratio={1} tone={colors.sandSoft} fit="cover" />
                  {pics.media[p] ? <T size={11} color={pics.media[p].status === 'passed' ? colors.success : colors.brassText}>{pics.media[p].status}</T> : null}
                </View>
              ))}
            </View>
          ) : null}
          {r.private ? (
            <View style={{ gap: 3 }}>
              <T w={700} size={13}>Contact, legal and bank (private)</T>
              <T size={13}>{r.private.contact_name} · {r.private.contact_email}{r.private.contact_phone ? ` · ${r.private.contact_phone}` : ''}</T>
              <T size={13}>{r.private.legal_name ?? '—'} ({r.private.legal_entity_type?.replace(/_/g, ' ') ?? 'type not given'}) · Reg. {r.private.registration_no ?? '—'} · Tax {r.private.tax_registration_no ?? '—'}</T>
              <T size={13}>{r.private.bank_name ?? '—'} · {r.private.account_holder ?? '—'} · IBAN {mask(r.private.iban)}</T>
              {r.private.kyc_note ? <T size={12.5} color={colors.muted}>KYC note: {r.private.kyc_note}</T> : null}
              {r.private.internal_notes ? <T size={12.5} color={colors.muted}>Internal: {r.private.internal_notes}</T> : null}
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            <T w={700} size={13}>Documents</T>
            {r.required.map((q) => {
              const has = r.documents.some((d) => d.doc_type === q.doc_type && d.status !== 'rejected');
              return has ? null : <T key={q.doc_type} size={12.5} color={colors.danger}>Missing: {q.label_en}</T>;
            })}
            {r.documents.map((d) => (
              <View key={d.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <T size={13}>{d.doc_type.replace(/_/g, ' ')}{d.subject ? ` (${d.subject})` : ''}{d.file_name ? ` · ${d.file_name}` : ''}{d.expires_on ? ` · expires ${d.expires_on}` : ''}</T>
                <Tag label={d.status} tone={d.status === 'accepted' ? 'ok' : d.status === 'rejected' ? 'err' : 'info'} />
                <Button label="Open" kind="text" size="sm" onPress={() => openDoc(d)} />
                {d.status !== 'accepted' ? <Button label="Accept" kind="secondary" size="sm" busy={busy === `d-${d.id}`} onPress={() => doc(d, 'accepted')} /> : null}
                {d.status !== 'rejected' ? <Button label="Reject (uses the note)" kind="text" size="sm" disabled={!note.trim()} onPress={() => doc(d, 'rejected')} /> : null}
              </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button label="KYC approved" kind="secondary" size="sm" busy={busy === 'kyc-approved'} disabled={r.private?.kyc_status === 'approved'} onPress={() => kyc('approved')} />
              <Button label="KYC: ask for more (uses the note)" kind="text" size="sm" disabled={!note.trim()} onPress={() => kyc('info_requested')} />
              <Button label="KYC rejected (uses the note)" kind="text" size="sm" disabled={!note.trim()} onPress={() => kyc('rejected')} />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <T w={700} size={13}>Categories (tick the ones to approve with the seller)</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {r.categories.map((c) => c.status === 'requested' && s.status !== 'approved' ? (
                <Chip key={c.category_id} size="sm" label={`${c.name_en} (${c.kind})`} active={chosen.includes(c.category_id)}
                  onPress={() => setChosen(chosen.includes(c.category_id) ? chosen.filter((x) => x !== c.category_id) : [...chosen, c.category_id])} />
              ) : (
                <View key={c.category_id} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  <Tag label={`${c.name_en}: ${c.status}`} tone={c.status === 'approved' ? 'ok' : c.status === 'declined' ? 'err' : 'info'} />
                  {c.status === 'requested' ? <Button label="Approve" kind="text" size="sm" onPress={() => decideCat(c, 'approved')} /> : null}
                  {c.status !== 'declined' ? <Button label="Decline" kind="text" size="sm" disabled={!note.trim() && c.status === 'requested'} onPress={() => decideCat(c, 'declined')} /> : null}
                </View>
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <T w={700} size={13}>Sample{a?.sample_note ? `: ${a.sample_note}` : ''}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SAMPLE.map((x) => <Chip key={x} size="sm" label={x.replace(/_/g, ' ')} active={a?.sample_status === x} onPress={() => sample(x)} />)}
            </View>
            <T size={12} color={colors.muted}>The note below, if any, is saved as the sample note the seller sees (where to send it, what we found).</T>
          </View>
          {r.events.length ? (
            <View style={{ gap: 3 }}>
              <T w={700} size={13}>History</T>
              {r.events.map((e, i) => <T key={i} size={12.5} color={e.visible ? colors.body : colors.brassText}>{e.at.slice(0, 16).replace('T', ' ')} · {e.kind.replace(/_/g, ' ')}{e.visible ? '' : ' (staff only)'}{e.message ? `: ${e.message}` : ''}</T>)}
            </View>
          ) : null}
        </View>
      )}

      <Field label="Message to the seller (required to ask for more, reject, suspend or reinstate) or a staff note" value={note} onChangeText={setNote} multiline />
      {msg && <Notice tone={msg.tone} text={msg.text} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['pending', 'info_requested', 'rejected'].includes(s.status) ? <Button size="sm" label={`Approve${chosen.length ? ` with ${chosen.length} categor${chosen.length === 1 ? 'y' : 'ies'}` : ''}`} busy={busy === 'approve'} onPress={approve} /> : null}
        {['pending', 'info_requested'].includes(s.status) ? <Button size="sm" kind="secondary" label="Ask for more information" busy={busy === 'request_info'} disabled={!note.trim()} onPress={() => review('request_info')} /> : null}
        {['pending', 'info_requested'].includes(s.status) ? <Button size="sm" kind="danger" label="Reject" busy={busy === 'reject'} disabled={!note.trim()} onPress={() => review('reject')} /> : null}
        {s.status === 'approved' ? <Button size="sm" kind="danger" label="Suspend (hides all their products)" busy={busy === 'suspend'} disabled={!note.trim()} onPress={() => review('suspend')} /> : null}
        {s.status === 'suspended' ? <Button size="sm" label="Reinstate" busy={busy === 'reinstate'} disabled={!note.trim()} onPress={() => review('reinstate')} /> : null}
        {s.status === 'approved' && waitingMedia ? <Button size="sm" kind="secondary" label="Publish logo and banner" busy={busy === 'media'} onPress={() => run('media', () => callFunction('review-seller', { sellerId: s.id, action: 'publish_media' }))} /> : null}
        <Button size="sm" kind="text" label="Add staff note" disabled={!note.trim()} onPress={() => review('note')} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ width: 160 }}><Field label="Margin %" value={pct} onChangeText={setPct} keyboardType="decimal-pad" hint="25 to 50; empty: the category's rate" /></View>
        <Button size="sm" kind="secondary" label="Save margin" busy={busy === 'margin'} onPress={saveMargin} style={{ marginBottom: 30 }} />
        <View style={{ flex: 1, minWidth: 220 }}><Field label="Give dashboard access (their sign-in email)" value={email} onChangeText={setEmail} autoCapitalize="none" /></View>
        <Button size="sm" kind="secondary" label="Add" busy={busy === 'member'} disabled={!email.includes('@')} onPress={addMember} style={{ marginBottom: 30 }} />
      </View>
    </Card>
  );
}

export default function AdminSellers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  const [err, setErr] = useState<string | null>(null);
  const [nf, setNf] = useState({ name_en: '', country: '', contact_email: '', kind: 'partner' });
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    if (MARKET_DEMO) return setRows(demoAdminSellers() as unknown as Row[]);
    const { data, error } = await supabase.rpc('admin_sellers');
    if (error) setErr(error.message); else setRows((data as Row[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    setCreating(true); setErr(null);
    const { error } = await supabase.rpc('staff_create_seller', { p: nf });
    setCreating(false);
    if (error) return setErr(error.message);
    setNf({ name_en: '', country: '', contact_email: '', kind: 'partner' });
    setTab(nf.kind === 'partner' ? 'approved' : 'in_progress');
    load();
  };
  const current = TABS.find((x) => x.key === tab)!;
  const shown = (rows ?? []).filter(current.test);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Sellers | Admin | Al Mukarramah" description="Staff only." path="/admin/sellers" noindex />
      <H1>Sellers and partners</H1>
      <T size={14} color={colors.muted} lh={1.6} style={{ marginBottom: 12 }}>
        Marketplace sellers have their own public shop page. Partners (private label and fulfilment) are hidden: their products are sold as Al Mukarramah.
        Approval needs the KYC approved, the sample passed (or marked not needed) and an open corridor from the seller's country; the database checks all three.
      </T>
      {MARKET_DEMO ? <Notice text="Demonstration: example sellers only, nothing is saved." /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {TABS.map((x) => <Chip key={x.key} size="sm" label={`${x.label} (${(rows ?? []).filter(x.test).length})`} active={tab === x.key} onPress={() => setTab(x.key)} />)}
      </View>
      {err && <Notice tone="warn" text={err} />}
      <View style={{ gap: 12 }}>{shown.map((r) => <SellerCard key={r.seller.id} r={r} onChanged={load} />)}</View>
      {rows && !shown.length && <T color={colors.muted}>Nothing here.</T>}

      <Card pad={16} style={{ gap: 6, marginTop: 24, borderColor: colors.champagne }}>
        <T w={700} size={16} color={colors.navy}>Open a partner or seller account</T>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <Chip size="sm" label="Partner (hidden)" active={nf.kind === 'partner'} onPress={() => setNf({ ...nf, kind: 'partner' })} />
          <Chip size="sm" label="Marketplace seller" active={nf.kind === 'marketplace'} onPress={() => setNf({ ...nf, kind: 'marketplace' })} />
        </View>
        <Field label="Name (English)" value={nf.name_en} onChangeText={(v) => setNf({ ...nf, name_en: v })} />
        <CountryPicker label="Ships from" value={nf.country} onChange={(c) => setNf({ ...nf, country: c })} />
        <Field label="Contact email" value={nf.contact_email} onChangeText={(v) => setNf({ ...nf, contact_email: v })} autoCapitalize="none" />
        <Button label={nf.kind === 'partner' ? 'Create partner (approved)' : 'Create seller (they complete the file)'} busy={creating} disabled={!nf.name_en.trim() || !nf.country || MARKET_DEMO} onPress={create} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </Screen>
  );
}
