// Store screenshots: the raw app screens from scripts/store-shots.mjs, put back into the app's own frame (status bar,
// tab bar or header, as the iPhone, iPad and Android apps draw them) and set on ivory under a short caption, in
// English and Arabic. Quiet on purpose: one serif line, the Kiswah mark, no badges, no shine.
// Usage: node scripts/store-frames.mjs <rawDir: shots/store> <outDir>
// Output: <outDir>/<size>/<lang>/<nn-scene>.jpg for iPhone 6.9″ (1320×2868), iPhone 6.5″ (1284×2778),
// iPad 13″ (2064×2752) and Android phone (1080×1920), plus a contact sheet per size.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const raw = resolve(process.argv[2] || 'shots/store');
const out = resolve(process.argv[3] || 'store/screens');

const C = { ink: '#1C1A17', ivory: '#F7F3EC', porcelain: '#FBF9F5', line: '#E3DACB', muted: '#6E675E', brass: '#9C7B45', brassText: '#7D6237', gold: '#B08D52', white: '#FFFFFF' };

// The same numbers as store-shots.mjs: window, status bar, tab bar (with the home indicator) and header.
const DEVICES = {
  iphone: { width: 440, height: 956, status: 62, tabbar: 83, header: 44, radius: 62, kind: 'ios' },
  ipad: { width: 1032, height: 1376, status: 24, tabbar: 69, header: 50, radius: 36, kind: 'ipad' },
  android: { width: 412, height: 915, status: 28, tabbar: 80, header: 64, radius: 44, kind: 'android' },
};
// Store canvases: which device fills them, and how much room the caption takes.
const SIZES = [
  { id: 'iphone-6.9', w: 1320, h: 2868, device: 'iphone', top: 0.205, bottom: 0.045 },
  { id: 'iphone-6.5', w: 1284, h: 2778, device: 'iphone', top: 0.205, bottom: 0.045 },
  { id: 'ipad-13', w: 2064, h: 2752, device: 'ipad', top: 0.17, bottom: 0.05, type: 1.2 },
  { id: 'android-phone', w: 1080, h: 1920, device: 'android', top: 0.205, bottom: 0.045 },
];

const SCENES = [
  { id: '1-home', tab: 'home', en: 'A curated marketplace from Madinah', ar: 'سوق مختار من المدينة المنورة' },
  { id: '2-doors', tab: 'home', en: 'Perfume, prayer and gifts, chosen with care', ar: 'عطور وصلاة وهدايا، مختارة بعناية' },
  { id: '3-perfumes', en: 'Celebrated Arabian fragrance houses', ar: 'عطور من دور عربية عريقة' },
  { id: '4-product', en: 'Every product approved by our team', ar: 'كل منتج يعتمده فريقنا' },
  { id: '5-bag', tab: 'cart', en: 'Hotel delivery in Madinah and Makkah', ar: 'توصيل إلى فنادق المدينة ومكة' },
  { id: '6-assistant', en: 'A gift assistant that knows our catalogue', ar: 'مساعد هدايا يعرف كتالوجنا' },
];
const BRAND = { en: 'Al Mukarramah', ar: 'المكرمة' };
const TABS = [
  { id: 'home', en: 'Home', ar: 'الرئيسية', icon: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>' },
  { id: 'shop', en: 'Shop', ar: 'المتجر', icon: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>' },
  { id: 'cart', en: 'Bag', ar: 'الحقيبة', icon: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>' },
  { id: 'account', en: 'Account', ar: 'حسابي', icon: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>' },
];

const font = (file, family, weight) => {
  const p = join(raw, 'fonts', file);
  return existsSync(p) ? `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(p).toString('base64')}) format('truetype')}` : '';
};
const FONTS = [
  font('CormorantGaramond_500Medium.ttf', 'Cormorant', 500), font('Amiri_400Regular.ttf', 'Amiri', 400), font('Amiri_700Bold.ttf', 'Amiri', 700),
  font('Manrope_500Medium.ttf', 'Manrope', 500), font('Manrope_600SemiBold.ttf', 'Manrope', 600), font('Manrope_700Bold.ttf', 'Manrope', 700),
  font('ReadexPro_400Regular.ttf', 'Readex', 400), font('ReadexPro_500Medium.ttf', 'Readex', 500), font('ReadexPro_600SemiBold.ttf', 'Readex', 600),
].join('');
const sans = (ar) => (ar ? "'Readex','Manrope',system-ui,sans-serif" : "'Manrope','Inter',system-ui,sans-serif");

// ---------------------------------------------------------------- the app's own frame, in the device's points
function statusBar(d, ar) {
  const dark = C.ink;
  const time = `<span style="font:600 ${d.kind === 'ipad' ? 15 : 17}px ${sans(false)};letter-spacing:-.2px;color:${dark}">9:41</span>`;
  const icons = `<span style="display:flex;gap:6px;align-items:center">
    <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="${dark}"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="${dark}"/><rect x="10" y="3" width="3" height="9" rx="1" fill="${dark}"/><rect x="15" y="0" width="3" height="12" rx="1" fill="${dark}"/></svg>
    <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5l2.2-2.6a3.3 3.3 0 0 0-4.4 0z" fill="${dark}"/><path d="M3.6 6.5a6.6 6.6 0 0 1 8.8 0" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M1 3.6a10.5 10.5 0 0 1 14 0" stroke="${dark}" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
    <svg width="27" height="13" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" fill="none" stroke="${dark}" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="${dark}"/><path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="${dark}" fill-opacity=".45"/></svg></span>`;
  const island = d.kind === 'ios' ? `<div style="position:absolute;left:50%;top:11px;width:124px;height:36px;margin-left:-62px;border-radius:20px;background:#0b0b0b"></div>`
    : d.kind === 'android' ? `<div style="position:absolute;left:50%;top:8px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#0b0b0b"></div>` : '';
  const pad = d.kind === 'ios' ? '0 34px 0 44px' : '0 24px';
  const align = d.kind === 'ios' ? 'center' : 'center';
  return `<div style="position:relative;height:${d.status}px;background:${C.ivory};display:flex;flex-direction:${ar ? 'row-reverse' : 'row'};justify-content:space-between;align-items:${align};padding:${pad};padding-top:${d.kind === 'ios' ? 6 : 0}px">${time}${island}${icons}</div>`;
}

function tabBar(d, active, lang) {
  const ar = lang === 'ar';
  const beside = d.kind === 'ipad';
  const items = TABS.map((t) => {
    const on = t.id === active;
    const color = on ? C.ink : C.muted;
    const badge = t.id === 'cart' && active === 'cart' ? `<span style="position:absolute;top:-5px;${ar ? 'left' : 'right'}:-9px;min-width:17px;height:17px;border-radius:9px;background:${C.brass};color:#fff;font:600 10px ${sans(false)};display:flex;align-items:center;justify-content:center">1</span>` : '';
    return `<div style="flex:1;display:flex;flex-direction:${beside ? (ar ? 'row-reverse' : 'row') : 'column'};align-items:center;justify-content:center;gap:${beside ? 10 : 3}px">
      <span style="position:relative;display:inline-flex"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>${badge}</span>
      <span style="font:${ar ? 600 : 700} 11px ${sans(ar)};color:${color}">${t[lang]}</span></div>`;
  });
  const bar = d.kind === 'android' ? 56 : 49;
  return `<div style="height:${d.tabbar}px;background:${C.white};border-top:1px solid ${C.line};box-sizing:border-box">
    <div style="height:${bar}px;display:flex;flex-direction:${ar ? 'row-reverse' : 'row'};padding:0 ${beside ? 160 : 6}px">${items.join('')}</div></div>`;
}

function header(d, ar) {
  // Pushed screens: the native header (white, no title, no shadow) with the back control in ink.
  const back = d.kind === 'android'
    ? `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:scaleX(${ar ? -1 : 1})"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`
    : `<svg width="13" height="22" viewBox="0 0 13 22" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="transform:scaleX(${ar ? -1 : 1})"><path d="M11 2L2 11l9 9"/></svg>`;
  return `<div style="height:${d.header}px;background:${C.white};display:flex;flex-direction:${ar ? 'row-reverse' : 'row'};align-items:center;padding:0 ${d.kind === 'android' ? 16 : 12}px">${back}</div>`;
}

function homeIndicator(d) {
  if (d.kind === 'android') return `<div style="position:absolute;left:50%;bottom:9px;width:108px;height:4px;margin-left:-54px;border-radius:2px;background:${C.ink};opacity:.7"></div>`;
  return `<div style="position:absolute;left:50%;bottom:8px;width:${d.kind === 'ipad' ? 320 : 140}px;height:5px;margin-left:-${d.kind === 'ipad' ? 160 : 70}px;border-radius:3px;background:${C.ink}"></div>`;
}

function deviceScreen(d, scene, lang, img) {
  const ar = lang === 'ar';
  const content = d.height - d.status - (scene.tab ? d.tabbar : d.header);
  return `<div style="position:relative;width:${d.width}px;height:${d.height}px;background:${C.ivory};overflow:hidden;border-radius:${d.radius}px">
    ${statusBar(d, ar)}
    ${scene.tab ? '' : header(d, ar)}
    <img src="${img}" style="display:block;width:${d.width}px;height:${content}px;object-fit:cover;object-position:top">
    ${scene.tab ? tabBar(d, scene.tab, lang) : ''}
    ${homeIndicator(d)}
  </div>`;
}

// ---------------------------------------------------------------- the store frame
function frame(size, scene, lang, img) {
  const d = DEVICES[size.device];
  const ar = lang === 'ar';
  const capTop = Math.round(size.h * size.top);
  const bottom = Math.round(size.h * size.bottom);
  const devH = size.h - capTop - bottom;
  const scale = devH / d.height;
  const devW = d.width * scale;
  const u = Math.min(size.w / 1320, size.h / 2868) * (size.type ?? 1); // type scale, from the 6.9″ canvas
  const headline = ar
    ? `font-family:'Amiri',serif;font-weight:400;font-size:${Math.round(86 * u)}px;line-height:1.45`
    : `font-family:'Cormorant',serif;font-weight:500;font-size:${Math.round(100 * u)}px;line-height:1.04;letter-spacing:-.5px`;
  const eyebrow = ar
    ? `font:500 ${Math.round(32 * u)}px ${sans(true)};letter-spacing:0`
    : `font:600 ${Math.round(26 * u)}px ${sans(false)};letter-spacing:.26em;text-transform:uppercase`;
  const rule = Math.round(150 * u);
  const sq = Math.max(10, Math.round(15 * u));
  return `<!doctype html><html dir="${ar ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8"><style>${FONTS}
    html,body{margin:0;padding:0}
    body{width:${size.w}px;height:${size.h}px;overflow:hidden;background:${C.ivory};position:relative;-webkit-font-smoothing:antialiased}
  </style></head><body>
    <div style="position:absolute;left:0;right:0;top:0;height:${capTop}px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:${Math.round(26 * u)}px;padding:0 ${Math.round(90 * u)}px ${Math.round(70 * u)}px;box-sizing:border-box;text-align:center">
      <div style="${eyebrow};color:${C.brassText}">${BRAND[lang]}</div>
      <div style="display:flex;align-items:center;gap:${Math.round(14 * u)}px">
        <span style="width:${rule}px;height:1px;background:${C.gold};opacity:.75"></span>
        <span style="position:relative;width:${sq}px;height:${sq}px;background:#141210"><span style="position:absolute;left:0;right:0;top:${Math.round(sq * 0.28)}px;height:${Math.max(1, Math.round(sq / 8))}px;background:${C.gold}"></span></span>
        <span style="width:${rule}px;height:1px;background:${C.gold};opacity:.75"></span>
      </div>
      <div style="${headline};color:${C.ink};max-width:${Math.round(size.w * 0.86)}px;text-wrap:balance">${scene[lang]}</div>
    </div>
    <div style="position:absolute;direction:ltr;top:${capTop}px;left:${(size.w - devW) / 2}px;width:${devW}px;height:${devH}px;border-radius:${d.radius * scale}px;box-shadow:0 ${Math.round(28 * u)}px ${Math.round(90 * u)}px rgba(28,26,23,.13),0 0 0 ${Math.max(1.5, 2 * u)}px rgba(176,141,82,.42)">
      <div style="transform:scale(${scale});transform-origin:0 0;width:${d.width}px;height:${d.height}px">${deviceScreen(d, scene, lang, img)}</div>
    </div>
  </body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const made = [];
for (const size of SIZES) {
  for (const lang of ['en', 'ar']) {
    const dir = join(out, size.id, lang);
    mkdirSync(dir, { recursive: true });
    for (const scene of SCENES) {
      const file = join(raw, `${size.device}-${lang}-${scene.id}.jpg`);
      if (!existsSync(file)) { console.log(`missing ${file}`); continue; }
      const img = `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
      await page.setViewportSize({ width: size.w, height: size.h });
      await page.setContent(frame(size, scene, lang, img), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const target = join(dir, `${scene.id}.jpg`);
      await page.screenshot({ path: target, type: 'jpeg', quality: 93, clip: { x: 0, y: 0, width: size.w, height: size.h } });
      made.push({ size: size.id, lang, scene: scene.id, path: target });
    }
  }
}

// Contact sheets: every frame of a size and language in one row, for a quick look.
for (const size of SIZES) {
  for (const lang of ['en', 'ar']) {
    const rows = made.filter((m) => m.size === size.id && m.lang === lang);
    if (!rows.length) continue;
    const th = 900;
    const tw = Math.round((th * size.w) / size.h);
    const imgs = rows.map((m) => `<img src="data:image/jpeg;base64,${readFileSync(m.path).toString('base64')}" style="width:${tw}px;height:${th}px;display:block">`).join('');
    const W = rows.length * (tw + 24) + 24;
    await page.setViewportSize({ width: W, height: th + 48 });
    await page.setContent(`<body style="margin:0;background:#e9e2d6;display:flex;gap:24px;padding:24px;direction:${lang === 'ar' ? 'rtl' : 'ltr'}">${imgs}</body>`);
    await page.screenshot({ path: join(out, `sheet-${size.id}-${lang}.jpg`), type: 'jpeg', quality: 80 });
  }
}

// Google Play graphics: the 1024 x 500 feature graphic (the full logo and the brand line on ivory) and the 512 x 512
// listing icon (the app icon).
const logoSrc = readFileSync(resolve('src/components/logo-data.ts'), 'utf8');
const logoPath = (k) => logoSrc.match(new RegExp(`${k}: '([^']+)'`))[1];
const logo = `<svg viewBox="25 24 868 216" width="560" height="139" fill="${C.ink}" fill-rule="evenodd"><path d="${logoPath('arabic')}"/><path d="${logoPath('latin')}"/><path d="${logoPath('arch')}"/></svg>`;
const feature = `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS} html,body{margin:0}</style></head>
  <body style="width:1024px;height:500px;background:${C.ivory};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
    ${logo}
    <div style="width:420px;height:1px;background:linear-gradient(90deg,transparent,${C.gold},transparent)"></div>
    <div style="display:flex;gap:18px;align-items:center;color:${C.brassText}">
      <span style="font:600 17px ${sans(false)};letter-spacing:.26em;text-transform:uppercase">For every Muslim home</span>
      <span style="width:5px;height:5px;background:${C.gold};transform:rotate(45deg)"></span>
      <span style="font:500 21px ${sans(true)}">لكل بيت مسلم</span>
    </div>
  </body></html>`;
mkdirSync(join(out, 'google-play'), { recursive: true });
await page.setViewportSize({ width: 1024, height: 500 });
await page.setContent(feature, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(out, 'google-play', 'feature-graphic-1024x500.png'), type: 'png' });
await page.setViewportSize({ width: 512, height: 512 });
await page.setContent(`<body style="margin:0"><img src="data:image/png;base64,${readFileSync(resolve('assets/app-icon.png')).toString('base64')}" style="width:512px;height:512px;display:block"></body>`, { waitUntil: 'load' });
await page.screenshot({ path: join(out, 'google-play', 'icon-512.png'), type: 'png' });
await browser.close();
writeFileSync(join(out, 'index.json'), JSON.stringify(made.map((m) => ({ ...m, path: m.path.replace(`${out}/`, '') })), null, 1));
console.log(`${made.length} store screenshots in ${out}`);
