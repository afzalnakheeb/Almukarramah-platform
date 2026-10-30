// Deletes the signed-in customer's account (App Store Guideline 5.1.1(v); Google Play's account deletion rule).
// Called from "Delete my account" in the apps and on the website, after a clear confirmation.
//  1. delete_account_data() (migration 0010): refuses for staff, sellers and orders still on their way; removes unpaid
//     orders; keeps the orders the law requires, unlinked and without contact details; removes the profile, saved
//     addresses, lesson progress and subscriptions. Tax invoices are never touched.
//  2. Sign in with Apple: when the app sends a fresh authorization code and the APPLE_* secrets are set, Apple's
//     tokens are revoked, as Apple asks of apps that delete accounts.
//  3. RevenueCat: when REVENUECAT_SECRET_KEY is set, the customer record there is deleted too. Billing by Apple or
//     Google stops only when the customer cancels in the store; the app says so before deleting.
//  4. The sign-in itself (auth user) is deleted; whatever else still points at it cascades.
// Secrets (Supabase > Edge Functions > Secrets): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 text),
// optional APPLE_BUNDLE_ID (default com.almukarramah.app), optional REVENUECAT_SECRET_KEY.
import { admin, caller, env, handle, json } from '../_shared/util.ts';

/** Reasons the database gives for not deleting yet; the app shows a sentence for each. */
const BLOCKS = ['orders_in_progress', 'payment_in_progress', 'staff_account', 'seller_account'];

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'sign_in' }, 401);
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean; appleAuthorizationCode?: string | null };
  if (body.confirm !== true) return json({ error: 'confirm' }, 400);

  const db = admin();
  const { data: summary, error } = await db.rpc('delete_account_data', { p_user: user.id });
  if (error) {
    const reason = BLOCKS.find((b) => error.message.includes(b));
    if (reason) return json({ error: reason }, 409);
    throw error;
  }

  if (body.appleAuthorizationCode) {
    await revokeApple(body.appleAuthorizationCode).catch((e) => console.error('Apple token revocation failed', e));
  }
  await deleteRevenueCatCustomer(user.id).catch((e) => console.error('RevenueCat customer deletion failed', e));

  const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
  if (deleteError) throw deleteError;
  return json({ deleted: true, ...(summary as Record<string, unknown> | null) });
}));

// ---------------------------------------------------------------- Sign in with Apple token revocation
const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The client secret Apple expects: a short-lived ES256 JWT signed with the Sign in with Apple key (.p8). */
async function appleClientSecret(clientId: string) {
  const pem = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: env('APPLE_KEY_ID') }));
  const claims = b64url(JSON.stringify({ iss: env('APPLE_TEAM_ID'), iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId }));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`));
  return `${head}.${claims}.${b64url(new Uint8Array(signature))}`;
}

async function revokeApple(code: string) {
  if (!Deno.env.get('APPLE_PRIVATE_KEY')) {
    console.warn('APPLE_PRIVATE_KEY is not set: Apple tokens were not revoked');
    return;
  }
  const clientId = Deno.env.get('APPLE_BUNDLE_ID') || 'com.almukarramah.app';
  const clientSecret = await appleClientSecret(clientId);
  const post = (url: string, fields: Record<string, string>) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });

  const tokenRes = await post('https://appleid.apple.com/auth/token', { client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' });
  const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; error?: string };
  if (!tokenRes.ok) throw new Error(`Apple token ${tokenRes.status}: ${tokens.error ?? ''}`);
  const token = tokens.refresh_token ?? tokens.access_token;
  if (!token) return;
  const revoke = await post('https://appleid.apple.com/auth/revoke', {
    client_id: clientId, client_secret: clientSecret, token, token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
  });
  if (!revoke.ok) throw new Error(`Apple revoke ${revoke.status}`);
}

// ---------------------------------------------------------------- RevenueCat customer record
async function deleteRevenueCatCustomer(userId: string) {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) return;
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`RevenueCat ${res.status}`);
}
