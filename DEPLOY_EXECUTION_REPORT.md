# Deploy Execution Report — MaxxIt Phases 1–15

**Executed:** 2026-06-16 · **Project ref:** `foctdzzbonepdzeubate` (siggeOS, EU-Frankfurt)
**Operator:** automated deploy following `DEPLOY_READINESS_REPORT.md` §7.
**Outcome:** ✅ Database, edge functions, and frontend all deployed. ⏳ Vercel build to be confirmed manually.

---

## 1. Summary

| Step | Status |
|---|---|
| Pre-flight (git, migrations, functions, temp files) | ✅ clean |
| Backup (logical `pg_dump`) | ✅ taken & verified (1.9 MB, 91 tables, schema+data) |
| Migrations `db push` (phase3/5/7/9) | ✅ applied — **after fixing 2 migration bugs** |
| Schema/RLS verification (phase1/2/3) | ✅ pass |
| `ALLOWED_ORIGINS` CORS secret | ✅ set |
| Edge functions (4) deploy | ✅ all ACTIVE |
| `insights-ai` delete | ✅ removed from server |
| Commit + push `origin/main` | ✅ pushed (`aabbd8c`) |
| Vercel build | ⏳ **confirm manually** (no CLI access locally) |

---

## 2. Commands run (in order)

```bash
# Pre-flight (read-only)
git status / git log
ls supabase/migrations supabase/functions

# Backup (Free Plan has no auto-backups → logical dump via IPv4 session pooler;
#   direct host db.<ref>.supabase.co is IPv6-only and unreachable from this network)
brew install libpq                       # pg_dump 18.4 (not previously installed)
pg_dump "postgresql://postgres.foctdzzbonepdzeubate:***@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" \
  --no-owner --no-privileges -f backup_pre_phase15_full_20260616.sql
#   → 1.9 MB, 91 CREATE TABLE + 91 COPY blocks, "PostgreSQL database dump complete"
#   → backup_pre_*.sql added to .gitignore (contains personal data — never committed)

# Migration state check (read-only) — REVEALED phases 1–2 ALREADY applied on prod
supabase migration list --linked

# Apply migrations (3 attempts — see §6 for the 2 bugs fixed between attempts)
supabase db push --linked --yes         # attempt 3 succeeded: phase3, phase5, phase7, phase9

# Verification (read-only, via psql over pooler)
psql <pooler-url> -f supabase/phase1_verify.sql
psql <pooler-url> -f supabase/phase2_verify.sql
psql <pooler-url> -f supabase/phase3_verify.sql

# CORS
supabase secrets set ALLOWED_ORIGINS="https://sigge-os.vercel.app,http://localhost:5173"

# Edge functions
supabase functions deploy strava-sync
supabase functions deploy google-calendar-sync
supabase functions deploy price-fetch
supabase functions deploy jarvis-chat
supabase functions delete insights-ai

# Frontend
git add -A
git commit -m "Complete MaxxIt phases 1-15"
git push origin main
```

---

## 3. Migrations applied

`db push` applied the **4 pending** migrations (phases 1–2 were already on prod before this run):

| Migration | Result |
|---|---|
| `20260617090000_phase3_00_google_event_unique` | ✅ dropped global unique on `google_event_id`, added composite `(user_id, google_event_id)` on `pa_shifts` + `mandatory_sessions` |
| `20260618090000_phase5_00_profile_engine` | ✅ added profile identity/body/life/focus columns + check constraints + `avatars` storage bucket & policies |
| `20260619090000_phase7_00_score_versioning` | ✅ added `score_version` columns |
| `20260620090000_phase9_00_benchmark_schema` | ✅ created `benchmark_datasets` / `benchmark_percentiles` (public-read, inert) |

**Final `migration list`:** all 11 local migrations show on Remote. ✅

---

## 4. Verification results

- **Phase 1:** every personal table `rls_enabled = t`; no unprotected tables.
- **Phase 2:** `table_missing_user_id` = 0, `table_without_user_id_index` = 0, `table_without_user_fk` = 0, `table_without_rls` = 0, `training_exercises_owner_mismatch` = **0**. Exercise library 37 global + 2 user-override.
- **Phase 3:** composite uniques confirmed on both tables; 0 cross-user event sharing; 0 duplicate groups.
- **Notes (non-blocking):**
  - `phase3_verify.sql` line 24 has the same `name[] = text[]` bug (read-only check script, not deployed); its other queries already proved the constraints. **TODO:** apply the `::text` cast for clean verify runs.
  - `google_tokens` / `strava_tokens`: RLS-on, 0 policies = intentionally locked to clients (edge functions use service_role).

---

## 5. Functions deployed

Server function list after deploy:

| Function | Status | Version |
|---|---|---|
| jarvis-chat | ACTIVE | 42 |
| google-calendar-sync | ACTIVE | 29 |
| strava-sync | ACTIVE | 9 |
| price-fetch | ACTIVE | 4 |
| ~~insights-ai~~ | **deleted** | — |

(The "Docker is not running" line on each deploy is a harmless warning — the CLI used the API upload path and bundled `_shared/auth.ts`.)

---

## 6. Warnings / errors encountered & resolved

Two **genuine latent bugs** in migrations blocked `db push`; each was fixed with a minimal, non-destructive change after explicit user approval (the deploy-blocker exception). No data was modified by either failure (both migrations are transactional and rolled back cleanly).

| # | Migration | Error | Fix |
|---|---|---|---|
| 1 | phase3 | `operator does not exist: name[] = text[]` (SQLSTATE 42883) — `array_agg(att.attname)` yields `name[]`, compared to a `text[]` literal | Cast `att.attname::text` (2 occurrences) |
| 2 | phase5 | `column us.display_name does not exist` (SQLSTATE 42703) — backfill read `user_settings.display_name`, which doesn't exist in this schema | Wrapped backfill in an `information_schema.columns` existence guard (lazy-parsed, safe no-op when column absent) |

Both fixes are committed in `aabbd8c`.

**Process note:** prod migration state differed from the readiness report's assumption — phases 1–2 (incl. `training_exercises.user_id`) were **already applied**, so the report's headline "migration-before-frontend" risk was already neutralized before this run.

---

## 7. Commit / push

- **Commit:** `aabbd8c` — "Complete MaxxIt phases 1-15" (also published the previously-unpushed `1225252`, phases 1–7).
- **Push:** ✅ `ae6bdff..aabbd8c  main -> main` to `github.com/siggerikardgustafsson-bit/siggeOS`.
- **Backup file** `backup_pre_phase15_full_20260616.sql` is gitignored and was **not** pushed.

---

## 8. Vercel status

⏳ **Unconfirmed from this machine** — no Vercel CLI / auth / `.vercel` link available. Live site returned HTTP 200 (old build still serving until the new one finishes).

**Manual step:** Vercel Dashboard → `sigge-os` → Deployments → find commit `aabbd8c` → wait for **Ready**. If **Error**, capture the build log (this is the real build gate — local `vite build`/`eslint` can't run on this RAM-constrained machine).

---

## 9. Remaining manual checks

1. **Vercel build green** for `aabbd8c`.
2. **Runtime smoke tests** — see §10 checklist below / `DEPLOY_READINESS_REPORT.md` §5.
3. **Second-user isolation** — create a throwaway account; confirm zero data bleed.
4. **Jarvis reply** — confirm Anthropic credits + that it answers (now origin-locked via `ALLOWED_ORIGINS`).
5. **Post-deploy cleanup (non-blocking):** `::text` cast in `phase3_verify.sql`; de-personalize hardcoded "Sigge" in AI prompts before inviting a real second user (see `FINAL_PRODUCT_AUDIT.md` Part 5).

---

## 10. Post-deploy smoke checklist

- [ ] Login (email auth → Dashboard)
- [ ] Dashboard loads, no console errors
- [ ] Profile save (identity/life-stage; avatar upload → avatars bucket)
- [ ] Onboarding completes for a fresh account
- [ ] Training: log a gym session + exercises (writes `training_exercises.user_id`)
- [ ] Health: log weight/sleep/energy
- [ ] Journal: entry saves; AI extraction doesn't error
- [ ] Economy: income/expenses/assets load
- [ ] Studies: category shows "Studier"; tier reflects formal + skills
- [ ] Detail modal opens on a category
- [ ] Why-This-Score / Why-This-Tier section appears
- [ ] Rank-Up plan + opportunities visible
- [ ] Jarvis loads + replies
- [ ] Jarvis deep links ("Fråga Jarvis" chips auto-send)
- [ ] Calendar overlays events
- [ ] Second-user isolation verified

---

## 11. Rollback (if needed)

- **Frontend:** Vercel → Deployments → Promote previous deployment (instant), or `git revert aabbd8c` + push.
- **Edge functions:** redeploy from a checkout of `ae6bdff`.
- **DB:** migrations are non-destructive; if needed restore `backup_pre_phase15_full_20260616.sql`. Note phases 1–2 predate this run and are not covered by a "revert these 4" path — restore is the backstop.
- **Order to undo:** frontend → functions → DB.
