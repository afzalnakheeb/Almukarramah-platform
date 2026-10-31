// Text people write to each other after a sale (messages, return details and answers, reviews and replies, a seller's
// cancellation reason) is cleaned here before it is stored: contact details are masked (phone numbers however they are
// written, emails, links, handles, messaging apps, bank account numbers), and what was found is kept as flags for our
// team, including an invitation to deal or pay outside the platform. A number split across two messages is caught
// in the second one. No imports besides contact.ts, so the app and the tests use it as it is.
import { detectContacts, maskContacts, splitNumber } from './contact.ts';

export type Cleaned = { text: string; masked: number; flags: string[] };

/**
 * Trimmed to max characters, control characters and invisible tricks removed (zero-width characters, embeddings and
 * direction overrides, which can show digits in another order than they are stored), contact details masked; flags
 * like contact_phone, solicit. The direction marks and isolates people type to keep mixed Arabic and English in order
 * stay (LRM, RLM, ALM, U+2066 to U+2069: review R3-7), and so do the joiners inside emoji and Persian words.
 * previous: the same person's last message in the conversation, to catch a number split across the two.
 */
export function cleanText(input: unknown, max: number, opts: { previous?: string | null } = {}): Cleaned {
  const raw = String(input ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u00AD\u180E\u200B\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n').trim().slice(0, max);
  if (!raw) return { text: '', masked: 0, flags: [] };
  const hits = detectContacts(raw);
  const masking = maskContacts(raw);
  let text = masking.text;
  let masked = masking.masked;
  const flags = new Set(hits.map((h) => (h.kind === 'solicit' ? 'solicit' : `contact_${h.kind}`)));
  // a bank account number is an invitation to pay outside Al Mukarramah
  if (hits.some((h) => h.kind === 'bank')) flags.add('solicit');
  const split = splitNumber(opts.previous, text);
  if (split) {
    text = text.slice(0, split.index) + '•••' + text.slice(split.index + split.match.length);
    masked++;
    flags.add('contact_phone');
    flags.add('contact_split');
  }
  return { text: text.trim(), masked, flags: [...flags].sort() };
}

/** Flags of several cleaned fields, once each. */
export function mergeFlags(...parts: Cleaned[]): string[] {
  return [...new Set(parts.flatMap((p) => p.flags))].sort();
}

export { RETURN_REASONS, returnReasons, type ReturnReason } from './returns.ts';
