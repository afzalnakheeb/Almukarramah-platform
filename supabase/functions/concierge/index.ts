// Gift concierge on the Claude API. It answers only from the live catalogue and never gives religious rulings.
import { admin, env, handle, json } from '../_shared/util.ts';

type Msg = { role: 'user' | 'assistant'; content: string };

Deno.serve(handle(async (req) => {
  const { messages, lang } = (await req.json()) as { messages: Msg[]; lang: 'ar' | 'en' };
  const db = admin();
  const { data: products } = await db
    .from('products')
    .select('slug, name_en, name_ar, base_price_sar, stock, description_en, product_tags(tags(slug))')
    .eq('is_active', true)
    .gt('stock', 0)
    .limit(200);

  const catalogue = (products ?? []).map((p) => ({
    slug: p.slug,
    name: lang === 'ar' ? p.name_ar : p.name_en,
    price_sar: p.base_price_sar / 100,
    tags: (p.product_tags as { tags: { slug: string } }[]).map((t) => t.tags.slug),
    about: p.description_en,
  }));

  const system = `You are the gift concierge for Al Mukarramah, a premium Islamic gifting brand in Madinah.
Reply in ${lang === 'ar' ? 'Arabic' : 'English'}, warmly and briefly (under 80 words).
Recommend only products from this catalogue, by occasion, recipient and budget. Prices are in SAR and include VAT.
Never invent products, prices, delivery promises or discounts. Never give religious rulings (fiqh); suggest asking a qualified scholar.
If you cannot help, offer WhatsApp support.
Return JSON only: {"reply": "...", "slugs": ["slug-1", "slug-2"]} with at most 3 slugs.
CATALOGUE: ${JSON.stringify(catalogue)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: Deno.env.get('CONCIERGE_MODEL') ?? 'claude-haiku-5-5', max_tokens: 600, system, messages: messages.slice(-10) }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const out = await res.json();
  const text: string = out.content?.find((c: { type: string }) => c.type === 'text')?.text ?? '';

  let parsed: { reply: string; slugs: string[] } = { reply: text, slugs: [] };
  try {
    parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    /* plain-text reply */
  }
  const picked = catalogue.filter((p) => parsed.slugs?.includes(p.slug)).map((p) => ({ slug: p.slug, name: p.name }));
  return json({ reply: parsed.reply, products: picked });
}));
