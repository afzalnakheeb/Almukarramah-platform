// How to delete an account, what is deleted and what the law makes us keep. The public page Google Play asks for
// (Data safety: "delete account URL"), linked from the app listing; signed in, the deletion itself is here too.
// It is /delete-account rather than /account/delete because vercel.json sends every old /account/* address to /account.
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { DeleteAccount, Point, storeSubsKey } from '@/components/account-delete';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Eyebrow, H1, Notice, Serif, T, useHydrated, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

export default function DeleteAccountPage() {
  const wide = useWide();
  const { t } = useI18n();
  const { session } = useSession();
  const { done } = useLocalSearchParams<{ done?: string }>();
  // The pre-rendered page has no query string: show the confirmation only after hydration.
  const deleted = useHydrated() && done === '1';
  const section = (title: string, lines: string[]) => (
    <View style={{ gap: 10 }}>
      <Serif role="h2" size={wide ? 26 : 22}>{title}</Serif>
      {lines.map((l) => <Point key={l} text={l} />)}
    </View>
  );
  return (
    <Screen>
      <Seo title="Delete your account | Al Mukarramah" path="/delete-account"
        description="How to delete your Al Mukarramah account and personal data, in the app, on the website or by email, and what the law requires us to keep." />
      <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center', gap: 14 }}>
        <Eyebrow rule>{t('account')}</Eyebrow>
        <H1 size={wide ? 46 : 32}>{t('dpTitle')}</H1>
        {deleted && <Notice tone="ok" text={t('deleteDone')} />}
        <T size={15.5} lh={1.7} color={colors.body}>{t('dpIntro')}</T>
        <Card pad={wide ? 28 : 18} style={{ gap: 24, marginTop: 6 }}>
          {section(t('dpHowTitle'), [t('dpHowApp'), t('dpHowWeb'), t('dpHowEmail')])}
          {section(t('dpDeletedTitle'), [t('deleteWhatGoes')])}
          {section(t('dpKeptTitle'), [t('deleteWhatStays'), t('dpBackups')])}
          {section(t('dpSubsTitle'), [t(storeSubsKey()), t('deleteWebSubs')])}
        </Card>
        {session ? <DeleteAccount /> : !deleted && (
          <Button label={t('dpSignIn')} href={{ pathname: '/account', params: { next: '/delete-account' } }} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
        )}
      </View>
    </Screen>
  );
}
