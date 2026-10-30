// The assistant sends what the shopper types (and the page, bag, delivery choice and, when signed in, recent order
// status) to Anthropic, a third-party AI. App Store Review Guideline 5.1.2(i) asks apps to say so clearly and to get
// permission first, so the iPhone and Android apps ask once and remember the answer on the device. The website
// explains it in the privacy policy and is not gated.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const KEY = 'aiConsent';
let agreed: boolean | null = Platform.OS === 'web' ? true : null;

export function useAiConsent() {
  const [ok, setOk] = useState(agreed === true);
  useEffect(() => {
    if (agreed !== null) return;
    AsyncStorage.getItem(KEY)
      .then((v) => { agreed = v === '1'; setOk(agreed); })
      .catch(() => undefined);
  }, []);
  const agree = useCallback(() => {
    agreed = true;
    setOk(true);
    AsyncStorage.setItem(KEY, '1').catch(() => undefined);
  }, []);
  return { ok, agree };
}
