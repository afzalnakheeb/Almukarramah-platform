// Text people write to each other after a sale (messages, return details and answers, reviews and replies) is
// cleaned here before it is stored: contact details are masked (phone numbers, emails, links, handles, messaging
// apps), and what was found is kept as flags for our team, including an invitation to deal outside the platform.
// No imports besides contact.ts, so the app and the tests use it as it is.
import { findContacts, maskContacts } from './contact.ts';

export type Cleaned = { text: string; masked: number; flags: string[] };

/** Trimmed to max characters, control characters removed, contact details masked; flags like contact_phone, solicit. */
export function cleanText(input: unknown, max: number): Cleaned {
  // eslint-disable-next-line no-control-regex
  const raw = String(input ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  if (!raw) return { text: '', masked: 0, flags: [] };
  const hits = findContacts(raw);
  const { text, masked } = maskContacts(raw);
  const flags = [...new Set(hits.map((h) => (h.kind === 'solicit' ? 'solicit' : `contact_${h.kind}`)))].sort();
  return { text: text.trim(), masked, flags };
}

/** Flags of several cleaned fields, once each. */
export function mergeFlags(...parts: Cleaned[]): string[] {
  return [...new Set(parts.flatMap((p) => p.flags))].sort();
}

export { RETURN_REASONS, returnReasons, type ReturnReason } from './returns.ts';
