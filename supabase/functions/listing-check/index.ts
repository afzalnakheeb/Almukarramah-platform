// AI guideline check for a seller's listing. Reads the text and looks at every photo against the seller guidelines,
// and stores the result on the product. The database only lets a listing be submitted for approval when the latest
// check passed or asks for fixes ("review"); "block" stops it. Al Mukarramah's team still approves every listing.
import { GUIDELINES } from '../_shared/guidelines.ts';
import { admin, caller, env, handle, json, staffRole } from '../_shared/util.ts';

const PER_SELLER_DAILY = 60;
const MAX_PHOTOS = 6;

type Issue = { severity: 'block' | 'fix' | 'note'; field: string; photo?: number; en: string; ar: string };
type Result = { verdict: 'pass' | 'review' | 'block'; summary_en: string; summary_ar: string; issues: Issue[]; suggested_ar?: { name?: string; description?: string } };

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) throw new Error('Please sign in');
  const { productId } = (await req.json()) as { productId?: string };
  if (!productId) throw new Error('Missing product');
  const db = admin();

  const { data: p, error } = await db.from('products')
    .select('id, updated_at, seller_id, name_en, name_ar, description_en, description_ar, base_price_sar, weight_g, ship_class, images, made_to_measure, garment, sizes, size_chart, tailoring, categories(slug, name_en), sellers(name_en, country, kind)')
    .eq('id', productId).single();
  if (error || !p) throw new Error('Product not found');
  if (!p.seller_id) throw new Error('Only seller listings are checked here');
  const staff = await staffRole(db, user.id);
  if (!staff) {
    const { data: m } = await db.from('seller_members').select('user_id').eq('seller_id', p.seller_id).eq('user_id', user.id).maybeSingle();
    if (!m) throw new Error('Not allowed');
  }
  const { data: used } = await db.rpc('assistant_hit', { p_key: `listing:${p.seller_id}` });
  if ((used ?? 0) > PER_SELLER_DAILY) throw new Error('Daily limit for guideline checks reached. Please try again tomorrow.');

  // Photos: private uploads are read with the server key; approved copies from the public catalogue.
  const images: { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }[] = [];
  for (const path of ((p.images as string[]) ?? []).slice(0, MAX_PHOTOS)) {
    try {
      let blob: Blob | null = null;
      if (/^https:\/\//.test(path)) blob = await (await fetch(path)).blob();
      else blob = (await db.storage.from('seller-uploads').download(path)).data;
      if (!blob) continue;
      const type = ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
      images.push({ type: 'image', source: { type: 'base64', media_type: type, data: toBase64(await blob.arrayBuffer()) } });
    } catch (e) {
      console.warn('photo not read', path, e);
    }
  }

  const listing = {
    name_en: p.name_en, name_ar: p.name_ar, description_en: p.description_en, description_ar: p.description_ar,
    price_sar_incl_vat: (p.base_price_sar / 100).toFixed(2), weight_g: p.weight_g, ship_class: p.ship_class,
    category: (p.categories as { name_en?: string } | null)?.name_en ?? null,
    made_to_measure: p.made_to_measure, garment: p.garment, sizes: p.sizes, size_chart: p.size_chart, tailoring: p.tailoring,
    seller_country: (p.sellers as { country?: string } | null)?.country ?? null,
    photo_count: images.length,
  };

  const system = `You review product listings for the Al Mukarramah marketplace before a human approves them.
Apply ONLY the store rules below. Do not give religious rulings or opinions beyond these rules.
Look carefully at every photo: a visible human face anywhere (models, portraits, faces on dolls, toys or packaging) is a block.

${GUIDELINES}

Answer with ONE JSON object and nothing else:
{"verdict":"pass"|"review"|"block",
 "summary_en":"one sentence for the seller","summary_ar":"the same in Arabic",
 "issues":[{"severity":"block"|"fix"|"note","field":"photos"|"name"|"description"|"price"|"category"|"details"|"other","photo":<1-based photo number if about a photo>,"en":"what is wrong and exactly how to fix it","ar":"the same in Arabic"}],
 "suggested_ar":{"name":"...","description":"..."}}
Rules for the verdict:
- "block": the product is in the NOT ALLOWED list, is outside the ALLOWED groups, or any photo shows a person's face or breaks a NOT ALLOWED rule.
- "review": allowed, but something must be fixed or checked (missing or poor Arabic, missing details such as size chart, alcohol statement, expiry or tailoring time, a weak or busy photo, text on a photo, contact details in the text, a price that looks wrong).
- "pass": allowed and meets the photo and quality rules.
Include "suggested_ar" only when the Arabic name or description is missing or poor: a faithful, natural Modern Standard Arabic version of the English text (never add claims).
Keep each message short, specific and polite.`;

  const apiKey = env('ANTHROPIC_API_KEY').trim().replace(/^["']|["']$/g, '');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('LISTING_CHECK_MODEL') ?? 'claude-sonnet-5-5',
      max_tokens: 1500,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `LISTING:\n${JSON.stringify(listing, null, 1)}\n\n${images.length} photo(s) follow, in order.` },
          ...images,
          ...(images.length ? [] : [{ type: 'text', text: 'There are no photos yet.' }]),
        ],
      }],
    }),
  });
  if (!res.ok) {
    console.error('Claude API', res.status, await res.text());
    throw new Error('The guideline check is unavailable right now. Please try again in a few minutes.');
  }
  const out = await res.json();
  const text: string = out.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';
  let r: Result;
  try {
    r = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    throw new Error('The guideline check returned an unreadable answer. Please try again.');
  }
  if (!['pass', 'review', 'block'].includes(r.verdict)) r.verdict = 'review';
  r.issues = (Array.isArray(r.issues) ? r.issues : []).slice(0, 20).map((i) => ({
    severity: (['block', 'fix', 'note'].includes(i.severity) ? i.severity : 'fix') as Issue['severity'],
    field: String(i.field ?? 'other').slice(0, 20), photo: typeof i.photo === 'number' ? i.photo : undefined,
    en: String(i.en ?? '').slice(0, 400), ar: String(i.ar ?? '').slice(0, 400),
  }));
  // A blocking issue always blocks, whatever the overall verdict says; no photos means it cannot pass.
  if (r.issues.some((i) => i.severity === 'block')) r.verdict = 'block';
  if (!images.length && r.verdict === 'pass') r.verdict = 'review';

  const stored = { ...r, model: out.model, checked_at: new Date().toISOString(), photos_checked: images.length };
  // Only store the result if the listing was not changed while it was being checked.
  const { data: saved, error: uErr } = await db.from('products').update({ ai_check: stored, ai_checked_at: new Date().toISOString() })
    .eq('id', p.id).eq('updated_at', p.updated_at).select('id');
  if (uErr) throw uErr;
  if (!saved?.length) throw new Error('The listing changed during the check. Please run the check again.');
  return json(stored);
}));
