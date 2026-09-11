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
// v2 (2026-09-14) — fixes from the first real sync against production
// Swedbank data:
//   1. Pagination: getTransactions() now follows continuation_key (see
//      enableBanking.ts) — v1 silently dropped everything past page 1.
//   2. Transfers between the user's own linked accounts (e.g. Privatkonto →
//      an e-sparkonto pocket) no longer count as income+expense. Each
//      bank_connections row now carries its own `iban`; a transaction whose
//      COUNTERPARTY iban matches any of the user's own linked accounts is
//      skipped entirely (not written to income_logs/expense_logs at all).
//   3. Categorization keyword list expanded from real Swedish transaction
//      text (still best-effort — no static list will ever be exhaustive
//      against arbitrary merchant names; 'övrigt' is always the honest
//      fallback, not a bug).
//   4. DEFAULT_LOOKBACK_DAYS raised 30 → 365 (user call: give Jarvis a full
//      year of real financial history to reason from).
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, getAuthedUser, serviceClient } from '../_shared/auth.ts'
import { getTransactions } from '../_shared/enableBanking.ts'

const DEFAULT_LOOKBACK_DAYS = 365
const OVERLAP_DAYS = 3 // re-fetch a few days before last_synced_at — banks settle transactions late

// Best-effort keyword categorizer against Ekonomi.jsx's real EXPENSE_CATEGORIES
// ids. Expanded 2026-09-14 from real Swedbank transaction text. Unmatched →
// 'övrigt', exactly what a user would pick manually when unsure — not a bug.
// 'mat' (groceries) vs 'restaurang' (eating out) are DELIBERATELY split, not
// lumped — a grocery-chain checkout is not the same spending decision as a
// restaurant/café/delivery order, even though both are "food" (user call
// 2026-09-14: "hade gärna separerat utemat och groceries").
const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ['mat', [ // groceries — actual grocery-store chains ONLY
    'ica', 'coop', 'hemköp', 'willys', 'lidl', 'city gross', 'tempo', 'matöppet', 'mathem', 'matsmart',
  ]],
  ['restaurang', [ // eating out — restaurants, cafés, fast food, delivery, kiosks
    'eatery', 'restaurang', 'restaurant', 'pizzeria', 'sushi', 'krog', 'bar & ',
    'foodora', 'wolt', 'ubereats', 'uber eats',
    'mcdonald', 'max burgers', 'burger king', 'sibylla', 'subway', 'o´learys', 'olearys',
    'espresso house', 'starbucks', 'wayne´s coffee', 'waynes coffee', 'café', 'cafe', 'kaffe', 'konditori',
    'pressbyrån', '7-eleven', 'seven eleven',
  ]],
  ['transport', [
    'sl ', 'sl-', 'skånetrafiken', 'västtrafik', 'sj ', 'flygbuss', 'sas', 'norwegian',
    'circle k', 'preem', 'ingo', 'okq8', 'shell', 'st1', 'uber', 'bolt', 'taxi',
    'parkering', 'parkster', 'easypark', 'apcoa', 'q-park',
  ]],
  ['hyra', [
    'hyra', 'hyresvärd', 'bostadsrättsförening', 'brf ', 'vattenfall', 'ellevio', 'e.on', 'fortum',
    'bredband', 'telia', 'tele2', 'telenor', 'tre ', 'hi3g', 'comhem', 'bahnhof',
  ]],
  ['hälsa', [
    'apotek', 'kronans', 'vårdcentral', 'sjukvård', 'tandläkare', 'tandvård', '1177',
    'gym', 'sats', 'nordic wellness', 'fitness24seven', 'friskis',
  ]],
  ['nöje', [
    'spotify', 'netflix', 'hbo', 'viaplay', 'disney+', 'steam', 'playstation', 'xbox', 'nintendo',
    'bio', 'filmstaden', 'sf bio', 'systembolaget',
  ]],
  ['prenumerationer', [
    'prenumeration', 'subscription', 'apple.com/bill', 'google *', 'google play', 'patreon', 'onlyfans',
  ]],
  ['kläder', [
    'hm.com', 'h & m', 'zalando', 'nakd', 'na-kd', 'jd sports', 'stadium', 'stadium outlet',
    'zara', 'asos', 'boozt', 'nelly',
  ]],
]
function guessCategory(description: string): string {
  const d = (description || '').toLowerCase()
  for (const [cat, kws] of CATEGORY_KEYWORDS) if (kws.some((k) => d.includes(k))) return cat
  return 'övrigt'
}

// Cosmetic only — strips the generic transaction-type suffix Swedbank appends
// to every remittance line (e.g. "Kortköp/uttag", "Autogiro") so the stored
// description reads as the actual merchant/counterparty, not boilerplate.
const BOILERPLATE_SUFFIXES = ['kortköp/uttag', 'autogiro', 'överföring']
function cleanDescription(lines: string[]): string {
  return lines.filter((l) => !BOILERPLATE_SUFFIXES.includes((l || '').trim().toLowerCase())).join(' ').trim()
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

// For a DBIT (money left this account), BerlinGroup's `debtor_account` is
// THIS account and `creditor_account` is the counterparty. For a CRDT it's
// reversed. Only actual bank transfers populate the counterparty IBAN (a
// card purchase at a shop has no creditor_account) — exactly what we want:
// only real inter-account transfers get filtered, not "this looks like it
// could be a transfer" guessing.
function counterpartyIban(tx: any, isCredit: boolean): string | null {
  const acct = isCredit ? tx.debtor_account : tx.creditor_account
  return acct?.iban || null
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

  // ALL of the user's own linked IBANs, across every connection — a
  // transaction whose counterparty matches ANY of these (not just the one
  // being synced right now) is an internal transfer, from any direction.
  const myIbans = new Set(connections.map((c) => c.iban).filter(Boolean))

  let totalSynced = 0
  let totalSkippedTransfers = 0
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
      let skippedTransfers = 0

      for (const tx of transactions || []) {
        const amount = Math.abs(Number(tx.transaction_amount?.amount ?? tx.amount ?? 0))
        if (!Number.isFinite(amount) || amount <= 0) continue
        const isCredit = (tx.credit_debit_indicator || tx.creditDebitIndicator) === 'CRDT'

        // Skip transfers between the user's own linked accounts — neither
        // real income nor a real expense, shouldn't appear in the history.
        const cpIban = counterpartyIban(tx, isCredit)
        if (cpIban && myIbans.has(cpIban)) { skippedTransfers++; continue }

        const date = tx.booking_date || tx.value_date || dateFrom
        const rawLines = Array.isArray(tx.remittance_information) ? tx.remittance_information : [tx.remittance_information].filter(Boolean)
        const description = cleanDescription(rawLines) || tx.creditor?.name || tx.debtor?.name || null
        const externalId = txExternalId(tx, conn.account_uid)

        if (isCredit) {
          incomeRows.push({
            user_id: conn.user_id, date, amount, source: 'Övrigt',
            description, external_id: externalId, sync_origin: 'enable_banking',
          })
        } else {
          expenseRows.push({
            user_id: conn.user_id, date, amount, category: guessCategory(description || ''),
            description, external_id: externalId, sync_origin: 'enable_banking',
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
      totalSkippedTransfers += skippedTransfers
      results.push({ account_uid: conn.account_uid, iban: conn.iban, synced: written, skipped_transfers: skippedTransfers, seen: incomeRows.length + expenseRows.length })
    } catch (e) {
      console.error('ekonomi-sync failed for connection', conn.id, e)
      results.push({ account_uid: conn.account_uid, error: String(e?.message || e) })
    }
  }

  return jsonResponse({ ok: true, connections: connections.length, synced: totalSynced, skipped_transfers: totalSkippedTransfers, results }, 200, req)
})
