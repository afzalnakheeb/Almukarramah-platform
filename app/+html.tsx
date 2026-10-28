// The HTML document wrapped around every pre-rendered page (web only).
import { ScrollViewStyleReset } from 'expo-router/html';
import React, { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#010852" />
        <meta name="application-name" content="Al Mukarramah" />
        <meta name="apple-mobile-web-app-title" content="Al Mukarramah" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
        <link rel="sitemap" type="application/xml" href="/sitemap.xml" />
        <link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'body{background-color:#FBF8F3;} #root{background-color:#FBF8F3;}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
