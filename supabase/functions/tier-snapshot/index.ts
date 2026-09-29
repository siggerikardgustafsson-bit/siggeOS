// ============================================================================
// tier-snapshot — nightly tier_snapshots row for every user (post_deploy_22).
// ----------------------------------------------------------------------------
// Before this, a snapshot was only written when the Dashboard was opened, so
// tier history (graphs, Jarvis tier trends) had a hole for every day the app
// wasn't opened. This runs the exact Dashboard tier logic server-side — the
// bundle is generated from src/lib/tierCompute.js by `npm run build`.
//
// Called by pg_cron at 21:45 UTC (23:45 CEST / 22:45 CET), when the UTC and
// Stockholm calendar dates agree — tierCompute keys dates in runtime-local
// time, which is UTC here.
//
// Auth: x-cron-secret header == Vault secret 'nightly_cron_secret' (read via
// a service-role-only RPC). Deployed with --no-verify-jwt.
// `?dry=1` computes and returns the rows without writing them.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, unauthorized, serviceClient } from '../_shared/auth.ts'
// @ts-ignore — generated plain-JS bundle
import { fetchTierInputs, computeTierCategories, tierSnapshotRow } from '../_shared/tierCompute.bundle.js'

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = serviceClient()
  const provided = req.headers.get('x-cron-secret') || ''
  const { data: expected, error: secretErr } = await supabase.rpc('get_nightly_cron_secret')
  if (secretErr || !expected || provided !== expected) return unauthorized(req)

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10)

  const { data: users, error: usersErr } = await supabase.from('profiles').select('id')
  if (usersErr) {
    return new Response(JSON.stringify({ error: usersErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const results: Record<string, unknown>[] = []
  for (const { id: userId } of users || []) {
    try {
      const inputs = await fetchTierInputs(supabase, userId, today)
      const { cats } = computeTierCategories(inputs, today)
      // No data in any category (e.g. an unused account) → no row, instead
      // of writing an all-null snapshot every night.
      if (!cats.some((c: any) => c.hasData)) { results.push({ userId, skipped: 'no_data' }); continue }
      const row = tierSnapshotRow(cats, userId, dateStr)
      if (!dry) {
        const { error } = await supabase.from('tier_snapshots').upsert(row, { onConflict: 'user_id,date' })
        if (error) { results.push({ userId, error: error.message }); continue }
      }
      results.push(dry ? { userId, row, cats: cats.map((c: any) => ({
        id: c.id, tier: c.tier?.tier ?? null, hasData: c.hasData,
        bottleneck: c.levelUp?.primaryBottleneck ?? null,
        requirements: (c.levelUp?.requirements || []).map((r: any) => `${r.label}: ${r.currentLabel} / ${r.targetLabel} (${r.gapLabel})`),
        details: (c.details || []).map((d: any) => `${d.label}: ${typeof d.value === 'string' || typeof d.value === 'number' ? d.value : '?'}${d.tierInfo?.tier != null ? ' [T' + d.tierInfo.tier + ']' : ''}`),
      })) } : { userId, ok: true })
    } catch (e) {
      results.push({ userId, error: e instanceof Error ? e.message : String(e) })
    }
  }
  console.log('tier-snapshot:', JSON.stringify(results))
  return new Response(JSON.stringify({ ok: true, date: dateStr, dry, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
