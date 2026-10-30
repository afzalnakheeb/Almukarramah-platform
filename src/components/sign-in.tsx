// Email sign-in on the account page.
// Website: a sign-in link by email that returns to /account (unchanged).
// Apps: the same email carries a sign-in code, typed in here, because a link in an email opens the browser rather
// than the app. The Supabase "Magic Link" and "Confirm signup" email templates must include {{ .Token }} for the code
// (docs/app-stores.md). In the apps, staff and the App Review account can also sign in with a password; those
// accounts are created in Supabase, and customers never need one.
import React, { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import { Button, Field, Notice, T } from '@/components/ui';
import { rememberNext } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export function EmailSignIn({ next }: { next?: string }) {
  const { t } = useI18n();
  const web = Platform.OS === 'web';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [withPassword, setWithPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'send' | 'verify' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const address = email.trim();
  const valid = address.includes('@');

  async function send() {
    setBusy('send');
    setError(null);
    await rememberNext(next);
    const { error: e } = await supabase.auth.signInWithOtp({
      email: address,
      // Website: the link signs in and comes back here. Apps: no link target; the code is typed in below.
      options: web ? { emailRedirectTo: `${window.location.origin}/account${next ? `?next=${encodeURIComponent(next)}` : ''}` } : undefined,
    });
    setBusy(null);
    if (e) setError(e.message);
    else {
      setSent(true);
      setCode('');
    }
  }

  async function verify() {
    setBusy('verify');
    setError(null);
    const { error: e } = await supabase.auth.verifyOtp({ email: address, token: code, type: 'email' });
    setBusy(null);
    if (e) setError(t('codeError'));
  }

  async function signInWithPassword() {
    setBusy('password');
    setError(null);
    await rememberNext(next);
    const { error: e } = await supabase.auth.signInWithPassword({ email: address, password });
    setBusy(null);
    if (e) setError(t('passwordError'));
  }

  const toggle = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ alignSelf: 'center', paddingVertical: 6 }}>
      <T size={12.5} color={colors.navy} style={{ textDecorationLine: 'underline', textDecorationColor: colors.goldLine } as never}>{label}</T>
    </Pressable>
  );

  return (
    <>
      <Field label={t('email')} value={email} onChangeText={(v) => { setEmail(v); setSent(false); }}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" dirLtr />
      {withPassword ? (
        <>
          <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
            autoComplete="current-password" textContentType="password" dirLtr />
          <Button label={t('signIn')} busy={busy === 'password'} disabled={!valid || !password} onPress={signInWithPassword} />
        </>
      ) : web ? (
        <>
          <Button label={t('sendCode')} busy={busy === 'send'} disabled={!valid} onPress={send} />
          {sent && <Notice tone="ok" text={t('checkEmail')} />}
        </>
      ) : !sent ? (
        <Button label={t('sendEmailCode')} busy={busy === 'send'} disabled={!valid} onPress={send} />
      ) : (
        <>
          <Notice tone="ok" text={t('emailCodeSent')} />
          <Field label={t('emailCode')} value={code} onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 10))}
            keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} dirLtr />
          <Button label={t('signIn')} busy={busy === 'verify'} disabled={code.length < 6} onPress={verify} />
          {toggle(t('resendCode'), send)}
        </>
      )}
      {error && <Notice tone="warn" text={error} />}
      {!web && toggle(withPassword ? t('useEmailCode') : t('usePassword'), () => { setWithPassword(!withPassword); setError(null); })}
    </>
  );
}
