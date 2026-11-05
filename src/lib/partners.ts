// The partner houses of Al Mukarramah (confirmed by the founder, 5 November 2026).
// Each has its own page (/brands/[slug]) with its photographs, and its pieces also appear in the departments they
// belong to. Photographs are the partners' own, used under our agreements with them. Item names are given in English
// and Arabic; the house descriptions live in src/lib/i18n.tsx (keys pb…).
// Generated from the partner image spec; images are in public/images/partners/<slug>/.
import type { Href } from 'expo-router';
import { snapshot } from '@/lib/snapshot';
import type { Key } from './i18n';

/** product: the slug of the piece in our store, when it is listed (priced and in the cart).
 *  onRequest: a single piece we sell but whose price is quoted per order (shown as "Price on request"). */
export type PartnerItem = { id: string; img: string; en: string; ar: string; depts: string[]; product?: string; onRequest?: boolean };
export type Partner = {
  slug: string;
  name: string;
  nameAr: string;
  site: string;
  blurb: Key;
  /** The brand name in the catalogue, when the house's products are listed in the store. */
  catalogueBrand?: string;
  items: PartnerItem[];
};

export const PARTNERS: Partner[] = [
  {
    slug: "luban", name: "Luban", nameAr: "لُبان", site: "https://lubanoman.com", blurb: 'pbLuban',
    catalogueBrand: "Luban",
    items: [
      { id: "face", img: '/images/partners/luban/face.jpg', en: "The face collection", ar: "مجموعة الوجه", depts: ["oud-and-fragrance"] },
      { id: "face-essentials", img: '/images/partners/luban/face-essentials.jpg', en: "Face Essentials gift box", ar: "علبة هدايا أساسيات الوجه", depts: ["oud-and-fragrance"], product: "luban-face-essentials" },
      { id: "day-cream", img: '/images/partners/luban/day-cream.jpg', en: "Frankincense Day Cream, 50 ml", ar: "كريم النهار باللبان، ٥٠ مل", depts: [], product: "luban-day-cream" },
      { id: "night-cream", img: '/images/partners/luban/night-cream.jpg', en: "Frankincense Night Cream, 50 ml", ar: "كريم الليل باللبان، ٥٠ مل", depts: [], product: "luban-night-cream" },
      { id: "eye-cream", img: '/images/partners/luban/eye-cream.jpg', en: "Frankincense Eye Cream, 20 ml", ar: "كريم العين باللبان، ٢٠ مل", depts: [], product: "luban-eye-cream" },
      { id: "face-oil", img: '/images/partners/luban/face-oil.jpg', en: "Frankincense Face Oil, 30 ml", ar: "زيت الوجه باللبان، ٣٠ مل", depts: [], product: "luban-face-oil" },
      { id: "face-cleanser", img: '/images/partners/luban/face-cleanser.jpg', en: "Frankincense Face Cleanser, 140 ml", ar: "غسول الوجه باللبان، ١٤٠ مل", depts: [], product: "luban-face-cleanser" },
      { id: "lip-balm", img: '/images/partners/luban/lip-balm.jpg', en: "Frankincense Lip Balm", ar: "مرطّب الشفاه باللبان", depts: [], product: "luban-lip-balm" },
      { id: "lip-scrub", img: '/images/partners/luban/lip-scrub.jpg', en: "Frankincense Lip Scrub", ar: "مقشّر الشفاه باللبان", depts: [], product: "luban-lip-scrub" },
      { id: "body", img: '/images/partners/luban/body.jpg', en: "The body collection", ar: "مجموعة الجسم", depts: [] },
      { id: "body-lotion", img: '/images/partners/luban/body-lotion.jpg', en: "Frankincense Body Lotion, 240 ml", ar: "لوشن الجسم باللبان، ٢٤٠ مل", depts: [], product: "luban-body-lotion" },
      { id: "body-butter", img: '/images/partners/luban/body-butter.jpg', en: "Frankincense Body Butter, 120 ml", ar: "زبدة الجسم باللبان، ١٢٠ مل", depts: [], product: "luban-body-butter" },
      { id: "shower-gel", img: '/images/partners/luban/shower-gel.jpg', en: "Frankincense Shower Gel, 240 ml", ar: "جل الاستحمام باللبان، ٢٤٠ مل", depts: [], product: "luban-shower-gel" },
      { id: "hand-wash", img: '/images/partners/luban/hand-wash.jpg', en: "Frankincense Hand Wash, 250 ml", ar: "غسول اليدين باللبان، ٢٥٠ مل", depts: [], product: "luban-hand-wash" },
      { id: "hand-moisturiser", img: '/images/partners/luban/hand-moisturiser.jpg', en: "Frankincense Hand Moisturiser, 250 ml", ar: "مرطّب اليدين باللبان، ٢٥٠ مل", depts: [], product: "luban-hand-moisturiser" },
      { id: "hair", img: '/images/partners/luban/hair.jpg', en: "The hair collection", ar: "مجموعة الشعر", depts: [] },
      { id: "shampoo", img: '/images/partners/luban/shampoo.jpg', en: "Frankincense Shampoo, 240 ml", ar: "شامبو باللبان، ٢٤٠ مل", depts: [], product: "luban-shampoo" },
      { id: "conditioner", img: '/images/partners/luban/conditioner.jpg', en: "Frankincense Conditioner, 225 ml", ar: "بلسم الشعر باللبان، ٢٢٥ مل", depts: [], product: "luban-conditioner" },
      { id: "aroma", img: '/images/partners/luban/aroma.jpg', en: "Aromatics", ar: "العطور المنزلية", depts: [] },
      { id: "essential-oil-30", img: '/images/partners/luban/essential-oil-30.jpg', en: "Frankincense Essential Oil, 30 ml", ar: "زيت اللبان العطري، ٣٠ مل", depts: ["oud-and-fragrance"], product: "luban-essential-oil-30" },
      { id: "essential-oil-10", img: '/images/partners/luban/essential-oil-10.jpg', en: "Frankincense Essential Oil, 10 ml", ar: "زيت اللبان العطري، ١٠ مل", depts: [], product: "luban-essential-oil-10" },
      { id: "oil-burner", img: '/images/partners/luban/oil-burner.jpg', en: "Aromatic Oil Burner set", ar: "طقم مبخرة الزيت العطري", depts: ["oud-and-fragrance"], product: "luban-oil-burner" },
      { id: "resins", img: '/images/partners/luban/resins.jpg', en: "Hojari Frankincense Resins, 250 g", ar: "حبّات اللبان الحوجري، ٢٥٠ غ", depts: ["oud-and-fragrance", "prayer"], product: "luban-resins" },
      { id: "resin-box", img: '/images/partners/luban/resin-box.jpg', en: "Frankincense Resin in a gift box, 250 g", ar: "لبان في علبة هدايا، ٢٥٠ غ", depts: [], product: "luban-resin-box" },
      { id: "drinkable-oil", img: '/images/partners/luban/drinkable-oil.jpg', en: "Drinkable Frankincense Oil, 30 ml", ar: "زيت اللبان للشرب، ٣٠ مل", depts: [], product: "luban-drinkable-oil" },
      { id: "boxes", img: '/images/partners/luban/boxes.jpg', en: "The gift box collection", ar: "مجموعة علب الهدايا", depts: [] },
      { id: "box-faves", img: '/images/partners/luban/box-faves.jpg', en: "Luban's Faves gift box", ar: "علبة هدايا مفضّلات لُبان", depts: [], product: "luban-box-faves" },
      { id: "box-body", img: '/images/partners/luban/box-body.jpg', en: "Body Hydration gift box", ar: "علبة هدايا ترطيب الجسم", depts: [], product: "luban-box-body" },
      { id: "box-hair", img: '/images/partners/luban/box-hair.jpg', en: "Hair Nourishing gift box", ar: "علبة هدايا تغذية الشعر", depts: [], product: "luban-box-hair" },
      { id: "box-face-lips", img: '/images/partners/luban/box-face-lips.jpg', en: "Face & Lips gift box", ar: "علبة هدايا الوجه والشفاه", depts: [], product: "luban-box-face-lips" },
      { id: "box-men", img: '/images/partners/luban/box-men.jpg', en: "Men's Box", ar: "علبة الرجال", depts: ["jewellery-for-him"], product: "luban-box-men" },
      { id: "landscape", img: '/images/partners/luban/landscape.jpg', en: "Frankincense trees of Dhofar", ar: "أشجار اللبان في ظفار", depts: [] },
    ],
  },
  {
    slug: "kajal", name: "Kajal", nameAr: "كاجال", site: "https://kajalperfumes.com", blurb: 'pbKajal',
    catalogueBrand: "Kajal",
    items: [
      { id: "lamar-noir", img: '/images/partners/kajal/lamar-noir.jpg', en: "Lamar Noir, extrait de parfum", ar: "لمار نوار، خلاصة عطر", depts: ["oud-and-fragrance"], product: "kajal-lamar-noir" },
      { id: "dahab-absolu", img: '/images/partners/kajal/dahab-absolu.jpg', en: "Dahab Absolu, extrait de parfum", ar: "ذهب أبسولو، خلاصة عطر", depts: ["oud-and-fragrance"], product: "kajal-dahab-absolu" },
      { id: "aican", img: '/images/partners/kajal/aican.jpg', en: "\u00c4ican, eau de parfum", ar: "إيقان، ماء عطر", depts: ["oud-and-fragrance"], product: "kajal-aican" },
      { id: "kolada", img: '/images/partners/kajal/kolada.jpg', en: "Kolada, extrait de parfum", ar: "كولادا، خلاصة عطر", depts: [], product: "kajal-kolada" },
      { id: "lamar-caviar", img: '/images/partners/kajal/lamar-caviar.jpg', en: "Lamar Caviar, perfume d'eau", ar: "لمار كافيار، عطر مائي", depts: ["oud-and-fragrance"], product: "kajal-lamar-caviar" },
      { id: "topaz", img: '/images/partners/kajal/topaz.jpg', en: "Topaz, eau de parfum", ar: "توباز، ماء عطر", depts: [], product: "kajal-topaz" },
      { id: "ruby", img: '/images/partners/kajal/ruby.jpg', en: "Ruby, eau de parfum", ar: "روبي، ماء عطر", depts: [], product: "kajal-ruby" },
      { id: "joorie", img: '/images/partners/kajal/joorie.jpg', en: "Joorie, eau de parfum", ar: "جوري، ماء عطر", depts: [], product: "kajal-joorie" },
      { id: "lamar", img: '/images/partners/kajal/lamar.jpg', en: "Lamar, eau de parfum", ar: "لمار، ماء عطر", depts: [], product: "kajal-lamar" },
      { id: "dahab", img: '/images/partners/kajal/dahab.jpg', en: "Dahab, eau de parfum", ar: "ذهب، ماء عطر", depts: [], product: "kajal-dahab" },
      { id: "kajal-v", img: '/images/partners/kajal/kajal-v.jpg', en: "Kajal V, eau de parfum", ar: "كاجال V، ماء عطر", depts: [], product: "kajal-kajal-v" },
      { id: "whispering-oud", img: '/images/partners/kajal/whispering-oud.jpg', en: "The Whispering Oud, extrait de parfum", ar: "العود الهامس، خلاصة عطر", depts: [], product: "kajal-whispering-oud" },
    ],
  },
  {
    slug: "ahmed-al-maghribi", name: "Ahmed Al Maghribi", nameAr: "أحمد المغربي", site: "https://ahmedalmaghribi.com", blurb: 'pbAhmedAlMaghribi',
    catalogueBrand: "Ahmed Al Maghribi",
    items: [
    ],
  },
  {
    slug: "amouage", name: "Amouage", nameAr: "أمواج", site: "https://amouage.com", blurb: 'pbAmouage',
    catalogueBrand: "Amouage",
    items: [
      { id: "oud-ulya", img: '/images/partners/amouage/oud-ulya.jpg', en: "Oud Ulya attar", ar: "عطر عود عُليا", depts: ["oud-and-fragrance"], product: "amouage-oud-ulya" },
      { id: "opus-xiii", img: '/images/partners/amouage/opus-xiii.jpg', en: "Opus XIII Silver Oud", ar: "أوبوس ١٣ سيلفر عود", depts: ["oud-and-fragrance", "jewellery-for-him"], product: "amouage-opus-xiii" },
      { id: "reflection-45", img: '/images/partners/amouage/reflection-45.jpg', en: "Reflection 45", ar: "ريفليكشن ٤٥", depts: ["oud-and-fragrance"], product: "amouage-reflection-45" },
    ],
  },
  {
    slug: "kiswah-jewellery", name: "Kiswah Jewellery", nameAr: "مجوهرات كسوة", site: "https://kiswahjewellery.com", blurb: 'pbKiswahJewellery',
    catalogueBrand: "Kiswah Jewellery",
    items: [
      { id: "necklace", img: '/images/partners/kiswah-jewellery/necklace.jpg', en: "Pendant with Kaaba Kiswah thread", ar: "قلادة بخيط من كسوة الكعبة", depts: ["jewellery-for-her"], onRequest: true },
      { id: "bracelet", img: '/images/partners/kiswah-jewellery/bracelet.jpg', en: "Bracelet with Kaaba Kiswah thread", ar: "سوار بخيط من كسوة الكعبة", depts: ["jewellery-for-her"], onRequest: true },
      { id: "rings", img: '/images/partners/kiswah-jewellery/rings.jpg', en: "Ring with Kaaba Kiswah thread", ar: "خاتم بخيط من كسوة الكعبة", depts: ["jewellery-for-her"], onRequest: true },
      { id: "necklaces", img: '/images/partners/kiswah-jewellery/necklaces.jpg', en: "The necklace collection", ar: "مجموعة القلائد", depts: ["jewellery-for-her"] },
      { id: "bracelets", img: '/images/partners/kiswah-jewellery/bracelets.jpg', en: "The bracelet collection", ar: "مجموعة الأساور", depts: [] },
      { id: "kiswa", img: '/images/partners/kiswah-jewellery/kiswa.jpg', en: "The Kiswah of the Kaaba", ar: "كسوة الكعبة المشرفة", depts: [] },
    ],
  },
  {
    slug: "lomar", name: "Lomar", nameAr: "لومار", site: "https://lomar.sa", blurb: 'pbLomar',
    catalogueBrand: "Lomar",
    items: [
      { id: "thobe-oud", img: '/images/partners/lomar/thobe-oud.jpg', en: "The Oud thobe", ar: "ثوب العود", depts: ["modest-style"], product: "lomar-thobe-oud" },
      { id: "thobe-business-secret", img: '/images/partners/lomar/thobe-business-secret.jpg', en: "Business Secret thobe, white", ar: "ثوب بزنس سيكريت، أبيض", depts: ["modest-style"], product: "lomar-thobe-business-secret" },
      { id: "thobe-business-navy", img: '/images/partners/lomar/thobe-business-navy.jpg', en: "Business Secret thobe, navy", ar: "ثوب بزنس سيكريت، كحلي", depts: ["modest-style"], product: "lomar-thobe-business-navy" },
      { id: "thobe-business-circle", img: '/images/partners/lomar/thobe-business-circle.jpg', en: "Business Circle thobe", ar: "ثوب بيزنس سيركل", depts: ["modest-style"], product: "lomar-thobe-business-circle" },
      { id: "thobe-qaitan", img: '/images/partners/lomar/thobe-qaitan.jpg', en: "Qaitan thobe", ar: "ثوب القيطان", depts: ["modest-style"], product: "lomar-thobe-qaitan" },
      { id: "thobe-black", img: '/images/partners/lomar/thobe-black.jpg', en: "Linen thobe", ar: "ثوب لينين", depts: ["modest-style"], product: "lomar-thobe-black" },
      { id: "shemagh-red", img: '/images/partners/lomar/shemagh-red.jpg', en: "Al Shaer shemagh, red", ar: "شماغ الشاعر، أحمر", depts: ["modest-style", "jewellery-for-him"], product: "lomar-shemagh-red" },
      { id: "shemagh-white", img: '/images/partners/lomar/shemagh-white.jpg', en: "Al Shaer ghutra, white", ar: "شماغ الشاعر، أبيض", depts: ["modest-style"], product: "lomar-shemagh-white" },
      { id: "agal", img: '/images/partners/lomar/agal.jpg', en: "Lomar premium agal", ar: "عقال لومار فاخر", depts: ["modest-style", "jewellery-for-him"], product: "lomar-agal" },
      { id: "misbaha-lapis", img: '/images/partners/lomar/misbaha-lapis.jpg', en: "Misbaha No. 2", ar: "سبحة لومار رقم ٢", depts: ["jewellery-for-him"], product: "lomar-misbaha-lapis" },
      { id: "misbaha-quartz", img: '/images/partners/lomar/misbaha-quartz.jpg', en: "Misbaha No. 8", ar: "سبحة لومار رقم ٨", depts: ["jewellery-for-him"], product: "lomar-misbaha-quartz" },
      { id: "business-bag", img: '/images/partners/lomar/business-bag.jpg', en: "Multi-use business bag", ar: "شنطة أعمال متعددة الاستخدام", depts: ["jewellery-for-him"], product: "lomar-business-bag" },
      { id: "logo-bag", img: '/images/partners/lomar/logo-bag.jpg', en: "Lomar monogram bag", ar: "شنطة بشعار لومار", depts: [], product: "lomar-logo-bag" },
      { id: "wallet", img: '/images/partners/lomar/wallet.jpg', en: "Leather wallet", ar: "محفظة جلدية", depts: ["jewellery-for-him"], product: "lomar-wallet" },
      { id: "elegance", img: '/images/partners/lomar/elegance.jpg', en: "Elegance perfume", ar: "عطر إليغانس", depts: ["oud-and-fragrance"], product: "lomar-elegance" },
    ],
  },
  {
    slug: "salam-gifts", name: "Salam Gifts", nameAr: "هدايا سلام", site: "https://salamgifts.net", blurb: 'pbSalamGifts',
    catalogueBrand: "Salam Gifts",
    items: [
      { id: "gift-box-men", img: '/images/partners/salam-gifts/gift-box-men.jpg', en: "Atyab Al Dhikr gift box for him", ar: "هدية بوكس أطيب الذكر للرجال", depts: ["prayer", "jewellery-for-him"], product: "salam-gifts-gift-box-men" },
      { id: "gift-box-women", img: '/images/partners/salam-gifts/gift-box-women.jpg', en: "Atyab Al Dhikr gift box for her", ar: "هدية بوكس أطيب الذكر للنساء", depts: ["prayer", "jewellery-for-her"], product: "salam-gifts-gift-box-women" },
      { id: "mushaf-asma", img: '/images/partners/salam-gifts/mushaf-asma.jpg', en: "Mushaf with the 99 Names cover", ar: "هدية مصحف مع غلاف أسماء الله الحسنى", depts: ["prayer"], product: "salam-gifts-mushaf-asma" },
      { id: "mushaf-leather", img: '/images/partners/salam-gifts/mushaf-leather.jpg', en: "Mushaf in a leather cover", ar: "هدية مصحف مع غلاف جلد", depts: [], product: "salam-gifts-mushaf-leather" },
      { id: "misbaha-dome", img: '/images/partners/salam-gifts/misbaha-dome.jpg', en: "Moving Dome misbaha, wood, 99", ar: "سبحة القبة المتحركة 99، خشبي", depts: ["prayer"], product: "salam-gifts-misbaha-dome" },
      { id: "misbaha-qindeel", img: '/images/partners/salam-gifts/misbaha-qindeel.jpg', en: "Silver Qindeel misbaha, 33", ar: "سبحة القنديل الفضي 33", depts: [], product: "salam-gifts-misbaha-qindeel" },
      { id: "misbaha-madinah", img: '/images/partners/salam-gifts/misbaha-madinah.jpg', en: "Scent of Madinah misbaha, 99", ar: "سبحة من رائحة المدينة 99", depts: [], product: "salam-gifts-misbaha-madinah" },
      { id: "rug-nabawi", img: '/images/partners/salam-gifts/rug-nabawi.jpg', en: "Prophet's Mosque entrance prayer rug", ar: "سجادة صلاة مدخل المسجد النبوي", depts: ["prayer"], product: "salam-gifts-rug-nabawi" },
      { id: "rug-black-stone", img: '/images/partners/salam-gifts/rug-black-stone.jpg', en: "Black Stone prayer rug", ar: "سجادة سلام الحجر الأسود", depts: ["prayer"], product: "salam-gifts-rug-black-stone" },
      { id: "rug-kaaba", img: '/images/partners/salam-gifts/rug-kaaba.jpg', en: "Kaaba curtain prayer rug", ar: "سجادة ستار الكعبة", depts: [], product: "salam-gifts-rug-kaaba" },
      { id: "rug-dome", img: '/images/partners/salam-gifts/rug-dome.jpg', en: "Mosque dome prayer rug", ar: "سجادة صلاة قبة المسجد", depts: [], product: "salam-gifts-rug-dome" },
      { id: "makki-scent", img: '/images/partners/salam-gifts/makki-scent.jpg', en: "Makki room scent, the scent of the Haram", ar: "معطر مكي، رائحة الحرم", depts: ["oud-and-fragrance"], product: "salam-gifts-makki-scent" },
    ],
  },
  {
    slug: "royal-selangor", name: "Royal Selangor", nameAr: "رويال سيلانجور", site: "https://www.royalselangor.com", blurb: 'pbRoyalSelangor',
    catalogueBrand: "Royal Selangor",
    items: [
      { id: "atiya-vase", img: '/images/partners/royal-selangor/atiya-vase.jpg', en: "Atiya vase", ar: "مزهرية عطية", depts: ["art-and-home"], product: "royal-selangor-atiya-vase" },
      { id: "rs-2", img: '/images/partners/royal-selangor/rs-2.jpg', en: "Atiya container", ar: "علبة عطية", depts: [], product: "royal-selangor-rs-2" },
      { id: "rs-4", img: '/images/partners/royal-selangor/rs-4.jpg', en: "Atiya plate, large", ar: "طبق عطية، كبير", depts: [], product: "royal-selangor-rs-4" },
    ],
  },
  {
    slug: "rihal", name: "Rihal", nameAr: "رحّال", site: "https://rihal.sa", blurb: 'pbRihal',
    catalogueBrand: "Rihal",
    items: [
      { id: "kaaba-door-rug", img: '/images/partners/rihal/kaaba-door-rug.jpg', en: "Kaaba Door silk wall prayer rug", ar: "سجادة جدارية لباب الكعبة المشرفة (حرير)", depts: ["prayer"], product: "rihal-kaaba-door-rug" },
      { id: "haram-rug", img: '/images/partners/rihal/haram-rug.jpg', en: "In the Haram silk prayer rug", ar: "سجادة في الحرم (حرير)", depts: ["prayer"], product: "rihal-haram-rug" },
      { id: "rawdah-rug", img: '/images/partners/rihal/rawdah-rug.jpg', en: "Edge of the Rawdah silk prayer rug", ar: "سجادة حدود الروضة (حرير)", depts: ["prayer"], product: "rihal-rawdah-rug" },
      { id: "mihrab-rug", img: '/images/partners/rihal/mihrab-rug.jpg', en: "Mihrab of the Rawdah silk prayer rug", ar: "سجادة محراب الروضة الشريفة (حرير)", depts: [], product: "rihal-mihrab-rug" },
      { id: "misbaha-door", img: '/images/partners/rihal/misbaha-door.jpg', en: "Prophet's Mosque Door misbaha, large", ar: "سبحة باب المسجد النبوي (كبيرة)", depts: ["prayer", "jewellery-for-him"], product: "rihal-misbaha-door" },
      { id: "misbaha-malachite", img: '/images/partners/rihal/misbaha-malachite.jpg', en: "Prophet's Mosque Door misbaha, malachite", ar: "سبحة باب المسجد النبوي (ملاكايت)", depts: ["prayer"], product: "rihal-misbaha-malachite" },
      { id: "misbaha-minaret", img: '/images/partners/rihal/misbaha-minaret.jpg', en: "Minaret misbaha", ar: "سبحة المئذنة", depts: [], product: "rihal-misbaha-minaret" },
      { id: "misbaha-agate", img: '/images/partners/rihal/misbaha-agate.jpg', en: "Black Stone misbaha, black agate", ar: "سبحة الحجر الأسود (بالعقيق الأسود)", depts: ["jewellery-for-him"], product: "rihal-misbaha-agate" },
      { id: "misbaha-qindeel-gold", img: '/images/partners/rihal/misbaha-qindeel-gold.jpg', en: "Kaaba Qindeel misbaha, gold-plated silver", ar: "سبحة قنديل الكعبة المشرفة (فضة مطلية بالذهب)", depts: ["jewellery-for-her"], product: "rihal-misbaha-qindeel-gold" },
      { id: "misbaha-qindeel-silver", img: '/images/partners/rihal/misbaha-qindeel-silver.jpg', en: "Kaaba Qindeel misbaha, silver", ar: "سبحة قنديل الكعبة المشرفة (فضة)", depts: [], product: "rihal-misbaha-qindeel-silver" },
      { id: "kaaba-wall", img: '/images/partners/rihal/kaaba-wall.jpg', en: "Kaaba wall model", ar: "مجسم جدار الكعبة المشرفة", depts: ["art-and-home"], product: "rihal-kaaba-wall" },
      { id: "bab-al-salam", img: '/images/partners/rihal/bab-al-salam.jpg', en: "Bab Al Salam model", ar: "مجسم باب السلام (كامل)", depts: ["art-and-home"], product: "rihal-bab-al-salam" },
      { id: "bab-al-rahma", img: '/images/partners/rihal/bab-al-rahma.jpg', en: "Bab Al Rahma model, large", ar: "مجسم باب الرحمة (كبير)", depts: [], product: "rihal-bab-al-rahma" },
      { id: "prophets-mosque-door", img: '/images/partners/rihal/prophets-mosque-door.jpg', en: "Prophet's Mosque door model, large", ar: "مجسم باب المسجد النبوي (كبير)", depts: [], product: "rihal-prophets-mosque-door" },
      { id: "muwajaha", img: '/images/partners/rihal/muwajaha.jpg', en: "Al Muwajaha Al Sharifa model", ar: "مجسم المواجهة الشريفة", depts: ["art-and-home"], product: "rihal-muwajaha" },
      { id: "mizab", img: '/images/partners/rihal/mizab.jpg', en: "Mizab of the Kaaba with Kiswa, large", ar: "مجسم ميزاب الكعبة المشرفة بالكسوة (مقاس كبير)", depts: [], product: "rihal-mizab" },
      { id: "mushaf-stand", img: '/images/partners/rihal/mushaf-stand.jpg', en: "Mushaf bound in Kiswa, with stand", ar: "مصحف بالكسوة مع حامل مصحف (حجم كبير)", depts: ["prayer"], product: "rihal-mushaf-stand" },
      { id: "mushaf-kiswa", img: '/images/partners/rihal/mushaf-kiswa.jpg', en: "Mushaf bound in Kiswa, large", ar: "مصحف بالكسوة (حجم كبير)", depts: [], product: "rihal-mushaf-kiswa" },
      { id: "mushaf-hujra", img: '/images/partners/rihal/mushaf-hujra.jpg', en: "Mushaf covered in the Hujra Sharifa fabric", ar: "مصحف بكسوة الحجرة الشريفة", depts: [], product: "rihal-mushaf-hujra" },
    ],
  },
  {
    slug: "chopard", name: "Chopard", nameAr: "شوبارد", site: "https://www.chopard.com", blurb: 'pbChopard',
    catalogueBrand: "Chopard",
    items: [
      { id: "alpine-eagle-gold", img: '/images/partners/chopard/alpine-eagle-gold.jpg', en: "Alpine Eagle 41, gold-tone dial", ar: "ألباين إيغل ٤١، بميناء ذهبي", depts: ["jewellery-for-him"], product: "chopard-alpine-eagle-gold" },
      { id: "alpine-eagle-steel", img: '/images/partners/chopard/alpine-eagle-steel.jpg', en: "Alpine Eagle 41, blue dial", ar: "ألباين إيغل ٤١، بميناء أزرق", depts: ["jewellery-for-him"], product: "chopard-alpine-eagle-steel" },
      { id: "alpine-eagle-rose", img: '/images/partners/chopard/alpine-eagle-rose.jpg', en: "Alpine Eagle 41, rose gold, blue dial", ar: "ألباين إيغل ٤١، ذهب وردي بميناء أزرق", depts: ["jewellery-for-him"], product: "chopard-alpine-eagle-rose" },
      { id: "alpine-eagle-two-tone", img: '/images/partners/chopard/alpine-eagle-two-tone.jpg', en: "Alpine Eagle 41, steel and rose gold", ar: "ألباين إيغل ٤١، فولاذ وذهب وردي", depts: ["jewellery-for-him"], product: "chopard-alpine-eagle-two-tone" },
      { id: "alpine-eagle-green", img: '/images/partners/chopard/alpine-eagle-green.jpg', en: "Alpine Eagle 41, green dial", ar: "ألباين إيغل ٤١، بميناء أخضر", depts: ["jewellery-for-him"], product: "chopard-alpine-eagle-green" },
      { id: "alpine-eagle-grey", img: '/images/partners/chopard/alpine-eagle-grey.jpg', en: "Alpine Eagle 41, grey dial", ar: "ألباين إيغل ٤١، بميناء رمادي", depts: ["jewellery-for-him"], product: "chopard-alpine-eagle-grey" },
      { id: "luc-1860", img: '/images/partners/chopard/luc-1860.jpg', en: "L.U.C XPS", ar: "إل.يو.سي XPS", depts: ["jewellery-for-him"], product: "chopard-luc-1860" },
      { id: "mille-miglia-black", img: '/images/partners/chopard/mille-miglia-black.jpg', en: "Mille Miglia Classic chronograph", ar: "ميل ميليا كلاسيك كرونوغراف", depts: ["jewellery-for-him"], product: "chopard-mille-miglia-black" },
      { id: "pen-classic-black", img: '/images/partners/chopard/pen-classic-black.jpg', en: "Classic rollerball pen", ar: "قلم كلاسيك رولربول", depts: ["jewellery-for-him"], product: "chopard-pen-classic-black" },
      { id: "pen-silver", img: '/images/partners/chopard/pen-silver.jpg', en: "Classic ballpoint pen, silver", ar: "قلم كلاسيك حبر جاف، فضي", depts: ["jewellery-for-him"], product: "chopard-pen-silver" },
      { id: "pen-rose-gold", img: '/images/partners/chopard/pen-rose-gold.jpg', en: "Classic ballpoint pen, rose gold", ar: "قلم كلاسيك حبر جاف، ذهبي وردي", depts: ["jewellery-for-him"], product: "chopard-pen-rose-gold" },
      { id: "alpine-eagle-rainbow", img: '/images/partners/chopard/alpine-eagle-rainbow.jpg', en: "Alpine Eagle, diamonds and rainbow sapphires", ar: "ألباين إيغل، ألماس وياقوت بألوان قوس قزح", depts: ["jewellery-for-her"], product: "chopard-alpine-eagle-rainbow" },
      { id: "alpine-eagle-36", img: '/images/partners/chopard/alpine-eagle-36.jpg', en: "Alpine Eagle 36, blue dial", ar: "ألباين إيغل ٣٦، بميناء أزرق", depts: ["jewellery-for-her"], product: "chopard-alpine-eagle-36" },
      { id: "happy-hearts-pendant", img: '/images/partners/chopard/happy-hearts-pendant.jpg', en: "Happy Hearts pendant", ar: "قلادة هابي هارتس", depts: ["jewellery-for-her"], product: "chopard-happy-hearts-pendant" },
      { id: "my-happy-hearts", img: '/images/partners/chopard/my-happy-hearts.jpg', en: "My Happy Hearts necklace", ar: "عقد ماي هابي هارتس", depts: ["jewellery-for-her"], product: "chopard-my-happy-hearts" },
      { id: "happy-hearts", img: '/images/partners/chopard/happy-hearts.jpg', en: "Happy Hearts", ar: "هابي هارتس", depts: ["jewellery-for-her"], product: "chopard-happy-hearts" },
    ],
  },
  {
    slug: "bateel", name: "Bateel", nameAr: "بتيل", site: "https://bateel.com", blurb: 'pbBateel',
    catalogueBrand: "Bateel",
    items: [
      { id: "signature", img: '/images/partners/bateel/signature.jpg', en: "Signature Collection", ar: "مجموعة سيغنتشر", depts: ["dates-and-gourmet"], product: "bateel-signature" },
      { id: "palm", img: '/images/partners/bateel/palm.jpg', en: "Palm gift set", ar: "طقم هدايا بالم", depts: ["dates-and-gourmet"], product: "bateel-palm" },
    ],
  },
  {
    slug: "kashida", name: "Kashida", nameAr: "كشيدة", site: "https://www.kashidadesign.com", blurb: 'pbKashida',
    catalogueBrand: "Kashida",
    items: [
      { id: "al-iman", img: '/images/partners/kashida/al-iman.jpg', en: "Al Iman (Faith) wall piece", ar: "لوحة الإيمان الجدارية", depts: ["art-and-home"], product: "kashida-al-iman" },
      { id: "allahu-akbar", img: '/images/partners/kashida/allahu-akbar.jpg', en: "Allahu Akbar wall art", ar: "لوحة الله أكبر الجدارية", depts: ["art-and-home"], product: "kashida-allahu-akbar" },
      { id: "99-names", img: '/images/partners/kashida/99-names.jpg', en: "The 99 Names of Allah, contemporary edition", ar: "أسماء الله الحسنى، إصدار معاصر", depts: ["art-and-home"], product: "kashida-99-names" },
      { id: "watch-box", img: '/images/partners/kashida/watch-box.jpg', en: "Personalised watch box with Arabic calligraphy", ar: "صندوق ساعات مخصّص بالخط العربي", depts: ["jewellery-for-him"], product: "kashida-watch-box" },
      { id: "calligraffiti-cups", img: '/images/partners/kashida/calligraffiti-cups.jpg', en: "Calligraffiti glasses", ar: "أكواب كاليغرافيتي", depts: ["dates-and-gourmet"], product: "kashida-calligraffiti-cups" },
      { id: "brushstrokes-cups", img: '/images/partners/kashida/brushstrokes-cups.jpg', en: "Emirates Brushstrokes coffee cups", ar: "فناجين ضربات فرشاة الإمارات", depts: ["dates-and-gourmet"], product: "kashida-brushstrokes-cups" },
      { id: "mushaf-holder", img: '/images/partners/kashida/mushaf-holder.jpg', en: "Al Kareem mushaf holder", ar: "حامل المصحف الكريم", depts: ["prayer"], product: "kashida-mushaf-holder" },
      { id: "name-bookends", img: '/images/partners/kashida/name-bookends.jpg', en: "Name bookends", ar: "مساند كتب بالأسماء", depts: ["art-and-home"], product: "kashida-name-bookends" },
    ],
  },
  {
    slug: "orient-499", name: "Orient 499", nameAr: "أورينت ٤٩٩", site: "https://orient499.com", blurb: 'pbOrient499',
    catalogueBrand: "Orient 499",
    items: [
      { id: "leather-tassel", img: '/images/partners/orient-499/leather-tassel.jpg', en: "Camel hair and leather abaya", ar: "عباية من وبر الجمل والجلد", depts: ["modest-style"], product: "orient-499-leather-tassel" },
      { id: "tareq-gold", img: '/images/partners/orient-499/tareq-gold.jpg', en: "Tareq gold cotton abaya", ar: "عباية طارق القطنية الذهبية", depts: ["modest-style"], product: "orient-499-tareq-gold" },
      { id: "poncho", img: '/images/partners/orient-499/poncho.jpg', en: "Cashmere poncho", ar: "بونشو من الكشمير", depts: ["modest-style"], product: "orient-499-poncho" },
      { id: "tarbouch", img: '/images/partners/orient-499/tarbouch.jpg', en: "Mini tarbouch box", ar: "علبة الطربوش الصغيرة", depts: ["art-and-home"], product: "orient-499-tarbouch" },
    ],
  },
  {
    slug: "teeb-made", name: "Teeb Made", nameAr: "طيب ميد", site: "https://www.teebmade.com", blurb: 'pbTeebMade',
    catalogueBrand: "Teeb Made",
    items: [
      { id: "harrat-diffuser", img: '/images/partners/teeb-made/harrat-diffuser.jpg', en: "Harrat basalt diffuser and incense burner", ar: "مبخرة وفوّاحة حرّات من البازلت", depts: ["oud-and-fragrance"], product: "teeb-made-harrat-diffuser" },
      { id: "harrat-date-server", img: '/images/partners/teeb-made/harrat-date-server.jpg', en: "Harrat stone date server", ar: "طبق تمر حرّات من الحجر", depts: ["dates-and-gourmet"], product: "teeb-made-harrat-date-server" },
      { id: "bloom-tray", img: '/images/partners/teeb-made/bloom-tray.jpg', en: "Bloom floral tray", ar: "صينية بلوم المزهرة", depts: ["art-and-home"], product: "teeb-made-bloom-tray" },
      { id: "prayer-mat", img: '/images/partners/teeb-made/prayer-mat.jpg', en: "The Prayer Mat", ar: "سجادة الصلاة", depts: ["prayer"], product: "teeb-made-prayer-mat" },
      { id: "door-clutch", img: '/images/partners/teeb-made/door-clutch.jpg', en: "Saudi Door clutch", ar: "حقيبة الباب السعودي", depts: ["jewellery-for-her"], product: "teeb-made-door-clutch" },
    ],
  },
  {
    slug: "mirzam", name: "Mirzam", nameAr: "مِرزم", site: "https://mirzam.com", blurb: 'pbMirzam',
    catalogueBrand: "Mirzam",
    items: [
      { id: "captain", img: '/images/partners/mirzam/captain.jpg', en: "The Captain's Treasure Box", ar: "صندوق كنز القبطان", depts: ["dates-and-gourmet"], product: "mirzam-captain" },
      { id: "abu-dhabi", img: '/images/partners/mirzam/abu-dhabi.jpg', en: "Abu Dhabi Treasure Box", ar: "صندوق كنز أبوظبي", depts: ["dates-and-gourmet"], product: "mirzam-abu-dhabi" },
      { id: "crescent", img: '/images/partners/mirzam/crescent.jpg', en: "Crescent bites tray", ar: "صينية الهلال", depts: [], product: "mirzam-crescent" },
      { id: "nakhuda", img: '/images/partners/mirzam/nakhuda.jpg', en: "Nakhuda's Treasure Box", ar: "صندوق كنز النوخذة", depts: [], product: "mirzam-nakhuda" },
    ],
  },
  {
    slug: "silsal", name: "Silsal", nameAr: "سلسال", site: "https://silsal.com", blurb: 'pbSilsal',
    catalogueBrand: "Silsal",
    items: [
      { id: "tamrah", img: '/images/partners/silsal/tamrah.jpg', en: "Tamrah dallah and cups, by Razan Alazzouni", ar: "دلّة وفناجين تمرة، بتصميم رزان العزوني", depts: ["dates-and-gourmet"], product: "silsal-tamrah" },
    ],
  },
  {
    slug: "sinwan", name: "Sinwan", nameAr: "صنوان", site: "https://floward.com", blurb: 'pbSinwan',
    catalogueBrand: "Sinwan",
    items: [
    ],
  },
  {
    slug: "ahlan", name: "Ahlan", nameAr: "أهلاً", site: "https://www.ahlandates.com", blurb: 'pbAhlan',
    catalogueBrand: "Ahlan",
    items: [
      { id: "safawi", img: '/images/partners/ahlan/safawi.jpg', en: "Safawi dates gift box", ar: "علبة تمر صفاوي للإهداء", depts: ["dates-and-gourmet"], product: "ahlan-safawi" },
    ],
  },
  {
    slug: "assouline", name: "Assouline", nameAr: "أسولين", site: "https://www.assouline.com", blurb: 'pbAssouline',
    catalogueBrand: "Assouline",
    items: [
      { id: "alula", img: '/images/partners/assouline/alula.jpg', en: "AlUla Ever", ar: "العُلا إلى الأبد", depts: ["art-and-home"], product: "assouline-alula" },
    ],
  },
  {
    slug: "loro-piana", name: "Loro Piana", nameAr: "لورو بيانا", site: "https://www.loropiana.com", blurb: 'pbLoroPiana',
    catalogueBrand: "Loro Piana",
    items: [
    ],
  },
  {
    slug: "ranavat", name: "Ranavat", nameAr: "راناڤات", site: "https://www.ranavat.com", blurb: 'pbRanavat',
    catalogueBrand: "Ranavat",
    items: [
      { id: "saffron", img: '/images/partners/ranavat/saffron.jpg', en: "Brightening saffron serum", ar: "سيروم الزعفران", depts: ["oud-and-fragrance"], product: "ranavat-saffron" },
    ],
  },
];

export const partnerHref = (slug: string): Href => ({ pathname: '/brands/[slug]', params: { slug } });

export const partnerBySlug = (slug: string): Partner | undefined => PARTNERS.find((p) => p.slug === slug);

/** Partner pieces that belong in a department, with their house. */
export const partnerItemsFor = (dept: string): (PartnerItem & { partner: Partner })[] =>
  PARTNERS.flatMap((p) => p.items.filter((i) => i.depts.includes(dept)).map((i) => ({ ...i, partner: p })));

/** The cover photograph of a house: its first piece, or a product photo for houses listed only in the catalogue. */
// A house is listed only when it has something to show: photographs or pieces in our store.
export const houseIsShown = (p: Partner): boolean =>
  p.items.length > 0 || (!!p.catalogueBrand && snapshot.products.some((x) => x.brand === p.catalogueBrand));

export const partnerCover = (p: Partner): string | undefined => p.items[0]?.img;
