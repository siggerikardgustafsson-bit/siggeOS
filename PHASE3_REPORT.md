# Phase 3 Report — Edge Function Isolation, Integration Hardening & Service-Role Security

> **Scope:** Phase 3 of [MULTI_USER_AUDIT.md](MULTI_USER_AUDIT.md) only — backend isolation & security. **No** product/UI/onboarding/tier/Maxx-Score/custom-module work.
> **Builds on:** [PHASE1_REPORT.md](PHASE1_REPORT.md) + [PHASE2_REPORT.md](PHASE2_REPORT.md). Phases 1–3 migrations are all **written but unapplied** on the remote (`supabase migration list` shows 8 local, 0 remote). `db push` applies them in order.
> **Frontend:** untouched this phase — all `src/` changes are from Phase 1/2. Production build is therefore unaffected by Phase 3.

---

## 1. Edge functions reviewed (task 3 consistency audit)

| Function | Auth (after Phase 3) | DB access | Ownership scoping | Cross-user path? |
|---|---|---|---|---|
| `jarvis-chat` | own dual-client `getUser()` (unchanged) | **service-role**, all queries `.eq('user_id', userId)` | ✅ every tool scoped; attachment leak closed in Phase 1 | none |
| `strava-sync` | **shared `getAuthedUser`** → 401 if none | **service-role** (reads `strava_tokens`) scoped by `user.id` | ✅ | none |
| `google-calendar-sync` | **shared `getAuthedUser`** → 401 if none | **service-role** (reads `google_tokens`) scoped by `user.id` | ✅ + collision closed (§2) | **closed this phase** |
| `insights-ai` | **NEW: shared `getAuthedUser`** → 401 if none | none (Anthropic proxy) | n/a (no user data) | none |
| `price-fetch` | **NEW: shared `getAuthedUser`** → 401 if none | none (Yahoo/Coingecko proxy) | n/a (no user data) | none |

**Verified:** the authenticated user is resolved before any work in all five; no DB read returns rows without a `user_id` scope (or returns no user data at all); the one historical cross-user path (shared `google_event_id`) is closed.

---

## 2. Google Calendar sync hardening (task 1)

**Problem:** `pa_shifts` and `mandatory_sessions` were upserted `ON CONFLICT (google_event_id)`, which is *globally* unique. If two users ever synced an event sharing a `google_event_id`, the second user's upsert would **overwrite the first user's row** — a cross-user collision.

**Fix (DB + function, must ship together):**
- Migration `20260617090000_phase3_00_google_event_unique.sql`: drops the global `unique(google_event_id)` (constraint *or* standalone index) and adds `unique(user_id, google_event_id)` on both tables. Idempotent; guards against pre-existing duplicate `(user_id, google_event_id)` rows (RAISE NOTICE + skip, no data touched); NULL `google_event_id` rows (the manual mandatory-sessions path) are unaffected (NULLs are distinct in a unique index). Relies on Phase 2 having set `user_id NOT NULL` on both tables.
- `google-calendar-sync/index.ts`: both upserts changed to `onConflict: 'user_id,google_event_id'`.

Each user now keeps their own row per Google event; the same `google_event_id` may legitimately exist for different users without collision. Existing single-user functionality is preserved (Sigge's rows are unaffected — backfilled `user_id` + composite key).

---

## 3. Securing `insights-ai` and `price-fetch` (task 2)

Both were fully **unauthenticated** — anyone with the public anon key (shipped in the bundle) could call them to burn the Anthropic budget / hammer Yahoo & Coingecko.

**Fix:** both now call `getAuthedUser(req)` and return `401` unless a real **user** is resolved. Because the public anon key carries no user, anon-key-only calls are rejected — this is what stops anonymous abuse. Authenticated functionality is unchanged: the app calls `price-fetch` via `supabase.functions.invoke` (Ekonomi.jsx), which attaches the logged-in user's JWT, so legitimate calls pass.

> Note: `insights-ai` has **no caller in the current app** (Insights.jsx uses `jarvis-chat`); it's effectively dead code. Secured anyway since an exposed unauthenticated function is an abuse vector. Consider removing it in a later cleanup.

---

## 4. Shared auth helper (task 4)

New `supabase/functions/_shared/auth.ts` exports:
- `getAuthedUser(req)` — resolves the user from the `Authorization` header via an anon (RLS-respecting) client; returns `{ user, userClient }`, `user=null` for missing/invalid/anon-key tokens.
- `serviceClient()` — service-role client (RLS bypass) for the few operations that need it.
- `corsHeaders`, `jsonResponse()`, `unauthorized()` — standardized CORS + error responses.

Adopted by `insights-ai`, `price-fetch`, `strava-sync`, `google-calendar-sync` (removed their duplicated client-creation + `getUser` blocks and local `corsHeaders`). `jarvis-chat` was **intentionally left on its own auth bootstrap** to avoid touching the largest/most critical function (documented as a Phase 4 follow-up). This was a small, behavior-preserving change — no large refactor.

---

## 5. Service-role audit (task 5)

| Function | Service-role used? | Required? | Justification / ownership guard |
|---|---|---|---|
| `strava-sync` | yes | **Yes** | Reads/writes `strava_tokens`, which Phase 1 locked to service-role-only (no client RLS policy). Every query `.eq('user_id', user.id)`. |
| `google-calendar-sync` | yes | **Yes** | Same, for `google_tokens`; plus user-scoped upserts to `pa_shifts`/`mandatory_sessions`/reads of `courses`. |
| `jarvis-chat` | yes (broad) | **Not strictly** | Used for all per-user reads/writes, each scoped by `user.id`. With Phases 1–2 RLS now in place, a JWT (RLS) client would also work and would be safer (defense-in-depth). **Left unchanged this phase** to avoid risk on the critical path — flagged as the main Phase 4 reduction. |
| `insights-ai` | no | — | No DB access. |
| `price-fetch` | no | — | No DB access. |

**Attack-surface reduction this phase:** removed two fully-open functions; standardized auth so no function silently diverges; service-role is now confined to the two token-reading integrations (justified) plus jarvis-chat (flagged).

---

## 6. Files changed / added

**Modified (edge functions):**
- `supabase/functions/insights-ai/index.ts` — JWT auth (rewrite via helper).
- `supabase/functions/price-fetch/index.ts` — JWT auth gate.
- `supabase/functions/strava-sync/index.ts` — helper auth + `serviceClient()`.
- `supabase/functions/google-calendar-sync/index.ts` — helper auth + `serviceClient()` + 2× `onConflict: 'user_id,google_event_id'`.
- (`jarvis-chat/index.ts` shows as modified from the **Phase 1** attachment fix — not changed in Phase 3.)

**Added:**
- `supabase/functions/_shared/auth.ts`
- `supabase/migrations/20260617090000_phase3_00_google_event_unique.sql`
- `supabase/phase3_verify.sql`
- `supabase/phase3_verify_auth.sh`

**Validation performed:** brace/paren balance OK for all 5 functions + helper; migration `$$`/`begin`/`end` balanced; `bash -n` clean; `supabase migration list` recognizes the new migration; no dangling `createClient`/`authHeader` references (createClient now only in `_shared/auth.ts` and jarvis-chat). `deno` is not installed in this environment, so a `deno check` typecheck could not be run — recommend running `deno check supabase/functions/**/index.ts` (or deploying to a staging project) before production deploy.

---

## 7. Security improvements (summary)

1. **No anonymous API-cost abuse** — `insights-ai`/`price-fetch` reject non-user callers.
2. **Cross-user Google-event collision closed** — composite `(user_id, google_event_id)` uniqueness + user-scoped `onConflict`.
3. **Standardized, deduplicated auth** — one helper, consistent `401`s (google-calendar-sync previously threw → `500` on auth failure; now a clean `401`).
4. **Service-role surface documented and confined** — only the two token integrations need it; jarvis-chat flagged for reduction.

---

## 8. Remaining risks

- **`jarvis-chat` broad service-role.** Mitigated by per-query `user.id` scoping (audited), but it's the last large RLS-bypassing surface. Recommend moving its reads/writes to a JWT client in Phase 4.
- **Deploy coordination (Google sync).** Between `db push` (drops the old global unique) and redeploying `google-calendar-sync` (new `onConflict`), a calendar sync would fail. Window is small; **don't trigger calendar sync between those two steps** (see §9).
- **`verify_jwt` platform setting.** In-function auth is now the reliable gate regardless, but keep functions deployed with `verify_jwt` at its default (enabled) for defense-in-depth.
- **CORS `Access-Control-Allow-Origin: '*'`** retained (acceptable with auth) — tighten to known origins later.
- **`insights-ai` is dead code** — secured but unused; candidate for removal.
- Migrations remain **unapplied**; nothing is enforced until `db push` + function deploys run.

---

## 9. Exact deployment commands

```bash
# 0) Snapshot/backup the DB in the Supabase dashboard (no prior migration history).

# 1) Apply all migrations (Phase 1 + 2 + 3), idempotent, no Docker needed:
supabase db push

# 2) IMMEDIATELY redeploy the calendar function (its onConflict now needs the
#    composite unique created in step 1). Do NOT run a calendar sync in between.
supabase functions deploy google-calendar-sync

# 3) Deploy the other changed/secured functions:
supabase functions deploy insights-ai
supabase functions deploy price-fetch
supabase functions deploy strava-sync
supabase functions deploy jarvis-chat        # Phase 1 attachment-scope fix, if not already deployed

# 4) Verify:
#    - SQL editor: run supabase/phase1_verify.sql, phase2_verify.sql, phase3_verify.sql
#    - Edge auth:  bash supabase/phase3_verify_auth.sh
#                  USER_JWT=<token> bash supabase/phase3_verify_auth.sh   # positive path
```

No frontend redeploy is required for Phase 3 (no `src/` changes).

---

## 10. Rollback instructions

- **Edge functions:** `git checkout <prev-commit> -- supabase/functions/<fn>/index.ts && supabase functions deploy <fn>`. The functions are independent; redeploying the old versions fully reverts behavior.
- **Google-event migration:** to revert the constraints (re-add the global unique, drop the composite):
  ```sql
  alter table public.pa_shifts          drop constraint if exists pa_shifts_user_google_event_uniq;
  alter table public.mandatory_sessions drop constraint if exists mandatory_sessions_user_google_event_uniq;
  alter table public.pa_shifts          add  constraint pa_shifts_google_event_id_key          unique (google_event_id);
  alter table public.mandatory_sessions add  constraint mandatory_sessions_google_event_id_key unique (google_event_id);
  ```
  (Re-adding the global unique requires no cross-user `google_event_id` dups — true in single-user data.) If reverting the constraint, also redeploy the old `google-calendar-sync` (with `onConflict: 'google_event_id'`) so the two stay in sync.
- **Shared helper:** harmless to leave; if removed, revert the importing functions in the same commit.

---

## 11. Recommended Phase 4 scope

**Immediate security follow-ups (finish the infra track):**
1. **Migrate `jarvis-chat` to a JWT (RLS) client** for reads/writes — eliminates the last broad service-role surface; keep service-role only if a specific operation needs it.
2. **Tighten CORS** to known origins (production domain + localhost) across all functions.
3. **Remove or re-wire `insights-ai`** (currently dead).
4. Run `deno check` / staging deploy as a CI gate for edge functions.

**Then the product track (audit's Phase 4+, explicitly out of scope here):** onboarding/profile personalization, module visibility, custom modules, personalized Maxx Score — none of which should start until the security base above is applied and verified with a second test account.
