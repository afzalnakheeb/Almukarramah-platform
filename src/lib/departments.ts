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
  /** concept: an AI concept image of a piece we would commission (no maker; shown as a concept, never as stock). */
  status: 'reference' | 'signed' | 'second-wave' | 'concept' | 'discussion';
};

/** A concept image: what we would commission, labelled as a concept on the page. */
const concept = (title: Key, img: string): Collection => ({ title, img, maker: '', piece: '', status: 'concept' });

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
  /** A sub-page of another department (e.g. jewellery for her): not shown in the menu or on the home page. */
  parent?: string;
};

export const DEPARTMENTS: Department[] = [
  {
    slug: 'prayer', title: 'dPrayer', short: 'dPrayerShort', intro: 'dPrayerIntro',
    examples: ['dPrayerEx1', 'dPrayerEx2', 'dPrayerEx3'], gift: 'dPrayerGift',
    cover: '/images/dept/cover-prayer.jpg',
    categories: ['prayer-mats', 'misbaha', 'mushaf-and-islamic-gifts', 'woven-rugs', 'gift-sets'],
    collections: [
    ],
  },
  {
    slug: 'oud-and-fragrance', title: 'dFragrance', short: 'dFragranceShort', intro: 'dFragranceIntro',
    examples: ['dFragranceEx1', 'dFragranceEx2', 'dFragranceEx3'], gift: 'dFragranceGift',
    cover: '/images/dept/cover-fragrance.jpg',
    categories: ['perfumes', 'oud-oils', 'bakhoor', 'frankincense-care'],
    collections: [
    ],
  },
  {
    slug: 'dates-and-gourmet', title: 'dDates', short: 'dDatesShort', intro: 'dDatesIntro',
    examples: ['dDatesEx1', 'dDatesEx2', 'dDatesEx3'], gift: 'dDatesGift',
    cover: '/images/dept/cover-dates.jpg',
    // The live dates listings (Ajwa, Sukkari) are not shown here, at the founder's request: the department leads with
    // the premium gift boxes until listings of that level are in the catalogue.
    categories: ['gourmet-gifts'],
    collections: [
    ],
  },
  {
    slug: 'art-and-home', title: 'dArt', short: 'dArtShort', intro: 'dArtIntro',
    examples: ['dArtEx1', 'dArtEx2', 'dArtEx3'], gift: 'dArtGift',
    cover: '/images/dept/cover-art.jpg',
    categories: ['art-and-decor', 'home-and-hospitality', 'keepsakes'],
    collections: [
      concept('cArtCalligraphy', '/images/dept/concept-art-brushwork.jpg'),
      concept('cArtRelief', '/images/dept/concept-art-relief.jpg'),
      concept('cArtSculpture', '/images/dept/concept-art-sculpture.jpg'),
      concept('cArtLandscape', '/images/dept/concept-art-mountains.jpg'),
      { title: 'cArtContemporary', img: '/images/dept/ref-alhomoud-alnoor.jpg', maker: 'Lulwah Al Homoud', piece: 'Al Noor, 2022', status: 'reference' },
      { title: 'cArtMasters', img: '/images/dept/ref-uthmantaha.jpg', maker: 'Uthman Taha (photo: Youm7)', piece: 'Madinah calligraphy heritage', status: 'reference' },
    ],
  },
  {
    slug: 'modest-style', title: 'dModest', short: 'dModestShort', intro: 'dModestIntro',
    examples: ['dModestEx1', 'dModestEx2', 'dModestEx3'], gift: 'dModestGift',
    cover: '/images/dept/cover-modest.jpg',
    categories: ['modest-wear'],
    collections: [
      concept('cAbayaCouture', '/images/dept/concept-abaya-black.jpg'),
      concept('cAbayaDay', '/images/dept/concept-abaya-sand.jpg'),
      concept('cSharshaf', '/images/dept/concept-sharshaf.jpg'),
      concept('cThobe', '/images/dept/concept-thobe.jpg'),
    ],
  },
  {
    slug: 'jewellery-and-accessories', title: 'dAccessories', short: 'dAccessoriesShort', intro: 'dAccessoriesIntro',
    examples: ['dAccessoriesEx1', 'dAccessoriesEx2', 'dAccessoriesEx3'], gift: 'dAccessoriesGift',
    cover: '/images/dept/concept-callig-set.jpg',
    categories: [],
    collections: [],
  },
  {
    slug: 'jewellery-for-her', parent: 'jewellery-and-accessories', title: 'dHer', short: 'dHerShort', intro: 'dHerIntro',
    examples: ['dHerEx1', 'dHerEx2', 'dHerEx3'], gift: 'dHerGift',
    cover: '/images/dept/concept-callig-set.jpg',
    categories: ['jewellery'],
    collections: [
      concept('cJewelNour', '/images/dept/concept-callig-set.jpg'),
      concept('cJewelNour', '/images/dept/concept-callig-cuff.jpg'),
      concept('cJewelPendant', '/images/dept/concept-pendant.jpg'),
      concept('cJewelEarrings', '/images/dept/concept-earrings.jpg'),
    ],
  },
  {
    slug: 'jewellery-for-him', parent: 'jewellery-and-accessories', title: 'dHim', short: 'dHimShort', intro: 'dHimIntro',
    examples: ['dHimEx1', 'dHimEx2', 'dHimEx3'], gift: 'dHimGift',
    cover: '/images/partners/chopard/alpine-eagle-gold.jpg',
    categories: ['mens-accessories'],
    collections: [
      concept('cJewelMens', '/images/dept/concept-mens.jpg'),
    ],
  },
];

/** The cover of this department is a photograph of a real maker's piece, not a concept image. */
/** Departments shown in the menu and on the home page (sub-pages are reached from their parent). */
export const TOP_DEPARTMENTS = DEPARTMENTS.filter((d) => !d.parent);

export const subDepartments = (slug: string): Department[] => DEPARTMENTS.filter((d) => d.parent === slug);

export const COVER_CREDIT: Record<string, string> = {};

export const departmentHref = (slug: string): Href => ({ pathname: '/departments/[slug]', params: { slug } });

export const departmentOf = (categorySlug: string): Department | undefined =>
  DEPARTMENTS.find((d) => d.categories.includes(categorySlug));
