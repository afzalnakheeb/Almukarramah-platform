// Contact details and attempts to take customers off the platform: phone numbers (including Arabic-Indic digits),
// email addresses, links and domains, social handles, messaging apps and "contact me directly" phrases, in English
// and Arabic. Used by the listing screening (block with a reason the seller can fix), the seller's live hints and the
// in-platform messages (masked). No imports: the app imports this file directly.

export type ContactKind = 'phone' | 'email' | 'url' | 'handle' | 'messaging' | 'solicit';
export type ContactHit = { kind: ContactKind; match: string; index: number };

/** Western digits for Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits. */
export function westernDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const TLD = 'com|net|org|sa|ae|kw|qa|om|bh|in|co|io|me|shop|store|info|biz|ly|gl|link|site|online|app|uk|us|pk|eg|tr|my|id|tv|page|website';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = new RegExp(`(?:https?:\\/\\/|www\\.)[^\\s<>"'،]+|\\b[A-Za-z][A-Za-z0-9-]{1,62}(?:\\.[A-Za-z0-9-]{2,62})*\\.(?:${TLD})(?:\\/[^\\s<>"'،]*)?\\b`, 'gi');
const HANDLE = /(?:^|[\s(])@[A-Za-z0-9_.]{3,30}\b/g;
const MESSAGING = /\b(?:whats\s?app|wa\.me|telegram|t\.me|instagram|insta|snapchat|snap\s?chat|tik\s?tok|facebook|twitter|wechat|viber)\b|واتساب|واتس\s?اب|واتس|وتساب|تلغرام|تلجرام|تليجرام|انستقرام|انستغرام|إنستغرام|سناب|تيك\s?توك|فيسبوك|فيس\s?بوك|تويتر/gi;
const SOLICIT = /\b(?:contact|call|text|message|dm|whatsapp)\s+(?:me|us)\b|\b(?:order|buy|pay)\s+(?:directly|outside)\b|\bdirect\s+(?:order|sale|contact)\b|تواصل\s+(?:معي|معنا)|اتصل\s+(?:بي|بنا)|راسلني|راسلنا|كلمني|اطلب\s+مباشرة|للطلب\s+(?:عبر|على)|خارج\s+المنصة/gi;
// numbers that are not phones when introduced like this
const NOT_PHONE = /(?:isbn|ean|gtin|barcode|sku|upc|ref|model|batch|lot|باركود|الرقم الدولي|رقم الدفعة)[\s:#.-]*$/i;

function phones(text: string): ContactHit[] {
  const t = westernDigits(text);
  const out: ContactHit[] = [];
  const re = /\+?\d[\d\s().-]{7,22}\d/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) continue;
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

/** Every contact detail or off-platform attempt in the text, in order. */
export function findContacts(text: string | null | undefined): ContactHit[] {
  if (!text) return [];
  const emails = collect(text, EMAIL, 'email');
  // a domain inside an email address is not a separate link
  const urls = collect(text, URL, 'url').filter((u) => !emails.some((e) => u.index >= e.index && u.index < e.index + e.match.length));
  const hits = [...emails, ...urls, ...phones(text), ...collect(text, HANDLE, 'handle'), ...collect(text, MESSAGING, 'messaging'), ...collect(text, SOLICIT, 'solicit')];
  return hits.sort((a, b) => a.index - b.index);
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
