// ============================================================================
// Enable Banking (PSD2 aggregator) — shared client for the Ekonomi auto-sync
// integration. See EKONOMI-INTEGRATION.md for the research/design behind
// this choice (Restricted Production, free for self-linked accounts).
//
// Auth: RS256 JWT signed with the private key downloaded when the
// "Application" was registered in the Enable Banking Control Panel — no
// client secret is sent over the wire, just a bearer JWT per request (their
// own quick-start guide's exact scheme, reimplemented here with Web Crypto
// instead of a JWT library, to match this repo's zero-extra-dependency style).
//
// Required secrets (supabase secrets set):
//   ENABLE_BANKING_APP_ID          — the Application ID (UUID) from the
//                                    Control Panel, also the .pem filename.
//   ENABLE_BANKING_PRIVATE_KEY_PEM — the full contents of that .pem file.
//   ENABLE_BANKING_ENV             — "sandbox" or "production" (which base
//                                    URL / which registered application to
//                                    act as — sandbox and production each
//                                    have their OWN application id + key).
// ============================================================================

const API_BASE = 'https://api.enablebanking.com'

function base64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): Uint8Array {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(clean)
  const der = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i)
  return der
}

let cachedKey: CryptoKey | null = null
async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  const pem = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY_PEM') ?? ''
  if (!pem) throw new Error('ENABLE_BANKING_PRIVATE_KEY_PEM not set')
  // Enable Banking generates a PKCS8 ("BEGIN PRIVATE KEY") .pem — if the
  // downloaded file instead says "BEGIN RSA PRIVATE KEY" (PKCS1), Web
  // Crypto can't import it directly and this needs a conversion step first
  // (openssl pkcs8 -topk8 -nocrypt -in old.pem -out new.pem).
  const der = pemToDer(pem)
  cachedKey = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  return cachedKey
}

async function signJwt(): Promise<string> {
  const appId = Deno.env.get('ENABLE_BANKING_APP_ID') ?? ''
  if (!appId) throw new Error('ENABLE_BANKING_APP_ID not set')
  const key = await getPrivateKey()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT', kid: appId }
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }
  const signingInput = `${base64url(new TextEncoder().encode(JSON.stringify(header)))}.${base64url(new TextEncoder().encode(JSON.stringify(payload)))}`
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64url(new Uint8Array(sig))}`
}

// Thrown specifically for a 429 so callers can tell "Swedbank's PSD2 daily
// call quota for this account is exhausted, stop retrying today" apart from
// a real/unexpected error. See MAX_PAGES comment below for why this quota
// matters so much here.
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitError'
  }
}

async function ebFetch(path: string, init: RequestInit = {}) {
  const jwt = await signJwt()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => null)
  if (res.status === 429) throw new RateLimitError(`Enable Banking ${path} → 429: ${JSON.stringify(body)}`)
  if (!res.ok) throw new Error(`Enable Banking ${path} → ${res.status}: ${JSON.stringify(body)}`)
  return body
}

/** Start a PSD2 auth flow for one ASPSP (bank) — returns the URL to send the user's browser to. */
export async function startAuth(opts: {
  aspspName: string; aspspCountry: string; state: string; redirectUrl: string; validDays?: number
}) {
  const validUntil = new Date(Date.now() + (opts.validDays ?? 90) * 86400_000).toISOString()
  const body = {
    access: { valid_until: validUntil },
    aspsp: { name: opts.aspspName, country: opts.aspspCountry },
    state: opts.state,
    redirect_url: opts.redirectUrl,
    psu_type: 'personal',
  }
  return ebFetch('/auth', { method: 'POST', body: JSON.stringify(body) }) as Promise<{ url: string }>
}

/** Exchange the `code` Enable Banking's redirect hands back for a session (account list). */
export async function createSession(code: string) {
  return ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) }) as Promise<{
    session_id: string
    accounts: Array<{ uid: string; account_id?: Record<string, unknown>; name?: string }>
  }>
}

/** Account details — critically, `account_id.iban`, the value used to spot
 * transfers between the user's own linked accounts (see ekonomi-sync). */
export async function getAccountDetails(accountUid: string) {
  return ebFetch(`/accounts/${accountUid}/details`) as Promise<{
    account_id?: { iban?: string; other?: { identification?: string } }
    details?: string
    product?: string
  }>
}

// Follows `continuation_key` until exhausted (2026-09-14 fix — the first cut
// of this only fetched ONE page, silently dropping everything past it; a
// real account easily has more transactions than fit in one response).
//
// 2026-09-14, later same day — confirmed against the real production
// account that Swedbank/Enable Banking does NOT always serve a window
// synchronously, REGARDLESS of how recent/narrow it is: sometimes the first
// page comes back with zero transactions and a continuation_key that, when
// followed, keeps returning MORE empty pages (each itself fast, ~1-2s) for
// a long time — this looks like an on-demand "statement" being generated
// server-side, and it's non-deterministic (the exact same account+window
// was instant on one call and took 10+ minutes without finishing on
// another, back to back). MAX_PAGES is no longer just a backstop against a
// pathological infinite loop — it's a real, expected exit path; the caller
// (ekonomi-sync) MUST check `complete` and must NOT advance that
// connection's last_synced_at on an incomplete fetch, or the un-fetched
// window is silently lost forever (this was a real bug here — advancing
// the watermark on every attempt regardless of outcome, even a fetch that
// exhausted its page budget having seen nothing).
//
// 2026-09-15 — raised 15 → 60, then discovered WHY the "empty page +
// continuation_key" pattern above happens so often, and why that was a
// dangerous change: Swedbank/Enable Banking enforces a PSD2 quota of ONLY
// 4 transaction-history calls PER ACCOUNT PER DAY ("Consent daily limit 4
// is exceeded ... account service TRANSACTIONS", HTTP 429,
// ASPSP_RATE_LIMIT_EXCEEDED — confirmed directly from the real API). Every
// page of pagination — including a continuation_key follow-up — is its own
// call against that same tiny budget. Raising MAX_PAGES to 60 meant a
// SINGLE "Synka nu" click could burn an entire account's whole day's
// allowance on pagination alone, which is almost certainly why fetches so
// often "never finished" — the fetch wasn't necessarily slow, it may well
// have been silently eating through the day's last few calls before this
// file learned to recognize 429 as its own thing (see RateLimitError
// above; previously the 429 was probably indistinguishable in outcome from
// the "still generating" case from this file's point of view, since both
// looked like "no continuation_key resolution yet"). Back down to a
// conservative 4, matching the quota exactly, so ONE click can never all
// by itself exhaust an account's entire day.
//
// Practical consequence: if an account's real history genuinely needs more
// than 4 pages to reach the end, it CANNOT be fetched in a single day —
// getTransactions() will return complete:false and ekonomi-sync will
// correctly leave last_synced_at untouched, but the retry has to wait for
// tomorrow's quota reset, not another click today (another click today
// will just draw down the same exhausted daily budget further, or 429 outright
// once it's gone). There is no "try harder" fix for this from our side —
// it's a hard external quota, not a bug to engineer around with a bigger
// number.
const MAX_PAGES = 4
export async function getTransactions(accountUid: string, dateFrom?: string) {
  const all: any[] = []
  let continuationKey: string | undefined
  let complete = false
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (continuationKey) params.set('continuation_key', continuationKey)
    const q = params.toString() ? `?${params.toString()}` : ''
    const res = await ebFetch(`/accounts/${accountUid}/transactions${q}`) as { transactions: any[]; continuation_key?: string }
    all.push(...(res.transactions || []))
    continuationKey = res.continuation_key
    if (!continuationKey) { complete = true; break }
  }
  return { transactions: all, complete }
}
