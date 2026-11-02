// Vercel Routing Middleware: the private files are served only to visitors who have entered that area's passcode:
//   /decks/      the pitch deck and the film             passcode on almukarramah.com/decks
//   /investors/  the investor film, deck and documents   passcode on almukarramah.com/investors
// Each area has its own passcode and cookie, so unlocking one never opens the other. It runs before Vercel's cache,
// so cached copies are protected too. The /decks and /investors pages themselves stay public: they ask for the
// passcode (and /decks gives link previews their title and image).
import * as decks from './src/server/decks-auth';
import * as investors from './src/server/investors-auth';

export const config = { matcher: ['/decks/:path+', '/investors/:path+'] };

const AREAS = [
  { dir: '/decks/', page: '/decks', unlocked: (request: Request) => decks.unlocked(request, decks.decksEnv()) },
  { dir: '/investors/', page: '/investors', unlocked: (request: Request) => investors.unlocked(request, investors.investorsEnv()) },
];

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  const area = AREAS.find((a) => url.pathname.startsWith(a.dir));
  if (!area) return undefined;
  if (await area.unlocked(request)) return undefined; // carry on to the file

  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  // Someone opened a private link directly: send them to the passcode page, then back here.
  if (request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')) {
    return new Response(null, { status: 302, headers: { ...headers, Location: `${area.page}?next=${encodeURIComponent(url.pathname)}` } });
  }
  return new Response(`Passcode required: https://almukarramah.com${area.page}`, {
    status: 401,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
