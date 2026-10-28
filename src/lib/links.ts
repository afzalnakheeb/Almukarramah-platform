import { Linking, Platform } from 'react-native';

/** Seerah Trail runs on its own site until it joins the membership plan. */
export const SEERAH_TRAIL_URL = 'https://seerahtrails.com';

export function openExternal(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url);
}
