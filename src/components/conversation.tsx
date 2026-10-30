// Conversations between customers and sellers (and our team), always through Al Mukarramah: a list of threads and the
// open one. Contact details are masked on the server before a message is stored; the compose box says so.
import { Link, type Href } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Field, Notice, T, Tag, useWide } from '@/components/ui';
import { sendMessage, thread as loadThread, threads as loadThreads, type Thread, type ThreadFull } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

const when = (s: string | null, lang: 'ar' | 'en') => {
  if (!s) return '';
  const d = new Date(s);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short' });
};

function ThreadRow({ t: th, active, side, onPress }: { t: Thread; active: boolean; side: 'customer' | 'seller' | 'staff'; onPress: () => void }) {
  const { t, lang } = useI18n();
  const who = side === 'customer' ? (th.seller ? (lang === 'ar' ? th.seller.name_ar ?? th.seller.name_en : th.seller.name_en) : t('srHouse')) : th.customer ?? '';
  const about = th.return ?? th.order ?? (th.product ? (lang === 'ar' ? th.product.name_ar : th.product.name_en) : th.subject);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8, backgroundColor: active ? colors.goldSoft : 'transparent', gap: 3 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <T size={14} w={th.unread ? 700 : 600} numberOfLines={1} style={{ flex: 1 }}>{who}</T>
        <T size={11.5} color={colors.muted}>{when(th.last_message_at, lang)}</T>
      </View>
      <T size={12.5} color={colors.brassText} numberOfLines={1}>{about}</T>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {th.unread ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.emerald }} /> : null}
        <T size={12.5} color={colors.body} numberOfLines={1} style={{ flex: 1 }}>{th.preview ?? ''}</T>
        {th.flagged ? <Tag label="Check" tone="warn" /> : null}
      </View>
    </Pressable>
  );
}

export function Inbox({ side, sellerId, initial, emptyText, list }: {
  side: 'customer' | 'seller' | 'staff'; sellerId?: string; initial?: string | null; emptyText: string;
  /** our team: the threads to show (flagged ones, say) */
  list?: () => Promise<Thread[]>;
}) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const [rows, setRows] = useState<Thread[] | null>(null);
  const [open, setOpen] = useState<string | null>(initial ?? null);
  const [full, setFull] = useState<ThreadFull | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sending = useRef(false);
  const reload = useCallback(() => (list ? list() : loadThreads(side === 'seller' ? sellerId : undefined)).then((r) => {
    setRows(r);
    if (!open && wide && r[0]) setOpen(r[0].id);
  }).catch((e) => setMsg(String(e.message ?? e))), [sellerId, side, wide]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (open) loadThread(open).then(setFull).catch((e) => setMsg(String(e.message ?? e))); else setFull(null); }, [open]);

  const send = async () => {
    if (!full || !draft.trim() || sending.current) return;
    if (MARKET_DEMO) { setMsg(t('lfDemo')); return; }
    sending.current = true; setBusy(true); setMsg(null);
    try {
      await sendMessage({ as: side, threadId: full.id, body: draft.trim() });
      setDraft('');
      setFull(await loadThread(full.id));
      reload();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); sending.current = false; }
  };

  const listView = (
    <Card pad={8} style={{ width: wide ? 320 : '100%', alignSelf: 'stretch', gap: 2 }}>
      {rows && !rows.length ? <T size={13} color={colors.muted} style={{ padding: 12 }}>{emptyText}</T> : null}
      {(rows ?? []).map((r) => <ThreadRow key={r.id} t={r} side={side} active={r.id === open} onPress={() => setOpen(r.id)} />)}
    </Card>
  );
  const threadView = full ? (
    <Card pad={wide ? 20 : 14} style={{ flex: 1, alignSelf: 'stretch', gap: 10 }}>
      {!wide ? <Button kind="text" size="sm" label={t('msBack')} onPress={() => setOpen(null)} style={{ alignSelf: 'flex-start' }} /> : null}
      <View style={{ gap: 2 }}>
        <T w={700} size={16} color={colors.navy}>{full.subject}</T>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {full.product ? <Link href={`/product/${full.product.slug}` as Href}><T size={12.5} color={colors.emerald}>{lang === 'ar' ? full.product.name_ar : full.product.name_en}</T></Link> : null}
          {full.order && side === 'customer' && full.order_id ? <Link href={{ pathname: '/order', params: { id: full.order_id } }}><T size={12.5} color={colors.emerald} num>{full.order}</T></Link> : null}
          {full.order && side !== 'customer' ? <T size={12.5} color={colors.muted} num>{full.order}</T> : null}
          {full.return ? <T size={12.5} color={colors.muted} num>{full.return}</T> : null}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {full.messages.map((m) => (
          <View key={m.id} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '86%', gap: 3 }}>
            <View style={{ backgroundColor: m.mine ? colors.emeraldSoft : colors.porcelain, borderWidth: 1, borderColor: m.mine ? colors.emeraldLine : colors.lineSoft, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 }}>
              <T size={14} lh={1.55}>{m.body}</T>
            </View>
            <T size={11} color={colors.muted} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}>
              {m.sender === 'staff' ? `${t('msFromUs')} · ` : ''}{when(m.at, lang)}{m.masked ? ` · ${t('msMaskedNote')}` : ''}{m.flags?.length ? ` · ${m.flags.join(', ')}` : ''}
            </T>
          </View>
        ))}
      </View>
      <Field label={t('msWrite')} value={draft} onChangeText={setDraft} multiline maxLength={2000} hint={t('msMaskedHint')} />
      <Button label={t('msSend')} busy={busy} disabled={!draft.trim()} onPress={send} style={{ alignSelf: 'flex-start' }} />
    </Card>
  ) : wide ? <Card pad={20} style={{ flex: 1, alignSelf: 'stretch' }}><T size={13} color={colors.muted}>{t('msPick')}</T></Card> : null;

  return (
    <View style={{ gap: 12 }}>
      {msg ? <Notice tone="warn" text={msg} /> : null}
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>{listView}{threadView}</View>
      ) : open ? threadView : listView}
    </View>
  );
}

/** A first message about an order, a product or a return (opens the conversation). */
export function StartConversation({ as, subOrderId, productId, returnId, label, onSent }: {
  as: 'customer' | 'seller'; subOrderId?: string; productId?: string; returnId?: string; label: string; onSent: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <Button size="sm" kind="secondary" label={label} onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <Field label={t('msWrite')} value={body} onChangeText={setBody} multiline maxLength={2000} hint={t('msMaskedHint')} />
      {msg ? <Notice tone="warn" text={msg} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="sm" label={t('msSend')} busy={busy} disabled={!body.trim()} onPress={async () => {
          if (MARKET_DEMO) { setMsg(t('lfDemo')); return; }
          setBusy(true); setMsg(null);
          try { const r = await sendMessage({ as, body: body.trim(), subOrderId, productId, returnId }); setOpen(false); setBody(''); onSent(r.thread_id); }
          catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
        }} />
        <Button size="sm" kind="text" label={t('cancel')} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}
