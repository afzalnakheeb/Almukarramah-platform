// /api/decks: the passcode check for almukarramah.com/decks (the pitch deck and film). Vercel Function.
//   GET     { unlocked, code? }   is this visitor unlocked? (the cookie is HttpOnly, so the page has to ask)
//   POST    { passcode }          right passcode: sets the 30-day cookie and returns { unlocked: true, code }
//                                 wrong passcode: 401 after a short pause, which slows guessing
//   DELETE                        "Lock this page": clears the cookie on this device
// The passcode is returned only to visitors who already have it, so the page can put it in the share message.
import { clearCookieHeader, cookieHeader, decksEnv, issueToken, normalise, same, unlocked } from '../src/server/decks-auth';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...headers },
  });

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  async fetch(request: Request): Promise<Response> {
    const e = decksEnv();
    if (!e) return json({ error: 'not_configured' }, 503);
    const secure = new URL(request.url).protocol === 'https:';

    if (request.method === 'GET') {
      return (await unlocked(request, e)) ? json({ unlocked: true, code: e.passcode }) : json({ unlocked: false });
    }
    if (request.method === 'DELETE') {
      return json({ unlocked: false }, 200, { 'Set-Cookie': clearCookieHeader(secure) });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, DELETE' });

    let typed = '';
    try {
      typed = normalise(((await request.json()) as { passcode?: unknown } | null)?.passcode);
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    if (!typed || typed.length > 64 || !same(typed, e.passcode)) {
      await pause(800);
      return json({ unlocked: false, error: 'wrong_passcode' }, 401);
    }
    return json({ unlocked: true, code: e.passcode }, 200, { 'Set-Cookie': cookieHeader(await issueToken(e), secure) });
  },
};
