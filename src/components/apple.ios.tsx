// "Continue with Apple" (App Store Guideline 4.8), iPhone and iPad only: Apple's own button, as tall as the Google
// button beside it and with the same crisp corners. Apple draws its words in the phone's language (English or Arabic,
// both declared in app.json), so the label always matches what the person reads elsewhere on the phone.
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { appleAvailable, signInWithApple } from '@/lib/apple';
import { colors } from '@/theme';

export function AppleButton({ onError }: { onError?: (msg: string) => void }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    appleAvailable().then(setAvailable);
  }, []);
  if (!available) return null;
  if (busy) {
    return (
      <View style={{ height: 50, borderRadius: 2, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ivory} />
      </View>
    );
  }
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={2}
      style={{ width: '100%', height: 50 }}
      onPress={async () => {
        setBusy(true);
        try {
          await signInWithApple();
        } catch (e) {
          onError?.(e instanceof Error ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
