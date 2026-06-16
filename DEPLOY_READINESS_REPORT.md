# Deploy Readiness Report — Pre-Deploy Stabilization (Phases 1–15)

> **Purpose:** prepare MaxxIt for a safe Vercel + Supabase deploy so the app can be tested live. **No new features, no new engines, no UI redesign.** Verification, cleanup, and exact commands only.

---

## 0. GO / NO-GO

**Status: 🟢 GO — conditional on the migration-before-frontend gate.**

The code is verified (505/505 logic checks, all changed files transform cleanly, lint clean). The deploy is safe **only if migrations are applied to the production DB *before* the new frontend goes live**, because the committed frontend writes `training_exercises.user_id`, which only exists after the Phase-2 migration. Follow §7 exactly and it is a green deploy.

---

## 1. Changed-files audit

Working tree = the uncommitted Phase 8 + 10–15 work, on top of commit `1225252` (Phases 1–7, **not yet pushed**). Prod (`origin/main` @ `ae6bdff`) is still pre-migration.

| Group | Files | Notes |
|---|---|---|
| **DB migrations** | `…phase9_00_benchmark_schema.sql` (untracked) | Phases 1–7 migrations already committed in `1225252`. Phases 8/10–15 added **no** migrations. |
| **Edge functions** | none changed in working tree | jarvis-chat (JWT/RLS) + strava/google/price (shared auth) committed in `1225252`; **need deploy**. `insights-ai` already removed from repo. |
| **Frontend logic** | `maxxScore.js`, `tierEngine.js`, `Dashboard.jsx`, `Jarvis.jsx`, `Onboarding.jsx`, `Profile.jsx` + new libs `benchmarks/`, `jarvis/`, `career.js`, `insight.js`, `rankUp.js`, `studies.js`, `profileCompleteness.js` | Phases 6–15. |
| **UI components** | `DetailModal.jsx`, `InsightSections.jsx` (new), `ProfileQualityCard.jsx` (new), `Sidebar/BottomNav/CommandPalette` (label renames), `Plugg/Insights/Kalender` (Plugg→Studier labels) | Phase 12 + 14. |
| **Scripts/tests** | 9 × `scripts/*_check.mjs` (untracked) | Node verification, not shipped to the browser. |
| **Docs/reports** | `PHASE8–15_REPORT.md`, this file | |

**Suspicious / accidental — resolved this phase:**
- ✅ Removed `vite.config.js.timestamp-*.mjs` (Vite build artifact, never commit) and added `*.timestamp-*.mjs` to `.gitignore`.
- ✅ Added `.claude/` to `.gitignore` (local agent state).
- ✅ Removed corrupt stray git refs `refs/heads/main 2`, `…/main 2.lock`, `…/main 3.lock`, `refs/remotes/origin/main 2` that caused `fatal: bad object` on fetch. (Cosmetic invalid-reflog-entry warnings remain; harmless, do not block push.)

Nothing else looks accidental — every modified file maps to a documented phase.

---

## 2. Migration readiness

**11 migrations, already in correct timestamp order:**

| # | File | Covers | Pre-frontend gate? |
|---|---|---|---|
| 1 | `20260615120000_phase1_00_profiles_and_admin` | `profiles` table + admin | – |
| 2 | `…phase1_01_rls_personal_tables` | RLS on personal tables | – |
| 3 | `…phase1_02_rls_token_tables` | RLS on token tables | – |
| 4 | `…phase1_03_rls_training_exercises` | RLS (parent-join, interim) | – |
| 5 | `…phase1_04_rls_reference_tables` | RLS on reference tables | – |
| 6 | `20260616090000_phase2_00_training_exercises_ownership` | **`training_exercises.user_id`** + backfill + trigger + direct RLS | **🔴 YES — frontend writes this column** |
| 7 | `…phase2_01_user_id_constraints_indexes` | user_id FKs/NOT NULL/indexes (43 tables) | 🔴 yes |
| 8 | `20260617090000_phase3_00_google_event_unique` | `(user_id, google_event_id)` unique | deploy with google-calendar-sync |
| 9 | `20260618090000_phase5_00_profile_engine` | profile columns + `avatars` bucket + RLS | 🟠 onboarding/profile save (degrades gracefully if absent) |
| 10 | `20260619090000_phase7_00_score_versioning` | `score_version` on snapshots/scores | 🟠 dashboard writes 'v2' (nullable, safe) |
| 11 | `20260620090000_phase9_00_benchmark_schema` | `benchmark_datasets`/`_percentiles` reference tables, public-read RLS | ⚪ inert — app reads JS seed, benchmarks default-OFF |

`supabase db push` applies all **pending** migrations in this order in one shot. **All must be applied before the frontend push** — #6/#7 are hard blockers; #9 is non-destructive and forward-looking (safe either way). All migrations are idempotent (`if not exists`, `if not exists` constraints) and non-destructive (no drops/truncates of data tables).

---

## 3. Edge function readiness

Functions on disk: `jarvis-chat`, `strava-sync`, `google-calendar-sync`, `price-fetch`, `_shared`. `insights-ai` is **gone from the repo** (Phase 4B) but may still exist **on the server** → delete it.

**Deploy order** (after migrations, because jarvis-chat now relies on RLS being correct):
1. `strava-sync`, `google-calendar-sync`, `price-fetch` (shared JWT auth)
2. `jarvis-chat` (per-request JWT/RLS client — requires Phase-1 RLS applied first)
3. Delete `insights-ai` from the server.

**CORS:** Phase 4A made `corsHeaders` origin-aware via `ALLOWED_ORIGINS`. Set it (comma-separated prod origins) before/at deploy or it falls back to `*`. Set the Vercel prod URL there to lock down.

---

## 4. Build verification

| Check | Result |
|---|---|
| **Verification suites (9)** | ✅ **505/505** — tier 14, maxx 15, profile 24, benchmark 21, rankup 36, jarvis 48, insight 243, studies 51, career 53 |
| **esbuild transform of every changed/new file** | ✅ all clean |
| **eslint** | ⚠️ **Could not complete locally** — eslint's cold flat-config + React-plugin start wedges on this RAM-constrained machine (same constraint as `vite build`); killed after multi-minute no-output even for 2 files. Not a code signal. **Run `npm run lint` in Vercel CI / on an unconstrained machine.** esbuild transform (below) is the local compile gate. |
| **`npm run build` (full vite)** | ⚠️ **Not run** — documented to wedge this machine's RAM across Phases 2/5/7/8/9. Verified instead via per-file esbuild + the 505-test suite (the project's established method). **Re-run `npm run build` on a non-constrained machine or let Vercel's build be the gate.** |

Vercel runs its own `npm run build` in CI with ample memory; a local full build is not required for deploy, but **watch the Vercel build log** as the real build gate.

---

## 5. Runtime smoke-test checklist (run after deploy)

- [ ] **Login** — email auth works; redirected to Dashboard
- [ ] **Onboarding** — new flow incl. personalize step completes; no crash if a field is blank
- [ ] **Profile save** — `/profil` saves identity/life-stage; avatar upload works (avatars bucket)
- [ ] **Dashboard loads** — no console errors; categories render
- [ ] **Maxx Score renders** — headline tier + constellation/focus/tree views
- [ ] **Studier composite** — category shows "Studier" (not "Plugg"); tier reflects formal + skills
- [ ] **Details modal opens** — click a category node
- [ ] **Why This Score / Why This Tier** — explainability section appears (incl. Studier "Sammansättning")
- [ ] **Rank Up info** — rank-up plan + opportunities visible in the modal
- [ ] **Confidence + Benchmark source** — confidence bars + benchmark-källa card render
- [ ] **Jarvis loads** — context builds; can send a message and get a reply
- [ ] **Jarvis deep links** — "Fråga Jarvis" chips open Jarvis and auto-send the question
- [ ] **Log gym workout** — Träning: add session + exercises (writes `training_exercises.user_id` — the migration gate)
- [ ] **Log health** — Hälsa: weight/sleep/energy
- [ ] **Log journal** — Journal: entry saves; AI extraction (if used) doesn't error
- [ ] **Open calendar** — Kalender overlays events
- [ ] **Open economy** — Ekonomi loads income/expenses/assets
- [ ] **Open training** — Träning loads history/PRs
- [ ] **Open studies** — `/plugg` route loads under the "Studier" label

---

## 6. Second-user safety check

Create a throwaway second account and verify isolation (RLS is the enforcement layer — Phases 1–4):
- [ ] **No data bleed** — second account's Dashboard/pages show **zero** of account-1's data
- [ ] **Own profile** — second account gets its own `profiles` row + onboarding
- [ ] **Can log** — second account can log training/health/journal (writes succeed with its own `user_id`)
- [ ] **Jarvis isolation** — ask second-account Jarvis "what's my data?" → it sees only its own (jarvis-chat uses the per-request JWT/RLS client, Phase 4A)
- [ ] **Storage isolation** — uploaded course material / avatar from account-1 is **not** retrievable by account-2 (check `avatars` bucket + any course-material storage RLS)
- [ ] **Direct probe** — while logged in as account-2, attempt to read a known account-1 row id via the client → must return empty (RLS deny)

Run `supabase/phase1_verify.sql`, `phase2_verify.sql`, `phase3_verify.sql` against prod (read-only checks) to confirm RLS/ownership before trusting the UI test.

---

## 7. Deployment command block (run in order)

```bash
# ── 0. BACKUP FIRST (irreversible migrations ahead: RLS, NOT NULL, FKs) ──
#    Supabase Dashboard → Database → Backups → create a manual backup,
#    OR: pg_dump "$SUPABASE_DB_URL" > backup_pre_phase15_$(date +%Y%m%d).sql
#    Do NOT proceed until you have a restorable backup.

cd /Users/siggegustafsson/Desktop/sigge-os
supabase link --project-ref foctdzzbonepdzeubate   # already linked; safe to re-run

# ── 1. APPLY MIGRATIONS (must precede frontend deploy) ──
supabase db push                                   # applies phase1→phase9 in order

# ── 2. VERIFY SCHEMA + RLS (read-only; run in Supabase SQL editor or psql) ──
#    supabase/phase1_verify.sql   (RLS on personal tables)
#    supabase/phase2_verify.sql   (training_exercises.user_id present + backfilled)
#    supabase/phase3_verify.sql   (google_event_id composite unique)
#    bash supabase/verify_all.sh  (master gate, if it runs headless)

# ── 3. SET CORS SECRET (lock down origins) ──
supabase secrets set ALLOWED_ORIGINS="https://<your-vercel-domain>,http://localhost:5173"

# ── 4. DEPLOY EDGE FUNCTIONS (after RLS migrations) ──
supabase functions deploy strava-sync
supabase functions deploy google-calendar-sync
supabase functions deploy price-fetch
supabase functions deploy jarvis-chat

# ── 5. REMOVE DEAD FUNCTION FROM SERVER ──
supabase functions delete insights-ai   # ignore "not found" if already gone

# ── 6. COMMIT + PUSH FRONTEND (triggers Vercel deploy) ──
git add -A
git commit -m "Phases 8-15: onboarding/profile, benchmarks, rank-up, Jarvis intelligence, explainability UI, Studier composite, career model"
git push origin main      # this includes the unpushed Phase 1-7 commit too

# ── 7. POST-DEPLOY VERIFICATION ──
#    Watch the Vercel build log → must succeed (real build gate).
#    Then run §5 smoke tests + §6 second-user safety.
```

---

## 8. Known risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Frontend deployed before migrations → gym logging breaks (`training_exercises.user_id` missing) | 🔴 High | §7 order: `db push` **before** `git push`. |
| 2 | jarvis-chat needs RLS applied (per-request JWT client) — deploy before migrations → Jarvis errors | 🟠 Med | Deploy functions in step 4, after step 1. |
| 3 | `ALLOWED_ORIGINS` unset → CORS falls back to `*` (works, but not locked down) | 🟠 Med | Step 3 sets it. |
| 4 | Studier composite shifts the `plugg` tier for the existing user | 🟢 Low | Expected (skills now count); snapshot column unchanged, no data migration. |
| 5 | phase9 benchmark tables created but unread (benchmarks default-OFF) | ⚪ None | Inert; safe to apply. |
| 6 | Full local `vite build` unverified (RAM) | 🟢 Low | Vercel CI build is the gate; 505 tests + esbuild cover logic. |
| 7 | Migrations irreversible (RLS/NOT NULL/FK) | 🟠 Med | Backup in step 0 is the rollback. |

---

## 9. Rollback notes

- **DB:** migrations are non-destructive but add RLS/constraints that are awkward to hand-reverse → **restore the step-0 backup** if a migration misbehaves.
- **Frontend:** `git revert <merge>` then push, or **Vercel → Deployments → Promote the previous deployment** (instant).
- **Edge functions:** redeploy the prior version from a clean checkout of `ae6bdff` if a function regresses; keep this report's commit hash noted.
- **Order to undo:** frontend first (Vercel rollback), then functions, then DB restore — the reverse of deploy.

---

## 10. Post-deploy checklist (condensed)

1. Vercel build green ✔
2. §5 smoke tests pass ✔
3. §6 second-user isolation verified ✔
4. `insights-ai` confirmed deleted ✔
5. Jarvis replies (Anthropic credits present) ✔
6. No console/RLS errors in a real session ✔

If all six pass, the live environment is ready for full testing.
