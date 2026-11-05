// The six departments of the house (the November 2026 store concept). Each one gathers the live categories that
// belong to it (from the catalogue in Supabase: their products are real and shop normally) and the collections we
// are preparing, shown with reference photographs from makers we admire.
//
// Reference photographs belong to their makers. They are credited on the page, they never stand for our stock, and
// no partnership is implied: only Royal Selangor is a signed partner, and it is marked as one. The cover images are
// concept images (AI, from the founder's mood board), labelled as such. Copy lives in src/lib/i18n.tsx (en and ar).
import type { Href } from 'expo-router';
import type { Key } from './i18n';

export type Collection = {
  title: Key;
  img: string;
  /** Who made the piece in the photograph: a real maker, credited as written here. */
  maker: string;
  piece: string;
  status: 'reference' | 'signed' | 'second-wave';
};

export type Department = {
  slug: string;
  title: Key;
  short: Key;
  intro: Key;
  examples: [Key, Key, Key];
  gift: Key;
  cover: string;
  /** Live catalogue categories in this department (slugs in the categories table). */
  categories: string[];
  collections: Collection[];
};

export const DEPARTMENTS: Department[] = [
  {
    slug: 'prayer', title: 'dPrayer', short: 'dPrayerShort', intro: 'dPrayerIntro',
    examples: ['dPrayerEx1', 'dPrayerEx2', 'dPrayerEx3'], gift: 'dPrayerGift',
    cover: '/images/dept/cover-prayer.jpg',
    categories: ['prayer-mats', 'woven-rugs', 'gift-sets'],
    collections: [
      { title: 'cMushaf', img: '/images/dept/ref-kashida-mushaf.jpg', maker: 'Kashida', piece: 'Al Kareem Mushaf Holder', status: 'reference' },
    ],
  },
  {
    slug: 'oud-and-fragrance', title: 'dFragrance', short: 'dFragranceShort', intro: 'dFragranceIntro',
    examples: ['dFragranceEx1', 'dFragranceEx2', 'dFragranceEx3'], gift: 'dFragranceGift',
    cover: '/images/dept/cover-fragrance.jpg',
    categories: ['perfumes', 'oud-oils', 'bakhoor'],
    collections: [
      { title: 'cBeauty', img: '/images/dept/ref-ranavat-saffron.jpg', maker: 'Ranavat', piece: 'Brightening Saffron Serum', status: 'second-wave' },
    ],
  },
  {
    slug: 'dates-and-gourmet', title: 'dDates', short: 'dDatesShort', intro: 'dDatesIntro',
    examples: ['dDatesEx1', 'dDatesEx2', 'dDatesEx3'], gift: 'dDatesGift',
    cover: '/images/dept/cover-dates.jpg',
    categories: ['dates'],
    collections: [
      { title: 'cGiftBoxes', img: '/images/dept/ref-bateel-signature.jpg', maker: 'Bateel', piece: 'Signature Collection', status: 'reference' },
      { title: 'cGourmet', img: '/images/dept/ref-sinwan-medjool.jpg', maker: 'Sinwan', piece: 'Filled Medjool assortment', status: 'reference' },
      { title: 'cGourmet', img: '/images/dept/ref-mirzam-nakhuda.jpg', maker: 'Mirzam', piece: 'Nakhuda Gift Box', status: 'reference' },
      { title: 'cHospitality', img: '/images/dept/ref-silsal-tamrah.jpg', maker: 'Silsal', piece: 'Tamrah by Razan Alazzouni', status: 'reference' },
    ],
  },
  {
    slug: 'art-and-home', title: 'dArt', short: 'dArtShort', intro: 'dArtIntro',
    examples: ['dArtEx1', 'dArtEx2', 'dArtEx3'], gift: 'dArtGift',
    cover: '/images/dept/cover-art.jpg',
    categories: ['keepsakes'],
    collections: [
      { title: 'cPewter', img: '/images/dept/ref-royalselangor-vase.jpg', maker: 'Royal Selangor', piece: 'Atiya II vase', status: 'signed' },
      { title: 'cBookends', img: '/images/dept/ref-kashida-bookends.jpg', maker: 'Kashida', piece: 'Name Bookends', status: 'reference' },
      { title: 'cKeepsakes', img: '/images/dept/ref-orient499-tarbouch.jpg', maker: 'Orient 499', piece: 'Mini Tarbouch Box', status: 'reference' },
      { title: 'cLibrary', img: '/images/dept/ref-assouline-alula.jpg', maker: 'Assouline', piece: 'AlUla Ever', status: 'reference' },
    ],
  },
  {
    slug: 'modest-style', title: 'dModest', short: 'dModestShort', intro: 'dModestIntro',
    examples: ['dModestEx1', 'dModestEx2', 'dModestEx3'], gift: 'dModestGift',
    cover: '/images/dept/cover-modest.jpg',
    categories: [],
    collections: [
      { title: 'cModestWear', img: '/images/dept/ref-bouguessa-jacket.jpg', maker: 'Bouguessa', piece: 'Iconic Long Jacket', status: 'reference' },
      { title: 'cShawls', img: '/images/dept/ref-loropiana-shawl.jpg', maker: 'Loro Piana', piece: 'Cashmere shawl (archive)', status: 'reference' },
      { title: 'cChildren', img: '/images/dept/ref-littlebambah-kaftan.jpg', maker: 'Little Bambah', piece: 'Blue Bella Kaftan', status: 'reference' },
    ],
  },
  {
    slug: 'jewellery-and-accessories', title: 'dAccessories', short: 'dAccessoriesShort', intro: 'dAccessoriesIntro',
    examples: ['dAccessoriesEx1', 'dAccessoriesEx2', 'dAccessoriesEx3'], gift: 'dAccessoriesGift',
    cover: '/images/dept/cover-accessories.jpg',
    categories: [],
    collections: [
      { title: 'cClutch', img: '/images/dept/ref-teebmade-clutch.jpg', maker: 'Teeb Made', piece: 'Saudi Door Clutch', status: 'reference' },
      { title: 'cWriting', img: '/images/dept/ref-chopard-pen.jpg', maker: 'Chopard', piece: 'Classic Rollerball', status: 'reference' },
    ],
  },
];

/** The cover of this department is a photograph of a real maker's piece, not a concept image. */
export const COVER_CREDIT: Record<string, string> = { 'jewellery-and-accessories': 'Teeb Made' };

export const departmentHref = (slug: string): Href => ({ pathname: '/departments/[slug]', params: { slug } });

export const departmentOf = (categorySlug: string): Department | undefined =>
  DEPARTMENTS.find((d) => d.categories.includes(categorySlug));
