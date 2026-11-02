// The /investors passcode gate, checked without a server: tokens, passcodes, separation from /decks, the routing
// middleware and the unlock function. Every passcode and secret here is random, made up afresh on each run.
// Run: npx tsx scripts/investors-gate.test.ts
import api from '../api/investors';
import middleware from '../middleware';
import * as decks from '../src/server/decks-auth';
import * as investors from '../src/server/investors-auth';

let passed = 0;
let failed = 0;
function ok(condition: unknown, what: string) {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? '  ok  ' : '  FAIL'}  ${what}`);
}

/** A random code of n digits, and a random 32-byte secret (base64). */
const digits = (n: number) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => String(x % 10)).join('');
const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
/** The same digits, as typed on an Arabic keyboard (٠١٢…), with spaces. */
const arabicIndic = (code: string) => [...code].map((c) => String.fromCharCode(0x0660 + Number(c))).join(' ');

async function main() {
  const secret = randomSecret();
  const invCode = digits(8);
  let decksCode = digits(8);
  while (decksCode === invCode) decksCode = digits(8);
  let otherCode = digits(8);
  while (otherCode === invCode) otherCode = digits(8);
  const inv: investors.InvestorsEnv = { passcode: invCode, secret };

  console.log('Issuing and verifying');
  const token = await investors.issueToken(inv);
  ok(/^inv1\.\d{1,12}\.[A-Za-z0-9_-]{43}$/.test(token), 'a token reads inv1.<expiry>.<signature>');
  ok(await investors.tokenValid(inv, token), 'a token just issued verifies');
  const exp = Number(token.split('.')[1]);
  ok(Math.abs(exp - (Date.now() / 1000 + 30 * 24 * 3600)) < 5, 'it lasts 30 days');
  ok(!(await investors.tokenValid(inv, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))), 'a changed signature is refused');
  ok(!(await investors.tokenValid(inv, token.replace(/^inv1\.\d+/, `inv1.${exp + 86400}`))), 'a lengthened expiry is refused');
  ok(!(await investors.tokenValid(inv, '')) && !(await investors.tokenValid(inv, null)), 'no token is refused');

  console.log('A wrong passcode');
  ok(!investors.same(investors.normalise(otherCode), inv.passcode), 'a wrong passcode does not match');
  ok(!(await investors.tokenValid({ passcode: otherCode, secret }, token)), 'a token is refused once the passcode changes');
  ok(!(await investors.tokenValid({ passcode: invCode, secret: randomSecret() }, token)), 'a token is refused once the secret changes');

  console.log('Expiry');
  const old = await investors.issueToken(inv, Date.now() - investors.MAX_AGE * 1000 - 1000);
  ok(!(await investors.tokenValid(inv, old)), 'a token that expired a second ago is refused');
  const edge = await investors.issueToken(inv);
  const edgeMs = Number(edge.split('.')[1]) * 1000;
  ok(await investors.tokenValid(inv, edge, edgeMs - 1000), 'a token is still valid a second before it expires');
  ok(!(await investors.tokenValid(inv, edge, edgeMs)), 'and refused from the moment it expires');

  console.log('/decks and /investors stay separate (even with the same passcode and secret)');
  const shared = { passcode: invCode, secret };
  const decksToken = await decks.issueToken(shared);
  const invToken = await investors.issueToken(shared);
  ok((await decks.tokenValid(shared, decksToken)) && (await investors.tokenValid(shared, invToken)), 'each token opens its own area');
  ok(!(await investors.tokenValid(shared, decksToken)), 'a /decks token is refused by /investors');
  ok(!(await decks.tokenValid(shared, invToken)), 'an /investors token is refused by /decks');
  ok(!(await investors.tokenValid(shared, decksToken.replace(/^v1\./, 'inv1.'))), 'a /decks token relabelled inv1. is refused');
  ok(!(await decks.tokenValid(shared, invToken.replace(/^inv1\./, 'v1.'))), 'an /investors token relabelled v1. is refused');
  ok(investors.COOKIE === 'am_investors' && decks.COOKIE === 'am_decks', 'the cookies have their own names');

  console.log('Normalisation');
  const code = digits(6);
  const persian = [...code].map((c) => String.fromCharCode(0x06f0 + Number(c))).join('');
  const fullWidth = [...code].map((c) => String.fromCharCode(0xff10 + Number(c))).join(' ');
  ok(investors.normalise(arabicIndic(code)) === code, 'Arabic-Indic digits (٠–٩) with spaces read as 0–9');
  ok(investors.normalise(persian) === code, 'Eastern Arabic-Indic digits (۰–۹) read as 0–9');
  ok(investors.normalise(fullWidth) === code, 'full-width digits with non-breaking spaces read as 0–9');
  ok(investors.normalise(` ${code}\n`) === code, 'spaces and line breaks around it are ignored');
  ok(investors.normalise(undefined) === '' && investors.normalise(null) === '', 'nothing typed reads as empty');

  console.log('Configuration');
  ok(investors.investorsEnv({ INVESTORS_PASSCODE: invCode, DECKS_COOKIE_SECRET: secret })?.passcode === invCode, 'its own passcode and the /decks secret configure it');
  ok(investors.investorsEnv({ DECKS_COOKIE_SECRET: secret }) === null, 'without a passcode nothing unlocks');
  ok(investors.investorsEnv({ INVESTORS_PASSCODE: invCode, DECKS_COOKIE_SECRET: secret.slice(0, 31) }) === null, 'with a short secret nothing unlocks');
  ok(investors.investorsEnv({ INVESTORS_PASSCODE: invCode, DECKS_PASSCODE: arabicIndic(invCode), DECKS_COOKIE_SECRET: secret }) === null,
    'with the /decks passcode (however it is written) nothing unlocks');

  console.log('Unlock function (api/investors.ts)');
  process.env.INVESTORS_PASSCODE = invCode;
  process.env.DECKS_PASSCODE = decksCode;
  process.env.DECKS_COOKIE_SECRET = secret;
  const site = 'https://almukarramah.com';
  const call = (method: string, init: { cookie?: string; body?: unknown } = {}) =>
    api.fetch(new Request(`${site}/api/investors`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }));
  const refused = await call('POST', { body: { passcode: decksCode } });
  ok(refused.status === 401 && !refused.headers.get('set-cookie'), 'the /decks passcode is refused here: 401, no cookie');
  const accepted = await call('POST', { body: { passcode: arabicIndic(invCode) } });
  const setCookie = accepted.headers.get('set-cookie') ?? '';
  ok(accepted.status === 200 && /^am_investors=inv1\.\d+\.[A-Za-z0-9_-]{43}; Path=\/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$/.test(setCookie),
    'the right passcode, typed in Arabic-Indic digits, sets the 30-day am_investors cookie');
  const opened = (await accepted.json()) as { unlocked?: boolean; code?: string };
  ok(opened.unlocked === true && opened.code === invCode, 'and returns the code for the share message');
  const cookie = setCookie.split(';')[0];
  const status = async (c?: string) => (await call('GET', { cookie: c })).json() as Promise<{ unlocked?: boolean; code?: string }>;
  ok((await status(cookie)).unlocked === true, 'GET with the cookie: unlocked');
  const anon = await status();
  ok(anon.unlocked === false && anon.code === undefined, 'GET without it: locked, and no code');
  ok((await status(`am_investors=${await decks.issueToken({ passcode: decksCode, secret })}`)).unlocked === false, 'GET with a /decks token in the cookie: locked');
  ok(/^am_investors=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax; Secure$/.test((await call('DELETE', { cookie })).headers.get('set-cookie') ?? ''), 'DELETE clears the cookie');
  ok((await call('PUT')).status === 405, 'other methods: 405');

  console.log('Routing middleware (middleware.ts)');
  const decksCookie = `am_decks=${await decks.issueToken({ passcode: decksCode, secret })}`;
  const visit = (path: string, c?: string, accept = 'text/html', method = 'GET') =>
    middleware(new Request(`${site}${path}`, { method, headers: { accept, ...(c ? { cookie: c } : {}) } }));
  const toForm = await visit('/investors/files/Al-Mukarramah-financial-model.xlsx');
  ok(toForm?.status === 302 && toForm.headers.get('location') === '/investors?next=%2Finvestors%2Ffiles%2FAl-Mukarramah-financial-model.xlsx',
    'a private link without the cookie goes to /investors?next=…');
  const file = await visit('/investors/film/poster.jpg', undefined, 'image/avif,image/webp,*/*');
  ok(file?.status === 401 && (await file.text()) === 'Passcode required: https://almukarramah.com/investors', 'a private file without the cookie: 401');
  ok((await visit('/investors/deck', cookie)) === undefined, 'the /investors cookie opens /investors files');
  ok((await visit('/investors/deck', decksCookie))?.status === 302, 'the /decks cookie does not');
  ok((await visit('/decks/deck', cookie))?.status === 302, 'the /investors cookie does not open /decks files');
  ok((await visit('/decks/deck', decksCookie)) === undefined, '/decks still opens with its own cookie');
  const decksForm = await visit('/decks/film/al-mukarramah-film-1080p.mp4');
  ok(decksForm?.status === 302 && decksForm.headers.get('location') === '/decks?next=%2Fdecks%2Ffilm%2Fal-mukarramah-film-1080p.mp4',
    '/decks without the cookie still goes to /decks?next=…');
  const decksFile = await visit('/decks/film/al-mukarramah-film-1080p.mp4', undefined, '*/*', 'HEAD');
  ok(decksFile?.status === 401 && (await decksFile.text()) === 'Passcode required: https://almukarramah.com/decks', '/decks files without the cookie: still 401');

  console.log('Misconfigured: /investors stays locked');
  process.env.INVESTORS_PASSCODE = decksCode;
  ok((await call('GET', { cookie })).status === 503, 'with the /decks passcode, the unlock function answers 503');
  ok((await visit('/investors/deck', cookie))?.status === 302, 'and even a valid cookie no longer opens the files');
  delete process.env.INVESTORS_PASSCODE;
  ok((await call('POST', { body: { passcode: invCode } })).status === 503, 'without a passcode, the unlock function answers 503');

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) throw new Error(`${failed} check(s) failed`);
}

main().catch((e) => {
  console.error(e);
  throw e; // unhandled, so the run ends with an error
});
