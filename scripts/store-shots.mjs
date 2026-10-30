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
// sheet: how far below the status bar a sheet (the assistant on phones) starts; inset: the room a sheet keeps at the
// bottom for the home indicator (the app pads it with the safe-area inset). store-frames.mjs uses the same numbers.
const DEVICES = {
  iphone: { width: 440, height: 956, dsf: 2.5, status: 62, tabbar: 83, header: 44, sheet: 10, inset: 34 }, // iPhone 6.9″ (Pro Max)
  ipad: { width: 1032, height: 1376, dsf: 2, status: 24, tabbar: 69, header: 50, sheet: 0, inset: 20 }, // iPad 13″
  android: { width: 412, height: 915, dsf: 2.5, status: 28, tabbar: 80, header: 64, sheet: 0, inset: 24 }, // Android phone
};

// Store text rule: no city in the screenshots. CITY finds one; scenes with `scrub` hide the line that holds it (the
// app's own lines, such as a product's place of preparation): 'hide' closes the gap, 'blank' keeps the line's room
// (so nothing below moves up into view). Every capture reports any city still in view in errors.txt.
const CITY = 'Madinah|Makkah|Medina|Mecca|Dubai|Riyadh|Jeddah|المدينة|مكة|دبي|الرياض|جدة';

// tab: the screen is one of the four tabs (Home, Shop, Bag, Account); otherwise it is pushed over them with a header.
// modal: the screen is a sheet over the others (the assistant on phones). bag: products added before the capture
// (the iPad's wider bag gets three). wide: what the iPad shows instead.
const SCENES = [
  { id: '1-home', path: '/', tab: 'home', scrub: 'hide' },
  { id: '2-doors', path: '/', tab: 'home', anchor: { en: 'Begin with what matters', ar: 'ابدأ بما يهمّك' } },
  { id: '3-perfumes', path: '/collections/perfumes' },
  { id: '4-product', path: '/product/kaaba-door-prayer-mat', scrub: 'blank', wide: { scrub: 'hide' } },
  { id: '5-bag', path: '/cart', tab: 'cart', bag: ['aam-zumar-60-ml'], hideFab: true,
    gift: { en: 'Eid Mubarak. With love and duas.', ar: 'عيد مبارك، مع خالص المحبة والدعاء.' },
    wide: { bag: ['aam-zumar-60-ml', 'kaaba-door-prayer-mat', 'ajwati-sukkari-dates'] } },
  // On the bag the assistant offers to write the gift card (its greeting there names no city).
  { id: '6-assistant', path: '/cart', bag: ['aam-kiswah-by-ahmed-50-ml'], openAssistant: true, modal: true,
    wide: { tab: 'cart', modal: false } },
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
      localStorage.setItem('destination', 'saudi');
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

/** City names in view. With scrub ('hide' or 'blank'), the line holding each one is hidden (with 'hide', also a
 *  separator dot just before it). */
async function cities(page, scrub) {
  return page.evaluate(([src, scrub]) => {
    const re = new RegExp(src);
    const inView = (el) => {
      if (getComputedStyle(el).visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (el && re.test(n.textContent || '') && inView(el)) hits.push(el);
    }
    const notes = [];
    for (const el of hits) {
      const text = (el.textContent || '').trim().slice(0, 90);
      const line = el.parentElement;
      if (scrub === 'blank' && line) {
        line.style.visibility = 'hidden';
        notes.push(`blanked: ${text}`);
      } else if (scrub && line) {
        const before = line.previousElementSibling;
        line.style.display = 'none';
        if (before && !(before.textContent || '').trim()) before.style.display = 'none';
        notes.push(`hidden: ${text}`);
      } else notes.push(`CITY VISIBLE: ${text}`);
    }
    document.querySelectorAll('textarea,input').forEach((f) => {
      if (re.test(f.value) && inView(f)) notes.push(`CITY VISIBLE in a field: ${f.value.slice(0, 90)}`);
    });
    return notes;
  }, [CITY, scrub]);
}

for (const [device, d] of Object.entries(DEVICES)) {
  for (const lang of Object.keys(LANGS)) {
    for (const scene of SCENES) {
      const s = device === 'ipad' && scene.wide ? { ...scene, ...scene.wide } : scene;
      const contentHeight = d.height - d.status - (s.modal ? d.sheet + d.inset : s.tab ? d.tabbar : d.header);
      const { ctx, page } = await open(device, lang, { width: d.width, height: contentHeight, dsf: d.dsf });
      try {
        // Fill the bag first: each product page's "Add to bag" goes on to the bag.
        for (const slug of s.bag ?? []) {
          await page.goto(`${base}/product/${slug}?intro=0`, { waitUntil: 'networkidle', timeout: 60000 });
          await settle(page, 1200);
          const add = page.locator('[data-btn="primary"]').first();
          if (!(await add.count())) { errors.push(`${device} ${lang} ${s.id}: no Add to bag on ${slug}`); continue; }
          await add.click();
          await page.waitForURL(/\/cart/, { timeout: 15000 }).catch(() => errors.push(`${device} ${lang} ${s.id}: ${slug} did not open the bag`));
        }
        if (!s.bag) await page.goto(`${base}${s.path}?intro=0`, { waitUntil: 'networkidle', timeout: 60000 });
        await settle(page);
        if (s.gift) {
          const field = page.locator('textarea').first();
          if (await field.count()) {
            await field.fill(s.gift[lang]);
            await field.blur();
          }
        }
        await appLook(page);
        if (s.hideFab) await page.addStyleTag({ content: '[data-btn="fab"]{display:none!important}' });
        if (s.openAssistant) {
          await page.locator('[data-btn="fab"]').first().click();
          await page.waitForTimeout(900);
        }
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
        if (s.scrub) for (const note of await cities(page, s.scrub)) errors.push(`${device} ${lang} ${s.id}: ${note}`);
        for (const note of await cities(page, false)) errors.push(`${device} ${lang} ${s.id}: ${note}`);
        await page.waitForTimeout(300);
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
