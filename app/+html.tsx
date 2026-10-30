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
html[dir="rtl"] [data-ul="start"]::after{transform-origin:100% 50%}
[data-hairline]{transform:scaleX(0);transform-origin:0 50%;transition:transform 600ms var(--am-ease)}
html[dir="rtl"] [data-hairline]{transform-origin:100% 50%}

/* buttons and links: colour changes over 280ms */
[data-btn]{transition:background-color 280ms ease,border-color 280ms ease,opacity 280ms ease}
[data-btn] *,[data-foot],[data-foot] *,[data-tab] *{transition:color 280ms ease}
[data-caps]{transition:border-color 300ms ease}
[data-chip]{transition:border-color 280ms ease,background-color 280ms ease}

@media (hover:hover) and (pointer:fine){
  [data-hover]:hover [data-zoom]{transform:scale(1.04)}
  [data-hover="tile"]:hover [data-hairline]{transform:scaleX(1)}
  [data-hover="door"]:hover [data-ul="start"]::after,[data-ul]:hover::after{transform:scaleX(1)}
  [data-btn="primary"]:hover{background-color:#0D2820!important;border-color:#0D2820!important}
  [data-btn="secondary"]:hover{background-color:${colors.ink}!important;border-color:${colors.ink}!important}
  [data-btn="secondary"]:hover *{color:${colors.ivory}!important}
  [data-btn="outlineLight"]:hover{background-color:${colors.ivory}!important;border-color:${colors.ivory}!important}
  [data-btn="outlineLight"]:hover *{color:${colors.ink}!important}
  [data-btn="gold"]:hover{background-color:${colors.goldBright}!important;border-color:${colors.goldBright}!important}
  [data-btn="light"]:hover{background-color:#FFFFFF!important}
  [data-btn="danger"]:hover,[data-btn="text"]:hover{opacity:.78}
  [data-foot]:hover,[data-foot]:hover *{color:${colors.goldBright}!important}
  [data-caps]:hover{border-color:${colors.gold}!important}
  [data-chip="off"]:hover{border-color:${colors.ink}!important}
  [data-tab]:hover *{color:#FFFFFF!important}
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
[data-logo]>:not(:first-child){max-height:24px;transition:opacity 200ms ease,max-height 300ms var(--am-ease)}
[data-logo="compact"]{gap:0!important;row-gap:0!important}
[data-logo="compact"]>:not(:first-child){opacity:0;max-height:0!important;overflow:hidden}

/* page change: the main content fades in over 250ms (never on the first, pre-rendered paint) */
@keyframes amPageA{from{opacity:0}to{opacity:1}}
@keyframes amPageB{from{opacity:0}to{opacity:1}}
[data-page="a"]{animation:amPageA 250ms ease-out backwards}
[data-page="b"]{animation:amPageB 250ms ease-out backwards}

@media (prefers-reduced-motion:reduce){
  [data-scroller]{scroll-behavior:auto}
  [data-zoom],[data-hairline],[data-ul]::after,[data-house]>*,[data-logo],[data-logo]>*,[data-collapse]{transition-duration:0ms!important}
  [data-zoom]{transform:none!important}
  [data-page="a"],[data-page="b"]{animation-duration:150ms}
}
@media print{[data-reveal]{opacity:1!important;transform:none!important}}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content={colors.navy} />
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
      </head>
      <body>{children}</body>
    </html>
  );
}
