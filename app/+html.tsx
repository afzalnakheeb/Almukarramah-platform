// The HTML document wrapped around every pre-rendered page (web only).
import { ScrollViewStyleReset } from 'expo-router/html';
import React, { type PropsWithChildren } from 'react';
import { colors } from '@/theme';

// Motion and hover on the website, keyed on data-* attributes set by src/components/motion.ts (see there).
// One ease for everything (cubic-bezier(0.22, 1, 0.36, 1): a long, soft settle, never a bounce).
// Hidden states only apply under html[data-motion], which is set after hydration, so the pre-rendered page is always visible.
const MOTION_CSS = `
:root{--am-ease:cubic-bezier(0.22,1,0.36,1)}
a,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"],[data-hover]{cursor:pointer}
[aria-disabled="true"]{cursor:default}
[data-scroller]{scroll-behavior:smooth}
[id]:not(#root){scroll-margin-top:112px}
::selection{background:${colors.champagne};color:${colors.ink}}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
/* typesetting: headings balanced (no lone word on a last line), running text without orphans */
[dir="auto"]{text-wrap:pretty}
h1,h2,h3,[role="heading"],[data-eyebrow]{text-wrap:balance}

/* focus: a fine Madinah-green ring for keyboard users, never for mouse clicks */
:focus{outline:none}
:focus-visible{outline:2px solid ${colors.emerald}!important;outline-offset:3px}
input:focus-visible,textarea:focus-visible{outline:none!important}
[data-field]{transition:border-color 200ms ease,box-shadow 200ms ease}
[data-field]:focus{border-color:${colors.emerald}!important;box-shadow:0 0 0 1px ${colors.emerald}}
[data-search]{transition:border-color 300ms ease}
[data-search]:focus-within{border-color:${colors.emerald}!important}

/* Kaaba corners: drawn in when their card is hovered (or always on) */
[data-corner]{transition:opacity 420ms var(--am-ease),transform 420ms var(--am-ease)}
[data-corner="draw"]{opacity:0;transform:scale(.35)}
[data-corner][data-cv="t"][data-ch="s"]{transform-origin:0 0}
[data-corner][data-cv="t"][data-ch="e"]{transform-origin:100% 0}
[data-corner][data-cv="b"][data-ch="s"]{transform-origin:0 100%}
[data-corner][data-cv="b"][data-ch="e"]{transform-origin:100% 100%}
html[dir="rtl"] [data-corner][data-ch="s"][data-cv="t"]{transform-origin:100% 0}
html[dir="rtl"] [data-corner][data-ch="e"][data-cv="t"]{transform-origin:0 0}
html[dir="rtl"] [data-corner][data-ch="s"][data-cv="b"]{transform-origin:100% 100%}
html[dir="rtl"] [data-corner][data-ch="e"][data-cv="b"]{transform-origin:0 100%}

/* section reveals: rise 20px and fade in over 800ms, siblings 80ms apart; photographs settle from 1.03 */
html[data-motion] [data-reveal]{transition:opacity 800ms var(--am-ease),transform 800ms var(--am-ease)}
html[data-motion] [data-ri="1"]{transition-delay:80ms}
html[data-motion] [data-ri="2"]{transition-delay:160ms}
html[data-motion] [data-ri="3"]{transition-delay:240ms}
html[data-motion] [data-ri="4"]{transition-delay:320ms}
html[data-motion="on"] [data-reveal]:not([data-shown]){opacity:0!important;transform:translate3d(0,20px,0)!important}
html[data-motion="on"] [data-reveal]:not([data-shown]) [data-zoom]{transform:scale(1.03)}
html[data-motion="reduced"] [data-reveal]:not([data-shown]){opacity:0!important}
html[data-motion="reduced"] [data-reveal]{transition:opacity 200ms linear!important;transition-delay:0ms!important}

/* photographs inside tiles, doors and cards: a slow zoom on hover (900ms) */
[data-zoom]{transition:transform 900ms var(--am-ease);transform-origin:50% 50%}

/* fine gold lines that draw in: menu links from the centre, labels from the start edge (mirrored in Arabic) */
[data-ul]{position:relative}
[data-ul]::after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:1px;background:${colors.gold};transform:scaleX(0);transform-origin:0 50%;transition:transform 500ms var(--am-ease);pointer-events:none}
[data-ul="center"]::after{bottom:3px;transform-origin:50% 50%}
[data-ul="nav"]::after{bottom:6px;transform-origin:50% 50%}
html[dir="rtl"] [data-ul="start"]::after{transform-origin:100% 50%}
[data-cur]::after{transform:scaleX(1);background:${colors.emerald}}
[data-hairline]{transform:scaleX(0);transform-origin:0 50%;transition:transform 600ms var(--am-ease)}
[data-hairline="c"]{transform-origin:50% 50%!important}
html[dir="rtl"] [data-hairline]{transform-origin:100% 50%}

/* buttons and links: colour changes over 280ms */
[data-btn]{transition:background-color 280ms ease,border-color 280ms ease,opacity 280ms ease}
[data-btn] *,[data-foot],[data-foot] *,[data-tab] *,[data-icon] path,[data-icon] circle,[data-icon] rect{transition:color 280ms ease,stroke 280ms ease}
[data-caps],[data-opt],[data-btn="quiet"] [data-ul]{transition:border-color 300ms ease}
[data-chip]{transition:border-color 280ms ease,background-color 280ms ease}

@media (hover:hover) and (pointer:fine){
  [data-hover]:hover [data-zoom]{transform:scale(1.035)}
  [data-hover="tile"]:hover [data-hairline]{transform:scaleX(1)}
  [data-hover]:hover [data-corner="draw"]{opacity:1;transform:none}
  [data-hover="door"]:hover [data-ul="start"]::after,[data-ul]:hover::after{transform:scaleX(1)}
  [data-btn="primary"]:hover{background-color:${colors.emeraldDeep}!important;border-color:${colors.emeraldDeep}!important}
  [data-btn="secondary"]:hover,[data-btn="outlineLight"]:hover{background-color:${colors.ink}!important;border-color:${colors.ink}!important}
  [data-btn="secondary"]:hover *,[data-btn="outlineLight"]:hover *{color:${colors.ivory}!important}
  [data-btn="gold"]:hover{background-color:${colors.goldSoft}!important}
  [data-btn="fab"]:hover{border-color:${colors.emerald}!important;background-color:${colors.ivory}!important}
  [data-btn="light"]:hover{border-color:${colors.ink}!important}
  [data-btn="quiet"]:hover [data-ul]{border-color:${colors.emerald}!important}
  [data-btn="quiet"]:hover *{color:${colors.emerald}!important}
  [data-btn="danger"]:hover,[data-btn="text"]:hover{opacity:.72}
  [data-foot]:hover,[data-foot]:hover *{color:${colors.brassText}!important}
  [data-icon]:hover path,[data-icon]:hover circle,[data-icon]:hover rect{stroke:${colors.brass}}
  [data-caps]:hover{border-color:${colors.emerald}!important}
  [data-caps]:hover *{color:${colors.emerald}!important}
  [data-chip="off"]:hover,[data-opt="off"]:hover{border-color:${colors.ink}!important}
  [data-tab]:hover *{color:${colors.ink}!important}
}

/* header: sticky; past the hero it becomes compact over 300ms, with a light ivory blur and its gold hairline */
html body [data-banner]{position:sticky!important;z-index:40}
html body [data-banner="wide"]{top:-36px}
html body [data-banner="narrow"]{top:0}
[data-house]{transition:background-color 300ms ease}
[data-house]>*{transition:padding-top 300ms var(--am-ease),padding-bottom 300ms var(--am-ease)}
[data-house="compact"]{background-color:rgba(247,243,236,0.86)!important;-webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1)}
[data-collapse]{max-height:48px;overflow:hidden;transition:max-height 300ms var(--am-ease),opacity 200ms ease}
[data-banner][data-compact] [data-collapse]{max-height:0;opacity:0}
[data-logo]{transition:gap 300ms var(--am-ease),row-gap 300ms var(--am-ease)}
[data-logo]>:first-child{transition:height 300ms var(--am-ease),width 300ms var(--am-ease)}
[data-logo]>:not(:first-child){max-height:34px;transition:opacity 200ms ease,max-height 300ms var(--am-ease)}
[data-logo="compact"]{gap:0!important;row-gap:0!important}
[data-logo="compact"]>:not(:first-child){opacity:0;max-height:0!important;overflow:hidden}

/* page change: the main content fades in over 250ms (never on the first, pre-rendered paint) */
@keyframes amPageA{from{opacity:0}to{opacity:1}}
@keyframes amPageB{from{opacity:0}to{opacity:1}}
[data-page="a"]{animation:amPageA 250ms ease-out backwards}
[data-page="b"]{animation:amPageB 250ms ease-out backwards}

@media (prefers-reduced-motion:reduce){
  [data-scroller]{scroll-behavior:auto}
  [data-zoom],[data-hairline],[data-ul]::after,[data-house]>*,[data-logo],[data-logo]>*,[data-collapse],[data-corner]{transition-duration:0ms!important}
  [data-zoom]{transform:none!important}
  [data-page="a"],[data-page="b"]{animation-duration:150ms}
}
@media print{[data-reveal]{opacity:1!important;transform:none!important}}

/* first-visit brand intro (public/intro.js, built by scripts/build-intro.mjs): the dark field is painted before the
   intro script arrives, so the page never flashes; it fades by itself after 5 s if that script never comes. The
   header's logo and its tagline are held back while the intro's logo glides into their place. */
html[data-intro="1"] body::after{content:"";position:fixed;inset:0;z-index:2147483000;background:radial-gradient(ellipse at 50% 45%,#2a241d 0%,#14110e 55%,#0c0a08 100%);animation:amIntroCover 600ms ease 5s forwards}
@keyframes amIntroCover{to{opacity:0;visibility:hidden}}
@keyframes amIntroShow{to{opacity:1}}
html[data-intro="1"] [data-brandslot],html[data-intro="1"] [data-brandline]{opacity:0;animation:amIntroShow 0s linear 5.6s forwards}
html[data-intro="live"] [data-brandslot],html[data-intro="live"] [data-brandline]{opacity:0!important}
`;

// Decides on the first-visit intro before the first paint: once per session, not for reduced motion, crawlers or
// link previews, not on checkout, payment, order or admin pages. ?intro=0 turns it off; ?intro=play or ?intro=2.5
// (frozen at 2.5 s, for design review) force it. Only when the intro will play does it preload the emblem photograph
// and load public/intro.js, which draws the intro straight away, without waiting for the app's JavaScript.
const INTRO_JS = `(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search).get('intro');if(q==='0')return;var f=q!==null;
if(!f){if(sessionStorage.getItem('amIntro'))return;if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
if(/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|headless|lighthouse/i.test(navigator.userAgent))return;
if(/^\\/(admin|checkout|pay|order|subscribe)/.test(location.pathname))return;sessionStorage.setItem('amIntro','1');d.setAttribute('data-intro','1');}
var l=document.createElement('link');l.rel='preload';l.as='image';l.type='image/webp';l.href='/images/brand/emblem-kaaba.webp';document.head.appendChild(l);
var s=document.createElement('script');s.src='/intro.js';s.async=true;document.head.appendChild(s);}catch(e){}})();`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content={colors.ivory} />
        <meta name="application-name" content="Al Mukarramah" />
        <meta name="apple-mobile-web-app-title" content="Al Mukarramah" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `body{background-color:${colors.ivory};} #root{background-color:${colors.ivory};}` }} />
        <style dangerouslySetInnerHTML={{ __html: MOTION_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: INTRO_JS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
