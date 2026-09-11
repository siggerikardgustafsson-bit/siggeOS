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

async function ebFetch(path: string, init: RequestInit = {}) {
  const jwt = await signJwt()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => null)
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
// MAX_PAGES is a sane backstop, not a real limit — a year of a personal
// account is nowhere near it.
const MAX_PAGES = 50
export async function getTransactions(accountUid: string, dateFrom?: string) {
  const all: any[] = []
  let continuationKey: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (continuationKey) params.set('continuation_key', continuationKey)
    const q = params.toString() ? `?${params.toString()}` : ''
    const res = await ebFetch(`/accounts/${accountUid}/transactions${q}`) as { transactions: any[]; continuation_key?: string }
    all.push(...(res.transactions || []))
    continuationKey = res.continuation_key
    if (!continuationKey) break
  }
  return { transactions: all }
}
