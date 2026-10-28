// Quran text for the Quran Trail, from the Quran Foundation API (developer terms: the text must never be modified;
// cache for no more than a week unless their sync service is used). Check the endpoints below against
// https://api-docs.quran.foundation before going live; set QF_CLIENT_ID and QF_CLIENT_SECRET as secrets.
import { env, handle, json } from '../_shared/util.ts';

const TOKEN_URL = Deno.env.get('QF_TOKEN_URL') ?? 'https://oauth2.quran.foundation/oauth2/token';
const API_BASE = Deno.env.get('QF_API_BASE') ?? 'https://apis.quran.foundation/content/api/v4';

let cached: { token: string; until: number } | null = null;

async function token() {
  if (cached && cached.until > Date.now()) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env('QF_CLIENT_ID')}:${env('QF_CLIENT_SECRET')}`),
    },
    body: 'grant_type=client_credentials&scope=content',
  });
  if (!res.ok) throw new Error(`Quran Foundation auth ${res.status}`);
  const body = await res.json();
  cached = { token: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
  return cached.token;
}

Deno.serve(handle(async (req) => {
  const { ref } = (await req.json()) as { ref: string }; // 'page:1' or 'juz:1'
  const [kind, n] = ref.split(':');
  if (!['page', 'juz'].includes(kind) || !/^\d+$/.test(n)) throw new Error('Bad reference');
  const res = await fetch(`${API_BASE}/verses/by_${kind}/${n}?fields=text_uthmani&per_page=50`, {
    headers: { 'x-auth-token': await token(), 'x-client-id': env('QF_CLIENT_ID') },
  });
  if (!res.ok) throw new Error(`Quran Foundation ${res.status}`);
  const body = await res.json();
  const verses = (body.verses ?? []).map((v: { verse_key: string; text_uthmani: string }) => ({ verse_key: v.verse_key, text_uthmani: v.text_uthmani }));
  return new Response(JSON.stringify({ verses }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' },
  });
}));
