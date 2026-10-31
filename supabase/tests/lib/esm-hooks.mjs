// Module hooks for the Edge Function tests (registered by edge.ts): the functions import supabase-js from esm.sh, as
// Deno does; under Node that import is answered by the local stand-in (fake-supabase.ts). Nothing else is remapped,
// and no other remote import is allowed, so a test can never reach the network.
const FAKE = new URL('./fake-supabase.ts', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) return { url: FAKE, shortCircuit: true };
  if (/^(https?|npm|jsr):/.test(specifier)) throw new Error(`remote import in a test: ${specifier}`);
  return next(specifier, context);
}
