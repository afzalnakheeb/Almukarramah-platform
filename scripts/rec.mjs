// Records the first-visit brand intro in real engines: WebKit as an iPhone (Safari's engine) and a throttled
// mid-range Android phone in Chromium, both with normal phone user agents (no ?intro=play). rec/* branches only.
import { mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, webkit, devices } from 'playwright';
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const out = process.argv[3] || 'rec';
mkdirSync(out, { recursive: true });
const runs = [
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'] },
  { name: 'android-slow', engine: chromium, device: devices['Pixel 7'], throttle: true },
  { name: 'iphone-webkit-ar', engine: webkit, device: { ...devices['iPhone 13'], locale: 'ar-SA' } },
];
for (const r of runs) {
  const browser = await r.engine.launch();
  const dir = join(out, 'tmp-' + r.name); mkdirSync(dir, { recursive: true });
  const vp = r.device.viewport;
  const ctx = await browser.newContext({ ...r.device, recordVideo: { dir, size: { width: vp.width * 2, height: vp.height * 2 } } });
  const page = await ctx.newPage();
  const log = [];
  page.on('pageerror', (e) => log.push('pageerror ' + e.message));
  if (r.throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.goto(base + '/', { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(13000);
  const state = await page.evaluate(() => ({ intro: document.documentElement.getAttribute('data-intro'), seen: sessionStorage.getItem('amIntro') }));
  console.log(r.name, JSON.stringify(state), log.join(' | '));
  await ctx.close(); await browser.close();
  const f = readdirSync(dir).find((x) => x.endsWith('.webm'));
  if (f) renameSync(join(dir, f), join(out, r.name + '.webm'));
}
