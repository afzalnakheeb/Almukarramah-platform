// Drafts a listing's name and description in the other language (English <-> Arabic) for the seller to check and
// confirm; nothing is saved here. Quran verses are never translated, paraphrased or reproduced: if the text quotes the
// Quran, that part is left out of the draft and the seller is told. Sellers only; rate-limited.
import { claudeCaller, screeningModels } from '../_shared/claude.ts';
import { admin, caller, fail, handle, json, UUID, withinLimit } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return fail(401, 'Please sign in', 'يُرجى تسجيل الدخول');
  const b = (await req.json()) as { sellerId?: string; to?: 'ar' | 'en'; name?: string; description?: string };
  if (!b.sellerId || !UUID.test(b.sellerId) || (b.to !== 'ar' && b.to !== 'en')) return fail(400, 'Missing details', 'بيانات ناقصة');
  const name = String(b.name ?? '').slice(0, 200).trim();
  const description = String(b.description ?? '').slice(0, 4000).trim();
  if (!name && !description) return fail(400, 'Write the name or description first', 'اكتب الاسم أو الوصف أولًا');
  const db = admin();
  const { data: m } = await db.from('seller_members').select('user_id').eq('seller_id', b.sellerId).eq('user_id', user.id).maybeSingle();
  if (!m) return fail(403, 'Not allowed', 'غير مسموح');
  if (!(await withinLimit(db, `translate:${b.sellerId}`, 86400, 100))) return fail(429, 'Daily limit reached. Please try again tomorrow.', 'بلغت الحد اليومي. حاول غدًا.');
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return fail(503, 'Drafting is not available right now', 'الصياغة غير متاحة الآن');
  const from = b.to === 'ar' ? 'English' : 'Arabic';
  const to = b.to === 'ar' ? 'Modern Standard Arabic' : 'British English';
  const system = `You draft product text for Al Mukarramah, a premium marketplace for Muslim homes. Translate the seller's ${from} product name and description into ${to}: faithful, natural and refined, adding nothing (no claims, no new facts).
Never translate, paraphrase or reproduce Quran verses: if the text quotes the Quran, leave that part out and set "quran_text_present": true.
Answer with ONE JSON object and nothing else: {"name": "...", "description": "...", "quran_text_present": true | false}`;
  try {
    const r = await claudeCaller(key, { maxTokens: 1500 })(screeningModels((n) => Deno.env.get(n)).fast, system,
      [{ type: 'text', text: JSON.stringify({ name, description }) }]);
    const o = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1)) as { name?: string; description?: string; quran_text_present?: boolean };
    return json({ name: String(o.name ?? '').slice(0, 120), description: String(o.description ?? '').slice(0, 4000), quran_text_present: o.quran_text_present === true });
  } catch (e) {
    console.error(e);
    return fail(503, 'Drafting is not available right now. Please try again shortly.', 'الصياغة غير متاحة الآن. حاول بعد قليل.');
  }
}));
