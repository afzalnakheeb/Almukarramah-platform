// "Delete my account" (App Store Guideline 5.1.1(v); Google Play's account deletion rule): what is deleted, what the
// law makes us keep, a clear confirmation, then the delete-account server function. Used on the account screen and
// on /delete-account. Accounts made with Sign in with Apple first get a fresh Apple code, so the server can revoke
// Apple's tokens as Apple asks.
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Button, Card, Notice, Serif, Sheet, T, useWide } from '@/components/ui';
import { appleAuthorizationCode } from '@/lib/apple';
import { useI18n, type Key } from '@/lib/i18n';
import { openExternal } from '@/lib/links';
import { initPurchases } from '@/lib/purchases';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

/** Where people cancel a subscription bought in the app (Apple and Google require it to be cancelled there). */
export const STORE_SUBSCRIPTIONS_URL = Platform.OS === 'android'
  ? 'https://play.google.com/store/account/subscriptions?package=com.almukarramah.app'
  : 'https://apps.apple.com/account/subscriptions';

/** The store-subscription sentence for this platform (no other store is named inside an app). */
export const storeSubsKey = (): Key => (Platform.OS === 'ios' ? 'deleteStoreSubsIos' : Platform.OS === 'android' ? 'deleteStoreSubsAndroid' : 'deleteStoreSubsWeb');

/** Reasons the server gives for not deleting yet (supabase/functions/delete-account). */
const BLOCKED: Record<string, Key> = {
  orders_in_progress: 'deleteBlockedOrders',
  payment_in_progress: 'deleteBlockedPayment',
  staff_account: 'deleteBlockedStaff',
  seller_account: 'deleteBlockedSeller',
};

/** A line with a small gold diamond before it. */
export function Point({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 5, height: 5, marginTop: 8, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />
      <T size={14} lh={1.6} color={colors.body} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

export function DeleteAccount() {
  const wide = useWide();
  const { t } = useI18n();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeSub, setStoreSub] = useState(false);

  // An app-store membership keeps billing after deletion: say so, with the way to cancel it.
  useEffect(() => {
    if (!open || !session) return;
    supabase.from('subscriptions').select('id').in('source', ['app_store', 'play_store']).in('status', ['active', 'past_due']).limit(1)
      .then(({ data }) => setStoreSub((data ?? []).length > 0), () => undefined);
  }, [open, session]);

  if (!session) return null;

  async function remove() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      let appleCode: string | null = null;
      const providers = (session.user.app_metadata?.providers as string[] | undefined) ?? [String(session.user.app_metadata?.provider ?? '')];
      if (Platform.OS === 'ios' && providers.includes('apple')) {
        const c = await appleAuthorizationCode();
        if (c === 'cancelled') return;
        appleCode = c;
      }
      const { error: e } = await supabase.functions.invoke('delete-account', { body: { confirm: true, appleAuthorizationCode: appleCode } });
      if (e) {
        let reason = '';
        try {
          reason = ((await (e as { context?: Response }).context?.json()) as { error?: string } | null)?.error ?? '';
        } catch { /* not a JSON answer */ }
        setError(t(BLOCKED[reason] ?? 'deleteFailed'));
        return;
      }
      setOpen(false);
      await initPurchases(null);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      router.replace({ pathname: '/delete-account', params: { done: '1' } });
    } catch {
      setError(t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card pad={wide ? 22 : 16} style={{ marginTop: 28, gap: 8 }}>
        <Serif size={26}>{t('deleteTitle')}</Serif>
        <T size={13.5} lh={1.6} color={colors.body}>{t('deleteIntro')}</T>
        <Button label={t('deleteButton')} kind="secondary" size="sm" onPress={() => { setSure(false); setError(null); setOpen(true); }}
          style={{ alignSelf: 'flex-start', marginTop: 6 }} />
      </Card>

      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={t('deleteConfirmTitle')}>
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }}>
          <Point text={t('deleteWhatGoes')} />
          <Point text={t('deleteWhatStays')} />
          <Point text={t('deleteWebSubs')} />
          {storeSub && <Point text={t(storeSubsKey())} />}
          {storeSub && Platform.OS !== 'web' && (
            <Button label={t('manageSubscriptions')} kind="text" size="sm" onPress={() => openExternal(STORE_SUBSCRIPTIONS_URL)} style={{ alignSelf: 'flex-start' }} />
          )}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: sure }} onPress={() => setSure(!sure)}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8, marginTop: 4 }}>
            <View style={{ width: 18, height: 18, marginTop: 1, borderWidth: 1, borderColor: sure ? colors.danger : colors.inputLine, backgroundColor: sure ? colors.danger : colors.porcelain, alignItems: 'center', justifyContent: 'center' }}>
              {sure && <Icon name="check" size={12} stroke={2.2} color={colors.ivory} />}
            </View>
            <T w={500} size={14} lh={1.5} color={colors.navy} style={{ flex: 1 }}>{t('deleteUnderstand')}</T>
          </Pressable>
          {error && <Notice tone="warn" text={error} />}
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
            <Button label={t('deleteConfirm')} kind="danger" busy={busy} disabled={!sure} onPress={remove} full={!wide} />
            <Button label={t('deleteKeep')} kind="secondary" disabled={busy} onPress={() => setOpen(false)} full={!wide} />
          </View>
        </ScrollView>
      </Sheet>
    </>
  );
}
