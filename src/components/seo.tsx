// Page <head>: title, description, canonical, Open Graph, Twitter and JSON-LD structured data.
// Rendered into the static HTML at build time (expo-router/head), so crawlers and AI assistants see it.
import Head from 'expo-router/head';
import React from 'react';
import { SITE_URL } from '@/lib/images';

export const BRAND = 'Al Mukarramah';
export const BRAND_AR = 'المكرمة';

const abs = (p?: string | null) => (!p ? undefined : /^https?:/.test(p) ? p : `${SITE_URL}${p}`);

export function Seo({ title, description, path, image, type = 'website', noindex, jsonLd }: {
  title: string; description: string; path: string; image?: string | null; type?: 'website' | 'product' | 'article';
  noindex?: boolean; jsonLd?: object | object[];
}) {
  const url = `${SITE_URL}${path}`;
  const img = abs(image) ?? `${SITE_URL}/images/hero.jpg`;
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex ? <meta name="robots" content="noindex, nofollow" /> : <meta name="robots" content="index, follow, max-image-preview:large" />}
      <meta property="og:site_name" content={BRAND} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />
      <meta property="og:locale" content="en_GB" />
      <meta property="og:locale:alternate" content="ar_SA" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />
      {blocks.map((b, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(b) }} />
      ))}
    </Head>
  );
}

export const organizationLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: BRAND,
  alternateName: BRAND_AR,
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo.png`,
  foundingDate: '2020',
  description: 'Premium Islamic gifts prepared and packed in Madinah: prayer mats and rugs inspired by the Haramain, gift sets, Madinah dates and keepsakes.',
  address: { '@type': 'PostalAddress', addressLocality: 'Madinah', addressCountry: 'SA' },
  areaServed: ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'GB', 'US', 'MY', 'ID'],
};

export const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: BRAND,
  alternateName: BRAND_AR,
  url: SITE_URL,
  inLanguage: ['en', 'ar'],
  publisher: { '@id': `${SITE_URL}/#organization` },
  potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/shop?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
};

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}

export function faqLd(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

export function itemListLd(name: string, products: { slug: string; name_en: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/product/${p.slug}`, name: p.name_en })),
  };
}

export function productLd(p: {
  slug: string; sku: string | null | undefined; name_en: string; name_ar: string; description_en: string | null; images: string[];
  base_price_sar: number; stock: number; categories?: { name_en: string } | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${SITE_URL}/product/${p.slug}#product`,
    name: p.name_en,
    alternateName: p.name_ar,
    description: p.description_en ?? undefined,
    image: p.images.map((i) => abs(i)),
    sku: p.sku ?? p.slug,
    category: p.categories?.name_en,
    brand: { '@type': 'Brand', name: BRAND },
    manufacturer: { '@id': `${SITE_URL}/#organization` },
    countryOfAssembly: 'SA',
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/product/${p.slug}`,
      priceCurrency: 'SAR',
      price: (p.base_price_sar / 100).toFixed(2),
      priceSpecification: { '@type': 'PriceSpecification', price: (p.base_price_sar / 100).toFixed(2), priceCurrency: 'SAR', valueAddedTaxIncluded: true },
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': `${SITE_URL}/#organization` },
    },
  };
}
