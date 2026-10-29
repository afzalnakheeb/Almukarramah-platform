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

const pages = (process.env.SHOT_PAGES || '/,/shop,/product/kaaba-door-prayer-mat,/membership,/apps,/apps/seerah-trails,/account').split(',');
const views = [
  { name: 'd', width: 1440, height: 900, dsf: 1, chunk: 1100, locale: 'en-GB' },
  { name: 'm', width: 390, height: 844, dsf: 2, chunk: 1300, locale: 'en-GB' },
  { name: 'ar', width: 1440, height: 900, dsf: 1, chunk: 1100, locale: 'ar-SA', only: ['/', '/product/kaaba-door-prayer-mat'] },
];
const slug = (p) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-'));

const errors = [];
const browser = await chromium.launch();
for (const v of process.env.SEO_ONLY ? [] : views) {
  for (const path of pages) {
    if (v.only && !v.only.includes(path)) continue;
    // React Native Web scrolls inside an inner view, so measure the content and use a viewport that tall.
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, locale: v.locale });
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
