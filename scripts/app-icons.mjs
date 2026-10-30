// App icon, Android adaptive icon, splash image and favicon, drawn from the vector logo (src/components/logo-data.ts),
// so they stay exactly the brand artwork. Rendered in Chromium (Playwright).
//   node scripts/app-icons.mjs                 writes the files in assets/
//   node scripts/app-icons.mjs <previewDir>    also writes previews (gold variant, home screen, masks, splash)
// The iOS icon must have no transparency and no alpha channel (App Store Connect rejects it otherwise). Chromium
// writes an opaque page as an RGB PNG; the script checks the PNG header and stops if that ever changes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const INK = '#1C1A17';
const IVORY = '#F7F3EC';
const STONE = '#EFE9DF';
const GOLD_LINE = '#B08D52';

const src = readFileSync('src/components/logo-data.ts', 'utf8');
const pathOf = (k) => src.match(new RegExp(`${k}: '([^']+)'`))[1];
const P = { arabic: pathOf('arabic'), latin: pathOf('latin'), arch: pathOf('arch') };
// Satin antique gold of the logo: a vertical gradient (no sheen: the house look is calm, never shiny).
const GOLD = [...src.match(/export const GOLD = \{[\s\S]*?\};/)[0].matchAll(/\[([\d.]+), '(#[0-9A-Fa-f]{6})'\]/g)].map((m) => [Number(m[1]), m[2]]);

// Bounding boxes in the logo's 917 x 264 viewBox (measured with getBBox()).
const ARCH = { x: 708.1, y: 24.2, w: 184.1, h: 213.8 };
const LOGO = { x: 25.2, y: 24.2, w: 867.0, h: 215.3 };

const goldDef = (id) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="26" x2="0" y2="238">${GOLD.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

/** The arch monogram, `h` px tall, centred on (cx, cy). */
function emblem({ h, cx, cy, fill }) {
  const s = h / ARCH.h;
  const tx = cx - (ARCH.x + ARCH.w / 2) * s;
  const ty = cy - (ARCH.y + ARCH.h / 2) * s;
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})"><path d="${P.arch}" fill-rule="evenodd" fill="${fill}"/></g>`;
}

/** The full logo (Arabic wordmark, Latin word and the arch), `w` px wide, centred on (cx, cy). */
function logo({ w, cx, cy, fill }) {
  const s = w / LOGO.w;
  const tx = cx - (LOGO.x + LOGO.w / 2) * s;
  const ty = cy - (LOGO.y + LOGO.h / 2) * s;
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})" fill="${fill}" fill-rule="evenodd">`
    + `<path d="${P.arabic}"/><path d="${P.latin}"/><path d="${P.arch}"/></g>`;
}

const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

// ---------------------------------------------------------------- the artwork
const S = 1024;
const ICON_EMBLEM = 0.54 * S; // emblem height in the iOS icon: generous ivory around it
const ICON_DROP = 0.006 * S; // a hair below centre: an arch reads top-heavy
const ADAPTIVE_EMBLEM = 400; // inside Android's 66 dp safe circle (626 px of 1024) with room to spare

const art = {
  icon: svg(S, S, `<rect width="${S}" height="${S}" fill="${IVORY}"/>${emblem({ h: ICON_EMBLEM, cx: S / 2, cy: S / 2 + ICON_DROP, fill: INK })}`),
  iconGold: svg(S, S, `<rect width="${S}" height="${S}" fill="${IVORY}"/>${emblem({ h: ICON_EMBLEM, cx: S / 2, cy: S / 2 + ICON_DROP, fill: 'url(#gold)' })}`, goldDef('gold')),
  adaptive: svg(S, S, emblem({ h: ADAPTIVE_EMBLEM, cx: S / 2, cy: S / 2 + ICON_DROP * 0.75, fill: INK })),
  mono: svg(S, S, emblem({ h: ADAPTIVE_EMBLEM, cx: S / 2, cy: S / 2 + ICON_DROP * 0.75, fill: '#000000' })),
  // Splash: the full logo on a transparent square (the ivory comes from the splash background colour). The logo fits
  // inside the centred circle Android 12+ keeps of a splash icon (two thirds of the square), so it is never clipped.
  splash: svg(S, S, logo({ w: 0.62 * S, cx: S / 2, cy: S / 2, fill: INK })),
  favicon: svg(256, 256, `<rect width="256" height="256" fill="${IVORY}"/>${emblem({ h: 184, cx: 128, cy: 130, fill: INK })}`),
};

const outDir = 'assets';
const previewDir = process.argv[2];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(markup, w, h, { transparent = false } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg,img{display:block}</style></head><body>${markup}</body></html>`);
  return page.screenshot({ type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
/** PNG colour type (byte 25 of the file): 2 is RGB, 6 is RGB with alpha. */
function opaque(png, file) {
  if (png[25] !== 2) throw new Error(`${file} would have an alpha channel (PNG colour type ${png[25]}); App Store Connect rejects that`);
  writeFileSync(file, png);
}

mkdirSync(outDir, { recursive: true });
const icon = await render(art.icon, S, S);
opaque(icon, join(outDir, 'app-icon.png'));
writeFileSync(join(outDir, 'adaptive-icon.png'), await render(art.adaptive, S, S, { transparent: true }));
writeFileSync(join(outDir, 'adaptive-icon-mono.png'), await render(art.mono, S, S, { transparent: true }));
writeFileSync(join(outDir, 'splash-icon.png'), await render(art.splash, S, S, { transparent: true }));
opaque(await render(art.favicon, 256, 256), join(outDir, 'favicon.png'));

// ---------------------------------------------------------------- previews (for review only, never shipped)
if (previewDir) {
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(join(previewDir, 'icon-ink-1024.png'), icon);
  const gold = await render(art.iconGold, S, S);
  writeFileSync(join(previewDir, 'icon-gold-1024.png'), gold);
  const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  const ink = b64(icon);
  const goldUri = b64(gold);
  const fg = b64(await render(art.adaptive, S, S, { transparent: true }));
  const mono = b64(await render(art.mono, S, S, { transparent: true }));
  const splash = b64(await render(art.splash, S, S, { transparent: true }));

  // Home screens: the icon at its real sizes (iPhone 60 pt, iPad 76 pt, Spotlight 40 pt) on a light and a dark wallpaper.
  const tile = (uri, size, label, dark) => `<div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(size * 0.12)}px;width:${size * 1.5}px">
    <img src="${uri}" width="${size}" height="${size}" style="border-radius:${size * 0.2237}px;box-shadow:0 ${size * 0.04}px ${size * 0.12}px rgba(0,0,0,${dark ? 0.35 : 0.12})">
    ${label ? `<div style="font:500 ${Math.max(11, size * 0.2)}px Inter,system-ui;color:${dark ? '#fff' : '#1C1A17'};white-space:nowrap">${label}</div>` : ''}</div>`;
  const wall = (dark, uri) => `<div style="flex:1;padding:56px 40px;display:flex;align-items:flex-end;justify-content:center;gap:28px;background:${dark ? 'linear-gradient(160deg,#2b2721,#121110)' : 'linear-gradient(160deg,#e9e4da,#cfd7d1)'}">
    ${tile(uri, 180, 'Al Mukarramah', dark)}${tile(uri, 120, 'Al Mukarramah', dark)}${tile(uri, 60, '', dark)}${tile(uri, 40, '', dark)}</div>`;
  const home = `<div style="display:flex;width:1600px;height:560px">${wall(false, ink)}${wall(true, ink)}</div>`
    + `<div style="display:flex;width:1600px;height:560px">${wall(false, goldUri)}${wall(true, goldUri)}</div>`;
  writeFileSync(join(previewDir, 'icon-home-screens.png'), await render(home, 1600, 1120));

  // Android: the adaptive icon under the launchers' masks (circle, squircle, rounded square, teardrop) and themed.
  const mask = (shape, size, themed) => {
    const r = { circle: '50%', squircle: '32%', rounded: '18%', drop: '50% 50% 50% 12%' }[shape];
    const bg = themed ? '#DCE5DD' : IVORY;
    const layer = themed ? `<div style="position:absolute;inset:-25%;background:#2F4A3C;-webkit-mask:url(${mono}) center/100% 100% no-repeat"></div>`
      : `<img src="${fg}" style="position:absolute;inset:-25%;width:150%;height:150%">`;
    return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:${r};overflow:hidden;background:${bg};box-shadow:0 6px 18px rgba(0,0,0,.18)">${layer}</div>`;
  };
  const row = (themed) => `<div style="display:flex;gap:56px;align-items:center;justify-content:center;padding:36px">${['circle', 'squircle', 'rounded', 'drop'].map((s) => mask(s, 192, themed)).join('')}${mask('circle', 96, themed)}${mask('circle', 48, themed)}</div>`;
  const safe = `<div style="position:relative;width:320px;height:320px;background:${IVORY};border:1px solid #d3c8b6">
    <img src="${fg}" style="position:absolute;inset:0;width:100%;height:100%">
    <div style="position:absolute;inset:${(18 / 108) * 320}px;border:1px dashed #9C7B45" title="visible 72 dp"></div>
    <div style="position:absolute;inset:${(21 / 108) * 320}px;border:1px dashed #18493B;border-radius:50%" title="safe 66 dp"></div></div>`;
  const android = `<div style="width:1600px;background:#f1efe9;font:500 15px Inter,system-ui;color:#4A453E">
    <div style="display:flex;gap:40px;align-items:center;padding:36px 48px 0">${safe}<div style="max-width:760px;line-height:1.6">Adaptive icon foreground on its 108 dp canvas. Gold dashes: the 72 dp a launcher shows; green dashes: the 66 dp circle every mask keeps. Background colour ${IVORY}. Below: the common launcher masks, then the themed (Material You) icon from the monochrome layer.</div></div>
    ${row(false)}${row(true)}</div>`;
  writeFileSync(join(previewDir, 'android-adaptive-icon.png'), await render(android, 1600, 878));

  // Splash on an iPhone (440 x 956 pt) and an Android phone (412 x 915 dp), at imageWidth 288 as in app.json.
  const W = 288;
  const phone = (w, h, label) => `<div style="display:flex;flex-direction:column;align-items:center;gap:14px">
    <div style="position:relative;width:${w}px;height:${h}px;border-radius:${w * 0.13}px;background:${IVORY};border:10px solid #1b1a18;box-shadow:0 20px 50px rgba(0,0,0,.18);overflow:hidden">
      <img src="${splash}" style="position:absolute;left:${(w - W) / 2}px;top:${(h - W) / 2}px;width:${W}px;height:${W}px"></div>
    <div style="font:500 14px Inter,system-ui;color:#6E675E">${label}</div></div>`;
  const splashes = `<div style="box-sizing:border-box;display:flex;gap:64px;justify-content:center;align-items:flex-start;padding:48px;background:${STONE};width:1100px;height:1110px">${phone(440, 956, 'iPhone 6.9″')}${phone(412, 915, 'Android')}</div>`;
  writeFileSync(join(previewDir, 'splash-preview.png'), await render(splashes, 1100, 1110));
  writeFileSync(join(previewDir, 'splash-icon.png'), Buffer.from(splash.split(',')[1], 'base64'));
  writeFileSync(join(previewDir, 'adaptive-icon-foreground.png'), Buffer.from(fg.split(',')[1], 'base64'));
}
await browser.close();
console.log(`icons written to ${outDir}/${previewDir ? ` and previews to ${previewDir}` : ''}`);
