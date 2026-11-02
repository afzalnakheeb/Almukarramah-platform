// Passcode gate for almukarramah.com/investors (the investor film, pitch deck, feasibility study and financial model).
// Server-side only: used by the unlock function (api/investors.ts) and the routing middleware (middleware.ts), which run
// on Vercel. The app never imports this file.
//
// It works like the /decks gate (src/server/decks-auth.ts, unchanged) and reuses its passcode normalisation, its
// constant-time compare and its cookie reader, but it has its own passcode and its own cookie.
// Both settings live in Vercel environment variables, never in this public repository:
//   INVESTORS_PASSCODE   what invited investors type (spaces are ignored; Arabic-Indic digits ٠١٢… are read as 0–9).
//                        It must differ from DECKS_PASSCODE: if the two are the same, /investors stays locked for
//                        everyone, so the /decks passcode can never open the investor documents.
//   DECKS_COOKIE_SECRET  signs the unlock cookie (the /decks secret, shared)
// Changing either one signs every visitor out of /investors.
//
// A visitor who types the right passcode gets a signed, HttpOnly cookie for 30 days:
//   inv1.<expiry, seconds>.<HMAC-SHA256 over "inv1.<expiry>.<passcode>">   (base64url)
// /decks tokens start "v1." and sign "v1.<expiry>.<passcode>". The two signed messages can never be the same, so even
// with one secret a /decks cookie never unlocks /investors, and an /investors cookie never unlocks /decks.
import { normalise, readCookie, same } from './decks-auth';

export { normalise, same };

export const COOKIE = 'am_investors';
export const MAX_AGE = 60 * 60 * 24 * 30;

const enc = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export type InvestorsEnv = { passcode: string; secret: string };

/** The configured passcode and secret, or null if either is missing or the passcode is the /decks one (then nothing unlocks). */
export function investorsEnv(env: Record<string, string | undefined> = process.env): InvestorsEnv | null {
  const passcode = normalise(env.INVESTORS_PASSCODE);
  const secret = env.DECKS_COOKIE_SECRET ?? '';
  if (!passcode || secret.length < 32) return null;
  if (passcode === normalise(env.DECKS_PASSCODE)) return null;
  return { passcode, secret };
}

export async function issueToken(e: InvestorsEnv, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `inv1.${exp}.${await sign(e.secret, `inv1.${exp}.${e.passcode}`)}`;
}

export async function tokenValid(e: InvestorsEnv, token: string | null | undefined, now = Date.now()): Promise<boolean> {
  const m = /^inv1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!m || Number(m[1]) * 1000 <= now) return false;
  return same(m[2], await sign(e.secret, `inv1.${m[1]}.${e.passcode}`));
}

export function cookieHeader(token: string, secure: boolean): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearCookieHeader(secure: boolean): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** True when the request carries a valid /investors unlock cookie. */
export async function unlocked(request: Request, e: InvestorsEnv | null = investorsEnv()): Promise<boolean> {
  return !!e && tokenValid(e, readCookie(request.headers.get('cookie'), COOKIE));
}
