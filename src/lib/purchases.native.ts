import { Platform } from 'react-native';

/**
 * App-store subscriptions (the membership) through RevenueCat.
 * Digital content sold inside the iPhone and Android apps must use Apple's and Google's billing; on the website the
 * membership is sold through Moyasar instead (create-payment with a plan). Physical goods and box clubs never come here.
 *
 * RevenueCat set-up (docs/app-stores.md, store/in-app-purchases.md): entitlement "member", the current offering's
 * monthly package holds the store products. The app user id is the Supabase user id, so the revenuecat-webhook function
 * can record the membership in Supabase (row-level security then opens the Quran Trail lessons).
 * react-native-purchases needs a development or store build (not Expo Go), so it is loaded lazily.
 */
type PurchasesModule = typeof import('react-native-purchases').default;
type Package = import('react-native-purchases').PurchasesPackage;
type CustomerInfo = import('react-native-purchases').CustomerInfo;

export type MembershipOffer = { priceString: string; period: 'month' | 'year' };
export type PurchaseResult = 'purchased' | 'cancelled' | 'unavailable';

export const MEMBER_ENTITLEMENT = 'member';

let purchases: PurchasesModule | null = null;
let configured = false;
let currentUser: string | null = null;
// Sign-in changes are applied one at a time, in order (configure once, then logIn / logOut).
let queue: Promise<void> = Promise.resolve();

export function initPurchases(userId: string | null): Promise<void> {
  queue = queue.then(() => sync(userId)).catch(() => undefined);
  return queue;
}

async function sync(userId: string | null) {
  if (Platform.OS === 'web') return;
  const apiKey = Platform.OS === 'ios' ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (!apiKey) return;
  if (!configured) {
    try {
      purchases = (await import('react-native-purchases')).default;
      purchases.configure({ apiKey, appUserID: userId ?? undefined });
      configured = true;
      currentUser = userId;
    } catch {
      purchases = null; // running in Expo Go
    }
    return;
  }
  if (!purchases || userId === currentUser) return;
  if (userId) await purchases.logIn(userId);
  else if (!(await purchases.isAnonymous())) await purchases.logOut();
  currentUser = userId;
}

export function purchasesAvailable() {
  return purchases !== null;
}

async function membershipPackage(): Promise<Package | null> {
  await queue;
  if (!purchases) return null;
  const offerings = await purchases.getOfferings();
  return offerings.current?.monthly ?? offerings.current?.annual ?? offerings.current?.availablePackages[0] ?? null;
}

const isMember = (info: CustomerInfo) => Boolean(info.entitlements.active[MEMBER_ENTITLEMENT]);

export async function getMembershipOffer(): Promise<MembershipOffer | null> {
  try {
    const pkg = await membershipPackage();
    if (!pkg) return null;
    return { priceString: pkg.product.priceString, period: String(pkg.packageType) === 'ANNUAL' ? 'year' : 'month' };
  } catch {
    return null;
  }
}

/** Buys the membership through the App Store or Google Play. The revenuecat-webhook function records it in Supabase. */
export async function buyMembership(): Promise<PurchaseResult> {
  const pkg = await membershipPackage().catch(() => null);
  if (!purchases || !pkg) return 'unavailable';
  try {
    await purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (e) {
    if ((e as { userCancelled?: boolean } | null)?.userCancelled) return 'cancelled';
    throw e;
  }
}

export async function restoreMembership(): Promise<boolean> {
  await queue;
  if (!purchases) return false;
  return isMember(await purchases.restorePurchases());
}

export async function storeMembershipActive(): Promise<boolean> {
  await queue;
  if (!purchases) return false;
  try {
    return isMember(await purchases.getCustomerInfo());
  } catch {
    return false;
  }
}
