// Which return reasons a customer may choose for a parcel, from the items' return policies and the dates. No imports:
// the app uses it as it is (the database checks everything again when the request is sent).
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
