// Raw app screens for the App Store and Google Play screenshots, captured from the website build at the apps' sizes.
// The apps draw the same screens without the website's header and footer (they have the tab bar and native headers
// instead), so those are hidden here and the capture is only the content area; scripts/store-frames.mjs then draws
// the status bar, the tab bar or header and the caption around it. Product photographs only: no people, no faces.
// Also captures the new web pages (/delete-account, /support) for review.
// Run by .github/workflows/shots.yml when the commit message contains [store-shots].
// Usage: node scripts/store-shots.mjs <baseUrl> <outDir>
import { copyFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const out = process.argv[3] || 'shots/store';
mkdirSync(out, { recursive: true });

// The window in points / dp, the status bar, and the bars around the content (tab screens and pushed screens).
// store-frames.mjs uses the same numbers.
const DEVICES = {
  iphone: { width: 440, height: 956, dsf: 2.5, status: 62, tabbar: 83, header: 44 }, // iPhone 6.9″ (Pro Max)
  ipad: { width: 1032, height: 1376, dsf: 2, status: 24, tabbar: 69, header: 50 }, // iPad 13″
  android: { width: 412, height: 915, dsf: 2.5, status: 28, tabbar: 80, header: 64 }, // Android phone
};

// tab: the screen is one of the four tabs (Home, Shop, Bag, Account); otherwise it is pushed over them with a header.
const SCENES = [
  { id: '1-home', path: '/', tab: 'home' },
  { id: '2-doors', path: '/', tab: 'home', anchor: { en: 'Begin with what matters', ar: 'ابدأ بما يهمّك' } },
  { id: '3-perfumes', path: '/collections/perfumes' },
  { id: '4-product', path: '/product/kaaba-door-prayer-mat' },
  { id: '5-bag', path: '/product/aam-zumar-60-ml', tab: 'cart', addToBag: true, gift: { en: 'Eid Mubarak. With love, from Madinah.', ar: 'عيد مبارك، مع خالص المحبة من المدينة المنورة.' } },
  { id: '6-assistant', path: '/concierge' },
];
const LANGS = { en: 'en-GB', ar: 'ar-SA' };

const errors = [];
const browser = await chromium.launch();

async function open(device, lang, { width, height, dsf }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, locale: LANGS[lang], hasTouch: device !== 'desktop', isMobile: device === 'iphone' || device === 'android' });
  await ctx.addInitScript(([l]) => {
    try {
      sessionStorage.setItem('amIntro', '1'); // no first-visit intro (website only)
      localStorage.setItem('lang', l);
      localStorage.setItem('destination', 'madinah-hotel');
    } catch { /* ignore */ }
  }, [lang]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${device} ${lang} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${device} ${lang} console: ${m.text().slice(0, 300)}`); });
  return { ctx, page };
}

/** As the apps show it: no website header or footer, nothing waiting to fade in, the still poster instead of the film. */
async function appLook(page) {
  await page.addStyleTag({ content: '[role="banner"],[role="contentinfo"]{display:none!important}' });
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-motion');
    document.querySelectorAll('video').forEach((v) => v.remove());
  });
}

async function settle(page, ms = 1800) {
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(ms);
}

for (const [device, d] of Object.entries(DEVICES)) {
  for (const lang of Object.keys(LANGS)) {
    for (const s of SCENES) {
      const contentHeight = d.height - d.status - (s.tab ? d.tabbar : d.header);
      const { ctx, page } = await open(device, lang, { width: d.width, height: contentHeight, dsf: d.dsf });
      try {
        await page.goto(`${base}${s.path}?intro=0`, { waitUntil: 'networkidle', timeout: 60000 });
        await settle(page);
        if (s.addToBag) {
          await page.locator('[data-btn="primary"]').first().click();
          await page.waitForURL(/\/cart/, { timeout: 15000 });
          await settle(page, 1200);
          const field = page.locator('textarea').first();
          if (await field.count()) {
            await field.fill(s.gift[lang]);
            await field.blur();
          }
        }
        await appLook(page);
        if (s.anchor) {
          await page.evaluate((text) => {
            const el = [...document.querySelectorAll('h2,[role="heading"]')].find((h) => h.textContent?.trim() === text);
            const scroller = document.querySelector('[data-scroller]');
            if (el && scroller) scroller.scrollTop += el.getBoundingClientRect().top - 72;
          }, s.anchor[lang]);
        } else {
          await page.evaluate(() => { const sc = document.querySelector('[data-scroller]'); if (sc) sc.scrollTop = 0; });
        }
        await page.waitForTimeout(900);
        await page.screenshot({ path: join(out, `${device}-${lang}-${s.id}.jpg`), type: 'jpeg', quality: 86 });
        console.log(`${device} ${lang} ${s.id}: ok`);
      } catch (e) {
        console.log(`${device} ${lang} ${s.id}: FAILED ${e.message}`);
        errors.push(`${device} ${lang} ${s.id}: ${e.message}`);
      }
      await ctx.close();
    }
  }
}

// The new pages, as the website shows them on a phone (full page, header and footer included).
for (const lang of Object.keys(LANGS)) {
  for (const path of ['/delete-account', '/support', '/membership', '/account']) {
    const { ctx, page } = await open('web', lang, { width: 390, height: 844, dsf: 2 });
    try {
      await page.goto(`${base}${path}?intro=0`, { waitUntil: 'networkidle', timeout: 60000 });
      await settle(page, 1500);
      await page.evaluate(() => document.documentElement.removeAttribute('data-motion'));
      const h = await page.evaluate(() => {
        let m = document.documentElement.scrollHeight;
        document.querySelectorAll('div').forEach((x) => { if (x.scrollHeight > m && x.scrollHeight < 12000) m = x.scrollHeight; });
        return m;
      });
      await page.setViewportSize({ width: 390, height: Math.min(h, 6000) });
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(out, `web-${lang}${path.replace(/\//g, '-')}.jpg`), type: 'jpeg', quality: 72 });
    } catch (e) {
      errors.push(`web ${lang} ${path}: ${e.message}`);
    }
    await ctx.close();
  }
}
await browser.close();

// The brand's fonts, for the captions drawn around these screens (store-frames.mjs).
const fontDir = join(out, 'fonts');
mkdirSync(fontDir, { recursive: true });
const wanted = /^(CormorantGaramond_500Medium|Amiri_400Regular|Amiri_700Bold|Manrope_500Medium|Manrope_600SemiBold|Manrope_700Bold|ReadexPro_400Regular|ReadexPro_500Medium|ReadexPro_600SemiBold)\.ttf$/;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (wanted.test(name)) copyFileSync(p, join(fontDir, name));
  }
};
try { walk('node_modules/@expo-google-fonts'); } catch (e) { errors.push(`fonts: ${e.message}`); }

writeFileSync(join(out, 'errors.txt'), errors.join('\n') || 'no errors');
console.log('store screens written to', out);
