// supabase/functions/ekonomi-bank-link/index.ts
// ============================================================================
// Ekonomi auto-sync — link flow (see EKONOMI-INTEGRATION.md).
//
// Deploy WITHOUT JWT verification — the GET callback branch is hit directly
// by the user's browser via Enable Banking's redirect, with no Supabase
// session attached (auth is handled internally via the `state` row instead):
//
//   supabase functions deploy ekonomi-bank-link --no-verify-jwt
//
// Two responsibilities, routed by HTTP method:
//
//   POST  Authorization: Bearer <supabase JWT>
//     { "aspspName": "Swedbank", "aspspCountry": "SE" }
//     → { url: "<redirect the browser here for BankID login>" }
//     Called from the logged-in SiggeOS app (Settings/Ekonomi "Koppla
//     bankkonto" button). Mints a short-lived `state` row so the GET
//     callback below can attribute the finished link to the right user.
//
//   GET   ?code=...&state=...
//     Enable Banking's own redirect target after the user completes BankID
//     login. Exchanges `code` for a session, stores the linked account in
//     bank_connections, then 302s the browser back into the app.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, getAuthedUser, serviceClient } from '../_shared/auth.ts'
import { startAuth, createSession } from '../_shared/enableBanking.ts'

// This function's OWN URL — Enable Banking needs it as `redirect_url`, and
// it must be added to the Application's whitelisted redirect URLs in their
// Control Panel too (both must match exactly).
const SELF_URL = 'https://foctdzzbonepdzeubate.supabase.co/functions/v1/ekonomi-bank-link'
// Where to send the browser once linking is done (success or failure).
const APP_RETURN_URL = 'https://siggeos.app/ekonomi' // TODO: confirm the real prod app URL

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const svc = serviceClient()

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const ebError = url.searchParams.get('error')
    if (ebError) {
      return Response.redirect(`${APP_RETURN_URL}?bank_link=error&reason=${encodeURIComponent(ebError)}`, 302)
    }
    if (!code || !state) return jsonResponse({ error: 'missing code/state' }, 400, req)

    const { data: reqRow } = await svc
      .from('bank_link_requests').select('*').eq('state', state).maybeSingle()
    if (!reqRow) return Response.redirect(`${APP_RETURN_URL}?bank_link=error&reason=expired_state`, 302)
    // Single-use — delete immediately regardless of what happens next.
    await svc.from('bank_link_requests').delete().eq('state', state)

    try {
      const session = await createSession(code)
      const rows = (session.accounts || []).map((acc) => ({
        user_id: reqRow.user_id,
        aspsp_name: reqRow.aspsp_name,
        aspsp_country: reqRow.aspsp_country,
        session_id: session.session_id,
        account_uid: acc.uid,
        account_name: acc.name || null,
      }))
      if (rows.length) {
        await svc.from('bank_connections').upsert(rows, { onConflict: 'user_id,account_uid' })
      }
      return Response.redirect(`${APP_RETURN_URL}?bank_link=ok&accounts=${rows.length}`, 302)
    } catch (e) {
      console.error('ekonomi-bank-link session exchange failed:', e)
      return Response.redirect(`${APP_RETURN_URL}?bank_link=error&reason=session_exchange_failed`, 302)
    }
  }

  if (req.method === 'POST') {
    const { user } = await getAuthedUser(req)
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, req)

    let body: any = {}
    try { body = await req.json() } catch { /* defaults below */ }
    const aspspName = typeof body.aspspName === 'string' ? body.aspspName : 'Swedbank'
    const aspspCountry = typeof body.aspspCountry === 'string' ? body.aspspCountry : 'SE'

    const state = crypto.randomUUID()
    const { error: insErr } = await svc.from('bank_link_requests').insert({
      state, user_id: user.id, aspsp_name: aspspName, aspsp_country: aspspCountry,
    })
    if (insErr) return jsonResponse({ ok: false, error: insErr.message }, 500, req)

    try {
      const auth = await startAuth({ aspspName, aspspCountry, state, redirectUrl: SELF_URL })
      return jsonResponse({ ok: true, url: auth.url }, 200, req)
    } catch (e) {
      await svc.from('bank_link_requests').delete().eq('state', state)
      console.error('ekonomi-bank-link startAuth failed:', e)
      return jsonResponse({ ok: false, error: String(e?.message || e) }, 500, req)
    }
  }

  return jsonResponse({ error: 'GET or POST only' }, 405, req)
})
