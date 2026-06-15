# Phase 4A Report — Finish Infrastructure / Security Hardening

> **Scope:** Phase 4A only — eliminate `jarvis-chat`'s broad service-role usage, add defense-in-depth ownership checks, tighten CORS, quarantine dead functions, verify. **No** product/UI/onboarding/tier/Maxx-Score/custom-module work.
> **Builds on:** Phases 1–3. All Phase 1–3 migrations remain **written but unapplied** (`supabase migration list` → 8 local, 0 remote). RLS is **already live** on every personal table (verified empirically in Phase 1), which is what makes the `jarvis-chat` JWT migration safe to deploy.
> **Frontend:** untouched. No `src/` changes this phase.

---

## 1. Edge functions changed

| Function | Phase 4A change |
|---|---|
| `_shared/auth.ts` | `corsHeaders` is now an **origin-aware function** (`corsHeaders(req)`) driven by an `ALLOWED_ORIGINS` env allowlist with a `*` fallback; `jsonResponse`/`unauthorized` take an optional `req` to echo the right origin. |
| `jarvis-chat` | **Removed the service-role client entirely.** Now uses a **per-request JWT/RLS client** (`getAuthedUser` → `userClient`) for every read/write. Added a **hard 401** for unauthenticated callers (was silently running Anthropic with empty context). CORS via per-request `cors`. |
| `strava-sync` | CORS switched to per-request `cors`. (Auth already via helper in Phase 3; still uses `serviceClient()` for `strava_tokens`.) |
| `google-calendar-sync` | CORS switched to per-request `cors`. (Auth + `onConflict` from Phase 3; still uses `serviceClient()` for `google_tokens`.) |
| `insights-ai` | CORS `req` threaded through `corsHeaders`/`jsonResponse`/`unauthorized`. (Auth from Phase 3.) |
| `price-fetch` | CORS switched to per-request `cors`. (Auth from Phase 3.) |

**Validation:** brace/paren balance OK for all six files (`jarvis-chat` 709/709, 1059/1059); no bare `corsHeaders` object-usage remains (all are `corsHeaders(req)` or the per-request `cors`); no dangling `createClient`/`anonClient`/`serviceKey` in `jarvis-chat`; `bash -n` clean on the verify script. `deno` is not installed here — see §6 for the typecheck command to run locally.

---

## 2. Jarvis security model — before / after

**Before (Phases 1–3):**
- All reads/writes ran on the **service-role client**, which **bypasses RLS**.
- Isolation depended *entirely* on every single query carrying `.eq('user_id', userId)`. One missed filter = cross-user leak (exactly the Phase-1 `course_materials`/`exam_old_files` bug).
- Unauthenticated calls still executed (empty context) and still hit Anthropic.

**After (Phase 4A):**
- All reads/writes run on a **per-request JWT/RLS client** bound to the caller's token, so **Postgres RLS enforces ownership** on every statement, *as the user*. Even if a `.eq('user_id')` filter were ever missing, RLS returns only the caller's rows (safe failure = "no data", never another user's data).
- The explicit `.eq('user_id', userId)` filters in `executeTool` are **kept as defense-in-depth** (belt and suspenders).
- **Hard 401** on unauthenticated calls — no anonymous Anthropic usage.
- **Service-role surface in `jarvis-chat` is now zero.**

### Defense-in-depth ownership checks (task 2) — per tool/action
- **Authenticated:** handler returns 401 before any tool runs; tool calls still guard `user ? … : 'Ingen användare inloggad.'`.
- **Reads scoped:** JWT/RLS client + explicit `.eq('user_id', userId)` on every `fetch_*` tool.
- **Writes scoped:** every `execute_action` insert sets `user_id`; updates/deletes carry `.eq('user_id', userId)`; RLS `WITH CHECK` blocks writing rows owned by anyone else.
- **Attachments:** `course_materials`/`exam_old_files` fetches keep `.eq('user_id', user.id)` (Phase 1) **and** now run on the RLS client — a foreign id resolves to zero rows twice over.
- **Unsafe / cross-user ids:** passing another user's id (material/exam/session/etc.) returns nothing under both the explicit filter and RLS.

---

## 3. Service-role audit — where it remains and why

| Function | Service-role after 4A? | Justification |
|---|---|---|
| `jarvis-chat` | **No** (removed) | Every table it touches is user-owned with owner RLS → the JWT client suffices. |
| `strava-sync` | Yes (`serviceClient()`) | Reads/writes `strava_tokens`, which Phase 1 locked to **service-role-only** (no client RLS policy). All queries `.eq('user_id', user.id)`. |
| `google-calendar-sync` | Yes (`serviceClient()`) | Same for `google_tokens`; plus user-scoped upserts. |
| `insights-ai` | No | No DB access. |
| `price-fetch` | No | No DB access. |

Service-role is now confined to exactly the two functions that read the locked-down OAuth token tables — the minimal necessary surface.

---

## 4. CORS behavior

- All functions build CORS via the shared `corsHeaders(req)`.
- Controlled by the **`ALLOWED_ORIGINS`** env var (comma-separated):
  - **Unset →** `Access-Control-Allow-Origin: *` (identical to today; nothing breaks).
  - **Set →** echoes the request `Origin` if it's in the list, else the first allowed origin; adds `Vary: Origin`.
- Preflight `OPTIONS` preserved on every function.
- **No production domain is configured** anywhere in the repo (vercel.json has no domain, `.env` only has the Supabase URL), so per the task I did **not** hardcode a domain. Lock it down post-deploy:
  ```bash
  supabase secrets set ALLOWED_ORIGINS="https://<your-prod-domain>,http://localhost:5173"
  ```
  Because auth (JWT) is the real access control on these endpoints, the `*` fallback is not a vulnerability — CORS tightening here is defense-in-depth against a logged-in user's browser being used cross-origin.

---

## 5. Dead function: `insights-ai` (task 4)

Confirmed **unused by the app** — no caller anywhere in `src/`; Insights.jsx uses `jarvis-chat`. **Kept, not deleted**, because:
- It is now **JWT-gated** (Phase 3) so it cannot be abused anonymously, and CORS-tightened (4A) — it is safe at rest.
- Deleting from the repo would not undeploy it; an explicit `supabase functions delete insights-ai` is the real removal and is a deploy action better done deliberately.

**To remove it later (recommended Phase 4B cleanup):**
```bash
supabase functions delete insights-ai
rm -rf supabase/functions/insights-ai
```

---

## 6. Verification & typecheck

**Scripts:**
- `supabase/phase4a_verify.sh` — for all 5 functions: anon-key POST → 401, OPTIONS → 200 + prints `Access-Control-Allow-Origin`, authed `price-fetch`/`jarvis-chat` → not 401, plus a documented 2-account cross-user attachment test. Run after deploy:
  ```bash
  bash supabase/phase4a_verify.sh
  USER_JWT=<token> bash supabase/phase4a_verify.sh     # also exercises authed paths
  ```
- `supabase/phase1_verify.sql`, `phase2_verify.sql`, `phase3_verify.sql` — **run these first**: `jarvis-chat` now relies on RLS for isolation, so confirm every personal table has correct owner policies before trusting it.

**Deno typecheck (task 6) — `deno` is not installed in this environment.** Run locally:
```bash
# install once: brew install deno
deno check supabase/functions/jarvis-chat/index.ts
deno check supabase/functions/strava-sync/index.ts
deno check supabase/functions/google-calendar-sync/index.ts
deno check supabase/functions/insights-ai/index.ts
deno check supabase/functions/price-fetch/index.ts
# (resolves the remote esm.sh imports + ../_shared/auth.ts)
```
Or deploy to a staging Supabase project first. Structural checks (brace/paren balance, import resolution, no dangling refs) passed here as a substitute.

---

## 7. Deployment commands

```bash
# 0) Snapshot/backup the DB in the dashboard.

# 1) Apply Phase 1–3 migrations (idempotent; standardizes the RLS jarvis-chat now relies on):
supabase db push

# 2) Redeploy ALL five functions (every one changed — jarvis-chat is the critical one):
supabase functions deploy jarvis-chat
supabase functions deploy strava-sync
supabase functions deploy google-calendar-sync
supabase functions deploy insights-ai
supabase functions deploy price-fetch
#   (google-calendar-sync must be deployed together with the Phase 3 migration — see PHASE3_REPORT §9)

# 3) (Optional, recommended) lock down CORS:
supabase secrets set ALLOWED_ORIGINS="https://<your-prod-domain>,http://localhost:5173"

# 4) Verify:
#    SQL editor: phase1_verify.sql, phase2_verify.sql, phase3_verify.sql
bash supabase/phase4a_verify.sh
```
No frontend redeploy needed (no `src/` changes).

---

## 8. Remaining risks

- **`jarvis-chat` now depends on RLS correctness.** If any personal table's owner policy is missing/wrong, that Jarvis tool returns *empty* (degraded), not leaked. Mitigation: run `phase1_verify.sql` + `phase2_verify.sql` and confirm no table has RLS disabled / missing policies **before** relying on this in production.
- **Migrations still unapplied.** RLS is already live so `jarvis-chat` works today, but the standardized `WITH CHECK`/policies from Phases 1–2 should be pushed for full guarantees.
- **`ALLOWED_ORIGINS` not yet set** → CORS still `*` until configured. Acceptable (auth-gated) but set it for hygiene.
- **No automated typecheck** ran here (no `deno`). Run `deno check` locally before production deploy.
- **`insights-ai` remains deployed** (secured but dead) until explicitly deleted.

---

## 9. Rollback notes

- **`jarvis-chat`:** `git checkout <prev-commit> -- supabase/functions/jarvis-chat/index.ts && supabase functions deploy jarvis-chat` reverts to the service-role client.
- **CORS:** `supabase secrets unset ALLOWED_ORIGINS` → `*` everywhere; or `git checkout <prev> -- supabase/functions/_shared/auth.ts` and redeploy the importers.
- **Per-function:** all functions are independent; redeploy any prior version to revert just that one.
- The JWT migration adds **no schema changes**, so there is nothing to roll back in the database for Phase 4A.

---

## 10. Recommended Phase 4B

**Finish the infra/security track:**
1. Set `ALLOWED_ORIGINS` to the real prod domain + localhost once known.
2. Remove the dead `insights-ai` function (`supabase functions delete` + dir).
3. Add `deno check` (and a deploy smoke test) as a CI gate for edge functions.
4. Consider lightweight rate-limiting / usage caps on the AI/price proxies.
5. Apply Phases 1–3 migrations and run all verifiers with a **second test account** (the gate before any product work).

**Then the product track (audit's Phase 4+, still out of scope):** onboarding/profile personalization, module visibility, custom modules, personalized Maxx Score — none to start until the security base is applied and verified.

---

## 11. Files changed / added

**Modified (edge functions):**
- `supabase/functions/_shared/auth.ts` — origin-aware CORS.
- `supabase/functions/jarvis-chat/index.ts` — service-role → JWT/RLS client; hard 401; CORS.
- `supabase/functions/strava-sync/index.ts` — CORS per-request.
- `supabase/functions/google-calendar-sync/index.ts` — CORS per-request.
- `supabase/functions/insights-ai/index.ts` — CORS req threading.
- `supabase/functions/price-fetch/index.ts` — CORS per-request.

**Added:**
- `supabase/phase4a_verify.sh`

No migrations were added in Phase 4A (no schema changes). No UI, scoring, tier, onboarding, or custom-module changes.
