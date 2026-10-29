// Benchmark screenshots: our site next to premium houses, taken by GitHub Actions (bench/* branches only).
// For each site: the first screen on desktop and phone, a longer desktop scroll, and a few measured design facts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const out = process.argv[2] || 'bench';
mkdirSync(out, { recursive: true });
const sites = (process.env.SITES || '').split(',').filter(Boolean).map((s) => s.split('|'));
const facts = [];
const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
for (const [name, url] of sites) {
  for (const v of [{ k: 'd', width: 1440, height: 900 }, { k: 'm', width: 390, height: 844, mobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, userAgent: v.mobile ? UA.replace('Macintosh; Intel Mac OS X 10_15_7', 'iPhone; CPU iPhone OS 18_0 like Mac OS X') : UA, deviceScaleFactor: 1, isMobile: !!v.mobile, locale: 'en-GB' });
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(7000);
      await page.screenshot({ path: join(out, `${name}-${v.k}-0.jpg`), type: 'jpeg', quality: 72 });
      if (v.k === 'd') {
        const f = await page.evaluate(() => {
          const cs = (el) => (el ? getComputedStyle(el) : null);
          const pick = (sel) => document.querySelector(sel);
          const h = pick('header') || pick('[role=banner]');
          const h1 = pick('h1');
          const btn = [...document.querySelectorAll('a,button')].find((e) => { const s = getComputedStyle(e); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' && e.offsetHeight > 30 && e.offsetHeight < 80; });
          const navLinks = h ? [...h.querySelectorAll('a')].filter((a) => a.offsetHeight && a.innerText.trim().length > 2).slice(0, 12) : [];
          return {
            title: document.title,
            bodyBg: cs(document.body)?.backgroundColor, bodyFont: cs(document.body)?.fontFamily, bodySize: cs(document.body)?.fontSize,
            headerBg: cs(h)?.backgroundColor, headerHeight: h?.offsetHeight,
            h1: h1 ? { text: h1.innerText.slice(0, 80), font: cs(h1).fontFamily, size: cs(h1).fontSize, weight: cs(h1).fontWeight } : null,
            nav: navLinks.map((a) => a.innerText.trim().slice(0, 24)),
            navStyle: navLinks[0] ? { size: cs(navLinks[0]).fontSize, spacing: cs(navLinks[0]).letterSpacing, transform: cs(navLinks[0]).textTransform, weight: cs(navLinks[0]).fontWeight } : null,
            button: btn ? { text: btn.innerText.trim().slice(0, 30), radius: cs(btn).borderRadius, bg: cs(btn).backgroundColor, spacing: cs(btn).letterSpacing, transform: cs(btn).textTransform } : null,
            videos: document.querySelectorAll('video').length,
            images: document.images.length,
            pageHeight: document.documentElement.scrollHeight,
          };
        });
        facts.push({ name, url, ...f });
        for (let i = 1; i <= 4; i++) {
          await page.mouse.wheel(0, 900);
          await page.waitForTimeout(1600);
          await page.screenshot({ path: join(out, `${name}-d-${i}.jpg`), type: 'jpeg', quality: 70 });
        }
      }
      console.log('ok', name, v.k);
    } catch (e) {
      console.log('FAILED', name, v.k, e.message.split('\n')[0]);
      facts.push({ name, url, error: e.message.split('\n')[0], view: v.k });
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(join(out, 'facts.json'), JSON.stringify(facts, null, 1));
