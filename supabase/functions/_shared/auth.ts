// ============================================================================
// Shared edge-function auth + response helpers (Phase 3)
// ----------------------------------------------------------------------------
// Standardises how every edge function resolves the authenticated user and
// returns errors, so auth logic isn't duplicated/divergent across functions.
//
// Import from a function:  import { ... } from '../_shared/auth.ts'
// Then redeploy that function (supabase bundles _shared on deploy).
// ============================================================================
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS allowlist — comma-separated, e.g. "https://maxxit.vercel.app,http://localhost:5173".
// UNSET → falls back to '*' (current behaviour) so nothing breaks until configured.
// TODO: set ALLOWED_ORIGINS in the Supabase Edge Function secrets to your real
//       production domain + localhost dev origins to lock CORS down.
//       `supabase secrets set ALLOWED_ORIGINS="https://<prod>,http://localhost:5173"`
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

// Origin-aware CORS headers. Pass the request so the allowed origin can be echoed
// (you cannot send a list in Access-Control-Allow-Origin). With no allowlist set,
// returns '*' exactly as before.
export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') ?? ''
  const allowOrigin = ALLOWED_ORIGINS.length === 0
    ? '*'
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0])
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}

export function unauthorized(req?: Request, message = 'Unauthorized'): Response {
  return jsonResponse({ error: message }, 401, req)
}

/**
 * Resolve the authenticated user from the request's Authorization header.
 *
 * Returns the user plus an anon (RLS-respecting) client bound to that token.
 * `user` is null when the token is missing/invalid OR is the project anon key
 * (which carries no user) — callers MUST reject those with `unauthorized()`.
 * This is what prevents anonymous abuse: the public anon key alone never
 * resolves to a user, so anon-key-only calls are rejected.
 */
export async function getAuthedUser(
  req: Request,
): Promise<{ user: any | null; userClient: SupabaseClient; authHeader: string }> {
  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  return { user: error ? null : user, userClient, authHeader }
}

/**
 * Service-role client — BYPASSES RLS. Use only for operations that genuinely
 * require it (e.g. reading the locked-down OAuth token tables, which have no
 * client RLS policy). ALWAYS scope queries by the authenticated user's id.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )
}
