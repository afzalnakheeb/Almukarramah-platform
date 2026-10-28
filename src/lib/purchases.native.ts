import { Platform } from 'react-native';

/**
 * App-store subscriptions (membership, Quran Trail) through RevenueCat.
 * Digital content sold inside the iPhone and Android apps must use Apple's and Google's billing.
 * On the website, membership is sold through Moyasar instead (create-payment with a plan).
 * react-native-purchases needs a development build (not Expo Go), so it is loaded lazily.
 */
type PurchasesModule = typeof import('react-native-purchases').default;

let purchases: PurchasesModule | null = null;

export async function initPurchases(userId: string | null) {
  if (Platform.OS === 'web') return;
  const apiKey = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) return;
  try {
    purchases = (await import('react-native-purchases')).default;
    purchases.configure({ apiKey, appUserID: userId ?? undefined });
  } catch {
    purchases = null; // running in Expo Go
  }
}

export function purchasesAvailable() {
  return purchases !== null;
}

/** Buy the membership through the app store. The revenuecat-webhook function records it in Supabase. */
export async function buyMembership(): Promise<boolean> {
  if (!purchases) return false;
  const offerings = await purchases.getOfferings();
  const pkg = offerings.current?.availablePackages[0];
  if (!pkg) return false;
  await purchases.purchasePackage(pkg);
  return true;
}
