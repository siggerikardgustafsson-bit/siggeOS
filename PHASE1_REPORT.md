# Phase 1 Report — Auth & RLS Hardening

> **Scope:** Phase 1 of [MULTI_USER_AUDIT.md](MULTI_USER_AUDIT.md) only — verify/harden auth, remove the DEV_USER production risk, audit every table for RLS, generate RLS migrations, create `profiles` + admin support, and fix confirmed security issues. **Nothing from Phases 2–7 was implemented** (no custom modules, personalized onboarding, dynamic tiers, module visibility, score changes, or Jarvis personalization).
> **Date:** 2026-06-15
> **Status of DB changes:** SQL migrations are **written but NOT yet applied** to the remote database (see [§6 How to apply](#6-how-to-apply)). Code changes are applied to the working tree and verified.

---

## 1. Headline: the database was already in better shape than the static audit could tell

The original audit's #1 risk was *"RLS may be off — anyone with the anon key could read the whole DB."* **I verified empirically that this is NOT the case.** RLS is already enabled and enforcing owner isolation on every personal/secret table.

That changes the nature of Phase 1 from *"turn RLS on and pray it doesn't break the app"* to:
- **Verify** isolation comprehensively (done — empirically).
- **Standardize & guarantee** correct policies via idempotent migrations (notably `WITH CHECK` on writes, and locking token tables to service-role only).
- **Fill the real gaps:** `profiles`/admin didn't exist; one service-role data leak and the DEV_USER backdoor were live.

---

## 2. Verification performed (evidence, not assumptions)

### 2.1 Empirical RLS probe — anon key, no user JWT, against the live project
Method: `GET /rest/v1/<table>?select=*` with the **public anon key** and `Prefer: count=exact`, `Range: 0-0`. If anon sees rows, RLS is off/permissive; `*/0` means zero rows visible (protected).

**Result — all 44 personal/secret tables returned `*/0` (protected):**
`training_sessions, training_exercises, personal_records, run_personal_records, health_logs, supplement_logs, nutrition_logs, meal_logs, journal_entries, social_interactions, friends, study_sessions, courses, course_exams, learning_goals, study_tasks, study_task_deadlines, tenta_sessions, course_materials, exam_old_files, income_logs, expense_logs, fixed_costs, assets, net_worth_history, projects, project_tasks, erik_tasks, erik_payments, erik_contact_log, pa_shifts, mandatory_sessions, schedule_events, trips, adventures, side_quests, skill_logs, daily_scores, tier_snapshots, jarvis_insights, jarvis_conversations, user_settings, strava_tokens, google_tokens` → **RLS ON.**

**Reference tables intentionally public-readable:** `exercise_library` (37 rows), `exercise_library_with_muscles` (39), `muscle_groups` (17), `exercise_muscles` (84), `exercise_aliases` (15).

**`profiles` → HTTP 404** — table did not exist. (Now created by migration 00.)

### 2.2 Schema facts confirmed from code + API
- `exercise_library` is a **hybrid**: global defaults (`user_id IS NULL`) + per-user overrides. Confirmed by `Traning.jsx` upsert `onConflict: 'user_id,slug'` and the in-code comment *"Global/default exercises are read-only. Create a user-owned override…"*.
- `training_exercises` has **no `user_id`** (insert at `QuickLog.jsx:478` sets only `session_id`, …). Its RLS must be a parent-session join → implemented that way in migration 03.
- Remote DB has **zero tracked migrations** (`supabase migration list --linked`) — schema was built ad-hoc in the dashboard. `supabase db push` will apply the new files (no Docker needed).

### 2.3 Live test of the `ExerciseModal` security fix
Ran the **exact** new PostgREST query (`training_exercises` with `training_sessions!inner(...)` + `training_sessions.user_id=eq.<uid>` + embedded order) against the live API with a real user JWT:
- `status: 200`, returned rows, **`allRowsOwnedByUser: true`**.
- Confirms the embed/filter/order syntax is valid (a malformed embed returns 400) and that results are correctly scoped.

### 2.4 Code edits compile
Both edited frontend files transform cleanly in the running Vite dev server (`/src/...jsx` → 200, `transformedOk: true`). No console/transform errors.

---

## 3. Code changes (applied to working tree)

### 3.1 Removed the DEV_USER production risk — `src/context/AuthContext.jsx`
The dev auth bypass is now hard-gated behind `import.meta.env.DEV`, which Vite sets to `false` in `vite build`. It is therefore **stripped from production bundles**; local dev is unaffected.
```diff
-const DEV_USER = import.meta.env.VITE_DEV_USER
+// hard-gated behind import.meta.env.DEV → stripped from production builds
+const DEV_USER = import.meta.env.DEV && import.meta.env.VITE_DEV_USER
   ? { id: import.meta.env.VITE_DEV_USER, email: 'dev@local', role: 'authenticated' }
   : null
```

### 3.2 Fixed confirmed cross-user leak in Jarvis (4B) — `supabase/functions/jarvis-chat/index.ts`
The attachment-content fetch ran on the **service-role** client (which bypasses RLS) with no owner check, so a client could pass arbitrary ids and read another user's uploaded course materials / old exams. Now scoped to the authenticated user and gated on `user`.
```diff
-        if (materialIds?.length) {
-          const { data: mats } = await supabase.from('course_materials').select('file_name,content').in('id', materialIds)
+        if (user && materialIds?.length) {
+          const { data: mats } = await supabase.from('course_materials').select('file_name,content').in('id', materialIds).eq('user_id', user.id)
...
-        if (examFileId) {
-          const { data: ef } = await supabase.from('exam_old_files').select('file_name,content').eq('id', examFileId).single()
+        if (user && examFileId) {
+          const { data: ef } = await supabase.from('exam_old_files').select('file_name,content').eq('id', examFileId).eq('user_id', user.id).single()
```
> ⚠️ **Requires deploy to take effect:** `supabase functions deploy jarvis-chat` (edge functions don't run in the local preview).

### 3.3 Fixed unscoped query in `ExerciseModal` — `src/components/ExerciseModal.jsx`
Previously selected `training_exercises` by `exercise_name` only (every user's sets). Now scoped to the user's own sessions via an inner join (defense-in-depth on top of the new parent-join RLS). Live-verified in §2.3.
```diff
-      .select('*, training_sessions(date, feeling)')
-      .eq('exercise_name', exerciseName)
+      .select('*, training_sessions!inner(date, feeling, user_id)')
+      .eq('exercise_name', exerciseName)
+      .eq('training_sessions.user_id', user.id)
```

> **Note on `Traning.jsx` bulk `training_exercises` updates** (`:330`, `:364`): these rename rows by `exercise_id` with no owner filter. They are **not changed in code** because the new parent-join RLS (migration 03) already restricts them to the caller's own rows. No cross-user write is possible post-migration.

---

## 4. SQL migrations created (`supabase/migrations/`)

All migrations are **idempotent** (safe to re-run) and **defensive** (skip missing tables, warn via `RAISE NOTICE` on unexpected schema instead of failing). They run in filename order.

| File | What it does |
|---|---|
| `20260615120000_phase1_00_profiles_and_admin.sql` | Creates `public.profiles` (1:1 with `auth.users`: display_name, avatar, locale, timezone, currency, unit_system, **`is_admin`**). Adds **`is_admin()`** helper (SECURITY DEFINER, safe inside policies). Adds **`handle_new_user`** trigger to auto-create a profile on signup, plus an `updated_at` touch trigger. Owner/admin RLS policies. **Backfills** profiles for existing users and **bootstraps the owner** (`siggerikardgustafsson@gmail.com`) as admin. |
| `20260615120100_phase1_01_rls_personal_tables.sql` | Loops over **41 owner-only tables**; for each with a `user_id` column: enables RLS, drops all existing policies, and creates the canonical 4 (`select/insert/update/delete` = `auth.uid() = user_id`, with `WITH CHECK` on insert/update). Tables lacking `user_id` are skipped with a warning. |
| `20260615120200_phase1_02_rls_token_tables.sql` | `strava_tokens`, `google_tokens`: RLS on, **all policies removed → no client access at all**. Only the service-role edge functions (which bypass RLS) can read them. Strictest possible for OAuth secrets. |
| `20260615120300_phase1_03_rls_training_exercises.sql` | Child table owned via parent. Detects whether a `user_id` column exists; if not (the current case), applies **parent-session-join** policies (`EXISTS (… training_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())`) for all four commands. |
| `20260615120400_phase1_04_rls_reference_tables.sql` | Shared catalog. `exercise_library`: read global+own+admin, write own (admin for global rows). `exercise_muscles`/`exercise_aliases`: public read, write only mappings of an exercise the user owns. `muscle_groups`: public read, admin-only write. Sets the `exercise_library_with_muscles` **view to `security_invoker = on`** so it respects base-table RLS (closes a view-bypass gap). |

Plus a **non-migration** helper: `supabase/phase1_verify.sql` — read-only queries to confirm RLS status, policy predicates, token-table lockdown, profile/admin rows, and a Phase-2 NULL-`user_id` preview. Run it in the SQL editor after applying.

---

## 5. Why these are safe for the existing (single-user) app

- The client always sends Sigge's JWT, so `auth.uid() = user_id` policies keep his reads/writes working exactly as before.
- Edge functions use the **service-role key**, which bypasses RLS — so locking token tables and standardizing policies does not affect `jarvis-chat`, `strava-sync`, or `google-calendar-sync`.
- The exercise-catalog read policies keep global rows publicly readable (anon still sees the 37 defaults), so the Träning page is unaffected. Sigge is bootstrapped as **admin**, so any global-library editing he does continues to work.
- Dropping/recreating policies only swaps client-facing rules; no data is touched.

---

## 6. How to apply

> These changes touch the **live production database** and are not auto-applied. Review, then run:

**1) Apply the SQL migrations** (no Docker required):
```bash
supabase db push          # applies the 5 files in supabase/migrations/
```
*Alternative:* paste each migration file into the Supabase SQL editor in filename order. Watch the `NOTICE` output — any `PHASE1 WARNING: <table> has no user_id column` means review that table before relying on its policy.

**2) Deploy the Jarvis edge-function fix:**
```bash
supabase functions deploy jarvis-chat
```

**3) Verify:**
```bash
# re-run the anon probe — every data table should still show */0
# (or run supabase/phase1_verify.sql in the SQL editor)
```

**4) Rebuild/redeploy the frontend** so the DEV_USER guard ships (`VITE_DEV_USER` must be unset in the production environment regardless).

### Rollback
RLS was already ON, so the risky part is policy replacement, not enabling RLS. If something misbehaves after push: re-grant temporarily with a permissive policy on the affected table (`create policy tmp_all on public.<t> for all using (auth.uid() = user_id);`) and investigate. The `profiles` table/trigger can be dropped with `drop table public.profiles cascade; drop function public.handle_new_user cascade;`. Because there are no prior tracked migrations, take a DB backup/snapshot in the dashboard **before** `db push`.

---

## 7. Post-apply checklist (do this before inviting a 2nd user)

- [ ] Run `supabase/phase1_verify.sql`; confirm **no data table has `rls_enabled = false`** and token tables have **0 policies**.
- [ ] Create a throwaway 2nd account; confirm it sees **zero** of Sigge's data on every page and via Jarvis.
- [ ] As the 2nd user, attempt to read another user's `course_materials` id through Jarvis — must fail (validates the 4B fix; needs the function deployed).
- [ ] Confirm Sigge can still log/edit training, health, economy, study, and that the exercise library loads.
- [ ] Confirm a production build has no `VITE_DEV_USER` effect (auth required).

---

## 8. Remaining issues & explicitly out of scope

### Deferred to later phases (per the audit — intentionally NOT done here)
- **Phase 2 — `user_id` NOT NULL/FK + backfill + indexes.** Migration 01 standardizes *policies* but does **not** add `NOT NULL`/FK constraints or indexes (constraint changes need the NULL-audit first; see `phase1_verify.sql` query 6). `training_exercises` still has no `user_id` column (uses the parent-join policy instead).
- **Phase 3 — `insights-ai` and `price-fetch` are still unauthenticated.** They leak no data (stateless proxies) but are open cost vectors. Adding JWT auth is Phase 3, so they were left untouched.
- **Phases 4–7** — onboarding personalization, module visibility, custom modules, dynamic/personalized tiers: not started, as instructed.

### Known smaller items observed but not changed in Phase 1
- `google-calendar-sync` upserts on `onConflict: 'google_event_id'` (not user-scoped). Safe while Google event ids are globally unique; consider `(user_id, google_event_id)` in Phase 3.
- The Sigge-specific hardcoding (Jarvis prompts, "Erik" module, CSN/SEK defaults, tier thresholds) is untouched — that's Phases 4/6/7.
- `is_admin()` exists in the DB, but there is **no admin UI** and the frontend does not yet read `profiles.is_admin`. That's deliberate (admin surfaces are module-visibility/Phase 5+). The DB role model is in place for when it's needed.

### Assumptions to be aware of
- The personal-table list in migration 01 is derived from the code's `.from()` usage. If a table exists that isn't in the list, it won't be hardened by this migration — `phase1_verify.sql` query 2 will surface any `public` table still missing RLS.
- The admin bootstrap matches the owner by email (`siggerikardgustafsson@gmail.com`). If that email differs in `auth.users`, set admin manually: `update public.profiles set is_admin = true where id = '<uuid>';`

---

## 9. Files changed / added

**Modified (code):**
- `src/context/AuthContext.jsx` — DEV_USER hard-gated to dev builds.
- `src/components/ExerciseModal.jsx` — query scoped to the user's own sessions.
- `supabase/functions/jarvis-chat/index.ts` — attachment fetch scoped to `user.id` (needs deploy).

**Added (migrations + verification):**
- `supabase/migrations/20260615120000_phase1_00_profiles_and_admin.sql`
- `supabase/migrations/20260615120100_phase1_01_rls_personal_tables.sql`
- `supabase/migrations/20260615120200_phase1_02_rls_token_tables.sql`
- `supabase/migrations/20260615120300_phase1_03_rls_training_exercises.sql`
- `supabase/migrations/20260615120400_phase1_04_rls_reference_tables.sql`
- `supabase/phase1_verify.sql`

No UI, scoring, onboarding, or Jarvis-personalization changes were made.
