/** Website build: app-store billing does not exist on the web; memberships are paid through Moyasar instead. */
export async function initPurchases(_userId: string | null) {}
export function purchasesAvailable() {
  return false;
}
export async function buyMembership(): Promise<boolean> {
  return false;
}
