# Ekonomi auto-sync — research & prep (2026-09-12)

## Status (2026-09-13): built, credentials live, API-level verified

Account created, Application registered (Sandbox), secrets set
(`ENABLE_BANKING_APP_ID`/`ENV`/`PRIVATE_KEY_PEM`), `ekonomi-bank-link` +
`ekonomi-sync` edge functions deployed. Confirmed working directly against
Enable Banking's API (JWT auth, `/aspsps`, `/auth`) — Swedbank is in the
Sandbox bank list with a test personnummer (`19901111-1111`, no real BankID
needed for this environment). Not yet confirmed: the actual click-through in
the app (Ekonomi page "Koppla Swedbank" button) and the transaction shape
from a real `/accounts/{uid}/transactions` response — `ekonomi-sync`'s field
mapping is still BerlinGroup-standard-shaped but unverified against a live
payload. See code comments in `supabase/functions/ekonomi-sync/index.ts`.

User ask: "börja researcha och preppa för någon integration till ekonomi så
att det sköts per automatik" — research + groundwork, not a live integration
yet (that needs an account only Sigge can create — see "What only you can do"
below).

## TL;DR

Use **Enable Banking** (enablebanking.com), on their free self-serve
**Restricted Production** tier. It's a PSD2 open-banking API aggregator
covering 2,700+ banks across 30 European countries, and the free tier is
scoped exactly to a single-user personal app: no contract, no KYB, but it
only ever sees accounts *you* personally link — which is all this app will
ever need. Architecture mirrors the Anki-sync pattern already live in this
app (`skill-ingest`), just simpler: no local Mac script needed, since the
bank API is reachable directly from a Supabase Edge Function.

**Swedbank confirmed (2026-09-13, user's own bank):** Enable Banking lists
Swedbank as a supported ASPSP — Swedbank exposes a standard BerlinGroup-
spec PSD2 API (same family every EU aggregator, including Enable Banking,
builds against), so no provider change needed. Worth a quick sanity check
once you're in their dashboard (their ASPSP directory) before linking, since
bank-specific quirks (e.g. personal vs. corporate account scoping) sometimes
only surface there.

**Cost confirmed (2026-09-13): free for this use case.** Restricted
Production (self-linked accounts, which is all SiggeOS needs) requires no
contract, no KYB, and — per multiple independent developer sources — no
credit card. Paid, contract-based pricing only kicks in for a *public,
customer-facing* app serving other people's accounts, which doesn't apply
here. Enable Banking's own FAQ doesn't spell out "$0" in so many words for
this specific tier (it just says restricted mode skips the contract/KYB
step, and separately describes volume-based invoicing for the *contracted*
tier) — so if their signup flow ever asks for payment details before you've
signed anything, stop and flag it rather than assuming it's still free.

## Why not the "obvious" choice (GoCardless / Nordigen)

My first instinct — and probably yours if you'd googled this a year ago —
would've been GoCardless Bank Account Data (formerly Nordigen), which used
to have a genuinely free, no-questions-asked tier for exactly this kind of
project. **That's dead**: GoCardless stopped accepting new Bank Account Data
signups from July 2025 onward. Worth flagging since it's still the top
search result and every older tutorial points there.

## Provider: Enable Banking

- **Coverage**: 2,700+ banks, 30 European countries, PSD2-compliant single
  API. Sweden's major banks are all legally required to expose PSD2 XS2A
  APIs, so Swedbank/SEB/Handelsbanken/Nordea should all be there — confirm
  your specific bank on their directory before committing:
  [enablebanking.com/open-banking-apis](https://enablebanking.com/open-banking-apis)
- **Free tier that fits us**: "Restricted Production" — production data
  access, self-serve signup, no contract/KYB, but *restricted to accounts
  you personally whitelist/link*. Full "public" production (arbitrary users
  connecting their own banks) needs a signed contract — irrelevant here,
  since SiggeOS is single-user.
- **Auth**: standard PSD2 Strong Customer Authentication — for Swedish
  banks that's BankID, the same flow as logging into your bank's own app.
- **Consent lifetime**: up to ~180 days for most banks (bank-specific, an
  API field tells you the max). After that you re-authenticate via BankID —
  needs a reminder somewhere (see open decisions).
- **API shape**: plain REST, polling-based — `GET /accounts`,
  `GET /accounts/{id}/transactions`, `GET /accounts/{id}/balances`. No
  webhooks; token refresh is handled by their API internally. This maps
  directly onto the polling pattern `sigge_anki_sync.py` already uses.

Sources: [Free & Indie Open Banking APIs 2026](https://www.openbankingtracker.com/guides/free-open-banking-apis) · [GoCardless Bank Account Data — signups closed](https://www.openbankingtracker.com/gocardless) · [Enable Banking FAQ](https://enablebanking.com/docs/faq/) · [enablebanking.com](https://enablebanking.com/)

## What's already prepped in this repo

Migration `20260912090000_post_deploy_14_ekonomi_sync_columns.sql` (pushed
to prod) adds, additively, to both `income_logs` and `expense_logs`:
- `source` — same convention as `skill_logs.source` (`'anki_sync'` etc):
  null means hand-logged, a tag means auto-synced. A future sync job can
  safely delete-and-replace *its own* rows without ever touching anything
  you typed in manually — exactly how `skill-ingest` already treats
  `skill_logs`.
- `external_id` — the bank's own transaction id, with a partial unique
  index per user (hand-logged rows, `external_id IS NULL`, are untouched by
  it). This is the actual dedup guarantee: re-running the sync, or a
  double-fire, can never double-count a charge.

Nothing reads these columns yet — purely groundwork.

## Proposed architecture (not built — needs your Enable Banking credentials first)

Simpler than Anki-sync, because there's no local-app dependency:

1. **`ekonomi-sync` Supabase Edge Function** (same shape as `skill-ingest`/
   `health-ingest`) — but instead of *receiving* a POST from a local script,
   it actively calls Enable Banking's REST API itself using a stored
   access/refresh token, then upserts into `income_logs`/`expense_logs`
   scoped by `source='enable_banking'` + `external_id`.
2. **Trigger**: a scheduled invocation (Supabase supports cron-triggered
   Edge Functions, or `pg_cron` calling the function via `pg_net`) — daily
   is plenty for a personal budget; no local machine needs to be running,
   unlike Anki.
3. **Category mapping**: bank transactions arrive with the bank's own
   (or PSD2-standard) description/merchant text, not this app's categories
   (`mat`, `boende`, etc. — see `expenseForm.category` in Ekonomi.jsx). Needs
   a mapping layer — simplest version: keyword rules first, "Okategoriserat"
   fallback you re-tag manually, refine the rules over time. An LLM-based
   categorizer is a nice-to-have, not needed for v1.
4. **Initial auth**: a one-time BankID flow to link the account(s) — the
   *user* does this (BankID is personal), the app just stores the resulting
   token. This can be a simple authenticated page/button in Settings, not a
   whole flow — Enable Banking's API returns an auth URL you redirect to and
   a callback URL that hands back the session.

## What only you can do (I can't do this part)

Creating third-party accounts on your behalf is outside what I'll do
unprompted — this needs your own sign-up:

1. Create an Enable Banking account at [enablebanking.com](https://enablebanking.com/) and register an
   application (gets you a sandbox + Restricted Production).
2. Confirm your actual bank is in their ASPSP directory.
3. Decide: **which account(s)** to link (checking only, or savings too?),
   and whether **shared/joint accounts** need special handling.
4. Get the app credentials (application ID + private key) to me, and I'll
   build the edge function + Settings-page linking flow against real
   credentials rather than guessed-at API shapes.

## Open decisions once you're ready to build

- Category-mapping rules — want to define them, or should I propose a
  reasonable keyword-based starter set from your existing `expenseForm`
  categories?
- Consent-renewal reminder — a Dashboard/Jarvis nudge when the ~180-day
  window is closing, or is a periodic manual check-in fine?
- Should auto-synced transactions require a quick manual "confirm" pass
  before counting toward Ekonomi's tier/Maxx Score math, or land directly?
