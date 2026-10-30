// Staff: seller applications and accounts. Approve, reject, suspend, set the margin (25% to 50%),
// open private-label / fulfilment partner accounts, and give people access to a seller dashboard.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName, CountryPicker } from '@/components/country';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Field, H1, Notice, T, Tag } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { Seller } from '@/lib/types';
import { STATUS_TONE } from '@/lib/seller-context';
import { colors } from '@/theme';

type Row = {
  seller: Seller & { agreed_guidelines_at: string | null };
  private: { contact_name: string; contact_email: string; contact_phone: string | null; legal_name: string | null; registration_no: string | null; product_summary: string | null; internal_notes: string | null } | null;
  live: number; waiting: number;
};

function SellerCard({ r, onChanged }: { r: Row; onChanged: () => void }) {
  const s = r.seller;
  const [note, setNote] = useState(s.review_note ?? '');
  const [pct, setPct] = useState(String(s.commission_bps / 100));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const update = async (patch: Partial<Seller>) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('sellers').update(patch).eq('id', s.id);
    setBusy(false);
    if (error) return setMsg({ tone: 'warn', text: error.message });
    onChanged();
  };
  const setStatus = (status: Seller['status']) => {
    if ((status === 'rejected' || status === 'suspended') && !note.trim()) return setMsg({ tone: 'warn', text: 'Write a short note for the seller first.' });
    update({ status, review_note: note.trim() || null });
  };
  const saveMargin = () => {
    const bps = Math.round(Number(pct) * 100);
    if (!(bps >= 2500 && bps <= 5000)) return setMsg({ tone: 'warn', text: 'Margin must be between 25% and 50%.' });
    update({ commission_bps: bps });
  };
  const addMember = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('staff_add_seller_member', { p_seller: s.id, p_email: email });
    setBusy(false);
    setMsg(error ? { tone: 'warn', text: error.message } : { tone: 'ok', text: `${email} can now open the seller dashboard.` });
    if (!error) setEmail('');
  };

  return (
    <Card pad={16} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <T w={700} size={16} color={colors.navy}>{s.name_en}{s.name_ar ? ` · ${s.name_ar}` : ''}</T>
        <Tag label={s.status} tone={STATUS_TONE[s.status]} />
        <Tag label={s.kind === 'partner' ? 'Partner (hidden, sold as Al Mukarramah)' : 'Marketplace seller'} tone="info" />
      </View>
      <T size={13} color={colors.muted}>{countryName(s.country, 'en')}{s.city ? `, ${s.city}` : ''} · applied {new Date(s.created_at).toLocaleDateString('en-GB')} · {r.live} live · {r.waiting} waiting for review{s.website ? ` · ${s.website}` : ''}</T>
      {r.private && (
        <View style={{ backgroundColor: colors.sandSoft, borderRadius: 10, padding: 10, gap: 2 }}>
          <T size={13.5}>{r.private.contact_name} · {r.private.contact_email}{r.private.contact_phone ? ` · ${r.private.contact_phone}` : ''}</T>
          {r.private.legal_name || r.private.registration_no ? <T size={13}>{r.private.legal_name ?? ''} {r.private.registration_no ? `· Reg. ${r.private.registration_no}` : ''}</T> : null}
          {r.private.product_summary ? <T size={13} color={colors.body}>Plans to sell: {r.private.product_summary}</T> : null}
        </View>
      )}
      <Field label="Note to the seller (shown on their dashboard)" value={note} onChangeText={setNote} multiline />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {s.status !== 'approved' && <Button size="sm" label="Approve seller" busy={busy} onPress={() => setStatus('approved')} />}
        {s.status === 'pending' && <Button size="sm" kind="danger" label="Reject" busy={busy} onPress={() => setStatus('rejected')} />}
        {s.status === 'approved' && <Button size="sm" kind="danger" label="Suspend (hides all their products)" busy={busy} onPress={() => setStatus('suspended')} />}
        <Button size="sm" kind="secondary" label={s.kind === 'partner' ? 'Make marketplace seller' : 'Make partner'} busy={busy} onPress={() => update({ kind: s.kind === 'partner' ? 'marketplace' : 'partner' })} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
        <View style={{ width: 160 }}><Field label="Margin %" value={pct} onChangeText={setPct} keyboardType="decimal-pad" hint="25 to 50" /></View>
        <Button size="sm" kind="secondary" label="Save margin" busy={busy} onPress={saveMargin} style={{ marginBottom: 30 }} />
        <View style={{ flex: 1, minWidth: 220 }}><Field label="Give dashboard access (their sign-in email)" value={email} onChangeText={setEmail} autoCapitalize="none" /></View>
        <Button size="sm" kind="secondary" label="Add" busy={busy} disabled={!email.includes('@')} onPress={addMember} style={{ marginBottom: 30 }} />
      </View>
      {msg && <Notice tone={msg.tone} text={msg.text} />}
    </Card>
  );
}

export default function AdminSellers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'all' | Seller['status']>('pending');
  const [err, setErr] = useState<string | null>(null);
  const [nf, setNf] = useState({ name_en: '', country: '', contact_email: '', kind: 'partner' });
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
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
    setFilter('approved');
    load();
  };
  const shown = (rows ?? []).filter((r) => filter === 'all' || r.seller.status === filter);
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Sellers | Admin | Al Mukarramah" description="Staff only." path="/admin/sellers" noindex />
      <H1>Sellers and partners</H1>
      <T size={14} color={colors.muted} lh={1.6} style={{ marginBottom: 12 }}>Marketplace sellers have their own public shop page. Partners (private label and fulfilment, e.g. Ahmed Al Maghribi) are hidden: their products are sold as Al Mukarramah. Everyone ships their own orders.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {(['pending', 'approved', 'suspended', 'rejected', 'all'] as const).map((f) => (
          <Chip key={f} size="sm" label={`${f} (${(rows ?? []).filter((r) => f === 'all' || r.seller.status === f).length})`} active={filter === f} onPress={() => setFilter(f)} />
        ))}
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
        <Button label="Create (approved, margin 25%)" busy={creating} disabled={!nf.name_en.trim() || !nf.country} onPress={create} style={{ alignSelf: 'flex-start' }} />
      </Card>
    </Screen>
  );
}
