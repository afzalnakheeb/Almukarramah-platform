// Passcode gate for almukarramah.com/decks (the pitch deck and film). Server-side only: used by the unlock function
// (api/decks.ts) and the routing middleware (middleware.ts), which run on Vercel. The app never imports this file.
//
// Both secrets live in Vercel environment variables, never in this public repository:
//   DECKS_PASSCODE       what visitors type (spaces are ignored; Arabic-Indic digits ٠١٢… are read as 0–9)
//   DECKS_COOKIE_SECRET  signs the unlock cookie
// Changing either one signs every visitor out of /decks.
//
// A visitor who types the right passcode gets a signed, HttpOnly cookie for 30 days:
//   v1.<expiry, seconds>.<HMAC-SHA256 over "v1.<expiry>.<passcode>">   (base64url)

export const COOKIE = 'am_decks';
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

/** Compares in time that does not depend on where the strings differ, so timing reveals nothing about a guess. */
export function same(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** What a visitor typed, as the server compares it: full-width and Arabic-Indic digits become 0–9, spaces go. */
export function normalise(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '');
}

export type DecksEnv = { passcode: string; secret: string };

/** The configured passcode and secret, or null if either is missing (then nothing unlocks). */
export function decksEnv(env: Record<string, string | undefined> = process.env): DecksEnv | null {
  const passcode = normalise(env.DECKS_PASSCODE);
  const secret = env.DECKS_COOKIE_SECRET ?? '';
  return passcode && secret.length >= 32 ? { passcode, secret } : null;
}

export async function issueToken(e: DecksEnv, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + MAX_AGE;
  return `v1.${exp}.${await sign(e.secret, `v1.${exp}.${e.passcode}`)}`;
}

export async function tokenValid(e: DecksEnv, token: string | null | undefined, now = Date.now()): Promise<boolean> {
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token ?? '');
  if (!m || Number(m[1]) * 1000 <= now) return false;
  return same(m[2], await sign(e.secret, `v1.${m[1]}.${e.passcode}`));
}

export function readCookie(header: string | null | undefined, name = COOKIE): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function cookieHeader(token: string, secure: boolean): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearCookieHeader(secure: boolean): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** True when the request carries a valid unlock cookie. */
export async function unlocked(request: Request, e: DecksEnv | null = decksEnv()): Promise<boolean> {
  return !!e && tokenValid(e, readCookie(request.headers.get('cookie')));
}
