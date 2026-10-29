// Runs before every web build (npm run build:web).
// 1. Takes a fresh snapshot of the live catalogue from Supabase (public, read-only key) so every page
//    and every product is pre-rendered with real content for search engines and AI assistants.
// 2. Writes sitemap.xml, robots.txt, llms.txt, llms-full.txt and a Google Merchant feed into /public.
// If Supabase cannot be reached, the last committed snapshot is used, so a build never fails on this.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(root, 'src/generated/catalogue.json');
const PUBLIC = join(root, 'public');
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://almukarramah.com').replace(/\/$/, '');
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

async function fetchJson(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function snapshot() {
  if (!URL_ || !KEY) throw new Error('Supabase env not set');
  const categories = await fetchJson('categories?select=id,slug,name_en,name_ar,sort,image,blurb_en,blurb_ar&is_active=eq.true&order=sort');
  const products = await fetchJson(
    'products?select=id,slug,sku,brand,ship_class,name_en,name_ar,description_en,description_ar,base_price_sar,stock,images,is_featured,restricted_countries,' +
      'seo_title_en,seo_title_ar,seo_description_en,seo_description_ar,updated_at,category_id,categories(slug,name_en,name_ar),' +
      'product_tags(tags(id,kind,slug,name_en,name_ar,icon))&is_active=eq.true&order=is_featured.desc,created_at',
  );
  return { categories, products, generated_at: new Date().toISOString() };
}

let data;
try {
  data = await snapshot();
  mkdirSync(dirname(SNAPSHOT), { recursive: true });
  writeFileSync(SNAPSHOT, JSON.stringify(data, null, 1));
  console.log(`catalogue snapshot: ${data.products.length} products, ${data.categories.length} categories`);
} catch (e) {
  console.warn(`catalogue snapshot skipped (${e.message}); using the committed snapshot`);
  data = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
}

// Partner photos (e.g. Ahmed Al Maghribi, used with permission) are fetched from the brand's server at build time,
// resized and served from our own domain, so pages never depend on someone else's server.
async function mirrorRemoteImages() {
  const manifestPath = join(root, 'scripts/remote-images.json');
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let sharp = null;
  try { sharp = (await import('sharp')).default; } catch { console.warn('sharp not installed: partner photos copied at full size'); }
  const entries = Object.entries(manifest).filter(([local]) => !existsSync(join(PUBLIC, local)));
  let ok = 0, failed = 0;
  for (let i = 0; i < entries.length; i += 8) {
    await Promise.all(entries.slice(i, i + 8).map(async ([local, url]) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(String(res.status));
        let buf = Buffer.from(await res.arrayBuffer());
        if (sharp) buf = await sharp(buf).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        mkdirSync(dirname(join(PUBLIC, local)), { recursive: true });
        writeFileSync(join(PUBLIC, local), buf);
        ok++;
      } catch (e) {
        failed++;
        console.warn(`photo not fetched: ${local} (${e.message})`);
      }
    }));
  }
  console.log(`partner photos: ${ok} fetched, ${failed} failed, ${Object.keys(manifest).length - entries.length} already present`);
}
await mirrorRemoteImages();

const { categories, products } = data;
const today = new Date().toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (p) => (p?.startsWith('http') ? p : `${SITE}${p}`);
const sar = (h) => (h / 100).toFixed(2);

// sitemap.xml (with image extension)
const pages = ['/', '/shop', '/apps', '/membership', '/concierge', '/apps/recite-with-me', '/apps/seerah-trails', '/privacy', '/terms'];
const urls = [
  ...pages.map((p) => `<url><loc>${SITE}${p}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.6'}</priority></url>`),
  ...categories.map((c) => `<url><loc>${SITE}/collections/${c.slug}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority>${c.image ? `<image:image><image:loc>${esc(abs(c.image))}</image:loc></image:image>` : ''}</url>`),
  ...products.map((p) => `<url><loc>${SITE}/product/${p.slug}</loc><lastmod>${(p.updated_at || today).slice(0, 10)}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority>${(p.images || []).map((i) => `<image:image><image:loc>${esc(abs(i))}</image:loc><image:title>${esc(p.name_en)}</image:title></image:image>`).join('')}</url>`),
];
writeFileSync(join(PUBLIC, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`);

// robots.txt — search engines and AI assistants are welcome on the shop; private areas are not.
writeFileSync(join(PUBLIC, 'robots.txt'), `# Al Mukarramah — premium Islamic gifts from Madinah
User-agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /checkout
Disallow: /cart
Disallow: /pay
Disallow: /subscribe

# AI assistants and answer engines may read and cite the catalogue (same private areas excluded)
User-agent: GPTBot
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: CCBot
Allow: /
Allow: /llms.txt
Allow: /llms-full.txt
Disallow: /admin
Disallow: /account
Disallow: /checkout
Disallow: /cart
Disallow: /pay
Disallow: /subscribe

Sitemap: ${SITE}/sitemap.xml
`);

// llms.txt — a short, factual map of the shop for AI assistants (llmstxt.org format)
const byCat = categories.map((c) => ({ c, items: products.filter((p) => p.categories?.slug === c.slug) }));
const llms = `# Al Mukarramah (المكرمة)

> A curated marketplace of premium products for every Muslim home, based in Madinah, Saudi Arabia (tagline: "For every Muslim home"). Every product is approved by the Al Mukarramah team. Today it offers prayer mats and woven prayer rugs inspired by the Haramain, matching gift sets, Madinah dates under the Ajwati label, Madinah keepsakes, and Ahmed Al Maghribi perfumes and oud oils (authorised reseller, official Saudi prices); makers of premium Muslim products can apply to sell (hello@almukarramah.com). Established 2020. Delivery to hotels in Madinah and Makkah, across Saudi Arabia and internationally. Prices are in Saudi riyals (SAR) and include 15% VAT; every order receives a ZATCA-compliant tax invoice.

- Website: ${SITE}
- Languages: Arabic and English
- Customer help: the Al Mukarramah assistant on every page, or ${SITE}/concierge
- Full catalogue for AI assistants: ${SITE}/llms-full.txt

## Collections
${byCat.map(({ c, items }) => `- [${c.name_en} / ${c.name_ar}](${SITE}/collections/${c.slug}): ${c.blurb_en ?? ''} (${items.length} products)`).join('\n')}

## Featured products
${products.filter((p) => p.is_featured).map((p) => `- [${p.name_en}](${SITE}/product/${p.slug}): SAR ${sar(p.base_price_sar)}`).join('\n')}

## Apps by Al Mukarramah
- [Recite With Me (رتّل معي)](https://rattilmai.com): Quran memorisation and tajweed to the standard of the Two Holy Mosques, with a daily plan, AI listening and live teacher sessions.
- [Seerah Trails (دروب السيرة)](https://seerahtrails.com): a halal, child-friendly 3D journey through the Seerah: Makkah, the Hijra and Madinah.
- All apps: ${SITE}/apps

## Policies
- Prices include 15% VAT (Saudi Arabia). Delivery charge is shown at checkout before payment.
- Gift message printed on a card; prices never appear on anything the recipient sees.
- Perfume sprays (alcohol-based) are delivered within Saudi Arabia only; oud and perfume oils ship internationally.
- Payment through Moyasar: mada, Apple Pay, STC Pay and cards. Card details never reach Al Mukarramah.
`;
writeFileSync(join(PUBLIC, 'llms.txt'), llms);

const full = `# Al Mukarramah — full catalogue

Generated ${data.generated_at}. Prices in SAR including 15% VAT.

${byCat.map(({ c, items }) => `## ${c.name_en} (${c.name_ar})

${c.blurb_en ?? ''}

${items.map((p) => `### ${p.name_en}
- Arabic name: ${p.name_ar}
- URL: ${SITE}/product/${p.slug}
- Price: SAR ${sar(p.base_price_sar)} (VAT included)
- Availability: ${p.stock > 0 ? 'in stock' : 'out of stock'}
${p.sku ? `- SKU: ${p.sku}\n` : ''}- Occasions and recipients: ${(p.product_tags || []).map((t) => t.tags.name_en).join(', ') || '—'}
- Description: ${p.description_en ?? ''}
- الوصف: ${p.description_ar ?? ''}
`).join('\n')}`).join('\n')}`;
writeFileSync(join(PUBLIC, 'llms-full.txt'), full);

// Google Merchant Center feed (RSS 2.0 + g: namespace)
mkdirSync(join(PUBLIC, 'feeds'), { recursive: true });
const items = products.map((p) => `<item>
<g:id>${esc(p.sku || p.slug)}</g:id>
<title>${esc(p.name_en)}</title>
<description>${esc(p.description_en)}</description>
<link>${SITE}/product/${p.slug}</link>
${p.images?.[0] ? `<g:image_link>${esc(abs(p.images[0]))}</g:image_link>` : ''}
${(p.images || []).slice(1).map((i) => `<g:additional_image_link>${esc(abs(i))}</g:additional_image_link>`).join('')}
<g:availability>${p.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>
<g:price>${sar(p.base_price_sar)} SAR</g:price>
<g:brand>${esc(p.brand || 'Al Mukarramah')}</g:brand>
<g:condition>new</g:condition>
<g:identifier_exists>no</g:identifier_exists>
<g:product_type>${esc(p.categories?.name_en ?? '')}</g:product_type>
</item>`);
writeFileSync(join(PUBLIC, 'feeds/google-merchant.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Al Mukarramah</title><link>${SITE}</link><description>The premium marketplace for every Muslim home</description>\n${items.join('\n')}\n</channel></rss>\n`);

if (!existsSync(join(PUBLIC, 'sitemap.xml'))) process.exit(1);
console.log('wrote sitemap.xml, robots.txt, llms.txt, llms-full.txt, feeds/google-merchant.xml');
