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

export const RETURN_REASONS = ['changed_mind', 'not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item', 'not_received'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** Which reasons a customer may choose for a delivered (or overdue) parcel, given the items' return policies. */
export function returnReasons(p: {
  delivered: boolean; overdue: boolean; policies: (string | null)[]; changeMindOpen: boolean; problemOpen: boolean;
}): ReturnReason[] {
  const out: ReturnReason[] = [];
  if (p.delivered && p.changeMindOpen && p.policies.some((x) => (x ?? 'standard') === 'standard' || x === 'unopened_only')) out.push('changed_mind');
  if (p.delivered && p.problemOpen) out.push('not_as_described', 'faulty', 'damaged', 'wrong_item', 'missing_item');
  if (p.overdue || (p.delivered && p.problemOpen)) out.push('not_received');
  return out;
}
