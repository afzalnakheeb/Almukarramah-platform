// Calls the Claude Messages API with the existing ANTHROPIC_API_KEY (no new secrets). Models come from env vars with
// defaults: SCREENING_FAST_MODEL (fast pass) and SCREENING_STRONG_MODEL (escalation; falls back to the older
// LISTING_CHECK_MODEL). A failed or slow call throws: the caller records an error and never passes anything unchecked.
import type { ModelCall } from './screening.ts';

export const DEFAULT_FAST_MODEL = 'claude-haiku-5-5';
export const DEFAULT_STRONG_MODEL = 'claude-sonnet-5-5';

export function screeningModels(get: (name: string) => string | undefined) {
  return {
    fast: get('SCREENING_FAST_MODEL') || DEFAULT_FAST_MODEL,
    strong: get('SCREENING_STRONG_MODEL') || get('LISTING_CHECK_MODEL') || DEFAULT_STRONG_MODEL,
  };
}

/** A ModelCall bound to an API key. */
export function claudeCaller(apiKey: string, opts: { maxTokens?: number; timeoutMs?: number; fetcher?: typeof fetch } = {}): ModelCall {
  const key = apiKey.trim().replace(/^["']|["']$/g, '');
  const doFetch = opts.fetcher ?? fetch;
  return async (model, system, content) => {
    const t0 = Date.now();
    const res = await doFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: opts.maxTokens ?? 1200, temperature: 0, system, messages: [{ role: 'user', content }] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45000),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out = await res.json() as { model?: string; content?: { type: string; text?: string }[] };
    const text = out.content?.find((c) => c.type === 'text')?.text ?? '';
    if (!text) throw new Error('empty answer');
    return { text, model: out.model ?? model, latencyMs: Date.now() - t0 };
  };
}

/** An image block for the model: base64 when small enough, otherwise a short-lived signed URL. */
export function imageBlock(p: { bytes?: Uint8Array; mime: string; url?: string }) {
  if (p.bytes && p.bytes.length <= 3_750_000) {
    let s = '';
    for (let i = 0; i < p.bytes.length; i += 0x8000) s += String.fromCharCode(...p.bytes.subarray(i, i + 0x8000));
    return { type: 'image', source: { type: 'base64', media_type: p.mime, data: btoa(s) } };
  }
  if (p.url) return { type: 'image', source: { type: 'url', url: p.url } };
  throw new Error('image too large to send without a link');
}
