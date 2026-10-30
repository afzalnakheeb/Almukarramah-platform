// Records the first-visit brand intro as a real browser session (desktop, phone, Arabic). Used only on rec/* branches.
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const out = process.argv[3] || 'rec';
mkdirSync(out, { recursive: true });
const runs = [
  { name: 'desktop-en', width: 1440, height: 900, locale: 'en-GB', path: '/' },
  { name: 'desktop-ar', width: 1440, height: 900, locale: 'ar-SA', path: '/' },
  { name: 'phone-en', width: 390, height: 844, locale: 'en-GB', path: '/', mobile: true },
];
const browser = await chromium.launch();
for (const r of runs) {
  const dir = join(out, 'tmp-' + r.name); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: r.width, height: r.height }, deviceScaleFactor: 1, locale: r.locale,
    isMobile: !!r.mobile, hasTouch: !!r.mobile, recordVideo: { dir, size: { width: r.width * (r.mobile ? 2 : 1), height: r.height * (r.mobile ? 2 : 1) } } });
  const page = await ctx.newPage();
  await page.goto(base + r.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  // a gentle scroll to show the page under the header
  await page.mouse.wheel(0, 500); await page.waitForTimeout(2500);
  await ctx.close();
  const f = readdirSync(dir).find((x) => x.endsWith('.webm'));
  if (f) renameSync(join(dir, f), join(out, r.name + '.webm'));
  console.log('recorded', r.name);
}
await browser.close();
