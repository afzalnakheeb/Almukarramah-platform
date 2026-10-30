/** Website build: app-store billing does not exist on the web; memberships are paid through Moyasar instead.
 *  The iPhone and Android apps use purchases.native.ts (RevenueCat); both files export the same functions. */

export type MembershipOffer = { priceString: string; period: 'month' | 'year' };
export type PurchaseResult = 'purchased' | 'cancelled' | 'unavailable';

export async function initPurchases(_userId: string | null): Promise<void> {}

export function purchasesAvailable() {
  return false;
}

/** The membership as the App Store or Google Play sells it (price in the shopper's own store currency). */
export async function getMembershipOffer(): Promise<MembershipOffer | null> {
  return null;
}

export async function buyMembership(): Promise<PurchaseResult> {
  return 'unavailable';
}

/** Restores an App Store / Google Play membership bought before (Apple requires a restore button). */
export async function restoreMembership(): Promise<boolean> {
  return false;
}

/** True when the store reports an active membership for this person. */
export async function storeMembershipActive(): Promise<boolean> {
  return false;
}
