// Contact details and attempts to take customers off the platform: phone numbers (including Arabic-Indic, Persian
// and full-width digits, the letters O and l standing in for 0 and 1, any separators, numbers spelled out in English
// or Arabic), email addresses (also "name at gmail dot com"), links and domains, social handles, messaging apps (also
// spaced out, "w h a t s a p p"), bank account numbers (IBAN) and invitations to buy or pay outside Al Mukarramah, in
// English and Arabic. Used by the listing screening (block with a reason the seller can fix), the seller's live hints
// and the in-platform messages (masked). No imports: the app imports this file directly, so the patterns avoid
// lookbehind and Unicode property escapes (not every JavaScript engine the apps run on has them).

export type ContactKind = 'phone' | 'email' | 'url' | 'handle' | 'messaging' | 'bank' | 'solicit';
export type ContactHit = { kind: ContactKind; match: string; index: number };

/** Western digits for Arabic-Indic (٠-٩), Eastern Arabic-Indic (۰-۹) and full-width (０-９) digits: one character each. */
export function westernDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[０-９]/g, (d) => String(d.charCodeAt(0) - 0xff10));
}

const TLD = 'com|net|org|sa|ae|kw|qa|om|bh|in|co|io|me|shop|store|info|biz|ly|gl|link|site|online|app|uk|us|pk|eg|tr|my|id|tv|page|website';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// "ali at gmail dot com", "ali (at) gmail (dot) com", "ali [at] gmail.com" (a plain "order at shop.com" is a link)
const EMAIL_SPOKEN = new RegExp(`\\b[A-Za-z0-9._%+-]{2,}\\s*(?:\\(at\\)|\\[at\\])\\s*[A-Za-z0-9-]{2,}\\s*(?:\\.|\\(dot\\)|\\[dot\\]|\\s+dot\\s+)\\s*(?:${TLD})\\b`
  + `|\\b[A-Za-z0-9._%+-]{2,}\\s+at\\s+[A-Za-z0-9-]{2,}\\s*(?:\\(dot\\)|\\[dot\\]|\\s+dot\\s+)\\s*(?:${TLD})\\b`, 'gi');
const URL = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s<>"'،]+|\\b[A-Za-z][A-Za-z0-9-]{1,62}(?:\\.[A-Za-z0-9-]{2,62})*\\.(?:${TLD})(?:\\/[^\\s<>"'،]*)?\\b`, 'gi');
const HANDLE = /(?:^|[\s(])@[A-Za-z0-9_.]{3,30}\b/g;
const MESSAGING = /\b(?:whats\s?app|wa\.me|telegram|t\.me|instagram|insta|snapchat|snap\s?chat|tik\s?tok|facebook|twitter|wechat|viber)\b|واتساب|واتس\s?اب|واتس|وتساب|تلغرام|تلجرام|تليجرام|انستقرام|انستغرام|إنستغرام|سناب|تيك\s?توك|فيسبوك|فيس\s?بوك|تويتر/gi;
// the same names spelled out with spaces, dots or dashes between the letters
const SPACED_NAMES = ['whatsapp', 'telegram', 'instagram', 'snapchat', 'tiktok', 'facebook', 'twitter', 'wechat'];
const MESSAGING_SPACED = new RegExp(`\\b(?:${SPACED_NAMES.map((w) => w.split('').join('[\\s._-]+')).join('|')})\\b`, 'gi');
const SOLICIT = /\b(?:contact|call|text|message|dm|whatsapp)\s+(?:me|us)\b|\b(?:order|buy|pay)\s+(?:directly|outside)\b|\bdirect\s+(?:order|sale|contact)\b|\b(?:bank|wire)\s+transfer\b|\bpay\s+(?:me|us)\s+(?:by|via|with|through)\b|\b(?:transfer|send)\s+(?:the\s+)?(?:money|payment)\s+(?:to\s+)?(?:me|us|my|our)\b|تواصل\s+(?:معي|معنا)|اتصل\s+(?:بي|بنا)|راسلني|راسلنا|كلمني|اطلب\s+مباشرة|للطلب\s+(?:عبر|على)|خارج\s+المنصة|تحويل\s+بنكي|حوالة\s+بنكية|حول\s+لي|ادفع\s+لي/gi;
// numbers that are not phones when introduced like this
const NOT_PHONE = /(?:isbn|ean|gtin|barcode|sku|upc|ref|model|batch|lot|باركود|الرقم الدولي|رقم الدفعة)[\s:#.-]*$/i;
// an IBAN (two letters, two check digits, then the account), spaces allowed between groups
const IBAN = /\b(?:SA|AE|KW|QA|OM|BH|GB|DE|FR|NL|BE|IE|ES|IT|IN|PK|EG|TR|JO|LB)[0-9]{2}(?:[ -]?[A-Z0-9]){10,30}\b/gi;
const NUMBER_WORD = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|صفر|واحد|اثنان|اثنين|ثلاثة|ثلاث|أربعة|اربعة|أربع|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثمان|تسعة|تسع)';
// seven or more number words in a row, not inside a longer word ("someone" is not "one"); group 2 is the number
const LETTER = 'A-Za-z\\u00C0-\\u024F\\u0600-\\u06FF';
const SPELLED = new RegExp(`(^|[^${LETTER}])(${NUMBER_WORD}(?:[\\s,.،-]+${NUMBER_WORD}){6,})(?![${LETTER}])`, 'gi');

/** Letters that stand in for digits inside a number (O for 0, l and I for 1), one character each; only between digits. */
function digitLike(s: string): string {
  return westernDigits(s).replace(/\d[\dOoQlI|]*\d/g, (run) => run.replace(/[OoQ]/g, '0').replace(/[lI|]/g, '1'));
}

/** Spelled-out numbers (the match without the character before it). */
function spelled(text: string): ContactHit[] {
  const out: ContactHit[] = [];
  SPELLED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPELLED.exec(text))) {
    out.push({ kind: 'phone', match: m[2], index: m.index + m[1].length });
    // the next number may start right after this one's last character
    SPELLED.lastIndex = m.index + m[0].length;
  }
  return out;
}

function phones(text: string): ContactHit[] {
  const t = digitLike(text);
  const real = westernDigits(text);
  const out: ContactHit[] = [];
  const re = /\+?\d[\d\s().\-/_]{7,24}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
    // at least six real digits: "lol 100% ooh" is not a number
    if (real.slice(m.index, m.index + raw.length).replace(/\D/g, '').length < 6) continue;
    const before = t.slice(Math.max(0, m.index - 16), m.index);
    if (NOT_PHONE.test(before)) continue;
    if (/^97[89]\d{10}$/.test(digits) && !raw.startsWith('+')) continue;   // an ISBN-13
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(raw.trim())) continue;       // a date
    out.push({ kind: 'phone', match: text.slice(m.index, m.index + raw.length), index: m.index });
  }
  return out;
}

function collect(text: string, re: RegExp, kind: ContactKind): ContactHit[] {
  const out: ContactHit[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (kind === 'handle') {
      const at = m[0].indexOf('@');
      out.push({ kind, match: m[0].slice(at), index: m.index + at });
    } else {
      out.push({ kind, match: m[0], index: m.index });
    }
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

const inside = (h: ContactHit, others: ContactHit[]) => others.some((o) => o !== h && h.index >= o.index && h.index + h.match.length <= o.index + o.match.length && o.match.length > h.match.length);

/** Every contact detail or off-platform attempt in the text, in order. */
export function findContacts(text: string | null | undefined): ContactHit[] {
  if (!text) return [];
  const emails = [...collect(text, EMAIL, 'email'), ...collect(text, EMAIL_SPOKEN, 'email')];
  // a domain inside an email address is not a separate link
  const urls = collect(text, URL, 'url').filter((u) => !emails.some((e) => u.index >= e.index && u.index < e.index + e.match.length));
  const banks = collect(text, IBAN, 'bank').filter((b) => b.match.replace(/\D/g, '').length >= 10);
  const numbers = [...phones(text), ...spelled(text)]
    .filter((p) => !banks.some((b) => p.index >= b.index && p.index < b.index + b.match.length));
  const hits = [...emails, ...urls, ...banks, ...numbers, ...collect(text, HANDLE, 'handle'), ...collect(text, MESSAGING, 'messaging'),
    ...collect(text, MESSAGING_SPACED, 'messaging'), ...collect(text, SOLICIT, 'solicit')];
  const uniq = hits.filter((h, i) => hits.findIndex((x) => x.index === h.index && x.match === h.match) === i);
  return uniq.filter((h) => h.kind === 'solicit' || !inside(h, uniq.filter((x) => x.kind !== 'solicit'))).sort((a, b) => a.index - b.index);
}

/** The text with contact details replaced by •••, for messages between customers and sellers. */
export function maskContacts(text: string): { text: string; masked: number } {
  const hits = findContacts(text).filter((h) => h.kind !== 'solicit');
  let out = text;
  let masked = 0;
  // replace from the end so earlier indexes stay valid
  for (const h of [...hits].sort((a, b) => b.index - a.index)) {
    const at = out.indexOf(h.match, Math.max(0, h.index - 2));
    if (at < 0) continue;
    out = out.slice(0, at) + '•••' + out.slice(at + h.match.length);
    masked++;
  }
  return { text: out, masked };
}

/**
 * A number split across two messages ("my number is 05012" then "34567"): the digits at the start of this message
 * that complete a phone number begun at the end of the previous one, or null.
 */
export function splitNumber(previous: string | null | undefined, text: string): { match: string; index: number } | null {
  if (!previous) return null;
  const tail = /(\+?[\d\s().\-/_]*\d)\s*$/.exec(digitLike(previous));
  const head = /^\s*(\d[\d\s().\-/_]*)/.exec(digitLike(text));
  if (!tail || !head) return null;
  const a = tail[1].replace(/\D/g, '');
  const b = head[1].replace(/\D/g, '');
  if (a.length < 3 || b.length < 3 || a.length + b.length < 9 || a.length + b.length > 15) return null;
  const index = head[0].length - head[1].length;
  return { match: text.slice(index, index + head[1].trimEnd().length), index };
}
