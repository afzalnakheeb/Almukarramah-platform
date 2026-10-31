// A refusal meant for the person using the app, in English and Arabic (review M8). No imports, so modules that the
// app or the tests load directly (cart.ts, checkout.ts) can throw it without pulling in supabase-js.

/** A refusal meant for the person using the app, with its Arabic (thrown by shared code; handle() answers 400). */
export class UserError extends Error {
  readonly ar: string;
  readonly code: string | null;
  constructor(en: string, ar: string, code: string | null = null) {
    super(en);
    this.name = 'UserError';
    this.ar = ar;
    this.code = code;
  }
}
