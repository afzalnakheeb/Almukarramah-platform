// Contact details and attempts to take customers off the platform: phone numbers however they are written (any digit
// system, letters standing in for digits, numbers spelled out in English or Arabic or mixed with digits, any
// punctuation, symbols or invisible characters between the digits, several numbers run together), email addresses
// (also "ali at gmail", "ali @ gmail . com", "ali {at} gmail {dot} com", "aliATgmailDOTcom"), links and domains,
// social handles (also "ig:@name", and the name after an app: "insta: name"), messaging apps (also spaced out), bank
// account numbers (IBAN, or a long account number) and invitations to deal or pay outside Al Mukarramah, in English
// and Arabic. Used by the listing screening (block with a reason the seller can fix), the seller's live hints and the
// in-platform messages (masked). The database has the same rules (private.contact_hint, 0016).
//
// How: the text is first copied into a normalised form, one character at most per character of the original
// (invisible format characters and Arabic marks dropped, every digit made 0-9, look-alike letters made plain, number
// words made digits), and each character of the copy remembers where it came from, so a match found in the copy masks
// exactly the right part of the original. No imports: the app imports this file directly, so the patterns avoid
// lookbehind and Unicode property escapes (not every JavaScript engine the apps run on has them); characters are
// classified with explicit tables instead.

export type ContactKind = 'phone' | 'email' | 'url' | 'handle' | 'messaging' | 'bank' | 'card' | 'solicit';
export type ContactHit = { kind: ContactKind; match: string; index: number };

// ================================================================ normalising
/** The first code point of each run of ten digits 0 to 9 (Unicode decimal digits, subscripts, mathematical digits). */
const DIGIT_ZEROS = [
  0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20, 0x1040, 0x1090,
  0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0x2080, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xa9f0, 0xaa50,
  0xabf0, 0xff10, 0x104a0, 0x10d30, 0x11066, 0x110f0, 0x11136, 0x111d0, 0x112f0, 0x11450, 0x114d0, 0x11650, 0x116c0, 0x11730, 0x118e0,
  0x11950, 0x11c50, 0x11d50, 0x11da0, 0x16a60, 0x16ac0, 0x16b50, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6, 0x1e140, 0x1e2f0, 0x1e950,
  0x1f101, 0x1fbf0,
];
/** Runs of nine digits 1 to 9 (circled, parenthesised, "1." and the dingbat circles). */
const DIGIT_ONES = [0x2460, 0x2474, 0x2488, 0x24f5, 0x2776, 0x2780, 0x278a];
/** Single digits elsewhere: superscripts and the zeros of the circled sets. */
const DIGIT_OTHER: Record<number, number> = {
  0x2070: 0, 0xb9: 1, 0xb2: 2, 0xb3: 3, 0x2074: 4, 0x2075: 5, 0x2076: 6, 0x2077: 7, 0x2078: 8, 0x2079: 9,
  0x24ea: 0, 0x24ff: 0, 0x1f100: 0, 0x1f10b: 0, 0x1f10c: 0,
};

/** The value of a digit in any of the systems above, or -1. */
export function digitOf(cp: number): number {
  if (cp >= 0x30 && cp <= 0x39) return cp - 0x30;
  if (cp < 0xb2) return -1;
  for (const z of DIGIT_ZEROS) if (cp >= z && cp <= z + 9) return cp - z;
  for (const o of DIGIT_ONES) if (cp >= o && cp <= o + 8) return cp - o + 1;
  const d = DIGIT_OTHER[cp];
  return d === undefined ? -1 : d;
}

/** Invisible characters dropped from the copy: format characters (zero-width, joiners, direction marks), variation selectors. */
function isInvisible(cp: number): boolean {
  return cp === 0xad || cp === 0x34f || cp === 0x61c || cp === 0x115f || cp === 0x1160 || cp === 0x17b4 || cp === 0x17b5 || cp === 0x180e
    || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f) || cp === 0x3164
    || (cp >= 0xfe00 && cp <= 0xfe0f) || cp === 0xfeff || cp === 0xffa0 || (cp >= 0xfff9 && cp <= 0xfffb) || (cp >= 0x1d173 && cp <= 0x1d17a)
    || cp === 0xe0001 || (cp >= 0xe0020 && cp <= 0xe007f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}

/** Arabic marks dropped from the copy (harakat, tatweel, Quranic annotation marks). */
function isArabicMark(cp: number): boolean {
  return (cp >= 0x64b && cp <= 0x65f) || cp === 0x670 || cp === 0x640 || (cp >= 0x6d6 && cp <= 0x6dc) || (cp >= 0x6df && cp <= 0x6e4)
    || cp === 0x6e7 || cp === 0x6e8 || (cp >= 0x6ea && cp <= 0x6ed);
}

/** Look-alike letters and symbols made plain: full-width forms, mathematical and enclosed letters, Arabic alef forms. */
function plain(cp: number): string | null {
  if (cp >= 0xff01 && cp <= 0xff5e) return String.fromCharCode(cp - 0xfee0);
  if (cp === 0xfe6b || cp === 0xff20) return '@';
  if (cp === 0xfe52 || cp === 0x2024 || cp === 0x3002) return '.';
  if (cp >= 0x1d400 && cp <= 0x1d6a3) {
    const i = (cp - 0x1d400) % 52;
    return String.fromCharCode(i < 26 ? 0x41 + i : 0x61 + i - 26);
  }
  if (cp >= 0x24b6 && cp <= 0x24cf) return String.fromCharCode(0x41 + cp - 0x24b6);
  if (cp >= 0x24d0 && cp <= 0x24e9) return String.fromCharCode(0x61 + cp - 0x24d0);
  if (cp >= 0x249c && cp <= 0x24b5) return String.fromCharCode(0x61 + cp - 0x249c);
  for (const a of [0x1f130, 0x1f150, 0x1f170]) if (cp >= a && cp <= a + 25) return String.fromCharCode(0x41 + cp - a);
  if (cp === 0x623 || cp === 0x625 || cp === 0x622 || cp === 0x671) return 'ا';
  if (cp === 0x649) return 'ي';
  return null;
}

/** A letter (of a script people write words in). Anything else between digits is a separator. */
function isLetter(cp: number): boolean {
  return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f && cp !== 0xd7 && cp !== 0xf7)
    || (cp >= 0x370 && cp <= 0x52f) || (cp >= 0x531 && cp <= 0x587) || (cp >= 0x5d0 && cp <= 0x5ea) || (cp >= 0x620 && cp <= 0x64a)
    || (cp >= 0x66e && cp <= 0x6d3) || cp === 0x6d5 || (cp >= 0x6fa && cp <= 0x6ff) || (cp >= 0x710 && cp <= 0x74f)
    || (cp >= 0x780 && cp <= 0x7a5) || (cp >= 0x900 && cp <= 0xdff && digitOf(cp) < 0) || (cp >= 0xe01 && cp <= 0xe4e && digitOf(cp) < 0)
    || (cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3040 && cp <= 0x30ff) || (cp >= 0x3400 && cp <= 0x9fff)
    || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfefc);
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  'صفر': '0', 'واحد': '1', 'اثنان': '2', 'اثنين': '2', 'اثنتان': '2', 'ثلاثة': '3', 'ثلاث': '3', 'اربعة': '4', 'اربع': '4', 'خمسة': '5',
  'خمس': '5', 'ستة': '6', 'ست': '6', 'سبعة': '7', 'سبع': '7', 'ثمانية': '8', 'ثماني': '8', 'ثمان': '8', 'تسعة': '9', 'تسع': '9',
};

/** One character of the normalised copy: where it came from in the original, and what it was. */
type Unit = { ch: string; start: number; end: number; real: boolean; word: boolean };

/** The normalised copy of a text, each character mapped back to the original. */
export function normalize(text: string): { norm: string; units: Unit[] } {
  const raw: Unit[] = [];
  let i = 0;
  for (const c of text) {
    const cp = c.codePointAt(0)!;
    const start = i;
    i += c.length;
    if (isInvisible(cp) || isArabicMark(cp)) continue;
    const d = digitOf(cp);
    if (d >= 0) { raw.push({ ch: String(d), start, end: i, real: true, word: false }); continue; }
    const p = plain(cp);
    // one character of the copy per character of the text: other astral characters (emoji, symbols) become a space,
    // which is a separator like any other symbol ("whats😀app" is still WhatsApp)
    const ch = p ?? (c.length === 1 ? c : isLetter(cp) ? 'x' : ' ');
    raw.push({ ch, start, end: i, real: false, word: false });
  }
  // number words become one digit each (a word of letters only, as a whole word)
  const units: Unit[] = [];
  for (let k = 0; k < raw.length;) {
    if (!isLetter(raw[k].ch.codePointAt(0)!)) { units.push(raw[k]); k++; continue; }
    let e = k;
    while (e < raw.length && isLetter(raw[e].ch.codePointAt(0)!)) e++;
    const word = raw.slice(k, e).map((u) => u.ch).join('').toLowerCase();
    const digit = NUMBER_WORDS[word];
    if (digit) units.push({ ch: digit, start: raw[k].start, end: raw[e - 1].end, real: false, word: true });
    else for (let x = k; x < e; x++) units.push(raw[x]);
    k = e;
  }
  // the letters O and l (and I, Q, |) standing in for 0 and 1 between digits
  let norm = units.map((u) => u.ch).join('');
  norm = norm.replace(/\d[\dOoQlI|]*\d/g, (run) => run.replace(/[OoQ]/g, '0').replace(/[lI|]/g, '1'));
  for (let k = 0; k < units.length; k++) units[k].ch = norm[k];
  return { norm, units };
}

/** Western digits for any digit system (Arabic-Indic, Persian, Devanagari, full-width...), other characters as they are. */
export function westernDigits(s: string): string {
  let out = '';
  for (const c of s) {
    const d = digitOf(c.codePointAt(0)!);
    out += d >= 0 ? String(d) : c;
  }
  return out;
}

// ================================================================ the patterns (run on the normalised copy)
const TLD = 'com|net|org|sa|ae|kw|qa|om|bh|in|co|io|me|shop|store|info|biz|ly|gl|link|site|online|app|uk|us|pk|eg|tr|my|id|tv|page|website|ru|de|fr';
const AT = '(?:@|\\(at\\)|\\[at\\]|\\{at\\}|<at>)';
const DOT = '(?:\\.|\\(dot\\)|\\[dot\\]|\\{dot\\}|<dot>|\\s+dot\\s+)';
const PROVIDERS = 'gmail|googlemail|hotmail|yahoo|ymail|outlook|icloud|aol|protonmail|proton|yandex|zoho|gmx';
/** Providers that are not ordinary words ("we met at Outlook cafe", "bought it at Yahoo shopping" are not emails). */
const PROVIDERS_SURE = 'gmail|googlemail|hotmail|ymail|icloud|protonmail';
const EMAIL_RES: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // spaces around @ and dots, the words at/dot in brackets: "ali @ gmail . com", "ali@gmail dot com", "ali {at} gmail {dot} com"
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s*${AT}\\s*[A-Za-z0-9-]{2,}(?:\\s*${DOT}\\s*[A-Za-z0-9-]{2,})*?\\s*${DOT}\\s*(?:${TLD})(?![A-Za-z])`, 'gi'),
  // the word at with the word dot: "ali at gmail dot com" ("order at shop.com" is a link, found as one below)
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s+at\\s+[A-Za-z0-9-]{2,}\\s*(?:\\(dot\\)|\\[dot\\]|\\{dot\\}|<dot>|\\s+dot\\s+)\\s*(?:${TLD})(?![A-Za-z])`, 'gi'),
  // a mail provider is enough: "ali @ hotmail", "ali at gmail"; with the word "at", an ordinary-word provider only at the
  // end of a phrase ("ali at outlook.")
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s*${AT}\\s*(?:${PROVIDERS})(?![A-Za-z])`, 'gi'),
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s+at\\s+(?:${PROVIDERS_SURE})(?![A-Za-z])`, 'gi'),
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s+at\\s+(?:${PROVIDERS})(?=\\s*(?:$|[.,;:!?)\\]،؟]))`, 'gi'),
  // written without spaces: "aliATgmailDOTcom"
  new RegExp(`[a-z0-9._-]{2,}AT[a-z0-9-]{2,}DOT(?:${TLD})(?![a-z])`, 'g'),
];
const URL_RE = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s<>"'،]+|\\b[A-Za-z][A-Za-z0-9-]{1,62}(?:\\.[A-Za-z0-9-]{2,62})*\\.(?:${TLD})(?:\\/[^\\s<>"'،]*)?\\b`, 'gi');
/** @name after anything that is not part of an email address: "ig:@name", "IG/@name", "(@name)"; not "@home" */
const HANDLE_RE = /(^|[^A-Za-z0-9._%+-])(@(?!(?:home|work|school|office|night|noon|gym|mall|mosque|masjid|haram|hotel|airport|beach|park|the|all|once|least|most|last|first|here|there)(?![A-Za-z0-9_.]))[A-Za-z0-9_.]{3,30})(?![A-Za-z0-9_])/gi;
const APPS_EN = 'whats\\s?app|wa\\.me|telegram|t\\.me|instagram|insta|snapchat|snap\\s?chat|tik\\s?tok|facebook|twitter|wechat|viber';
const APPS_AR = 'واتساب|واتس\\s?اب|واتس|وتساب|تلغرام|تلجرام|تليجرام|انستقرام|انستغرام|انستا|سناب|تيك\\s?توك|فيسبوك|فيس\\s?بوك|تويتر';
const MESSAGING_RE = new RegExp(`\\b(?:whats\\s?app|wa\\.me|telegram|t\\.me|instagram|insta|snapchat|snap\\s?chat|tik\\s?tok|facebook|twitter|wechat|viber)\\b|${APPS_AR}`, 'gi');
// short or ordinary-word names count only with a marked name after them: "ig: name", "snap: name", "fb/name"
const SHORT_APPS = 'ig|snap|tg|fb';
const SHORT_APP = new RegExp(`^(?:${SHORT_APPS})$`, 'i');
// the name after an app: masked when it is marked (":", "/", "@") or looks like a handle (has _ . or a digit)
const APP_HANDLE_RE = new RegExp(`(?:\\b(?:${APPS_EN}|${SHORT_APPS})|${APPS_AR})(\\s*[:/@]+\\s*|\\s*[:：]?\\s+)([A-Za-z0-9_.]{3,30})`, 'gi');
const SPACED_NAMES = ['whatsapp', 'telegram', 'instagram', 'snapchat', 'tiktok', 'facebook', 'twitter', 'wechat'];
const MESSAGING_SPACED = new RegExp(`\\b(?:${SPACED_NAMES.map((w) => w.split('').join('[\\s._-]+')).join('|')})\\b`, 'gi');
const SOLICIT_RE = new RegExp([
  '\\b(?:contact|call|text|message|dm|whatsapp|ring|reach)\\s+(?:me|us)\\b', '\\b(?:order|buy|pay)\\s+(?:directly|outside)\\b',
  '\\bdirect\\s+(?:order|sale|contact)\\b', '\\b(?:bank|wire)\\s+transfer\\b', '\\bpay\\s+(?:me|us)\\s+(?:by|via|with|through)\\b',
  '\\b(?:transfer|send)\\s+(?:the\\s+)?(?:money|payment|amount)\\s+(?:to\\s+)?(?:me|us|my|our)\\b',
  '\\b(?:send|give|share|text)\\s+(?:me|us)\\s+(?:your\\s+)?(?:number|phone|mobile|whats\\s?app|email|e-mail|contact|details)\\b',
  "\\bwhat(?:'|’)?s\\s+your\\s+(?:number|phone|mobile|whats\\s?app|email)\\b", '\\boutside\\s+(?:the\\s+)?(?:app|platform|site|website)\\b',
  // Arabic (alef forms already plain, marks removed)
  'تواصل\\s+(?:معي|معنا)', 'اتصل\\s+(?:بي|بنا)', 'راسلني', 'راسلنا', 'كلمني', 'كلمنا', 'اطلب\\s+مباشرة', 'للطلب\\s+(?:عبر|على)', 'خارج\\s+(?:المنصة|التطبيق|الموقع)',
  'تحويل\\s+بنكي', 'حوالة\\s+بنكية', 'حول\\s+لي', 'ادفع\\s+لي', 'حول\\s+(?:المبلغ|الفلوس|المال|القيمة)', 'حسابي\\s+البنكي',
  '(?:على|ع)\\s+الخاص', 'بالخاص', '(?:ارسل|ابعث|ابعت|اعطني|عطني|هات)(?:ي)?\\s+(?:لي\\s+)?(?:رقمك|رقم\\s+(?:جوالك|هاتفك|تلفونك|موبايلك)|ايميلك|بريدك|واتسابك|حسابك)',
].join('|'), 'gi');
/** "call me" followed by a name (a capital letter, not an app or "on"): how someone gives their name. */
const CALL_ME_NAME = /\b[Cc]all\s+(?:[Mm]e|[Uu]s)(?=\s+(?!(?:On|At|Via|WhatsApp|Whatsapp|Telegram|Back|Now|Later|Today|Tomorrow)\b)[A-Z][a-z])/g;
/** Before a long number: it is a bank account. */
const BANK_WORDS = /(?:iban|account|acct|a\/c|ايبان|حساب|الحساب)[^0-9]{0,14}$/i;

// ================================================================ what a phone number looks like (review R3-1)
// Digits run together across separators are a phone number only when they look like one: a trunk 0 (05x xxx xxxx),
// 00 or + and a country code, a Gulf mobile without its 0 (5x xxx xxxx), or a country code with the length of that
// country's numbers (966 5x xxx xxxx). Anything else of nine to fifteen digits is a phone only when it is written like
// one: one run, or up to four groups with the same separator, not a list (sizes, measurements, prices), not codes of
// the same length (order numbers), not after a word that says what it is (tracking, order, booking, size...) and not
// glued to letters (SBX5501928374). Dates, times and amounts are never part of a number. Mirrored in the database
// (private.number_hint, 0016).
const COUNTRY_SHAPES = '966\\d{9}|971\\d{8,9}|96[58]\\d{8}|97[34]\\d{8}|962\\d{9}|961\\d{7,8}|964\\d{10}|963\\d{9}|967\\d{9}|970\\d{9}'
  + '|20\\d{10}|21[23]\\d{9}|216\\d{8}|218\\d{9}|249\\d{9}|44\\d{10}|1\\d{10}|9[12]\\d{10}|880\\d{10}|90\\d{10}|60\\d{9,10}|62\\d{9,12}'
  + '|63\\d{10}|234\\d{10}|254\\d{9}|27\\d{9}|33\\d{9}|49\\d{10,11}|7\\d{10}|86\\d{11}';
const PHONE_SHAPE = new RegExp(`^(?:0\\d{8,10}|5\\d{8}|00\\d{8,15}|${COUNTRY_SHAPES})$`);
/** A run of digits shaped like a phone number (plus: written with a + before it). */
export function phoneShaped(digits: string, plus = false): boolean {
  return plus ? digits.length >= 8 && digits.length <= 15 : PHONE_SHAPE.test(digits);
}
/** How no list of sizes or prices starts: a trunk 0, 00, or a Gulf country code. */
const ANCHORED = /^(?:0|96[5-8]|97[134])/;
/** What separates the numbers of a list. */
const LIST_SEP = /^[\s,،/\-–—+|;]+$/;
/** Words that say what a number is (not a phone): codes, orders, tracking, bookings, sizes, prices; and carriers. */
const CODE_WORDS = 'isbn|ean|gtin|barcode|sku|upc|ref|reference|model|batch|lot|serial|codes?|items?|orders?|invoices?|inv|receipt|tracking|track|awb'
  + '|waybill|shipments?|parcels?|bookings?|reservations?|confirmation|voucher|coupon|discount|promo|gift\\s*card|card|room|sizes?|chest|length|sleeve'
  + '|measurements?|prices?|total|sar|sr|riyals?|ml|cm|kg'
  + '|باركود|الباركود|الدفعة|دفعة|الطلب|طلب|طلبي|الطلبية|طلبية|الطلبات|طلبات|طلباتي|الطلبان|الطلبين|الفاتورة|فاتورة|الشحنة|شحنة|الشحنات|التتبع|تتبع'
  + '|الحجز|حجز|الكود|كود|الرمز|رمز|الخصم|خصم|الكوبون|كوبون|المقاس|مقاس|المقاسات|مقاسات|القياس|قياس|القياسات|قياسات|السعر|سعر|الاسعار|اسعار|ريال|الغرفة|غرفة|القسيمة|قسيمة|البطاقة|بطاقة';
const CARRIERS = 'smsa|aramex|dhl|fedex|ups|naqel|spl|zajil|ajex|imile';
const CODE_BEFORE = new RegExp(`(?:^|[^a-z\\u0621-\\u064a])(?:${CODE_WORDS}|${CARRIERS})(?:[\\s:#.\\-]*(?:number|num|no|nos|is|are|رقم|رقمه|رقمها|هو|هي)(?![a-z\\u0621-\\u064a]))*`
  + `[\\s:#.\\-]*(?:(?:${CARRIERS})[\\s:#.\\-]*)?$`, 'i');
/** Barcode words: after them even a number shaped like a phone (a Saudi barcode looks like +62 8...) is a barcode. */
const BARCODE_BEFORE = /(?:isbn|ean|gtin|barcode|sku|upc|باركود|الرقم الدولي)[\s:#.-]*$/i;

/**
 * Dates (with a four-digit year), times and amounts (with decimals or thousands): never part of a phone number. Each
 * is a whole token: no digit right after it, nor a digit across a point, comma, colon or slash (the same before it is
 * checked by protectTokens: no lookbehind here).
 */
const AFTER = '(?!\\d)(?![.,٫:/]\\d)';
const PROTECTED_RES = [
  new RegExp(`(?:(?:19|20)\\d\\d([-/.])(?:0?[1-9]|1[0-2])\\1(?:0?[1-9]|[12]\\d|3[01])|(?:0?[1-9]|[12]\\d|3[01])([-/.])(?:0?[1-9]|1[0-2])\\2(?:19|20)\\d\\d|(?:0?[1-9]|1[0-2])([-/.])(?:0?[1-9]|[12]\\d|3[01])\\3(?:19|20)\\d\\d)${AFTER}`, 'g'),
  new RegExp(`(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?${AFTER}`, 'g'),
  new RegExp(`(?:[1-9]\\d{0,2},\\d{3}(?:[.٫]\\d{1,2})?|(?:[1-9]\\d{0,5}|0)[.٫]\\d{1,2})${AFTER}`, 'g'),
];
const isAsciiDigit = (s: string, k: number) => k >= 0 && k < s.length && s.charCodeAt(k) >= 48 && s.charCodeAt(k) <= 57;
const JOINER = /[.,٫:/]/;
/** The text with dates, times and amounts made letters ("q"), the same length, so they never join a number. */
function protectTokens(norm: string): string {
  let out = norm;
  for (const re of PROTECTED_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out))) {
      const a = m.index;
      const b = a + m[0].length;
      if (!isAsciiDigit(out, a - 1) && !(JOINER.test(out[a - 1] ?? '') && isAsciiDigit(out, a - 2))) out = out.slice(0, a) + 'q'.repeat(b - a) + out.slice(b);
      else re.lastIndex = a + 1;
    }
  }
  return out;
}

/** The Luhn check of a card number. */
export function luhn(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = d.charCodeAt(d.length - 1 - i) - 48;
    if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9; }
    sum += x;
  }
  return d.length > 0 && sum % 10 === 0;
}
/** The EAN-13 check digit of a barcode. */
export function ean13(d: string): boolean {
  if (!/^\d{13}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (d.charCodeAt(i) - 48) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === d.charCodeAt(12) - 48;
}

/** What a run of digits is: a phone number, a bank account, a card number, or nothing to hide. */
export function classifyNumber(r: { groups: string[]; seps: string[]; plus: boolean; real: number; words: number; before: string; glued: boolean; rtl?: boolean }): 'phone' | 'bank' | 'card' | null {
  const d = r.groups.join('');
  const n = d.length;
  if (r.words >= 7 && n >= 7) return 'phone';                       // a number spelled out
  if (n < 9 || (r.real < 6 && r.words < 7)) return null;
  const bank = BANK_WORDS.test(r.before.slice(-20));
  if (n > 15) {
    // an account number, two phone numbers run together, or a card number
    if (bank) return 'bank';
    for (let k = 9; k <= n - 9; k++) if (phoneShaped(d.slice(0, k), r.plus) && phoneShaped(d.slice(k))) return 'phone';
    const lens = r.groups.map((g) => g.length).join(',');
    if (n <= 19 && luhn(d) && (r.groups.length === 1 || r.groups.every((g) => g.length === 4) || lens === '4,6,5' || lens === '4,6,4')) return 'card';
    return null;
  }
  const list = r.groups.length >= 3 && r.groups.every((g) => g.length >= 2 && g.length <= 3) && r.seps.every((x) => LIST_SEP.test(x));
  // a right-to-left line (Arabic) shows groups in reverse order: "67 45 23 01 05" reads 05 01 23 45 67; read that way
  // only when it then starts like a phone number (0, 00, a Gulf code)
  const rev = r.rtl && r.groups.length >= 2 ? [...r.groups].reverse().join('') : '';
  const back = rev !== '' && ANCHORED.test(rev) && phoneShaped(rev);
  const shaped = (phoneShaped(d, r.plus) && (r.plus || ANCHORED.test(d) || !list)) || back;
  if (shaped) {
    const anchored = r.plus || ANCHORED.test(d) || back;
    if (!anchored && (BARCODE_BEFORE.test(r.before) || (n === 13 && ean13(d)) || (!r.plus && /^97[89]\d{10}$/.test(d)))) return null;   // a barcode, an ISBN
    return bank ? 'bank' : 'phone';
  }
  if (list) return null;                                                                      // sizes, measurements, prices
  if (r.groups.length >= 2 && r.groups[0].length >= 5 && r.groups.every((g) => g.length === r.groups[0].length)) return null;   // order numbers, codes
  if (CODE_BEFORE.test(r.before) || r.glued) return null;                                     // a tracking number, a code
  const kinds = r.seps.map((x) => x.replace(/\s+/g, '') || ' ');
  if (r.groups.length > 4 || kinds.some((x) => x !== kinds[0])) return null;                  // not written like a phone number
  if (n === 13 && ean13(d)) return null;
  return bank ? 'bank' : 'phone';
}
/** An IBAN: two letters, two check digits, then the account, with spaces or dashes allowed between groups. */
const IBAN_RE = /\b(?:SA|AE|KW|QA|OM|BH|GB|DE|FR|NL|BE|IE|ES|IT|IN|PK|EG|TR|JO|LB)[0-9]{2}(?:[ -]?[A-Z0-9]){10,30}\b/gi;

// ================================================================ finding them
type Span = { kind: ContactKind; a: number; b: number };   // a span of the normalised copy

function regexSpans(norm: string, re: RegExp, kind: ContactKind, group = 0): Span[] {
  const out: Span[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    if (group) {
      const lead = m.slice(1, group).reduce((n, g) => n + (g?.length ?? 0), 0);
      const g = m[group] ?? '';
      if (g) out.push({ kind, a: m.index + lead, b: m.index + lead + g.length });
    } else {
      out.push({ kind, a: m.index, b: m.index + m[0].length });
    }
  }
  return out;
}

/**
 * Runs of digits with anything but letters between them (up to four characters at a time: spaces, punctuation,
 * symbols, emoji), each classified by classifyNumber: a phone number, a bank account or a card number to hide, or an
 * ordinary number (a list of sizes, an order number, a date) to leave alone.
 */
function numberSpans(norm: string, units: Unit[]): Span[] {
  const out: Span[] = [];
  const work = protectTokens(norm);
  const rtl = /[\u0621-\u064a]/.test(norm);   // Arabic letters: the line may be shown right to left
  const isDigit = (k: number) => isAsciiDigit(work, k);
  const isSep = (k: number) => !isDigit(k) && !isLetter(work.codePointAt(k) ?? 0x41);
  let k = 0;
  while (k < work.length) {
    if (!isDigit(k)) { k++; continue; }
    const a = k;
    let b = k + 1;
    const groups: string[] = [work[a]];
    const seps: string[] = [];
    // a "+" right before the number belongs to it
    const plus = a > 0 && work[a - 1] === '+';
    for (let j = b; j < work.length;) {
      if (isDigit(j)) { groups[groups.length - 1] += work[j]; j++; b = j; continue; }
      let s = j;
      while (s < work.length && s - j < 4 && isSep(s)) s++;
      if (s > j && s < work.length && isDigit(s) && s - j <= 4) {
        // a comma and a space (a list: "size 56, 12 ml", "sizes 52, 54, 56") join only groups of three digits or more
        const sep = work.slice(j, s);
        if (/[,،]/.test(sep) && /\s/.test(sep)) {
          let next = 0;
          while (s + next < work.length && isDigit(s + next)) next++;
          if (groups[groups.length - 1].length < 3 || next < 3) break;
        }
        seps.push(sep);
        groups.push('');
        j = s;
        continue;
      }
      break;
    }
    k = b;
    let real = 0;
    let words = 0;
    for (let x = a; x < b; x++) if (isDigit(x)) { if (units[x].real) real++; else if (units[x].word) words++; }
    const start = plus ? a - 1 : a;
    const glued = (start > 0 && isLetter(work.codePointAt(start - 1) ?? 0)) || (b < work.length && isLetter(work.codePointAt(b) ?? 0));
    const kind = classifyNumber({ groups, seps, plus, real, words, before: work.slice(Math.max(0, start - 40), start).toLowerCase(), glued, rtl });
    if (kind) out.push({ kind, a: start, b });
  }
  return out;
}

/** Every contact detail or off-platform attempt, in normalised coordinates (overlapping spans included). */
function spans(norm: string, units: Unit[]): Span[] {
  const emails = EMAIL_RES.flatMap((re) => regexSpans(norm, re, 'email'));
  const inEmail = (s: Span) => emails.some((e) => s.a >= e.a && s.a < e.b);
  const urls = regexSpans(norm, URL_RE, 'url').filter((u) => !inEmail(u));
  const handles = regexSpans(norm, HANDLE_RE, 'handle', 2).filter((h) => !inEmail(h));
  const apps = [...regexSpans(norm, MESSAGING_RE, 'messaging'), ...regexSpans(norm, MESSAGING_SPACED, 'messaging')];
  // the name after an app ("insta: oud_house", "t.me/oudhouse", "telegram oudhouse_sa", "snap: oud.house")
  const appHandles: Span[] = [];
  APP_HANDLE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = APP_HANDLE_RE.exec(norm))) {
    const sep = m[1];
    const name = m[2];
    const marked = /[:/@：]/.test(sep);
    const app = m[0].slice(0, m[0].length - sep.length - name.length);
    if (!marked && (SHORT_APP.test(app) || !/[_.0-9]/.test(name))) continue;
    if (/^(?:com|net|org|me)$/i.test(name)) continue;
    const at = m.index + m[0].length - name.length;
    appHandles.push({ kind: 'handle', a: at, b: at + name.length });
    // a short name ("ig", "snap") counts as an app only with a handle after it
    if (!apps.some((x) => x.a <= m!.index && x.b >= m!.index + app.length)) apps.push({ kind: 'messaging', a: m.index, b: m.index + app.length });
    APP_HANDLE_RE.lastIndex = at + name.length;
  }
  const ibans = regexSpans(norm, IBAN_RE, 'bank').filter((b) => norm.slice(b.a, b.b).replace(/\D/g, '').length >= 10);
  const numbers = numberSpans(norm, units).filter((p) => !ibans.some((b) => p.a >= b.a && p.a < b.b) && !inEmail(p));
  // "call me Maryam" gives a name, it does not ask for a call
  const forSolicit = norm.replace(CALL_ME_NAME, (m) => ' '.repeat(m.length));
  return [...emails, ...urls, ...handles, ...apps, ...appHandles, ...ibans, ...numbers, ...regexSpans(forSolicit, SOLICIT_RE, 'solicit')];
}

/** A normalised span as the part of the original text it came from. */
function toHit(text: string, units: Unit[], s: Span): ContactHit {
  const start = units[s.a].start;
  const end = units[s.b - 1].end;
  return { kind: s.kind, match: text.slice(start, end), index: start };
}

/**
 * Every contact detail or off-platform attempt in the text, in the original's positions, in order. Overlapping hits
 * of different kinds are all kept (each kind is a flag); a hit inside a longer one of another kind is left out.
 */
export function detectContacts(text: string | null | undefined): ContactHit[] {
  if (!text) return [];
  const { norm, units } = normalize(text);
  if (!norm) return [];
  const all = spans(norm, units);
  const inside = (s: Span) => all.some((o) => o !== s && o.kind !== 'solicit' && s.kind !== 'solicit' && s.a >= o.a && s.b <= o.b && o.b - o.a > s.b - s.a);
  const kept = all.filter((s) => !inside(s));
  const uniq = kept.filter((s, i) => kept.findIndex((x) => x.a === s.a && x.b === s.b && x.kind === s.kind) === i);
  const solicitLast = (s: Span) => (s.kind === 'solicit' ? 1 : 0);
  return uniq.sort((x, y) => x.a - y.a || solicitLast(x) - solicitLast(y) || y.b - x.b).map((s) => toHit(text, units, s));
}

/** The contact details and off-platform attempts in the text, in order (a phrase and the app name inside it are both kept). */
export function findContacts(text: string | null | undefined): ContactHit[] {
  return detectContacts(text);
}

/** The text with contact details replaced by •••, for messages between customers and sellers. */
export function maskContacts(text: string): { text: string; masked: number } {
  // the solicit phrases stay readable; the contact details inside or next to them are masked on their own (overlapping
  // details are masked as one)
  const merged: { a: number; b: number }[] = [];
  for (const h of detectContacts(text).filter((x) => x.kind !== 'solicit').sort((x, y) => x.index - y.index)) {
    const a = h.index;
    const b = h.index + h.match.length;
    const last = merged[merged.length - 1];
    if (last && a <= last.b) last.b = Math.max(last.b, b);
    else merged.push({ a, b });
  }
  let out = text;
  for (const s of [...merged].reverse()) out = out.slice(0, s.a) + '•••' + out.slice(s.b);
  return { text: out, masked: merged.length };
}

/**
 * A number split across two messages ("my number is 05012" then "34567"): the digits at the start of this message
 * that complete a phone number begun at the end of the previous one, or null.
 */
export function splitNumber(previous: string | null | undefined, text: string): { match: string; index: number } | null {
  if (!previous) return null;
  const p = normalize(previous).norm;
  const { norm, units } = normalize(text);
  const tail = /(\+?[0-9][^A-Za-z؀-ۿ]{0,40})$/.exec(p);
  const head = /^[^A-Za-z؀-ۿ0-9]*([0-9][^A-Za-z؀-ۿ]{0,40}[0-9]|[0-9])/.exec(norm);
  if (!tail || !head) return null;
  const a = tail[1].replace(/\D/g, '');
  const b = head[1].replace(/\D/g, '');
  if (a.length < 3 || b.length < 3 || a.length + b.length < 9 || a.length + b.length > 15) return null;
  // only a number shaped like a phone (two order numbers in a row are not one: review R3-1)
  if (!phoneShaped(a + b, tail[1].startsWith('+'))) return null;
  const from = head[0].length - head[1].length;
  const start = units[from].start;
  const end = units[from + head[1].length - 1].end;
  return { match: text.slice(start, end), index: start };
}
