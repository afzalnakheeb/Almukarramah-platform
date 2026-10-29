// Account — sign-in follows Identity.dc.html; signed-in view follows Account.dc.html.
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Logo, Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Button, Card, Eyebrow, Field, H1, Notice, Photo, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { openExternal, SEERAH_TRAIL_URL } from '@/lib/links';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { callFunction, isConfigured, supabase } from '@/lib/supabase';
import { colors, toneFor } from '@/theme';
import { Seo } from '@/components/seo';

type SubRow = { id: string; source: string; status: string; cancel_at_period_end: boolean; current_period_end: string | null; plans: { name_en: string; name_ar: string; price_sar: number; kind: string } | null };
type OrderRow = { id: string; number: number; status: string; currency: string; total_minor: number; created_at: string; invoices: { id: string; number: string }[] };

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info' | 'err' | 'mute'> = {
  paid: 'info', packing: 'warn', shipped: 'info', delivered: 'ok', pending_payment: 'mute', refunded: 'err', cancelled: 'mute',
};

export default function Account() {
  const wide = useWide();
  const { t, lang, isRTL } = useI18n();
  const { session, staffRole } = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [subBusy, setSubBusy] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);

  const loadSubs = () =>
    supabase
      .from('subscriptions')
      .select('id, source, status, cancel_at_period_end, current_period_end, plans(name_en, name_ar, price_sar, kind)')
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setSubs((data as unknown as SubRow[]) ?? []));

  async function changeSub(id: string, action: 'cancel' | 'resume') {
    setSubBusy(id);
    setSubError(null);
    try {
      await callFunction('manage-subscription', { subscriptionId: id, action });
      await loadSubs();
    } catch {
      setSubError(t('subChangeError'));
    } finally {
      setSubBusy(null);
    }
  }

  useEffect(() => {
    if (!session) return;
    supabase
      .from('orders')
      .select('id, number, status, currency, total_minor, created_at, invoices(id, number)')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setOrders((data as OrderRow[]) ?? []));
    loadSubs();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) {
    return (
      <Screen>
      <Seo title="Your account | Al Mukarramah" description="Orders, tax invoices and membership." path="/account" noindex />
        <View style={{ alignItems: 'center', paddingVertical: wide ? 32 : 8 }}>
          <Card pad={28} style={{ width: '100%', maxWidth: 460, borderRadius: 24, gap: 14 }}>
            <Logo height={36} />
            <Serif role="h1" size={30} style={{ marginTop: 6 }}>{t('signInTitle')}</Serif>
            <T size={14} lh={1.6} color={colors.muted}>{t('signInBody')}</T>
            {!isConfigured && <Notice text="Preview mode: sign-in works once the Supabase project is connected." />}
            <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" dirLtr />
            <Button
              label={t('sendCode')}
              busy={busy}
              disabled={!email.includes('@')}
              onPress={async () => {
                setBusy(true);
                setError(null);
                const { error: e } = await supabase.auth.signInWithOtp({ email: email.trim() });
                setBusy(false);
                if (e) setError(e.message);
                else setSent(true);
              }}
            />
            {sent && <Notice tone="ok" text={t('checkEmail')} />}
            {error && <Notice tone="warn" text={error} />}
            <T size={12.5} color={colors.muted} center>{t('or')}</T>
            <Button label={t('continueGuest')} kind="secondary" href="/shop" />
            <T size={12} lh={1.6} color={colors.muted}>{t('noMarketing')}</T>
          </Card>
        </View>
      </Screen>
    );
  }

  const tiles: { kicker: string; title: string; body: string; href: Parameters<typeof router.push>[0]; icon: 'book' | 'gift' | 'shield'; external?: boolean }[] = [
    { kicker: t('membership'), title: t('membership'), body: t('circleBody'), href: '/membership', icon: 'gift' },
    { kicker: t('learning'), title: t('quranTrail'), body: t('membersOnlyBody'), href: { pathname: '/trail/[slug]', params: { slug: 'quran-trail' } }, icon: 'book' },
    { kicker: t('learning'), title: t('seerahTrail'), body: t('seerahExternal'), href: SEERAH_TRAIL_URL as never, icon: 'book', external: true },
  ];
  if (staffRole) tiles.unshift({ kicker: staffRole, title: t('admin'), body: t('adminBody'), href: '/admin', icon: 'shield' });

  return (
    <Screen>
      <Seo title="Your account | Al Mukarramah" description="Orders, tax invoices and membership." path="/account" noindex />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <H1 size={wide ? 44 : 32}>{t('greeting')}</H1>
      </View>
      <T size={14} color={colors.muted} style={{ marginBottom: 22 }}>{session.user.email}</T>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {tiles.map((c) => (
          <Pressable key={c.title} accessibilityRole="link" onPress={() => (c.external ? openExternal(String(c.href)) : router.push(c.href))}
            style={{ flexGrow: 1, flexBasis: wide ? 220 : '100%', backgroundColor: c.icon === 'shield' ? colors.navy : colors.white, borderWidth: 1, borderColor: c.icon === 'shield' ? colors.navy : colors.line, borderRadius: 20, padding: 20, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow size={11} color={c.icon === 'shield' ? colors.champagne : colors.brassText}>{c.kicker}</Eyebrow>
              <Icon name={c.icon} size={20} color={c.icon === 'shield' ? colors.champagne : colors.navy} />
            </View>
            <T w={700} size={18} color={c.icon === 'shield' ? colors.white : colors.navy}>{c.title}</T>
            <T size={13} lh={1.5} color={c.icon === 'shield' ? '#D6D8EA' : colors.muted}>{c.body}</T>
          </Pressable>
        ))}
      </View>

      {subs.length > 0 && (
        <Card pad={wide ? 22 : 16} style={{ marginTop: 20, borderRadius: 20, gap: 4 }}>
          <T w={700} size={17} color={colors.navy} style={{ marginBottom: 8 }}>{t('mySubscriptions')}</T>
          {subs.map((s, i) => {
            const date = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const store = s.source !== 'moyasar';
            return (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft, flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                  <T w={700} size={15}>{s.plans ? (lang === 'ar' ? s.plans.name_ar : s.plans.name_en) : ''}</T>
                  <T size={13} color={colors.muted}>
                    {s.plans ? `${formatMoney(s.plans.price_sar, 'SAR', lang)} / ${t('perMonth')} · ` : ''}
                    {s.status === 'past_due' ? t('subPastDue') : s.cancel_at_period_end ? `${t('subEnds')} ${date}` : `${t('subRenews')} ${date}`}
                  </T>
                  {store && <T size={12.5} color={colors.muted}>{t('subStoreManaged')}</T>}
                </View>
                <Tag label={s.status === 'past_due' ? t('subPastDueTag') : s.cancel_at_period_end ? t('subCancelledTag') : t('subActiveTag')} tone={s.status === 'past_due' ? 'warn' : s.cancel_at_period_end ? 'mute' : 'ok'} />
                {!store && (
                  <Button size="sm" kind="secondary" busy={subBusy === s.id}
                    label={s.cancel_at_period_end ? t('subResume') : t('subCancel')}
                    onPress={() => changeSub(s.id, s.cancel_at_period_end ? 'resume' : 'cancel')} />
                )}
              </View>
            );
          })}
          {subError && <Notice tone="warn" text={subError} />}
          <T size={12.5} color={colors.muted} style={{ marginTop: 6 }}>{t('subCancelNote')}</T>
        </Card>
      )}

      <Card pad={wide ? 22 : 16} style={{ marginTop: 20, borderRadius: 20, gap: 4 }}>
        <T w={700} size={17} color={colors.navy} style={{ marginBottom: 8 }}>{t('myOrders')}</T>
        {orders.length === 0 ? <T color={colors.muted}>{t('noOrders')}</T> : orders.map((o, i) => (
          <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.lineSoft, flexWrap: 'wrap' }}>
            <View style={{ width: 52 }}><Photo ratio={1} tone={toneFor(String(o.number))} style={{ borderRadius: 12 }} /></View>
            <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
              <T w={700} size={15}>AM-{o.number}</T>
              <T size={13} color={colors.muted}>
                {new Date(o.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {formatMoney(o.total_minor, o.currency, lang)}
              </T>
              {o.invoices?.[0] && <T size={12.5} color={colors.muted}>{t('invoice')}: {o.invoices[0].number}</T>}
            </View>
            <Tag label={t(`status_${o.status}` as Key) ?? o.status} tone={STATUS_TONE[o.status] ?? 'mute'} />
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <T size={13} color={colors.muted} style={{ flexShrink: 1 }}>{t('accountOptional')}</T>
        <Button label={t('signOut')} kind="secondary" size="sm" onPress={() => supabase.auth.signOut()}
          icon={<Icon name={isRTL ? 'arrowLeft' : 'arrowRight'} size={16} />} />
      </View>
    </Screen>
  );
}
