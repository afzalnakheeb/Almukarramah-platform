// Drafts to approve: hidden products (e.g. Ahmed Al Maghribi) shown with photo, price and delivery rule.
// Nothing goes on sale until the owner selects products and confirms on this page.
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Chip, H1, Notice, Photo, T, Tag } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Row = {
  id: string; slug: string; name_en: string; name_ar: string; base_price_sar: number; images: string[] | null;
  is_active: boolean; brand: string | null; ship_class: string; description_en: string | null;
  categories: { slug: string; name_en: string } | null;
};

const SHIP: Record<string, { label: string; tone: 'warn' | 'ok' | 'info' }> = {
  perfume_spray: { label: 'Saudi delivery only (spray)', tone: 'warn' },
  perfume_oil: { label: 'Oil: ships abroad', tone: 'ok' },
  standard: { label: 'Ships abroad', tone: 'info' },
};

export default function Drafts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>('all');
  const [show, setShow] = useState<'draft' | 'live'>('draft');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<'publish' | 'hide' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('products')
      .select('id, slug, name_en, name_ar, base_price_sar, images, is_active, brand, ship_class, description_en, categories(slug, name_en)')
      .not('brand', 'is', null)
      .order('name_en');
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const cats = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => r.categories && m.set(r.categories.slug, r.categories.name_en));
    return [...m.entries()];
  }, [rows]);
  const view = rows.filter((r) => (show === 'draft' ? !r.is_active : r.is_active) && (cat === 'all' || r.categories?.slug === cat));
  const draftCount = rows.filter((r) => !r.is_active).length;
  const liveCount = rows.length - draftCount;
  const selectedInView = view.filter((r) => picked.has(r.id));

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setPicked((p) => { const n = new Set(p); const all = view.every((r) => n.has(r.id)); view.forEach((r) => (all ? n.delete(r.id) : n.add(r.id))); return n; });

  async function apply(action: 'publish' | 'hide') {
    setBusy(true);
    setMsg(null);
    const ids = selectedInView.map((r) => r.id);
    const { error } = await supabase.from('products').update({ is_active: action === 'publish', updated_at: new Date().toISOString() }).in('id', ids);
    if (!error && action === 'publish') {
      // A collection appears in the shop once it has products on sale.
      const slugs = [...new Set(selectedInView.map((r) => r.categories?.slug).filter(Boolean))] as string[];
      if (slugs.length) await supabase.from('categories').update({ is_active: true }).in('slug', slugs);
    }
    setBusy(false);
    setConfirming(null);
    if (error) return setMsg({ tone: 'warn', text: `Not saved: ${error.message}` });
    setPicked(new Set());
    setMsg({ tone: 'ok', text: action === 'publish'
      ? `${ids.length} product${ids.length > 1 ? 's are' : ' is'} now on sale. Ask Claude to refresh the website so each product gets its own page for Google.`
      : `${ids.length} product${ids.length > 1 ? 's are' : ' is'} hidden from the shop again.` });
    load();
  }

  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Drafts | Admin | Al Mukarramah" description="Staff only." path="/admin/drafts" noindex />
      <H1>Drafts to approve</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12 }}>
        Ahmed Al Maghribi products at their official Saudi prices (VAT included). Hidden products are not visible to customers. Select the ones you want and put them on sale.
      </T>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Chip label={`Hidden drafts (${draftCount})`} active={show === 'draft'} onPress={() => { setShow('draft'); setConfirming(null); }} />
        <Chip label={`On sale (${liveCount})`} active={show === 'live'} onPress={() => { setShow('live'); setConfirming(null); }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Chip size="sm" label="All" active={cat === 'all'} onPress={() => setCat('all')} />
        {cats.map(([slug, name]) => <Chip key={slug} size="sm" label={name} active={cat === slug} onPress={() => setCat(slug)} />)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginBottom: 14 }}>
        <Button size="sm" kind="secondary" label={view.length && view.every((r) => picked.has(r.id)) ? 'Clear selection' : `Select all ${view.length}`} onPress={selectAll} disabled={!view.length} />
        <T size={14} w={600} style={{ flex: 1, minWidth: 140 }}>{selectedInView.length} selected</T>
        {confirming ? (
          <>
            <T size={14} color={colors.navy} w={700}>
              {confirming === 'publish' ? `Put ${selectedInView.length} on sale at the prices shown?` : `Hide ${selectedInView.length} from the shop?`}
            </T>
            <Button size="sm" label={confirming === 'publish' ? 'Yes, put on sale' : 'Yes, hide'} kind={confirming === 'publish' ? 'primary' : 'danger'} busy={busy} onPress={() => apply(confirming)} />
            <Button size="sm" kind="text" label="Cancel" onPress={() => setConfirming(null)} />
          </>
        ) : show === 'draft' ? (
          <Button size="sm" label={`Put ${selectedInView.length || ''} on sale`} disabled={!selectedInView.length} onPress={() => setConfirming('publish')} />
        ) : (
          <Button size="sm" kind="danger" label={`Hide ${selectedInView.length || ''}`} disabled={!selectedInView.length} onPress={() => setConfirming('hide')} />
        )}
      </View>
      {msg && <Notice tone={msg.tone} text={msg.text} />}

      {loading ? <T color={colors.muted}>Loading…</T> : view.length === 0 ? (
        <T color={colors.muted}>{show === 'draft' ? 'No hidden drafts here.' : 'Nothing on sale here yet.'}</T>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {view.map((r) => {
            const on = picked.has(r.id);
            const ship = SHIP[r.ship_class] ?? SHIP.standard;
            return (
              <Pressable key={r.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(r.id)}
                style={{ flexGrow: 1, flexBasis: 220, maxWidth: 280, backgroundColor: colors.white, borderRadius: 18, borderWidth: on ? 2 : 1, borderColor: on ? colors.navy : colors.line, padding: 10, gap: 8 }}>
                <View>
                  <Photo uri={r.images?.[0]} ratio={1} fit="contain" tone={colors.white} style={{ borderRadius: 12 }} />
                  <View style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: on ? colors.navy : colors.inputLine, backgroundColor: on ? colors.navy : colors.white, alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Icon name="check" size={16} color={colors.white} />}
                  </View>
                </View>
                <T w={700} size={14} lh={1.35} numberOfLines={3}>{r.name_en}</T>
                <T size={13.5} color={colors.body} numberOfLines={2} style={{ writingDirection: 'rtl', textAlign: 'right' }}>{r.name_ar}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                  <T w={700} size={15} color={colors.navy}>{formatMoney(r.base_price_sar, 'SAR', 'en')}</T>
                  <Tag label={ship.label} tone={ship.tone} />
                </View>
                <T size={12} color={colors.muted}>{r.categories?.name_en}</T>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
