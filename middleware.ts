// Vercel Routing Middleware: the files under /decks/ (the pitch deck and the film) are served only to visitors who
// have entered the passcode on almukarramah.com/decks. It runs before Vercel's cache, so cached copies are protected too.
// The /decks page itself stays public: it asks for the passcode and gives link previews their title and image.
import { decksEnv, unlocked } from './src/server/decks-auth';

export const config = { matcher: ['/decks/:path+'] };

export default async function middleware(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/decks/')) return undefined;
  if (await unlocked(request, decksEnv())) return undefined; // carry on to the file

  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  // Someone opened a deck link directly: send them to the passcode page, then back here.
  if (request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')) {
    return new Response(null, { status: 302, headers: { ...headers, Location: `/decks?next=${encodeURIComponent(url.pathname)}` } });
  }
  return new Response('Passcode required: https://almukarramah.com/decks', {
    status: 401,
    headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
