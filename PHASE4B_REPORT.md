# Phase 4B Report — Final Infra Cleanup, Deployment Readiness & Verification Gate

> **Scope:** Phase 4B only — cleanup, deployment readiness, verification, and removal of unused edge code. **No** product/UI/scoring/onboarding/custom-module work. **No schema changes** (no new migrations).
> **Builds on:** Phases 1–4A. This is the final infrastructure/security phase before any product work.
> **State:** All Phase 1–3 migrations remain **written but unapplied** (8 local, 0 remote). All edge-function changes (Phases 1–4A + 4B cleanup) are **in the repo, not yet deployed**.

---

## 1. Files changed / functions removed

**Removed (task 5):**
- `supabase/functions/insights-ai/` — deleted from the repo. Re-verified unused: the only references anywhere were inside the verification scripts (no `src/`, no `index.html`, no other edge function calls it; Insights.jsx uses `jarvis-chat`). Reversible via git. **The deployed copy is NOT auto-removed** — run the delete command in §5.

**Added:**
- `supabase/verify_all.sh` — master verification gate (orchestrates the runnable checks + prints the manual gate).
- `supabase/functions/typecheck.sh` — `deno check` runner for all functions.
- `supabase/functions/.env.example` — documents required edge-function secrets incl. `ALLOWED_ORIGINS`.

**Modified:**
- `supabase/phase4a_verify.sh` — dropped `insights-ai` from the tested function list.

**Unchanged (from prior phases, still pending deploy):** `_shared/auth.ts`, `jarvis-chat`, `strava-sync`, `google-calendar-sync`, `price-fetch`; migrations `20260615*`–`20260617*`; `phase1/2/3_verify.sql`.

---

## 2. Functions kept vs removed

| Function | Status | Notes |
|---|---|---|
| `jarvis-chat` | kept | JWT/RLS client (Phase 4A); no service-role. |
| `strava-sync` | kept | service-role for `strava_tokens` (justified). |
| `google-calendar-sync` | kept | service-role for `google_tokens` (justified). |
| `price-fetch` | kept | JWT-gated stateless proxy. |
| `insights-ai` | **removed from repo** | unused/dead; delete deployed copy via §5. |
| `_shared/auth.ts` | kept | shared auth/CORS helper. |

---

## 3. Deployment readiness audit (task 1)

### Migration order — correct
Filename timestamps apply in lexicographic order, which is the correct dependency order:
```
20260615120000 phase1_00 profiles + admin
20260615120100 phase1_01 RLS personal tables
20260615120200 phase1_02 RLS token tables
20260615120300 phase1_03 RLS training_exercises (parent-join)
20260615120400 phase1_04 RLS reference tables
20260616090000 phase2_00 training_exercises user_id (replaces 1_03 policies)
20260616090100 phase2_01 user_id constraints + indexes
20260617090000 phase3_00 (user_id, google_event_id) unique
```
- Phase 2_00 correctly runs **after** 1_03 (it drops the parent-join policies and adds direct `user_id`).
- Phase 3_00 correctly runs **after** 2_01 (it relies on `user_id NOT NULL` on `pa_shifts`/`mandatory_sessions`).
- All are idempotent + non-destructive (guarded `DO` blocks, `RAISE NOTICE` instead of failing on ambiguity).

### `db push` safety
`supabase db push` applies all 8 (remote history is empty) in order, directly against the remote (no Docker needed). Watch the `NOTICE` output for any `PHASE2 WARNING` (ambiguous-ownership NULLs left nullable) or `PHASE3 WARNING` (duplicate `(user_id, google_event_id)`).

### `google-calendar-sync` deploy timing
The Phase 3 migration drops the global `unique(google_event_id)` and adds `unique(user_id, google_event_id)`; the function's `onConflict` was changed to match. **Apply the migration and redeploy `google-calendar-sync` together, and do not trigger a calendar sync in the gap** (the old function's `onConflict` breaks once the global unique is dropped).

### `jarvis-chat` relies on RLS — deploy after RLS verification
`jarvis-chat` now runs on the per-request JWT/RLS client, so its isolation depends on correct RLS. RLS is already live (verified Phase 1), but **run `phase1_verify.sql` + `phase2_verify.sql` and confirm no table has RLS disabled / missing owner policies BEFORE redeploying `jarvis-chat`.** Failure mode if a policy were wrong is "tool returns empty," never a cross-user leak.

---

## 4. Verification gate (task 2)

Single entry point: **`bash supabase/verify_all.sh`** (pass `USER_JWT=<token>` to also exercise authed paths). It:
1. checks prerequisites (.env, supabase CLI, deno),
2. runs the edge-function typecheck (`functions/typecheck.sh`) if deno is present,
3. prints migration status (`supabase migration list`),
4. runs `phase4a_verify.sh` (anon→401 + CORS preflight + authed paths),
5. lists the **SQL gate** to run in the editor — `phase1_verify.sql`, `phase2_verify.sql`, `phase3_verify.sql`,
6. prints the **second-user isolation** + **Jarvis cross-user attachment** manual steps,
7. prints a GO / NO-GO summary.

The SQL files can't be auto-run here (they need DB access in the editor); the script lists them with expected "zero rows" results. `phase3_verify_auth.sh` is superseded by `phase4a_verify.sh`/`verify_all.sh` (kept only as a historical artifact).

---

## 5. `insights-ai` removal — exact steps (task 5)

Repo directory already removed. To remove the **deployed** function and confirm:
```bash
supabase functions delete insights-ai          # removes the deployed function
supabase functions list                        # confirm it's gone
```
Rollback (if ever needed): `git checkout <prev-commit> -- supabase/functions/insights-ai && supabase functions deploy insights-ai`.

---

## 6. Deno / typecheck setup (task 3)

`deno` is **not installed** in this environment, so no typecheck ran here (structural checks — brace/paren balance, import resolution, no dangling refs — passed across all phases as a substitute).

Run locally before deploying:
```bash
brew install deno                       # once (or: curl -fsSL https://deno.land/install.sh | sh)
bash supabase/functions/typecheck.sh    # deno check every function + the shared helper
```
`deno check` resolves the remote `esm.sh` imports and the `../_shared/auth.ts` import, and fails on import errors or TypeScript syntax/type errors — the closest pre-deploy gate to how Supabase runs the functions. (Not wiring up full CI now — this one command is the lightweight gate.)

---

## 7. CORS production config (task 4)

- CORS is centralized in `_shared/auth.ts` via origin-aware `corsHeaders(req)`, driven by the **`ALLOWED_ORIGINS`** edge-function secret (documented in `supabase/functions/.env.example`).
- **Unset → `*`** (current behaviour; localhost and everything else work; nothing breaks).
- To lock down (after you know the prod domain — none is configured in the repo, so it is intentionally **not** hardcoded):
  ```bash
  supabase secrets set ALLOWED_ORIGINS="https://<your-prod-domain>,http://localhost:5173"
  ```
  Include **every** origin the app is served from (prod, Vercel preview URLs, `http://localhost:5173`). Preflight `OPTIONS` stays working in both modes; `Vary: Origin` is set so caches don't mix origins.

---

## 8. Rate-limit / cost protection plan (task 6 — plan only, not implemented)

Per-call cost is already bounded (`jarvis-chat`: truncated history, `max_tokens` 2500, ≤8 tool loops; the proxies are tiny). The real exposure is **call volume** by an authenticated user. Layered plan, cheapest first:

1. **Now, zero code (do this first):** set an **Anthropic Console monthly spend cap + usage alert**. This is the definitive backstop against runaway cost regardless of app behaviour.
2. **Now, zero code:** rely on Supabase platform per-function limits / monitor function invocation metrics; add a billing alert.
3. **Lightweight, ready-to-build (1 small table — deferred to keep Phase 4B schema-free):**
   ```sql
   create table public.ai_usage (
     user_id uuid references auth.users(id) on delete cascade,
     day date not null default current_date,
     calls int not null default 0,
     primary key (user_id, day)
   );
   alter table public.ai_usage enable row level security;
   create policy ai_usage_own on public.ai_usage for all
     using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
   Then a helper in `_shared/auth.ts`, called at the top of `jarvis-chat`/`insights-ai`-style functions:
   ```ts
   export async function assertUnderDailyLimit(client, userId, max = 200) {
     const { data } = await client.from('ai_usage')
       .upsert({ user_id: userId, day: new Date().toISOString().slice(0,10) }, { onConflict: 'user_id,day' })
       .select('calls').single()
     if ((data?.calls ?? 0) >= max) throw new Error('Daily AI limit reached')
     await client.from('ai_usage').update({ calls: (data?.calls ?? 0) + 1 })
       .eq('user_id', userId).eq('day', new Date().toISOString().slice(0,10))
   }
   ```
   (Increment-then-check; good enough for cost protection. Not implemented now — it's a schema change and Phase 4B is schema-free.)
4. **Optional input guards (no state):** cap `price-fetch` `assets.length` and `insights-ai` `lines` length to sane maxima. Low value vs. #1/#3; mentioned for completeness.

**Recommendation:** do #1 immediately; build #3 in the next infra pass if usage grows.

---

## 9. Deployment commands (consolidated)

```bash
# 0) Snapshot/backup the DB (dashboard) — no prior migration history.

# 1) Apply Phase 1–3 migrations (idempotent, ordered, no Docker):
supabase db push

# 2) Verify RLS BEFORE deploying jarvis-chat — run in SQL editor:
#    supabase/phase1_verify.sql , supabase/phase2_verify.sql , supabase/phase3_verify.sql

# 3) Deploy functions (jarvis-chat AFTER step 2; google-calendar-sync together with step 1):
supabase functions deploy google-calendar-sync
supabase functions deploy strava-sync
supabase functions deploy price-fetch
supabase functions deploy jarvis-chat

# 4) Remove the dead deployed function:
supabase functions delete insights-ai

# 5) (Recommended) lock down CORS:
supabase secrets set ALLOWED_ORIGINS="https://<your-prod-domain>,http://localhost:5173"

# 6) Local typecheck (if not already): bash supabase/functions/typecheck.sh
# 7) Master gate: USER_JWT=<token> bash supabase/verify_all.sh
```
No frontend redeploy is required for Phase 4B (no `src/` changes). Note: the **frontend still needs a redeploy from Phase 1/2** (DEV_USER guard + explicit `training_exercises` `user_id`) — see PHASE1/2 reports.

---

## 10. Rollback notes

- **insights-ai removal:** `git checkout <prev> -- supabase/functions/insights-ai && supabase functions deploy insights-ai` (and it was never called, so nothing depends on it).
- **New scripts / .env.example:** documentation/tooling only — deleting them changes no runtime behaviour.
- **Everything else (functions, migrations):** rollback per PHASE1–4A reports. Phase 4B added no schema changes, so there is nothing DB-level to roll back here.

---

## 11. Final GO / NO-GO for inviting a second test user

**Code: READY.** All infra/security phases (RLS, ownership, edge isolation, service-role reduction, CORS config, cleanup) are implemented and self-consistent in the repo.

**Conditional GO** — invite a second user **only after** the following pass (none can be done from here — they require deploying to your live project):

- [ ] `supabase db push` applied; no unexpected `PHASE2/3 WARNING` notices.
- [ ] `phase1_verify.sql` + `phase2_verify.sql` + `phase3_verify.sql` all return clean (no RLS-off tables; tokens 0-policy; `user_id` NOT NULL + indexed; `training_exercises.user_id` matches parent; composite google unique present).
- [ ] All 4 functions deployed; `insights-ai` deleted.
- [ ] `bash supabase/functions/typecheck.sh` clean (run once with deno installed).
- [ ] `USER_JWT=… bash supabase/verify_all.sh` — anon→401 on all functions; authed works; CORS preflight OK.
- [ ] **Second-user isolation passes**: a throwaway account sees zero of your data on every page and via Jarvis; the cross-user attachment test returns nothing.
- [ ] Frontend redeployed (DEV_USER stripped; `training_exercises` writes carry `user_id`).
- [ ] Anthropic spend cap set (§8.1).

Until the second-user isolation test passes against the deployed stack, treat it as **NO-GO**.

---

## 12. Recommended next phase

**Infra is complete.** The next phase is the **product track** from the audit (explicitly out of scope until the GO checklist passes):
- Phase 5 — onboarding/profile personalization
- Phase 6 — module visibility + custom modules
- Phase 7 — personalized Maxx Score / dynamic tiers

Optional infra follow-ups if usage grows: build the `ai_usage` daily cap (§8.3), wire `typecheck.sh` into CI, and revisit CORS once the production domain is finalized.
