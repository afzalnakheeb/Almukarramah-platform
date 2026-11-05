// Vercel Routing Middleware: almukarramah.com is private while the store concept is refined.
//
// Every page and file is served only to visitors who have entered the site passcode. The passcode is the /investors
// one (INVESTORS_PASSCODE, set in Vercel, never in this repository), and the unlock cookie is the /investors cookie
// (src/server/investors-auth.ts, Path=/), so one entry opens the store, /investors and /decks together.
//   /decks/   the brand film and deck: opens with the site cookie, or with its own /decks cookie as before
//   /api/*    not gated here: the functions check what they need (the passcode checks, webhooks, the concierge)
// A visitor without the cookie gets the passcode page itself, at the address they asked for (no redirect), so after
// unlocking the page simply reloads. Anything that is not a page (an image, a film, a script) gets a plain 401.
// It runs before Vercel's cache, so cached copies are protected too.
import * as decks from './src/server/decks-auth';
import * as investors from './src/server/investors-auth';

export const config = { matcher: ['/((?!api/).*)'] };

/** Paths that stay open: the robots file (it says "do not index") and the files browsers and app stores fetch on their own. */
const OPEN = [/^\/robots\.txt$/, /^\/favicon\.ico$/, /^\/\.well-known\//];

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (OPEN.some((re) => re.test(url.pathname))) return undefined;
  if (await investors.unlocked(request, investors.investorsEnv())) return undefined; // the site passcode opens everything
  if (url.pathname.startsWith('/decks/') && (await decks.unlocked(request, decks.decksEnv()))) return undefined; // old /decks links

  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')) {
    return new Response(GATE_HTML, { status: 401, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return new Response('Passcode required: https://almukarramah.com', {
    status: 401,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/** The passcode page: one self-contained file (no scripts or fonts from elsewhere), in English and Arabic. */
export const GATE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Al Mukarramah</title><meta name="robots" content="noindex, nofollow">
<style>
:root{--ivory:#F7F3EC;--ink:#1C1A17;--gold:#B08D52;--brass:#7D6237;--line:#E3DACB;--muted:#6E675E;--emerald:#14392F}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--ivory);color:var(--ink)}
body{font-family:"Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}
.card{width:100%;max-width:440px;text-align:center;border:1px solid var(--line);outline:1px solid rgba(176,141,82,.35);outline-offset:6px;background:#FBF9F5;padding:44px 32px 36px}
.ar{font-family:"Geeza Pro","Noto Naskh Arabic","Amiri",serif;font-size:40px;color:var(--brass);line-height:1.3;margin:0}
.en{font-family:Georgia,"Times New Roman",serif;font-size:15px;letter-spacing:.42em;text-transform:uppercase;margin:6px 0 26px}
.rule{width:56px;height:1px;background:var(--gold);margin:0 auto 22px}
p.lead{font-size:14.5px;line-height:1.6;color:var(--muted);margin:0 0 4px}p.lead[dir=rtl]{font-size:16px;margin-bottom:22px}
form{display:flex;gap:10px}
input{flex:1;min-width:0;font:600 20px/1 "Helvetica Neue",Arial,sans-serif;letter-spacing:.3em;text-align:center;padding:14px 10px;border:1px solid #D9CDB8;background:#fff;color:var(--ink);border-radius:2px}
input:focus{outline:2px solid var(--gold);outline-offset:1px}
button{font:600 12px/1 "Helvetica Neue",Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;padding:0 20px;border:0;background:var(--emerald);color:#F3ECDD;border-radius:2px;cursor:pointer}
button:disabled{opacity:.6}
.err{min-height:22px;margin-top:12px;font-size:13.5px;color:#9B3B2E}
.foot{margin-top:18px;font-size:12.5px;color:var(--muted)}
</style></head><body>
<main class="card">
<p class="ar" lang="ar">المكرّمة</p><p class="en">Al Mukarramah</p><div class="rule"></div>
<p class="lead">This preview is private. Please enter the passcode.</p>
<p class="lead" dir="rtl" lang="ar">هذه المعاينة خاصة. يُرجى إدخال رمز الدخول.</p>
<form id="f" autocomplete="off"><input id="c" inputmode="numeric" autocomplete="one-time-code" aria-label="Passcode / رمز الدخول" maxlength="32" required autofocus><button id="b" type="submit">Enter · دخول</button></form>
<div class="err" id="e" role="alert"></div>
<div class="foot">hello@almukarramah.com</div>
</main>
<script>
var f=document.getElementById('f'),c=document.getElementById('c'),b=document.getElementById('b'),e=document.getElementById('e');
f.addEventListener('submit',function(ev){ev.preventDefault();b.disabled=true;e.textContent='';
fetch('/api/investors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passcode:c.value}),credentials:'same-origin'})
.then(function(r){if(r.ok){location.reload();return}e.textContent=r.status===401?'That passcode is not right. · رمز الدخول غير صحيح.':'Please try again in a moment. · حاول مرة أخرى بعد قليل.';b.disabled=false;c.select()})
.catch(function(){e.textContent='Please check your connection. · تحقّق من اتصالك.';b.disabled=false})});
</script></body></html>`;
