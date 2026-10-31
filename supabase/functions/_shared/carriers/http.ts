// How every carrier adapter calls its carrier's API (review R4-5, REVIEW-4), as moyasar.ts does for Moyasar: each
// call has a time limit, and a failure says whether the carrier DEFINITELY did not act. Only a refusal with the
// carrier's own JSON answer (400, 401, 403, 404, 422: the address, the weight, the account) is definite, so nothing
// was bought and the parcel is free for a new try. Anything else is unknown: a timeout, a dropped connection, a 5xx or
// an HTML gateway page, a 409 (a duplicate of a request it may have done), a 2xx without JSON. Then the label may have
// been sold, so create-shipment keeps the claim and asks again with the same key, which the carrier must answer with
// the label it already sold (SWITCH-ON.md).
import { CarrierError } from './types.ts';

const DEFINITE = new Set([400, 401, 403, 404, 422]);

export async function carrierCall<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs ?? 20000) });
  } catch (e) {
    throw new CarrierError(`The carrier did not answer (${(e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message})`, false, null);
  }
  const text = await res.text().catch(() => '');
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.ok && body !== null && typeof body === 'object') return body as T;
  const json = body !== null && typeof body === 'object';
  throw new CarrierError(`Carrier ${res.status}: ${json ? JSON.stringify(body).slice(0, 500) : text.slice(0, 200)}`, !res.ok && json && DEFINITE.has(res.status), res.status);
}
