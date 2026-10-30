// Storefront footage for the pitch film: slow, eased scrolls of the built website, captured frame by frame at 30 fps
// (so the motion is perfectly smooth however slow the machine is) and encoded to H.264.
// Time is stepped, not waited for: every frame sets the scroll position, moves every CSS animation and transition
// (the site's reveals, header and fades) to that frame's time, seeks the homepage hero film to the same moment,
// waits until the visible images are decoded, then takes the screenshot.
// Run by scripts/shots.mjs on the shots/film-scroll branch. Public storefront pages only (no account, cart or admin).
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const FPS = 30;
const T0 = Date.now();
const BUDGET_MIN = Number(process.env.FILM_BUDGET_MIN || 40); // no new job starts after this many minutes
const HARD_MIN = BUDGET_MIN + 6; // a running job is cut short (and still encoded) after this

const DESK = { kind: 'desktop', width: 1920, height: 1080, dsf: 2, enc: [2560, 1440], crf: 17, maxrate: '18M', estFrame: 0.6 };
const PHONE = { kind: 'phone', width: 390, height: 844, dsf: 3, enc: [1170, 2532], crf: 17, maxrate: '12M', mobile: true, estFrame: 0.35 };

// plan: [seconds, viewport heights] keyframes. Between two keyframes the scroll accelerates and decelerates with
// cosine ramps (ramp seconds) and glides at constant speed in between; equal values are holds.
const JOBS = [
  { name: 'desktop-home', view: DESK, path: '/', plan: [[0, 0], [3.5, 0], [15, 3.4], [16.5, 3.4]], ramp: 2.2 },
  { name: 'phone-home', view: PHONE, path: '/', plan: [[0, 0], [3.5, 0], [14, 4.6], [15, 4.6]], ramp: 2.0 },
  { name: 'desktop-collection-perfumes', view: DESK, path: '/collections/perfumes', plan: [[0, 0], [1.5, 0], [9, 2.6], [10, 2.6]], ramp: 1.8 },
  { name: 'desktop-product-zumar', view: DESK, path: '/product/aam-zumar-60-ml', plan: [[0, 0], [2.5, 0], [7.5, 1.6], [9, 1.6]], ramp: 1.6 },
  { name: 'phone-collection-perfumes', view: PHONE, path: '/collections/perfumes', plan: [[0, 0], [1.5, 0], [8, 3.2], [9, 3.2]], ramp: 1.6 },
  { name: 'phone-product-zumar', view: PHONE, path: '/product/aam-zumar-60-ml', plan: [[0, 0], [2, 0], [7.5, 2.4], [9, 2.4]], ramp: 1.6 },
  { name: 'desktop-home-arabic', view: DESK, path: '/', locale: 'ar-SA', plan: [[0, 0], [3, 0], [9, 2.2], [10, 2.2]], ramp: 1.8 },
  { name: 'phone-home-arabic', view: PHONE, path: '/', locale: 'ar-SA', plan: [[0, 0], [3, 0], [8, 2.5], [9, 2.5]], ramp: 1.6 },
  { name: 'desktop-collection-prayer-mats', view: DESK, path: '/collections/prayer-mats', plan: [[0, 0], [1.5, 0], [7.5, 2.2], [8, 2.2]], ramp: 1.6 },
  { name: 'desktop-intro', view: DESK, path: '/?intro=play', intro: true, plan: [[0, 0], [8, 0]], ramp: 1 },
];

const minutes = () => (Date.now() - T0) / 60000;

// position (0..1) along one segment of length D seconds at time u, with cosine ramps of r seconds at both ends
function glide(u, D, r) {
  r = Math.min(r, D / 2);
  const total = D - r;
  let s;
  if (u <= 0) s = 0;
  else if (u >= D) s = total;
  else if (u <= r) s = u / 2 - (r / (2 * Math.PI)) * Math.sin((Math.PI * u) / r);
  else if (u <= D - r) s = r / 2 + (u - r);
  else { const w = u - (D - r); s = r / 2 + (D - 2 * r) + w / 2 + (r / (2 * Math.PI)) * Math.sin((Math.PI * w) / r); }
  return s / total;
}

function scrollAt(plan, ramp, t) {
  for (let i = 0; i < plan.length - 1; i++) {
    const [t0, y0] = plan[i], [t1, y1] = plan[i + 1];
    if (t <= t1 || i === plan.length - 2) {
      if (y0 === y1) return y0;
      return y0 + (y1 - y0) * glide(Math.min(t, t1) - t0, t1 - t0, ramp);
    }
  }
  return plan[plan.length - 1][1];
}

const STYLE = `
  html, [data-scroller], [data-scroller] * { scroll-behavior: auto !important; }
  *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  * { scrollbar-width: none !important; }
  * { caret-color: transparent !important; }
`;

// helpers installed in the page
const PAGE_HELPERS = () => {
  const F = (window.__film = { seen: new WeakMap(), ready: new WeakSet(), scroller: null });
  F.findScroller = () => {
    let best = document.scrollingElement, range = best ? best.scrollHeight - best.clientHeight : 0;
    for (const el of document.querySelectorAll('[data-scroller], div, main, section')) {
      const r = el.scrollHeight - el.clientHeight;
      if (r <= range + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      best = el; range = r;
    }
    F.scroller = best;
    return { range, tag: best ? `${best.tagName.toLowerCase()}${best.hasAttribute && best.hasAttribute('data-scroller') ? '[data-scroller]' : ''}` : 'none' };
  };
  F.setScroll = (y) => { if (F.scroller) F.scroller.scrollTop = y; return F.scroller ? F.scroller.scrollTop : 0; };
  // at the first captured frame: finished animations stay finished, running ones carry on from where they are
  F.primeAnimations = () => {
    for (const a of document.getAnimations()) {
      F.seen.set(a, a.playState === 'finished' ? -1e12 : -(Number(a.currentTime) || 0));
      try { a.pause(); } catch (e) { /* ignore */ }
    }
  };
  F.syncAnimations = (tMs) => {
    let n = 0;
    for (const a of document.getAnimations()) {
      let s = F.seen.get(a);
      if (s === undefined) { s = tMs; F.seen.set(a, s); try { a.pause(); } catch (e) { /* ignore */ } }
      try { a.currentTime = Math.max(0, tMs - s); n++; } catch (e) { /* ignore */ }
    }
    return n;
  };
  F.syncVideos = (tMs) => Promise.all([...document.querySelectorAll('video')].map((v) => new Promise((res) => {
    if (!v.duration || !isFinite(v.duration)) return res('no-duration');
    if (!v.paused) v.pause();
    if (v.__t0 === undefined) v.__t0 = tMs;
    const box = v.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) return res('offscreen');
    const target = (((tMs - v.__t0) / 1000) % v.duration);
    if (Math.abs(v.currentTime - target) < 0.0005) return res('same');
    let done = false;
    const finish = (why) => { if (!done) { done = true; res(why); } };
    v.addEventListener('seeked', () => {
      if (v.requestVideoFrameCallback) { v.requestVideoFrameCallback(() => finish('frame')); setTimeout(() => finish('seeked'), 300); }
      else finish('seeked');
    }, { once: true });
    setTimeout(() => finish('timeout'), 4000);
    v.currentTime = target;
  })));
  F.waitImages = () => {
    const vh = innerHeight;
    const imgs = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > -200 && r.top < vh + 400; });
    return Promise.all(imgs.map((i) => {
      if (F.ready.has(i)) return null;
      const dec = () => (i.decode ? i.decode().catch(() => null) : null);
      const p = i.complete ? dec() : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 5000); }).then(dec);
      return Promise.resolve(p).then(() => { if (i.complete) F.ready.add(i); });
    }));
  };
  F.raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // one frame: scroll, let observers and reveals react, put every animation and film at this frame's time, wait for images
  F.frame = async (tMs, y) => {
    const got = F.setScroll(y);
    await F.raf2();
    F.syncAnimations(tMs);
    await F.syncVideos(tMs);
    await F.waitImages();
    F.syncAnimations(tMs);
    await F.raf2();
    return got;
  };
  F.videoInfo = () => [...document.querySelectorAll('video')].map((v) => ({ src: v.currentSrc, w: v.videoWidth, h: v.videoHeight, d: v.duration, rs: v.readyState }));
};

function ensureFfmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return; } catch { /* install */ }
  execSync('sudo apt-get update -qq && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg', { stdio: 'inherit' });
}

function encoder(view, file) {
  const [w, h] = view.enc;
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(view.crf),
    '-maxrate', view.maxrate, '-bufsize', String(parseInt(view.maxrate, 10) * 2) + 'M', '-profile:v', 'high',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', '-r', String(FPS), file];
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  let failed = null;
  p.stdin.on('error', (e) => { failed = e; });
  const closed = new Promise((res) => p.on('close', res));
  return {
    write: (buf) => new Promise((res, rej) => { if (failed) return rej(failed); if (p.stdin.write(buf)) res(); else p.stdin.once('drain', res); }),
    end: () => { p.stdin.end(); return closed; },
  };
}

async function launch() {
  const args = ['--hide-scrollbars', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'];
  try {
    const b = await chromium.launch({ channel: 'chrome', args });
    return { browser: b, channel: 'chrome' };
  } catch (e) {
    console.log(`film: Google Chrome not available (${e.message.split('\n')[0]}), using bundled Chromium`);
    return { browser: await chromium.launch({ args }), channel: 'chromium' };
  }
}

// Chromium builds without H.264 cannot play the hero film. Then (and only then) each film is re-encoded once,
// frame for frame, to VP9 and served in place of the MP4, so the page still shows the real film.
const webmCache = new Map();
async function webmFor(base, path, tmpDir) {
  if (webmCache.has(path)) return webmCache.get(path);
  const src = join(tmpDir, path.replace(/[^a-z0-9.]+/gi, '_'));
  const res = await fetch(base + path);
  writeFileSync(src, Buffer.from(await res.arrayBuffer()));
  const out = src.replace(/\.mp4$/, '') + '.webm';
  execSync(`ffmpeg -y -loglevel error -i "${src}" -an -c:v libvpx-vp9 -crf 16 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 "${out}"`);
  const body = readFileSync(out);
  webmCache.set(path, body);
  return body;
}

async function newPage(browser, job, base, needWebm, tmpDir) {
  const v = job.view;
  const ctx = await browser.newContext({
    viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dsf, locale: job.locale || 'en-GB',
    isMobile: !!v.mobile, hasTouch: !!v.mobile, reducedMotion: 'no-preference', colorScheme: 'light',
  });
  if (needWebm) {
    await ctx.route(/\/films\/[^/?]+\.mp4(\?.*)?$/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      try { await route.fulfill({ status: 200, contentType: 'video/webm', body: await webmFor(base, path, tmpDir) }); } catch (e) { route.continue(); }
    });
  }
  if (!job.intro) await ctx.addInitScript(() => { try { sessionStorage.setItem('amIntro', '1'); } catch { /* ignore */ } });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function settle(page, log) {
  await page.evaluate(() => document.fonts && document.fonts.ready);
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => [...document.querySelectorAll('video')].every((v) => v.readyState >= 3));
    if (ok) break;
    await page.waitForTimeout(500);
  }
  log.videos = await page.evaluate(() => window.__film ? window.__film.videoInfo() : null);
}

async function runJob(browser, base, outDir, job, index, needWebm) {
  const v = job.view;
  const frames = Math.min(Math.round(job.plan[job.plan.length - 1][0] * FPS), Number(process.env.FILM_MAX_FRAMES || 1e9));
  const log = { name: job.name, path: job.path, locale: job.locale || 'en-GB', kind: v.kind, viewport: [v.width, v.height], dsf: v.dsf, encoded: v.enc, fps: FPS, frames_planned: frames, scroll: [] };
  const t0 = Date.now();
  const { ctx, page } = await newPage(browser, job, base, needWebm, join(outDir, '.tmp'));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let enc = null;
  try {
    if (job.intro) {
      // the intro is drawn by script (requestAnimationFrame + performance.now): step a paused page clock from the start
      await page.clock.install();
      await page.clock.pauseAt(Date.now() + 500);
      await page.goto(base + job.path, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } else {
      // first pass warms the cache (every image on the planned route), then a fresh load is captured
      await page.goto(base + job.path, { waitUntil: 'networkidle', timeout: 60000 });
      await page.addStyleTag({ content: STYLE });
      await page.evaluate(PAGE_HELPERS);
      await page.waitForTimeout(800);
      const { range } = await page.evaluate(() => window.__film.findScroller());
      const maxY = Math.min(range, Math.max(...job.plan.map((p) => p[1])) * v.height + v.height);
      for (let y = 0; y <= maxY; y += Math.round(v.height * 0.5)) { await page.evaluate((yy) => window.__film.setScroll(yy), y); await page.waitForTimeout(250); }
      await page.waitForLoadState('networkidle').catch(() => null);
      await page.goto(base + job.path, { waitUntil: 'networkidle', timeout: 60000 });
    }
    await page.addStyleTag({ content: STYLE });
    await page.evaluate(PAGE_HELPERS);
    if (!job.intro) { await page.waitForTimeout(1500); await settle(page, log); }
    const sc = await page.evaluate(() => window.__film.findScroller());
    log.scroller = sc;
    enc = encoder(v, join(outDir, `${job.name}.mp4`));
    await page.evaluate(() => window.__film.primeAnimations());
    let n = 0, clockMs = 0;
    for (; n < frames; n++) {
      if (minutes() > HARD_MIN) { log.cut_short = true; break; }
      const t = n / FPS, tMs = t * 1000;
      const want = scrollAt(job.plan, job.ramp, t) * v.height;
      const y = Math.round(Math.min(want, sc.range) * v.dsf) / v.dsf; // whole device pixels: crisp text every frame
      let got;
      if (!job.intro) {
        got = await page.evaluate(([ms, yy]) => window.__film.frame(ms, yy), [tMs, y]);
      } else {
        // the page clock is paused: the intro's timers and requestAnimationFrame only run when stepped here
        if (n > 0) { const target = Math.round(tMs); await page.clock.runFor(target - clockMs); clockMs = target; }
        got = await page.evaluate((yy) => window.__film.setScroll(yy), y);
        await page.waitForTimeout(34);
        await page.evaluate((ms) => window.__film.syncAnimations(ms), tMs);
        await Promise.race([page.evaluate((ms) => window.__film.syncVideos(ms), tMs), new Promise((r) => setTimeout(r, 1500))]);
        await page.evaluate((ms) => window.__film.syncAnimations(ms), tMs);
        await page.waitForTimeout(16);
      }
      const buf = await page.screenshot({ type: 'jpeg', quality: 95, animations: 'allow', caret: 'hide', scale: 'device' });
      await enc.write(buf);
      if (n === 0) writeFileSync(join(outDir, `${job.name}-poster.jpg`), buf);
      log.scroll.push(Math.round(got * 10) / 10);
    }
    const code = await enc.end();
    enc = null;
    log.frames = n;
    log.ffmpeg_exit = code;
    try { log.mb = Math.round(statSync(join(outDir, `${job.name}.mp4`)).size / 1e5) / 10; } catch { log.mb = null; }
    try {
      execSync(`ffmpeg -y -loglevel error -i "${join(outDir, `${job.name}.mp4`)}" -vf "select='not(mod(n\\,30))',scale=480:-2,tile=6x4:padding=4:color=white" -frames:v 1 -q:v 4 "${join(outDir, `${job.name}-sheet.jpg`)}"`);
    } catch (e) { log.sheet_error = e.message.split('\n')[0]; }
  } catch (e) {
    log.error = e.message.split('\n').slice(0, 3).join(' | ');
    if (enc) { log.ffmpeg_exit = await enc.end(); log.frames = log.scroll.length; } // keep what was captured
  }
  log.page_errors = errors.slice(0, 8);
  log.seconds = Math.round((Date.now() - t0) / 1000);
  await ctx.close();
  console.log(`film ${index + 1}/${JOBS.length} ${job.name}: ${log.frames ?? 0}/${frames} frames, ${log.mb ?? '-'} MB, ${log.seconds}s${log.error ? ' ERROR ' + log.error : ''}`);
  return log;
}

export async function filmScroll(base, outDir) {
  mkdirSync(outDir, { recursive: true });
  ensureFfmpeg();
  const { browser, channel } = await launch();
  const only = process.env.FILM_ONLY ? process.env.FILM_ONLY.split(',') : null;
  const probe = await browser.newPage();
  const h264 = await probe.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"'));
  await probe.close();
  const needWebm = !h264;
  mkdirSync(join(outDir, '.tmp'), { recursive: true });
  const report = { channel, browser: browser.version(), h264: h264 || 'no', film_served_as: needWebm ? 'vp9 re-encode of the same file' : 'original mp4', fps: FPS, started: new Date().toISOString(), budget_min: BUDGET_MIN, jobs: [] };
  for (const [i, job] of JOBS.entries()) {
    if (only && !only.includes(job.name)) continue;
    const est = (job.plan[job.plan.length - 1][0] * FPS * job.view.estFrame) / 60;
    if (minutes() + est > BUDGET_MIN) { report.jobs.push({ name: job.name, skipped: `time budget (${minutes().toFixed(1)} min used, about ${est.toFixed(1)} more needed)` }); continue; }
    report.jobs.push(await runJob(browser, base, outDir, job, i, needWebm));
    writeFileSync(join(outDir, 'index.json'), JSON.stringify(report, null, 1));
  }
  await browser.close();
  rmSync(join(outDir, '.tmp'), { recursive: true, force: true });
  report.minutes = Math.round(minutes() * 10) / 10;
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(report, null, 1));
  console.log(`film: done in ${report.minutes} min`);
}
