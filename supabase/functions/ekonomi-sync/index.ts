// supabase/functions/ekonomi-sync/index.ts
// ============================================================================
// Ekonomi auto-sync — the actual pull (see EKONOMI-INTEGRATION.md).
//
// Deploy WITH JWT verification (the default) — today's only caller is the
// "Synka nu" button on /ekonomi, a real logged-in user, and this scopes the
// sync to THAT user's own bank_connections only:
//
//   supabase functions deploy ekonomi-sync
//
// TODO once a real cron trigger exists: a scheduled invocation has no user
// session, so it'll need a separate auth path (e.g. a shared cron secret
// checked before falling back to getAuthedUser) rather than --no-verify-jwt
// wide open — don't just flip verify-jwt off later without adding that.
//
// UNVERIFIED (2026-09-13): built directly from Enable Banking's own
// quick-start docs and the BerlinGroup PSD2 transaction shape every
// aggregator in this family uses, but never run against a real response —
// no sandbox/production credentials existed yet when this was written. The
// transaction field names below (`entry_reference`, `booking_date`,
// `transaction_amount`, `credit_debit_indicator`, `remittance_information`)
// are the BerlinGroup standard; Enable Banking may pass them through
// slightly differently. First real sync should be checked by hand before
// trusting it unattended.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, getAuthedUser, serviceClient } from '../_shared/auth.ts'
import { getTransactions } from '../_shared/enableBanking.ts'

const DEFAULT_LOOKBACK_DAYS = 30
const OVERLAP_DAYS = 3 // re-fetch a few days before last_synced_at — banks settle transactions late

// Simple keyword categorizer against Ekonomi.jsx's EXPENSE_CATEGORIES ids.
// Best-effort — anything unmatched lands in 'övrigt', same as a user would
// pick when unsure. Refine with real transaction text once synced (see doc).
const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ['mat', ['ica', 'coop', 'hemköp', 'willys', 'lidl', 'city gross', 'restaurant', 'restaurang', 'foodora', 'wolt', 'ubereats', 'mcdonald', 'max burgers', 'espresso', 'café', 'cafe']],
  ['transport', ['sl', 'sj ', 'pressbyrån', 'circle k', 'preem', 'ingo', 'okq8', 'shell', 'uber', 'bolt', 'taxi', 'parkering', 'parkster', 'easypark']],
  ['hyra', ['hyra', 'hyresvärd', 'el ', 'elbolag', 'vattenfall', 'bredband', 'telia', 'tele2']],
  ['hälsa', ['apotek', 'vårdcentral', 'sjukvård', 'tandläkare', 'gym', 'sats', 'nordic wellness']],
  ['nöje', ['spotify', 'netflix', 'hbo', 'viaplay', 'steam', 'playstation', 'bio', 'filmstaden']],
  ['prenumerationer', ['prenumeration', 'subscription', 'apple.com/bill', 'google *']],
  ['kläder', ['hm.com', 'zalando', 'nakd', 'jd sports', 'stadium']],
]
function guessCategory(description: string): string {
  const d = (description || '').toLowerCase()
  for (const [cat, kws] of CATEGORY_KEYWORDS) if (kws.some((k) => d.includes(k))) return cat
  return 'övrigt'
}

function txExternalId(tx: any, accountUid: string): string {
  const ref = tx.entry_reference || tx.transaction_id || tx.internal_transaction_id
  if (ref) return String(ref)
  // Fallback dedup key when the ASPSP doesn't return a stable reference —
  // not bulletproof (two identical same-day transactions would collide and
  // only one would be kept), but far better than no dedup at all.
  const amt = tx.transaction_amount?.amount ?? tx.amount ?? ''
  const date = tx.booking_date || tx.value_date || ''
  const desc = (tx.remittance_information?.[0] || tx.remittance_information || '').toString().slice(0, 40)
  return `${accountUid}:${date}:${amt}:${desc}`
}

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405, req)

  const { user } = await getAuthedUser(req)
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, req)

  const svc = serviceClient()
  const { data: connections, error } = await svc.from('bank_connections').select('*').eq('user_id', user.id)
  if (error) return jsonResponse({ ok: false, error: error.message }, 500, req)
  if (!connections?.length) return jsonResponse({ ok: true, connections: 0, synced: 0 }, 200, req)

  let totalSynced = 0
  const results: any[] = []

  for (const conn of connections) {
    try {
      const since = conn.last_synced_at
        ? new Date(new Date(conn.last_synced_at).getTime() - OVERLAP_DAYS * 86400_000)
        : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400_000)
      const dateFrom = since.toISOString().slice(0, 10)

      const { transactions } = await getTransactions(conn.account_uid, dateFrom)
      const incomeRows: Record<string, unknown>[] = []
      const expenseRows: Record<string, unknown>[] = []

      for (const tx of transactions || []) {
        const amount = Math.abs(Number(tx.transaction_amount?.amount ?? tx.amount ?? 0))
        if (!Number.isFinite(amount) || amount <= 0) continue
        const date = tx.booking_date || tx.value_date || dateFrom
        const description = Array.isArray(tx.remittance_information)
          ? tx.remittance_information.join(' ')
          : (tx.remittance_information || tx.creditor?.name || tx.debtor?.name || '')
        const externalId = txExternalId(tx, conn.account_uid)
        const isCredit = (tx.credit_debit_indicator || tx.creditDebitIndicator) === 'CRDT'

        if (isCredit) {
          incomeRows.push({
            user_id: conn.user_id, date, amount, source: 'Övrigt',
            description: description || null, external_id: externalId, sync_origin: 'enable_banking',
          })
        } else {
          expenseRows.push({
            user_id: conn.user_id, date, amount, category: guessCategory(description),
            description: description || null, external_id: externalId, sync_origin: 'enable_banking',
          })
        }
      }

      // Check .error explicitly — supabase-js upsert() does NOT throw on a
      // DB-level failure (e.g. a bad onConflict target), it just returns
      // {error}. Silently ignoring that was the 2026-09-13 bug: this
      // reported "85 synced" while writing zero rows.
      let written = 0
      if (incomeRows.length) {
        const { error: incErr, count } = await svc.from('income_logs').upsert(incomeRows, { onConflict: 'user_id,external_id', count: 'exact' })
        if (incErr) throw new Error(`income_logs upsert: ${incErr.message}`)
        written += count ?? incomeRows.length
      }
      if (expenseRows.length) {
        const { error: expErr, count } = await svc.from('expense_logs').upsert(expenseRows, { onConflict: 'user_id,external_id', count: 'exact' })
        if (expErr) throw new Error(`expense_logs upsert: ${expErr.message}`)
        written += count ?? expenseRows.length
      }

      await svc.from('bank_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
      totalSynced += written
      results.push({ account_uid: conn.account_uid, synced: written, seen: incomeRows.length + expenseRows.length })
    } catch (e) {
      console.error('ekonomi-sync failed for connection', conn.id, e)
      results.push({ account_uid: conn.account_uid, error: String(e?.message || e) })
    }
  }

  return jsonResponse({ ok: true, connections: connections.length, synced: totalSynced, results }, 200, req)
})
