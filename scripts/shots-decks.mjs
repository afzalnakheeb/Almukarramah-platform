// Screenshots of /decks in its three states (locked, wrong passcode, open), desktop and phone, English and Arabic.
// The passcode check runs on Vercel only, so here /api/decks is answered by the test itself.
// Usage: node scripts/shots-decks.mjs <base> <out>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const out = process.argv[3] || 'shots';
mkdirSync(out, { recursive: true });
const views = [
  { name: 'd', width: 1440, height: 900, dsf: 1, locale: 'en-GB' },
  { name: 'm', width: 390, height: 844, dsf: 2, locale: 'en-GB' },
  { name: 'ar', width: 1440, height: 900, dsf: 1, locale: 'ar-SA' },
  { name: 'arm', width: 390, height: 844, dsf: 2, locale: 'ar-SA' },
];
const poster = readFileSync('public/images/hero-light.jpg');
const errors = [];
const browser = await chromium.launch();
for (const v of views) {
  for (const state of ['locked', 'wrong', 'open']) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, locale: v.locale });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('amIntro', '1'); } catch { /* ignore */ } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${v.name} ${state} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${v.name} ${state} console: ${m.text().slice(0, 300)}`); });
    await page.route('**/api/decks', (route) => {
      const post = route.request().method() === 'POST';
      if (state === 'open') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"unlocked":true,"code":"24434"}' });
      if (post) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"unlocked":false,"error":"wrong_passcode"}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"unlocked":false}' });
    });
    await page.route('**/decks/film/poster.jpg', (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: poster }));
    await page.route('**/decks/film/*.mp4', (route) => route.fulfill({ status: 200, contentType: 'video/mp4', body: '' }));
    try {
      await page.goto(`${base}/decks`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1800);
      if (state === 'wrong') {
        await page.locator('input').first().fill('11111');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1200);
      }
      const h = await page.evaluate(() => {
        let m = document.documentElement.scrollHeight;
        document.querySelectorAll('div').forEach((d) => { if (d.scrollHeight > m && d.scrollHeight < 40000) m = d.scrollHeight; });
        return m;
      });
      await page.setViewportSize({ width: v.width, height: Math.min(h, 9000) });
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, `${v.name}-decks-${state}.jpg`), type: 'jpeg', quality: 72 });
      console.log(`${v.name} ${state}: ${h}px`);
    } catch (e) {
      console.log(`${v.name} ${state}: FAILED ${e.message}`);
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(out, 'errors.txt'), errors.join('\n\n') || 'none');
console.log(`errors: ${errors.length}`);
