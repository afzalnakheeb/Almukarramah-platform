// Design and SEO check, run by .github/workflows/shots.yml on shots/* branches (never on main).
// Takes screenshots of the built site (desktop, phone, Arabic) cut into readable pieces, and writes an SEO report
// of what search engines and AI assistants see in each page's raw HTML (before any JavaScript runs).
// Usage: node scripts/shots.mjs <baseUrl> <outDir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const out = process.argv[3] || 'shots';
mkdirSync(out, { recursive: true });

const pages = (process.env.SHOT_PAGES || '/,/collections/perfumes,/product/aam-zumar-60-ml,/product/kaaba-door-prayer-mat,/cart,/checkout,/sell,/sell/guidelines,/sell/categories,/sell/islamic-standard,/sell/premium-standard,/sell/photos,/sell/prohibited,/seller/application,/seller/shop,/seller/orders,/seller/product?id=demo-blocked,/seller/product?id=demo-queue-oud,/admin/listings,/admin/sellers,/search?q=oud,/search?cat=fragrance-oud,/sellers/dar-al-oud-madinah,/sellers,/fashion,/tailoring/measure,/seller/statements,/seller/returns,/seller/messages,/seller/reviews,/seller/performance,/order?id=demo-order,/messages,/review?item=i1,/admin/returns,/admin/reviews,/admin/payouts,/admin/messages,/admin/notifications,/admin/performance').split(',');
const views = [
  { name: 'd', width: 1440, height: 900, dsf: 1, chunk: 1100, locale: 'en-GB' },
  { name: 'm', width: 390, height: 844, dsf: 2, chunk: 1300, locale: 'en-GB' },
  { name: 'ar', width: 1440, height: 900, dsf: 1, chunk: 1100, locale: 'ar-SA', only: ['/', '/collections/perfumes', '/product/aam-zumar-60-ml', '/cart', '/account', '/sell/categories', '/sell/islamic-standard', '/search?q=oud', '/sellers/dar-al-oud-madinah', '/seller/statements', '/order?id=demo-order', '/product/kaaba-door-prayer-mat'] },
  { name: 'arm', width: 390, height: 844, dsf: 2, chunk: 1300, locale: 'ar-SA', only: ['/', '/product/aam-zumar-60-ml', '/sell', '/sell/photos', '/seller/application', '/seller/product?id=demo-blocked', '/seller/orders', '/seller/statements', '/seller/returns', '/order?id=demo-order', '/messages'] },
];
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-'));

const errors = [];
const browser = await chromium.launch();
for (const v of process.env.SEO_ONLY ? [] : views) {
  for (const path of pages) {
    if (v.only && !v.only.includes(path)) continue;
    // React Native Web scrolls inside an inner view, so measure the content and use a viewport that tall.
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, locale: v.locale });
    // the first-visit brand intro is captured separately below (frozen frames); normal shots never show it
    await ctx.addInitScript(() => { try { sessionStorage.setItem('amIntro', '1'); } catch { /* ignore */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${v.name} ${path} pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 6).join('\n')}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${v.name} ${path} console: ${m.text().slice(0, 600)}`); });
    try {
      await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);
      const h = await page.evaluate(() => {
        let m = document.documentElement.scrollHeight;
        document.querySelectorAll('div').forEach((d) => { if (d.scrollHeight > m && d.scrollHeight < 40000) m = d.scrollHeight; });
        return m;
      });
      await page.setViewportSize({ width: v.width, height: Math.min(h, 16000) });
      await page.waitForTimeout(1200);
      const total = Math.min(h, 16000);
      for (let y = 0, i = 0; y < total; y += v.chunk, i++) {
        await page.screenshot({ path: join(out, `${v.name}-${slug(path)}-${i}.jpg`), type: 'jpeg', quality: 70, clip: { x: 0, y, width: v.width, height: Math.min(v.chunk, total - y) } });
      }
      console.log(`${v.name} ${path}: ${total}px`);
    } catch (e) {
      console.log(`${v.name} ${path}: FAILED ${e.message}`);
    }
    await ctx.close();
  }
}
// States a plain page load never shows: the phone menu and filter sheet, the compact header, a bag with a gift in it.
const states = [
  { v: 'm', name: 'state-menu', path: '/', act: async (p) => { await p.locator('[data-banner] [data-icon]').first().click(); } },
  { v: 'arm', name: 'state-menu', path: '/', act: async (p) => { await p.locator('[data-banner] [data-icon]').first().click(); } },
  { v: 'm', name: 'state-filters', path: '/collections/perfumes', act: async (p) => { await p.getByText(/Filter and sort/i).first().click(); } },
  { v: 'd', name: 'state-compact', path: '/collections/perfumes', act: async (p) => { await p.evaluate(() => { const s = document.querySelector('[data-scroller]'); if (s) s.scrollTop = 900; }); } },
  { v: 'd', name: 'state-bag', path: '/product/aam-zumar-60-ml', act: async (p) => { await p.getByText(/Add to bag/i).first().click(); await p.waitForURL(/\/cart/, { timeout: 15000 }); } },
  { v: 'm', name: 'state-bag', path: '/product/kaaba-door-prayer-mat', act: async (p) => { await p.getByText(/^Add to bag$/i).first().click(); await p.waitForURL(/\/cart/, { timeout: 15000 }); } },
  { v: 'ar', name: 'state-bag', path: '/product/aam-zumar-60-ml', act: async (p) => { await p.locator('[data-btn="primary"]').first().click(); await p.waitForURL(/\/cart/, { timeout: 15000 }); } },
];
for (const st of process.env.SEO_ONLY ? [] : states) {
  const v = views.find((x) => x.name === st.v);
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, locale: v.locale });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('amIntro', '1'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${v.name} ${st.name} pageerror: ${e.message}`));
  try {
    await page.goto(base + st.path, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    await st.act(page);
    await page.waitForTimeout(1800);
    if (st.name === 'state-bag') {
      const h = await page.evaluate(() => { let m = document.documentElement.scrollHeight; document.querySelectorAll('div').forEach((d) => { if (d.scrollHeight > m && d.scrollHeight < 40000) m = d.scrollHeight; }); return m; });
      await page.setViewportSize({ width: v.width, height: Math.min(h, 2600) });
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: join(out, `${v.name}-${st.name}.jpg`), type: 'jpeg', quality: 72, fullPage: false });
  } catch (e) {
    console.log(`${v.name} ${st.name}: FAILED ${e.message}`);
  }
  await ctx.close();
}

// The brand intro, frozen at moments of its timeline (?intro=<seconds>, see src/components/brand-intro.tsx).
const introTimes = { d: [0.6, 1.8, 2.8, 3.8, 4.9, 5.6, 6.6, 7.25], m: [1.8, 3.6, 5.0, 6.6, 7.25], ar: [3.6, 6.6, 7.25], arm: [6.6] };
for (const v of process.env.SEO_ONLY || process.env.NO_INTRO ? [] : views) {
  for (const t of introTimes[v.name] ?? []) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, locale: v.locale });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${v.name} intro ${t} pageerror: ${e.message}`));
    try {
      await page.goto(`${base}/?intro=${t}`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1600);
      await page.screenshot({ path: join(out, `intro-${v.name}-${String(t).replace('.', '_')}.jpg`), type: 'jpeg', quality: 78 });
    } catch (e) {
      console.log(`intro ${v.name} ${t}: FAILED ${e.message}`);
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(out, 'errors.txt'), errors.join('\n\n') || 'no errors');

// SEO report from raw HTML (what crawlers that do not run JavaScript, including most AI crawlers, see)
const seoPages = [...new Set([...pages, '/collections/prayer-mats', '/privacy', '/terms'])].filter((p) => p !== '/account');
const lines = [];
const pick = (html, re) => [...html.matchAll(re)].map((m) => m[1]);
for (const p of seoPages) {
  try {
    const res = await fetch(base + p);
    const html = await res.text();
    const title = pick(html, /<title[^>]*>([^<]*)<\/title>/g)[0];
    const meta = (n) => pick(html, new RegExp(`<meta[^>]+(?:name|property)="${n}"[^>]+content="([^"]*)"`, 'g'))[0] ?? pick(html, new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:name|property)="${n}"`, 'g'))[0];
    const canon = pick(html, /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/g)[0];
    const alts = pick(html, /<link[^>]+hreflang="([^"]*)"/g);
    const ld = pick(html, /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g).map((s) => { try { const j = JSON.parse(s); return j['@type'] ?? (j['@graph'] ? 'graph' : '?'); } catch { return 'INVALID'; } });
    const h1 = pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/g).map((s) => s.replace(/<[^>]+>/g, '').trim());
    const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    lines.push(`## ${p}  (HTTP ${res.status})`,
      `title: ${title}`, `description: ${meta('description')}`, `robots: ${meta('robots') ?? '-'}`, `canonical: ${canon}`,
      `hreflang: ${alts.join(', ') || '-'}`, `og:title: ${meta('og:title')}`, `og:image: ${meta('og:image')}`, `twitter:card: ${meta('twitter:card')}`,
      `html lang/dir: ${pick(html, /<html([^>]*)>/g)[0]?.trim()}`, `h1: ${h1.join(' | ') || 'NONE'}`, `json-ld: ${ld.join(', ') || 'NONE'}`,
      `visible text without JS: ${text.length} chars: "${text.slice(0, 160)}…"`, '');
  } catch (e) { lines.push(`## ${p}: FAILED ${e.message}`, ''); }
}
for (const f of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/llms-full.txt', '/feeds/google-merchant.xml']) {
  try { const r = await fetch(base + f); const t = await r.text(); lines.push(`${f}: HTTP ${r.status}, ${t.length} bytes${f === '/sitemap.xml' ? `, ${(t.match(/<loc>/g) || []).length} URLs` : ''}`); } catch (e) { lines.push(`${f}: FAILED`); }
}
writeFileSync(join(out, 'seo-report.md'), lines.join('\n'));
console.log('seo report written');
