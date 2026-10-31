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

export type ContactKind = 'phone' | 'email' | 'url' | 'handle' | 'messaging' | 'bank' | 'solicit';
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
const EMAIL_RES: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // spaces around @ and dots, the words at/dot in brackets: "ali @ gmail . com", "ali@gmail dot com", "ali {at} gmail {dot} com"
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s*${AT}\\s*[A-Za-z0-9-]{2,}(?:\\s*${DOT}\\s*[A-Za-z0-9-]{2,})*?\\s*${DOT}\\s*(?:${TLD})(?![A-Za-z])`, 'gi'),
  // the word at with the word dot: "ali at gmail dot com" ("order at shop.com" is a link, found as one below)
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s+at\\s+[A-Za-z0-9-]{2,}\\s*(?:\\(dot\\)|\\[dot\\]|\\{dot\\}|<dot>|\\s+dot\\s+)\\s*(?:${TLD})(?![A-Za-z])`, 'gi'),
  // a mail provider is enough: "ali at gmail", "ali @ hotmail"
  new RegExp(`[A-Za-z0-9._%+-]{2,}\\s*(?:${AT}|\\s+at\\s+)\\s*(?:${PROVIDERS})(?![A-Za-z])`, 'gi'),
  // written without spaces: "aliATgmailDOTcom"
  new RegExp(`[a-z0-9._-]{2,}AT[a-z0-9-]{2,}DOT(?:${TLD})(?![a-z])`, 'g'),
];
const URL_RE = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s<>"'،]+|\\b[A-Za-z][A-Za-z0-9-]{1,62}(?:\\.[A-Za-z0-9-]{2,62})*\\.(?:${TLD})(?:\\/[^\\s<>"'،]*)?\\b`, 'gi');
/** @name after anything that is not part of an email address: "ig:@name", "IG/@name", "(@name)" */
const HANDLE_RE = /(^|[^A-Za-z0-9._%+-])(@[A-Za-z0-9_.]{3,30})(?![A-Za-z0-9_])/g;
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
/** Numbers that are not phones when introduced like this. */
const NOT_PHONE = /(?:isbn|ean|gtin|barcode|sku|upc|ref|model|batch|lot|باركود|الرقم الدولي|رقم الدفعة)[\s:#.-]*$/i;
/** Before a long number: it is a bank account. */
const BANK_WORDS = /(?:iban|account|acct|a\/c|ايبان|حساب|الحساب)[^0-9]{0,14}$/i;
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
 * symbols, emoji). Nine to fifteen digits are a phone number; more are several numbers run together, or an account.
 */
function numberSpans(norm: string, units: Unit[]): Span[] {
  const out: Span[] = [];
  const isDigit = (k: number) => norm.charCodeAt(k) >= 48 && norm.charCodeAt(k) <= 57;
  const isSep = (k: number) => !isDigit(k) && !isLetter(norm.codePointAt(k) ?? 0x41);
  let k = 0;
  while (k < norm.length) {
    if (!isDigit(k)) { k++; continue; }
    const a = k;
    let b = k + 1;
    const groups: number[] = [1];
    // a "+" right before the number belongs to it
    const plus = a > 0 && norm[a - 1] === '+';
    for (let j = b; j < norm.length;) {
      if (isDigit(j)) { groups[groups.length - 1]++; j++; b = j; continue; }
      let s = j;
      while (s < norm.length && s - j < 4 && isSep(s)) s++;
      if (s > j && s < norm.length && isDigit(s) && s - j <= 4) {
        // a comma and a space (a list: "size 56, 12 ml", "sizes 52, 54, 56") join only groups of three digits or more
        const sep = norm.slice(j, s);
        if (/[,،]/.test(sep) && /\s/.test(sep)) {
          let next = 0;
          while (s + next < norm.length && isDigit(s + next)) next++;
          if (groups[groups.length - 1] < 3 || next < 3) break;
        }
        groups.push(0);
        j = s;
        continue;
      }
      break;
    }
    k = b;
    const digits = groups.reduce((n, g) => n + g, 0);
    let real = 0;
    let words = 0;
    for (let x = a; x < b; x++) if (isDigit(x)) { if (units[x].real) real++; else if (units[x].word) words++; }
    const span = { a: plus ? a - 1 : a, b };
    const before = norm.slice(Math.max(0, a - 16), a);
    if (words >= 7 && digits >= 7) { out.push({ kind: 'phone', ...span }); continue; }   // a number spelled out
    if (digits < 9 || (real < 6 && words < 7)) continue;
    const text = norm.slice(a, b);
    if (NOT_PHONE.test(before)) continue;
    if (digits <= 15) {
      const plain = text.replace(/\D/g, '');
      if (/^97[89]\d{10}$/.test(plain) && !plus) continue;              // an ISBN-13
      if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(text)) continue;        // a date
      out.push({ kind: BANK_WORDS.test(norm.slice(Math.max(0, a - 20), a)) ? 'bank' : 'phone', ...span });
      continue;
    }
    // more than fifteen digits: two phone numbers together, or an account number
    let split = false;
    for (let g = 1, left = groups[0]; g < groups.length; left += groups[g], g++) {
      if (left >= 9 && left <= 15 && digits - left >= 9 && digits - left <= 15) { split = true; break; }
    }
    out.push({ kind: split && !BANK_WORDS.test(norm.slice(Math.max(0, a - 20), a)) ? 'phone' : 'bank', ...span });
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
  return [...emails, ...urls, ...handles, ...apps, ...appHandles, ...ibans, ...numbers, ...regexSpans(norm, SOLICIT_RE, 'solicit')];
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
  const from = head[0].length - head[1].length;
  const start = units[from].start;
  const end = units[from + head[1].length - 1].end;
  return { match: text.slice(start, end), index: start };
}
