// The partner houses of Al Mukarramah (confirmed by the founder, 5 November 2026).
// Each has its own page (/brands/[slug]) with its photographs, and its pieces also appear in the departments they
// belong to. Photographs are the partners' own, used under our agreements with them. Item names are given in English
// and Arabic; the house descriptions live in src/lib/i18n.tsx (keys pb…).
// Generated from the partner image spec; images are in public/images/partners/<slug>/.
import type { Href } from 'expo-router';
import type { Key } from './i18n';

export type PartnerItem = { id: string; img: string; en: string; ar: string; depts: string[] };
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
      { id: "face-essentials", img: '/images/partners/luban/face-essentials.jpg', en: "Face Essentials gift box", ar: "علبة هدايا أساسيات الوجه", depts: ["oud-and-fragrance"] },
      { id: "day-cream", img: '/images/partners/luban/day-cream.jpg', en: "Frankincense Day Cream, 50 ml", ar: "كريم النهار باللبان، ٥٠ مل", depts: [] },
      { id: "night-cream", img: '/images/partners/luban/night-cream.jpg', en: "Frankincense Night Cream, 50 ml", ar: "كريم الليل باللبان، ٥٠ مل", depts: [] },
      { id: "eye-cream", img: '/images/partners/luban/eye-cream.jpg', en: "Frankincense Eye Cream, 20 ml", ar: "كريم العين باللبان، ٢٠ مل", depts: [] },
      { id: "face-oil", img: '/images/partners/luban/face-oil.jpg', en: "Frankincense Face Oil, 30 ml", ar: "زيت الوجه باللبان، ٣٠ مل", depts: [] },
      { id: "face-cleanser", img: '/images/partners/luban/face-cleanser.jpg', en: "Frankincense Face Cleanser, 140 ml", ar: "غسول الوجه باللبان، ١٤٠ مل", depts: [] },
      { id: "lip-balm", img: '/images/partners/luban/lip-balm.jpg', en: "Frankincense Lip Balm", ar: "مرطّب الشفاه باللبان", depts: [] },
      { id: "lip-scrub", img: '/images/partners/luban/lip-scrub.jpg', en: "Frankincense Lip Scrub", ar: "مقشّر الشفاه باللبان", depts: [] },
      { id: "body", img: '/images/partners/luban/body.jpg', en: "The body collection", ar: "مجموعة الجسم", depts: [] },
      { id: "body-lotion", img: '/images/partners/luban/body-lotion.jpg', en: "Frankincense Body Lotion, 240 ml", ar: "لوشن الجسم باللبان، ٢٤٠ مل", depts: [] },
      { id: "body-butter", img: '/images/partners/luban/body-butter.jpg', en: "Frankincense Body Butter, 120 ml", ar: "زبدة الجسم باللبان، ١٢٠ مل", depts: [] },
      { id: "shower-gel", img: '/images/partners/luban/shower-gel.jpg', en: "Frankincense Shower Gel, 240 ml", ar: "جل الاستحمام باللبان، ٢٤٠ مل", depts: [] },
      { id: "hand-wash", img: '/images/partners/luban/hand-wash.jpg', en: "Frankincense Hand Wash, 250 ml", ar: "غسول اليدين باللبان، ٢٥٠ مل", depts: [] },
      { id: "hand-moisturiser", img: '/images/partners/luban/hand-moisturiser.jpg', en: "Frankincense Hand Moisturiser, 250 ml", ar: "مرطّب اليدين باللبان، ٢٥٠ مل", depts: [] },
      { id: "hair", img: '/images/partners/luban/hair.jpg', en: "The hair collection", ar: "مجموعة الشعر", depts: [] },
      { id: "shampoo", img: '/images/partners/luban/shampoo.jpg', en: "Frankincense Shampoo, 240 ml", ar: "شامبو باللبان، ٢٤٠ مل", depts: [] },
      { id: "conditioner", img: '/images/partners/luban/conditioner.jpg', en: "Frankincense Conditioner, 225 ml", ar: "بلسم الشعر باللبان، ٢٢٥ مل", depts: [] },
      { id: "aroma", img: '/images/partners/luban/aroma.jpg', en: "Aromatics", ar: "العطور المنزلية", depts: [] },
      { id: "essential-oil-30", img: '/images/partners/luban/essential-oil-30.jpg', en: "Frankincense Essential Oil, 30 ml", ar: "زيت اللبان العطري، ٣٠ مل", depts: ["oud-and-fragrance"] },
      { id: "essential-oil-10", img: '/images/partners/luban/essential-oil-10.jpg', en: "Frankincense Essential Oil, 10 ml", ar: "زيت اللبان العطري، ١٠ مل", depts: [] },
      { id: "oil-burner", img: '/images/partners/luban/oil-burner.jpg', en: "Aromatic Oil Burner set", ar: "طقم مبخرة الزيت العطري", depts: ["oud-and-fragrance"] },
      { id: "resins", img: '/images/partners/luban/resins.jpg', en: "Hojari Frankincense Resins, 250 g", ar: "حبّات اللبان الحوجري، ٢٥٠ غ", depts: ["oud-and-fragrance", "prayer"] },
      { id: "resin-box", img: '/images/partners/luban/resin-box.jpg', en: "Frankincense Resin in a gift box, 250 g", ar: "لبان في علبة هدايا، ٢٥٠ غ", depts: [] },
      { id: "drinkable-oil", img: '/images/partners/luban/drinkable-oil.jpg', en: "Drinkable Frankincense Oil, 30 ml", ar: "زيت اللبان للشرب، ٣٠ مل", depts: [] },
      { id: "boxes", img: '/images/partners/luban/boxes.jpg', en: "The gift box collection", ar: "مجموعة علب الهدايا", depts: [] },
      { id: "box-faves", img: '/images/partners/luban/box-faves.jpg', en: "Luban's Faves gift box", ar: "علبة هدايا مفضّلات لُبان", depts: [] },
      { id: "box-body", img: '/images/partners/luban/box-body.jpg', en: "Body Hydration gift box", ar: "علبة هدايا ترطيب الجسم", depts: [] },
      { id: "box-hair", img: '/images/partners/luban/box-hair.jpg', en: "Hair Nourishing gift box", ar: "علبة هدايا تغذية الشعر", depts: [] },
      { id: "box-face-lips", img: '/images/partners/luban/box-face-lips.jpg', en: "Face & Lips gift box", ar: "علبة هدايا الوجه والشفاه", depts: [] },
      { id: "box-men", img: '/images/partners/luban/box-men.jpg', en: "Men's Box", ar: "علبة الرجال", depts: ["jewellery-for-him"] },
      { id: "box-own-large", img: '/images/partners/luban/box-own-large.jpg', en: "Make your own gift box, large", ar: "صمّم علبة هداياك، كبيرة", depts: [] },
      { id: "box-own-small", img: '/images/partners/luban/box-own-small.jpg', en: "Make your own gift box, small", ar: "صمّم علبة هداياك، صغيرة", depts: [] },
      { id: "landscape", img: '/images/partners/luban/landscape.jpg', en: "Frankincense trees of Dhofar", ar: "أشجار اللبان في ظفار", depts: [] },
    ],
  },
  {
    slug: "kajal", name: "Kajal", nameAr: "كاجال", site: "https://kajalperfumes.com", blurb: 'pbKajal',
    catalogueBrand: "Kajal",
    items: [
      { id: "lamar-noir", img: '/images/partners/kajal/lamar-noir.jpg', en: "Lamar Noir, extrait de parfum", ar: "لمار نوار، خلاصة عطر", depts: ["oud-and-fragrance"] },
      { id: "dahab-absolu", img: '/images/partners/kajal/dahab-absolu.jpg', en: "Dahab Absolu, extrait de parfum", ar: "ذهب أبسولو، خلاصة عطر", depts: ["oud-and-fragrance"] },
      { id: "aican", img: '/images/partners/kajal/aican.jpg', en: "Äican, eau de parfum", ar: "إيقان، ماء عطر", depts: ["oud-and-fragrance"] },
      { id: "kolada", img: '/images/partners/kajal/kolada.jpg', en: "Kolada, extrait de parfum", ar: "كولادا، خلاصة عطر", depts: [] },
      { id: "lamar-caviar", img: '/images/partners/kajal/lamar-caviar.jpg', en: "Lamar Caviar, perfume d'eau", ar: "لمار كافيار، عطر مائي", depts: ["oud-and-fragrance"] },
      { id: "topaz", img: '/images/partners/kajal/topaz.jpg', en: "Topaz, eau de parfum", ar: "توباز، ماء عطر", depts: [] },
      { id: "ruby", img: '/images/partners/kajal/ruby.jpg', en: "Ruby, eau de parfum", ar: "روبي، ماء عطر", depts: [] },
      { id: "joorie", img: '/images/partners/kajal/joorie.jpg', en: "Joorie, eau de parfum", ar: "جوري، ماء عطر", depts: [] },
      { id: "lamar", img: '/images/partners/kajal/lamar.jpg', en: "Lamar, eau de parfum", ar: "لمار، ماء عطر", depts: [] },
      { id: "dahab", img: '/images/partners/kajal/dahab.jpg', en: "Dahab, eau de parfum", ar: "ذهب، ماء عطر", depts: [] },
      { id: "kajal-v", img: '/images/partners/kajal/kajal-v.jpg', en: "Kajal V, eau de parfum", ar: "كاجال V، ماء عطر", depts: [] },
      { id: "whispering-oud", img: '/images/partners/kajal/whispering-oud.jpg', en: "The Whispering Oud, extrait de parfum", ar: "العود الهامس، خلاصة عطر", depts: [] },
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
    items: [
      { id: "oud-ulya", img: '/images/partners/amouage/oud-ulya.jpg', en: "Oud Ulya attar", ar: "عطر عود عُليا", depts: ["oud-and-fragrance"] },
      { id: "opus-xiii", img: '/images/partners/amouage/opus-xiii.jpg', en: "Opus XIII Silver Oud", ar: "أوبوس ١٣ سيلفر عود", depts: ["oud-and-fragrance", "jewellery-for-him"] },
      { id: "reflection-45", img: '/images/partners/amouage/reflection-45.jpg', en: "Reflection 45", ar: "ريفليكشن ٤٥", depts: ["oud-and-fragrance"] },
    ],
  },
  {
    slug: "kiswah-jewellery", name: "Kiswah Jewellery", nameAr: "مجوهرات كسوة", site: "https://kiswahjewellery.com", blurb: 'pbKiswahJewellery',
    items: [
      { id: "necklace", img: '/images/partners/kiswah-jewellery/necklace.jpg', en: "Pendant with Kaaba Kiswah thread", ar: "قلادة بخيط من كسوة الكعبة", depts: ["jewellery-for-her"] },
      { id: "bracelet", img: '/images/partners/kiswah-jewellery/bracelet.jpg', en: "Bracelet with Kaaba Kiswah thread", ar: "سوار بخيط من كسوة الكعبة", depts: ["jewellery-for-her"] },
      { id: "rings", img: '/images/partners/kiswah-jewellery/rings.jpg', en: "Ring with Kaaba Kiswah thread", ar: "خاتم بخيط من كسوة الكعبة", depts: ["jewellery-for-her"] },
      { id: "necklaces", img: '/images/partners/kiswah-jewellery/necklaces.jpg', en: "The necklace collection", ar: "مجموعة القلائد", depts: ["jewellery-for-her"] },
      { id: "bracelets", img: '/images/partners/kiswah-jewellery/bracelets.jpg', en: "The bracelet collection", ar: "مجموعة الأساور", depts: [] },
      { id: "kiswa", img: '/images/partners/kiswah-jewellery/kiswa.jpg', en: "The Kiswah of the Kaaba", ar: "كسوة الكعبة المشرفة", depts: [] },
    ],
  },
  {
    slug: "royal-selangor", name: "Royal Selangor", nameAr: "رويال سيلانجور", site: "https://www.royalselangor.com", blurb: 'pbRoyalSelangor',
    items: [
      { id: "atiya-vase", img: '/images/partners/royal-selangor/atiya-vase.jpg', en: "Atiya II vase", ar: "مزهرية عطية ٢", depts: ["art-and-home"] },
      { id: "rs-1", img: '/images/partners/royal-selangor/rs-1.jpg', en: "Pewter giftware", ar: "هدايا من القصدير", depts: [] },
      { id: "rs-2", img: '/images/partners/royal-selangor/rs-2.jpg', en: "Arabesque pewter", ar: "قصدير بزخارف عربية", depts: [] },
      { id: "rs-3", img: '/images/partners/royal-selangor/rs-3.jpg', en: "Pewter tray", ar: "صينية من القصدير", depts: [] },
      { id: "rs-4", img: '/images/partners/royal-selangor/rs-4.jpg', en: "Eight-pointed star", ar: "النجمة الثمانية", depts: [] },
    ],
  },
  {
    slug: "rihal", name: "Rihal", nameAr: "رحّال", site: "https://rihal.sa", blurb: 'pbRihal',
    items: [
      { id: "kaaba-door-rug", img: '/images/partners/rihal/kaaba-door-rug.jpg', en: "Kaaba Door silk wall prayer rug", ar: "سجادة جدارية لباب الكعبة المشرفة (حرير)", depts: ["prayer"] },
      { id: "haram-rug", img: '/images/partners/rihal/haram-rug.jpg', en: "In the Haram silk prayer rug", ar: "سجادة في الحرم (حرير)", depts: ["prayer"] },
      { id: "rawdah-rug", img: '/images/partners/rihal/rawdah-rug.jpg', en: "Edge of the Rawdah silk prayer rug", ar: "سجادة حدود الروضة (حرير)", depts: ["prayer"] },
      { id: "mihrab-rug", img: '/images/partners/rihal/mihrab-rug.jpg', en: "Mihrab of the Rawdah silk prayer rug", ar: "سجادة محراب الروضة الشريفة (حرير)", depts: [] },
      { id: "misbaha-door", img: '/images/partners/rihal/misbaha-door.jpg', en: "Prophet's Mosque Door misbaha, large", ar: "سبحة باب المسجد النبوي (كبيرة)", depts: ["prayer", "jewellery-for-him"] },
      { id: "misbaha-malachite", img: '/images/partners/rihal/misbaha-malachite.jpg', en: "Prophet's Mosque Door misbaha, malachite", ar: "سبحة باب المسجد النبوي (ملاكايت)", depts: ["prayer"] },
      { id: "misbaha-minaret", img: '/images/partners/rihal/misbaha-minaret.jpg', en: "Minaret misbaha", ar: "سبحة المئذنة", depts: [] },
      { id: "misbaha-agate", img: '/images/partners/rihal/misbaha-agate.jpg', en: "Black Stone misbaha, black agate", ar: "سبحة الحجر الأسود (بالعقيق الأسود)", depts: ["jewellery-for-him"] },
      { id: "misbaha-qindeel-gold", img: '/images/partners/rihal/misbaha-qindeel-gold.jpg', en: "Kaaba Qindeel misbaha, gold-plated silver", ar: "سبحة قنديل الكعبة المشرفة (فضة مطلية بالذهب)", depts: ["jewellery-for-her"] },
      { id: "misbaha-qindeel-silver", img: '/images/partners/rihal/misbaha-qindeel-silver.jpg', en: "Kaaba Qindeel misbaha, silver", ar: "سبحة قنديل الكعبة المشرفة (فضة)", depts: [] },
      { id: "kaaba-wall", img: '/images/partners/rihal/kaaba-wall.jpg', en: "Kaaba wall model", ar: "مجسم جدار الكعبة المشرفة", depts: ["art-and-home"] },
      { id: "bab-al-salam", img: '/images/partners/rihal/bab-al-salam.jpg', en: "Bab Al Salam model", ar: "مجسم باب السلام (كامل)", depts: ["art-and-home"] },
      { id: "bab-al-rahma", img: '/images/partners/rihal/bab-al-rahma.jpg', en: "Bab Al Rahma model, large", ar: "مجسم باب الرحمة (كبير)", depts: [] },
      { id: "prophets-mosque-door", img: '/images/partners/rihal/prophets-mosque-door.jpg', en: "Prophet's Mosque door model, large", ar: "مجسم باب المسجد النبوي (كبير)", depts: [] },
      { id: "muwajaha", img: '/images/partners/rihal/muwajaha.jpg', en: "Al Muwajaha Al Sharifa model", ar: "مجسم المواجهة الشريفة", depts: ["art-and-home"] },
      { id: "mizab", img: '/images/partners/rihal/mizab.jpg', en: "Mizab of the Kaaba with Kiswa, large", ar: "مجسم ميزاب الكعبة المشرفة بالكسوة (مقاس كبير)", depts: [] },
      { id: "mushaf-stand", img: '/images/partners/rihal/mushaf-stand.jpg', en: "Mushaf bound in Kiswa, with stand", ar: "مصحف بالكسوة مع حامل مصحف (حجم كبير)", depts: ["prayer"] },
      { id: "mushaf-kiswa", img: '/images/partners/rihal/mushaf-kiswa.jpg', en: "Mushaf bound in Kiswa, large", ar: "مصحف بالكسوة (حجم كبير)", depts: [] },
      { id: "mushaf-hujra", img: '/images/partners/rihal/mushaf-hujra.jpg', en: "Mushaf covered in the Hujra Sharifa fabric", ar: "مصحف بكسوة الحجرة الشريفة", depts: [] },
    ],
  },
  {
    slug: "chopard", name: "Chopard", nameAr: "شوبارد", site: "https://www.chopard.com", blurb: 'pbChopard',
    items: [
      { id: "alpine-eagle-gold", img: '/images/partners/chopard/alpine-eagle-gold.jpg', en: "Alpine Eagle 41, 18k gold", ar: "ألباين إيغل ٤١، ذهب عيار ١٨", depts: ["jewellery-for-him"] },
      { id: "alpine-eagle-steel", img: '/images/partners/chopard/alpine-eagle-steel.jpg', en: "Alpine Eagle 41, blue dial", ar: "ألباين إيغل ٤١، بميناء أزرق", depts: ["jewellery-for-him"] },
      { id: "alpine-eagle-rose", img: '/images/partners/chopard/alpine-eagle-rose.jpg', en: "Alpine Eagle 41, rose gold, blue dial", ar: "ألباين إيغل ٤١، ذهب وردي بميناء أزرق", depts: ["jewellery-for-him"] },
      { id: "alpine-eagle-two-tone", img: '/images/partners/chopard/alpine-eagle-two-tone.jpg', en: "Alpine Eagle 41, steel and rose gold", ar: "ألباين إيغل ٤١، فولاذ وذهب وردي", depts: ["jewellery-for-him"] },
      { id: "alpine-eagle-green", img: '/images/partners/chopard/alpine-eagle-green.jpg', en: "Alpine Eagle 41, green dial", ar: "ألباين إيغل ٤١، بميناء أخضر", depts: ["jewellery-for-him"] },
      { id: "alpine-eagle-grey", img: '/images/partners/chopard/alpine-eagle-grey.jpg', en: "Alpine Eagle 41, grey dial", ar: "ألباين إيغل ٤١، بميناء رمادي", depts: ["jewellery-for-him"] },
      { id: "luc-1860", img: '/images/partners/chopard/luc-1860.jpg', en: "L.U.C 1860, rose gold", ar: "إل.يو.سي ١٨٦٠، ذهب وردي", depts: ["jewellery-for-him"] },
      { id: "mille-miglia-black", img: '/images/partners/chopard/mille-miglia-black.jpg', en: "Mille Miglia chronograph, black dial", ar: "ميل ميليا كرونوغراف، بميناء أسود", depts: ["jewellery-for-him"] },
      { id: "mille-miglia-silver", img: '/images/partners/chopard/mille-miglia-silver.jpg', en: "Mille Miglia chronograph, silver dial", ar: "ميل ميليا كرونوغراف، بميناء فضي", depts: ["jewellery-for-him"] },
      { id: "pen-classic-black", img: '/images/partners/chopard/pen-classic-black.jpg', en: "Classic rollerball, black", ar: "قلم كلاسيك رولربول، أسود", depts: ["jewellery-for-him"] },
      { id: "pen-classic-rose", img: '/images/partners/chopard/pen-classic-rose.jpg', en: "Classic rollerball, black and rose gold", ar: "قلم كلاسيك رولربول، أسود وذهبي وردي", depts: ["jewellery-for-him"] },
      { id: "pen-silver", img: '/images/partners/chopard/pen-silver.jpg', en: "Ballpoint pen, black and silver", ar: "قلم حبر جاف، أسود وفضي", depts: ["jewellery-for-him"] },
      { id: "pen-rose-gold", img: '/images/partners/chopard/pen-rose-gold.jpg', en: "Ballpoint pen, rose gold", ar: "قلم حبر جاف، ذهبي وردي", depts: ["jewellery-for-him"] },
      { id: "alpine-eagle-rainbow", img: '/images/partners/chopard/alpine-eagle-rainbow.jpg', en: "Alpine Eagle, diamonds and rainbow sapphires", ar: "ألباين إيغل، ألماس وياقوت بألوان قوس قزح", depts: ["jewellery-for-her"] },
      { id: "alpine-eagle-36", img: '/images/partners/chopard/alpine-eagle-36.jpg', en: "Alpine Eagle 36, blue dial", ar: "ألباين إيغل ٣٦، بميناء أزرق", depts: ["jewellery-for-her"] },
      { id: "rollerball", img: '/images/partners/chopard/rollerball.jpg', en: "Classic rollerball pen", ar: "قلم كلاسيك رولربول", depts: ["jewellery-for-him"] },
      { id: "happy-hearts-pendant", img: '/images/partners/chopard/happy-hearts-pendant.jpg', en: "Happy Hearts pendant", ar: "قلادة هابي هارتس", depts: ["jewellery-for-her"] },
      { id: "my-happy-hearts", img: '/images/partners/chopard/my-happy-hearts.jpg', en: "My Happy Hearts necklace", ar: "عقد ماي هابي هارتس", depts: ["jewellery-for-her"] },
      { id: "happy-hearts", img: '/images/partners/chopard/happy-hearts.jpg', en: "Happy Hearts bangle", ar: "سوار هابي هارتس", depts: ["jewellery-for-her"] },
    ],
  },
  {
    slug: "bateel", name: "Bateel", nameAr: "بتيل", site: "https://bateel.com", blurb: 'pbBateel',
    items: [
      { id: "signature", img: '/images/partners/bateel/signature.jpg', en: "Signature gift box", ar: "علبة سيغنتشر للإهداء", depts: ["dates-and-gourmet"] },
      { id: "corporate", img: '/images/partners/bateel/corporate.jpg', en: "Gift boxes for corporate gifting", ar: "علب هدايا للشركات", depts: ["dates-and-gourmet"] },
      { id: "palm", img: '/images/partners/bateel/palm.jpg', en: "Palm gift box", ar: "علبة بالم للإهداء", depts: ["dates-and-gourmet"] },
      { id: "oasis", img: '/images/partners/bateel/oasis.jpg', en: "Oasis wooden chest", ar: "صندوق الواحة الخشبي", depts: ["dates-and-gourmet"] },
    ],
  },
  {
    slug: "kashida", name: "Kashida", nameAr: "كشيدة", site: "https://www.kashidadesign.com", blurb: 'pbKashida',
    items: [
      { id: "al-iman", img: '/images/partners/kashida/al-iman.jpg', en: "Al Iman (Faith) wall piece", ar: "لوحة الإيمان الجدارية", depts: ["art-and-home"] },
      { id: "allahu-akbar", img: '/images/partners/kashida/allahu-akbar.jpg', en: "Allahu Akbar wall art", ar: "لوحة الله أكبر الجدارية", depts: ["art-and-home"] },
      { id: "99-names", img: '/images/partners/kashida/99-names.jpg', en: "The 99 Names of Allah, contemporary edition", ar: "أسماء الله الحسنى، إصدار معاصر", depts: ["art-and-home"] },
      { id: "watch-box", img: '/images/partners/kashida/watch-box.jpg', en: "Personalised watch box with Arabic calligraphy", ar: "صندوق ساعات مخصّص بالخط العربي", depts: ["jewellery-for-him"] },
      { id: "calligraffiti-cups", img: '/images/partners/kashida/calligraffiti-cups.jpg', en: "Calligraffiti glasses", ar: "أكواب كاليغرافيتي", depts: ["dates-and-gourmet"] },
      { id: "brushstrokes-cups", img: '/images/partners/kashida/brushstrokes-cups.jpg', en: "Emirates Brushstrokes coffee cups", ar: "فناجين ضربات فرشاة الإمارات", depts: ["dates-and-gourmet"] },
      { id: "mushaf-holder", img: '/images/partners/kashida/mushaf-holder.jpg', en: "Al Kareem mushaf holder", ar: "حامل المصحف الكريم", depts: ["prayer"] },
      { id: "name-bookends", img: '/images/partners/kashida/name-bookends.jpg', en: "Name bookends", ar: "مساند كتب بالأسماء", depts: ["art-and-home"] },
    ],
  },
  {
    slug: "orient-499", name: "Orient 499", nameAr: "أورينت ٤٩٩", site: "https://orient499.com", blurb: 'pbOrient499',
    items: [
      { id: "leather-tassel", img: '/images/partners/orient-499/leather-tassel.jpg', en: "Camel hair and leather abaya", ar: "عباية من وبر الجمل والجلد", depts: ["modest-style"] },
      { id: "tareq-gold", img: '/images/partners/orient-499/tareq-gold.jpg', en: "Tareq gold cotton abaya", ar: "عباية طارق القطنية الذهبية", depts: ["modest-style"] },
      { id: "poncho", img: '/images/partners/orient-499/poncho.jpg', en: "Cashmere poncho", ar: "بونشو من الكشمير", depts: ["modest-style"] },
      { id: "tarbouch", img: '/images/partners/orient-499/tarbouch.jpg', en: "Mini tarbouch box", ar: "علبة الطربوش الصغيرة", depts: ["art-and-home"] },
    ],
  },
  {
    slug: "teeb-made", name: "Teeb Made", nameAr: "طيب ميد", site: "https://www.teebmade.com", blurb: 'pbTeebMade',
    items: [
      { id: "harrat-diffuser", img: '/images/partners/teeb-made/harrat-diffuser.jpg', en: "Harrat basalt diffuser and incense burner", ar: "مبخرة وفوّاحة حرّات من البازلت", depts: ["oud-and-fragrance"] },
      { id: "harrat-date-server", img: '/images/partners/teeb-made/harrat-date-server.jpg', en: "Harrat stone date server", ar: "طبق تمر حرّات من الحجر", depts: ["dates-and-gourmet"] },
      { id: "bloom-tray", img: '/images/partners/teeb-made/bloom-tray.jpg', en: "Bloom floral tray", ar: "صينية بلوم المزهرة", depts: ["art-and-home"] },
      { id: "prayer-mat", img: '/images/partners/teeb-made/prayer-mat.jpg', en: "The Prayer Mat", ar: "سجادة الصلاة", depts: ["prayer"] },
      { id: "door-clutch", img: '/images/partners/teeb-made/door-clutch.jpg', en: "Saudi Door clutch", ar: "حقيبة الباب السعودي", depts: ["jewellery-for-her"] },
    ],
  },
  {
    slug: "mirzam", name: "Mirzam", nameAr: "مِرزم", site: "https://mirzam.com", blurb: 'pbMirzam',
    items: [
      { id: "captain", img: '/images/partners/mirzam/captain.jpg', en: "The Captain's Treasure Box", ar: "صندوق كنز القبطان", depts: ["dates-and-gourmet"] },
      { id: "abu-dhabi", img: '/images/partners/mirzam/abu-dhabi.jpg', en: "Abu Dhabi Treasure Box", ar: "صندوق كنز أبوظبي", depts: ["dates-and-gourmet"] },
      { id: "safeefa", img: '/images/partners/mirzam/safeefa.jpg', en: "Safeefa Signature box", ar: "علبة سفيفة", depts: [] },
      { id: "crescent", img: '/images/partners/mirzam/crescent.jpg', en: "Crescent bites tray", ar: "صينية الهلال", depts: [] },
      { id: "nakhuda", img: '/images/partners/mirzam/nakhuda.jpg', en: "Nakhuda's Treasure Box", ar: "صندوق كنز النوخذة", depts: [] },
    ],
  },
  {
    slug: "silsal", name: "Silsal", nameAr: "سلسال", site: "https://silsal.com", blurb: 'pbSilsal',
    items: [
      { id: "tamrah", img: '/images/partners/silsal/tamrah.jpg', en: "Tamrah dallah and cups, by Razan Alazzouni", ar: "دلّة وفناجين تمرة، بتصميم رزان العزوني", depts: ["dates-and-gourmet"] },
    ],
  },
  {
    slug: "sinwan", name: "Sinwan", nameAr: "صنوان", site: "https://floward.com", blurb: 'pbSinwan',
    items: [
      { id: "filled-medjool", img: '/images/partners/sinwan/filled-medjool.jpg', en: "Filled Medjool assortment", ar: "تشكيلة مجدول محشو", depts: ["dates-and-gourmet"] },
    ],
  },
  {
    slug: "ahlan", name: "Ahlan", nameAr: "أهلاً", site: "https://www.ahlandates.com", blurb: 'pbAhlan',
    items: [
      { id: "safawi", img: '/images/partners/ahlan/safawi.jpg', en: "Safawi dates gift box", ar: "علبة تمر صفاوي للإهداء", depts: ["dates-and-gourmet"] },
    ],
  },
  {
    slug: "assouline", name: "Assouline", nameAr: "أسولين", site: "https://www.assouline.com", blurb: 'pbAssouline',
    items: [
      { id: "alula", img: '/images/partners/assouline/alula.jpg', en: "AlUla Ever", ar: "العُلا إلى الأبد", depts: ["art-and-home"] },
    ],
  },
  {
    slug: "loro-piana", name: "Loro Piana", nameAr: "لورو بيانا", site: "https://www.loropiana.com", blurb: 'pbLoroPiana',
    items: [
      { id: "shawl", img: '/images/partners/loro-piana/shawl.jpg', en: "Cashmere shawl", ar: "شال من الكشمير", depts: ["modest-style"] },
    ],
  },
  {
    slug: "ranavat", name: "Ranavat", nameAr: "راناڤات", site: "https://www.ranavat.com", blurb: 'pbRanavat',
    items: [
      { id: "saffron", img: '/images/partners/ranavat/saffron.jpg', en: "Brightening saffron serum", ar: "سيروم الزعفران", depts: ["oud-and-fragrance"] },
    ],
  },
];

export const partnerHref = (slug: string): Href => ({ pathname: '/brands/[slug]', params: { slug } });

export const partnerBySlug = (slug: string): Partner | undefined => PARTNERS.find((p) => p.slug === slug);

/** Partner pieces that belong in a department, with their house. */
export const partnerItemsFor = (dept: string): (PartnerItem & { partner: Partner })[] =>
  PARTNERS.flatMap((p) => p.items.filter((i) => i.depts.includes(dept)).map((i) => ({ ...i, partner: p })));

/** The cover photograph of a house: its first piece, or a product photo for houses listed only in the catalogue. */
export const partnerCover = (p: Partner): string | undefined => p.items[0]?.img;
