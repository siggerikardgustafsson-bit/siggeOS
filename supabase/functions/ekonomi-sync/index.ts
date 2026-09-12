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
// Swedbank data: pagination, direct-IBAN transfer filtering, wider
// categorization keywords, 365-day lookback.
//
// v3 (2026-09-14, same day) — v2's transfer filtering turned out to only
// catch HALF the picture. Confirmed against real Swedbank data: for
// "Överföring via internet" transactions specifically, Enable Banking/
// Swedbank does NOT populate the counterparty account on EITHER side of the
// transfer — the checking account's CRDT leg has `debtor_account: null` and
// the savings account's DBIT leg has `creditor_account: null`. Neither side
// exposes who the other party is, so single-transaction IBAN matching (v2)
// has nothing to compare against and can't catch these at all.
//
// Fix: this is now a THREE-phase sync instead of one connection-at-a-time
// pass, because catching this requires seeing every connection's
// transactions at once:
//   Phase 1 — fetch every connection's transactions into one combined list.
//   Phase 2 — global transfer detection across ALL of them:
//     (a) direct match (v2's check, kept): counterparty IBAN is one of the
//         user's own linked accounts.
//     (b) paired match (new): for a transaction with NO counterparty info
//         at all, whose remittance text looks like an internal transfer
//         ("överföring"), search every OTHER connection's transactions for
//         an opposite-direction entry with the same amount+currency within
//         2 days. A match on both ends is exactly what a same-user internal
//         transfer looks like, so both legs are marked and dropped.
//   Phase 3 — per connection, write only the non-transfer rows, categorize,
//     upsert, advance last_synced_at.
//
// Also fixed: categorization was matching accented keywords ('hemköp',
// 'pressbyrån') against ASCII-transliterated real bank text ('HEMKOP',
// 'Pressbyran') and silently missing every one of them. Both the
// description and the keyword list are now diacritic-folded before
// comparison.
//
// v3.1/v3.2 (same day, hours later) — the ACTUAL reason the "full year"
// sync returned nothing at all, found by probing Enable Banking's real API
// directly with several date_from windows and by adding temporary
// instrumentation to a live deploy:
//   - A long-back window (tested: 180 days) reliably flips Swedbank into an
//     on-demand "statement" generation job: page 1 has NO transactions,
//     just a continuation_key, and every subsequent poll (each itself fast,
//     ~1.5s) keeps coming back with ANOTHER empty page + a fresh
//     continuation_key. A live test against the 365-day default ran 10+
//     minutes without ever returning one transaction before being killed.
//   - A short/recent window is USUALLY fast (30d and 90d both returned
//     instantly, single page, real data, in isolated testing) — BUT NOT
//     RELIABLY: a later live run using the exact same accounts and almost
//     the same 90-day-back date landed in the identical empty-page/
//     continuation_key loop as the long-back case, confirmed via
//     temporary debugInfo output on a live deploy (rawCount: 0 for all 4
//     connections despite a valid recent dateFrom). This is NOT purely a
//     function of window size — it looks like a warm/cold cache on
//     Swedbank's side that this integration has no visibility into or
//     control over. No amount of raising MAX_PAGES "fixes" a job that may
//     take many minutes (if it finishes at all) to generate.
//   - This is why the sync appeared to load "a very limited number" (in
//     practice: often zero) even after the lookback was lowered — a sync
//     can legitimately, non-deterministically take a very long time on
//     Swedbank's end, no matter the window.
//   - A REAL bug this surfaced: last_synced_at was being advanced
//     unconditionally at the end of every connection's try block, even one
//     that gave up after MAX_PAGES having fetched nothing. That silently
//     and PERMANENTLY narrowed the window on every subsequent attempt —
//     each failed sync made the next one look at less history, not the
//     same history again. Fixed: getTransactions() now reports whether it
//     reached a real end (`complete`), and last_synced_at only advances
//     when it did. An incomplete connection is reported back with
//     `incomplete: true` and safely retries the SAME window next time.
//
// Fix: DEFAULT_LOOKBACK_DAYS back down to 90 (still the right default — it
// IS usually fast, and unlike 365 it isn't guaranteed to hit the slow path)
// and MAX_PAGES lowered 50 → 15 so one cold/slow connection can't eat the
// whole run — it now gives up faster, reports incomplete, and leaves the
// watermark untouched so a later "Synka nu" click retries cleanly. Full,
// guaranteed-complete year-back history for Jarvis still needs a genuinely
// separate, patient, non-blocking backfill job (poll for as long as it
// takes, off the request/response path a button click waits on) — not a
// bigger number in a constant here.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, jsonResponse, getAuthedUser, serviceClient } from '../_shared/auth.ts'
import { getTransactions } from '../_shared/enableBanking.ts'

const DEFAULT_LOOKBACK_DAYS = 90
const OVERLAP_DAYS = 3 // re-fetch a few days before last_synced_at — banks settle transactions late
const TRANSFER_PAIR_WINDOW_MS = 2 * 86400_000 // how close two legs' dates may be to count as the same transfer

// Strips Swedish diacritics so accented keywords match the ASCII-
// transliterated text real bank feeds actually send ("HEMKOP", not "hemköp").
function foldSwedish(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/ü/g, 'u')
}

// Best-effort keyword categorizer against Ekonomi.jsx's real EXPENSE_CATEGORIES
// ids. Unmatched → 'övrigt', exactly what a user would pick manually when
// unsure — not a bug. 'mat' (groceries) vs 'restaurang' (eating out) are
// DELIBERATELY split, not lumped (user call 2026-09-14).
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
// Fold once at module load, not per-call.
const CATEGORY_KEYWORDS_FOLDED: Array<[string, string[]]> =
  CATEGORY_KEYWORDS.map(([cat, kws]) => [cat, kws.map(foldSwedish)])

function guessCategory(description: string): string {
  const d = foldSwedish(description)
  for (const [cat, kws] of CATEGORY_KEYWORDS_FOLDED) if (kws.some((k) => d.includes(k))) return cat
  return 'övrigt'
}

// Cosmetic only — strips the generic transaction-type suffix Swedbank appends
// to every remittance line (e.g. "Kortköp/uttag", "Autogiro") so the stored
// description reads as the actual merchant/counterparty, not boilerplate.
const BOILERPLATE_SUFFIXES = ['kortköp/uttag', 'autogiro', 'överföring']
function cleanDescription(lines: string[]): string {
  return lines.filter((l) => !BOILERPLATE_SUFFIXES.includes((l || '').trim().toLowerCase())).join(' ').trim()
}

// Looser than cleanDescription's exact match — catches "Överföring via
// internet", "Överföring", etc. anywhere in the raw remittance text, used to
// decide whether a null-counterparty transaction is even a transfer
// candidate worth pairing (see phase 2b below).
function looksLikeTransfer(rawLines: string[]): boolean {
  return rawLines.some((l) => foldSwedish(l).includes('overforing'))
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
// card purchase at a shop has no creditor_account) — but Swedbank does NOT
// populate it even for some real internal transfers (see phase 2b).
function counterpartyIban(tx: any, isCredit: boolean): string | null {
  const acct = isCredit ? tx.debtor_account : tx.creditor_account
  return acct?.iban || null
}

type Item = {
  conn: any
  tx: any
  isCredit: boolean
  amount: number
  currency: string
  date: string
  cpIban: string | null
  hasTransferText: boolean
  rawLines: string[]
  isTransfer: boolean
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

  // ALL of the user's own linked IBANs, across every connection.
  const myIbans = new Set(connections.map((c) => c.iban).filter(Boolean))

  // ---- Phase 1: fetch every connection's transactions into one list ----
  // Run all connections' fetches CONCURRENTLY (2026-09-15 fix). Confirmed
  // against the real production data: with these run sequentially, a
  // slow/cold connection (Swedbank's on-demand statement generation, see
  // the v3.1/v3.2 notes above) starved the others of nothing directly, but
  // wasted the WHOLE request's wall-clock budget on one connection before
  // even starting the next — across many "Synka nu" clicks, the 3 small
  // savings accounts eventually each got their turn to complete, but the
  // highest-volume checking account never did, because by the time its
  // slow fetch got going there often wasn't enough of the click's time left
  // and each retry started the SAME cold fetch over from scratch. Running
  // them concurrently means every connection gets the full click's time
  // budget in parallel, not a shrinking slice of it.
  const fetchErrors: Record<string, string> = {}
  // Whether each connection's fetch reached a real end (continuation_key
  // exhausted naturally) vs. gave up after MAX_PAGES without finishing.
  // Phase 3 uses this to decide whether it's safe to advance
  // last_synced_at — see the enableBanking.ts header comment for why.
  const completeByConn: Record<string, boolean> = {}
  const perConnItems = await Promise.all(connections.map(async (conn) => {
    const collected: Item[] = []
    try {
      const since = conn.last_synced_at
        ? new Date(new Date(conn.last_synced_at).getTime() - OVERLAP_DAYS * 86400_000)
        : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400_000)
      const dateFrom = since.toISOString().slice(0, 10)
      const { transactions, complete } = await getTransactions(conn.account_uid, dateFrom)
      completeByConn[conn.id] = complete

      for (const tx of transactions || []) {
        const amount = Math.abs(Number(tx.transaction_amount?.amount ?? tx.amount ?? 0))
        if (!Number.isFinite(amount) || amount <= 0) continue
        const isCredit = (tx.credit_debit_indicator || tx.creditDebitIndicator) === 'CRDT'
        const rawLines = Array.isArray(tx.remittance_information)
          ? tx.remittance_information
          : [tx.remittance_information].filter(Boolean)
        collected.push({
          conn, tx, isCredit, amount,
          currency: tx.transaction_amount?.currency || tx.currency || 'SEK',
          date: tx.booking_date || tx.value_date || dateFrom,
          cpIban: counterpartyIban(tx, isCredit),
          hasTransferText: looksLikeTransfer(rawLines),
          rawLines,
          isTransfer: false,
        })
      }
    } catch (e) {
      console.error('ekonomi-sync fetch failed for connection', conn.id, e)
      fetchErrors[conn.id] = String(e?.message || e)
    }
    return collected
  }))
  const items: Item[] = perConnItems.flat()

  // ---- Phase 2a: direct match — counterparty IBAN is one of my own ----
  for (const it of items) {
    if (it.cpIban && myIbans.has(it.cpIban)) it.isTransfer = true
  }

  // ---- Phase 2b: paired match — null counterparty on both legs ----
  // Swedbank doesn't expose the counterparty for some internal-transfer
  // transaction types at all (confirmed 2026-09-14: neither the checking
  // account's CRDT leg nor the savings account's DBIT leg names the other
  // side). Only real signal left is: two legs, opposite direction, same
  // amount+currency, close dates, on two DIFFERENT accounts of mine, and the
  // remittance text reads like a transfer. Require ALL of that — a
  // coincidental equal-amount unrelated purchase must not get swept in.
  for (const it of items) {
    if (it.isTransfer || it.cpIban || !it.hasTransferText) continue
    const match = items.find((other) =>
      other !== it &&
      !other.isTransfer &&
      !other.cpIban &&
      other.hasTransferText &&
      other.conn.account_uid !== it.conn.account_uid &&
      other.isCredit !== it.isCredit &&
      other.currency === it.currency &&
      Math.abs(other.amount - it.amount) < 0.01 &&
      Math.abs(new Date(other.date).getTime() - new Date(it.date).getTime()) <= TRANSFER_PAIR_WINDOW_MS,
    )
    if (match) { it.isTransfer = true; match.isTransfer = true }
  }

  // ---- Phase 3: per connection, write only the non-transfer rows ----
  let totalSynced = 0
  let totalSkippedTransfers = 0
  const results: any[] = []

  for (const conn of connections) {
    if (fetchErrors[conn.id]) {
      results.push({ account_uid: conn.account_uid, error: fetchErrors[conn.id] })
      continue
    }
    try {
      const connItems = items.filter((it) => it.conn.id === conn.id)
      const incomeRows: Record<string, unknown>[] = []
      const expenseRows: Record<string, unknown>[] = []
      let skippedTransfers = 0

      for (const it of connItems) {
        if (it.isTransfer) { skippedTransfers++; continue }
        const { tx, isCredit, amount, date } = it
        const description = cleanDescription(it.rawLines) || tx.creditor?.name || tx.debtor?.name || null
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

      // Only advance the watermark when this connection's fetch actually
      // reached a real end. Swedbank/Enable Banking sometimes serves a
      // window instantly and sometimes needs several minutes of on-demand
      // "statement" generation for the exact same account+window (confirmed
      // 2026-09-14 — non-deterministic on their end, not this code). If we
      // gave up after MAX_PAGES without finishing, advancing last_synced_at
      // anyway would silently and permanently lose whatever wasn't fetched
      // yet — the next sync must retry the SAME window, not a narrower one.
      const complete = completeByConn[conn.id] !== false
      if (complete) {
        await svc.from('bank_connections').update({ last_synced_at: new Date().toISOString() }).eq('id', conn.id)
      }
      totalSynced += written
      totalSkippedTransfers += skippedTransfers
      results.push({
        account_uid: conn.account_uid, iban: conn.iban, synced: written,
        skipped_transfers: skippedTransfers, seen: connItems.length,
        ...(complete ? {} : { incomplete: true }),
      })
    } catch (e) {
      console.error('ekonomi-sync failed for connection', conn.id, e)
      results.push({ account_uid: conn.account_uid, error: String(e?.message || e) })
    }
  }

  return jsonResponse({ ok: true, connections: connections.length, synced: totalSynced, skipped_transfers: totalSkippedTransfers, results }, 200, req)
})
