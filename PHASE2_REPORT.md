# Phase 2 Report — user_id Audit, Backfill, Constraints & Ownership Consistency

> **Scope:** Phase 2 of [MULTI_USER_AUDIT.md](MULTI_USER_AUDIT.md) only — make every row clearly owned and that ownership enforceable. **No** custom modules, onboarding/personalization, dynamic tiers, Maxx Score, UI, or broad refactors were touched.
> **Builds on:** [PHASE1_REPORT.md](PHASE1_REPORT.md). Phase 1 migrations are **still unapplied** on the remote (verified: `profiles` → 404, `training_exercises.user_id` → 400). `supabase db push` will apply Phase 1 then Phase 2 in filename order.
> **DB changes status:** migrations **written, not yet applied**.

---

## 1. What I confirmed before writing anything

- **Phase 1 not yet pushed.** Empirical probes: `GET /rest/v1/profiles` → 404; `GET /rest/v1/training_exercises?select=user_id` → 400 (column absent); `?select=session_id` → 200. So Phase 2 layers cleanly on top of Phase 1 at push time.
- **`training_exercises` has no `user_id`** (inserts at `QuickLog.jsx`, `Traning.jsx` set only `session_id`). Confirmed it's the only owned table needing a column add.
- **Composite-index columns exist** where expected (probed live): `training_sessions.date`, `health_logs.date`, `study_sessions.(course_id,date)`, `learning_goals.course_id`, `projects.created_at`, `jarvis_conversations.created_at`, `net_worth_history.date`.
- **Conflict-target audit (every `onConflict` in the codebase):** all are user-scoped (`user_id`, `user_id,date`, `user_id,slug`, `user_id,distance_key,strava_activity_id`, …) **except two**, both in the `google-calendar-sync` edge function: `pa_shifts` and `mandatory_sessions` upsert on `google_event_id`. → deferred to Phase 3 (see §7).

---

## 2. Migrations added (`supabase/migrations/`)

| File | Purpose |
|---|---|
| `20260616090000_phase2_00_training_exercises_ownership.sql` | Promote `training_exercises` to a directly-owned table: add `user_id`, backfill from parent session, add BEFORE-INSERT trigger to auto-fill `user_id` from the parent, NOT NULL (if clean), FK→`auth.users` ON DELETE CASCADE, indexes, and switch RLS from Phase-1 parent-join to **direct `user_id`**. |
| `20260616090100_phase2_01_user_id_constraints_indexes.sql` | For all 43 other owned tables: NULL audit + safe backfill, FK→`auth.users` ON DELETE CASCADE (if missing), NOT NULL (if clean), and indexes (composite + leading-`user_id` guarantee). |

Non-migration helper: `supabase/phase2_verify.sql` (read-only checks; see §9).

Everything is **idempotent** (safe to re-run) and **non-destructive** (never deletes rows, never overwrites a non-NULL `user_id`, never forces NOT NULL while NULLs remain — it `RAISE NOTICE`s instead).

---

## 3. `training_exercises` ownership (task 4) — design

1. `add column if not exists user_id uuid` (nullable first).
2. **Backfill** from the parent: `UPDATE training_exercises te SET user_id = s.user_id FROM training_sessions s WHERE s.id = te.session_id AND te.user_id IS NULL`.
3. **DB safety net** — `set_training_exercise_user_id()` BEFORE INSERT trigger fills `user_id` from the parent session when NULL (`SECURITY DEFINER`). This:
   - guarantees `training_exercises.user_id` always equals the parent's owner (consistency),
   - makes the NOT NULL constraint safe across rolling deploys (old clients that don't send `user_id` still succeed),
   - combined with the RLS insert check (`auth.uid() = user_id`), rejects any cross-user insert (a forged `session_id` resolves to that other user's id, which then fails the WITH CHECK).
4. `SET NOT NULL` only if the backfill leaves zero NULLs (else NOTICE + leave nullable; nullable rows are still invisible to everyone under direct-`user_id` RLS, so no leak).
5. FK `fk_training_exercises_user_id → auth.users(id) ON DELETE CASCADE`.
6. Indexes: `(user_id)`, `(session_id)`, `(user_id, exercise_name)`.
7. **RLS switched to direct `user_id`** (drops the Phase-1 parent-join policies, recreates `_sel/_ins/_upd/_del_own` on `auth.uid() = user_id`). Faster than the EXISTS sub-select and simpler to reason about; parent-consistency is now enforced by the trigger + verified by `phase2_verify.sql` query 5.

> The existing client bulk updates (`Traning.jsx:330/364` rename by `exercise_id`) remain correct: direct-`user_id` RLS scopes them to the caller's own rows.

---

## 4. Backfill logic (task 3) — conservative, non-destructive

A single owner is resolved once: `v_single = the sole auth.users id` **iff** there is exactly one user in the system. Then per table, only when NULLs exist:

| Situation | Action |
|---|---|
| Table has exactly **one** distinct existing `user_id` | Fill NULLs with that owner (the rest of the table proves ownership). |
| Table is **entirely** NULL **and** the system has exactly one user | Fill NULLs with that single system owner. |
| **Multiple** distinct owners + NULLs (ambiguous) | **Do nothing** — `RAISE NOTICE`, and NOT NULL is skipped for that table. |

No row is ever deleted; no non-NULL `user_id` is ever changed. In the current single-user database the expectation is **zero** NULLs anyway (the app has always written `user_id`), so most tables go straight to FK + NOT NULL + indexes with no data change.

---

## 5. Constraints & indexes added (task 2)

For every owned table that exists and has `user_id`:
- **FK** `fk_<table>_user_id → auth.users(id) ON DELETE CASCADE` — added only if no FK on `user_id` already exists (existing FKs are left untouched; see §10 risks).
- **NOT NULL** on `user_id` — only when zero NULLs remain.
- **Indexes** (created `IF NOT EXISTS`):
  - `(user_id, date DESC)` when a `date` column exists; else `(user_id, created_at DESC)` when `created_at` exists.
  - `(user_id, course_id)` when `course_id` exists (study tables).
  - A standalone `(user_id)` index **only if** no existing index already leads with `user_id` (avoids redundant bloat where a composite or unique already covers it).

**Owned tables covered (43):** training_sessions, personal_records, run_personal_records, health_logs, supplement_logs, nutrition_logs, meal_logs, journal_entries, social_interactions, friends, study_sessions, courses, course_exams, learning_goals, study_tasks, study_task_deadlines, tenta_sessions, course_materials, exam_old_files, income_logs, expense_logs, fixed_costs, assets, net_worth_history, projects, project_tasks, erik_tasks, erik_payments, erik_contact_log, pa_shifts, mandatory_sessions, schedule_events, trips, adventures, side_quests, skill_logs, daily_scores, tier_snapshots, jarvis_insights, jarvis_conversations, user_settings, strava_tokens, google_tokens — **plus** training_exercises (file 00).

---

## 6. Code files changed (tasks 5 & 6)

Explicit `user_id: user.id` added to every `training_exercises` insert builder (the trigger is the safety net; these make the writes explicit as requested):

| File | Site | Change |
|---|---|---|
| `src/components/QuickLog.jsx` | `:479` (gym quick-log sets) | added `user_id: user.id` |
| `src/pages/Traning.jsx` | `:585` (`saveEditSession`) | added `user_id: user.id` |
| `src/pages/Traning.jsx` | `:745` (save new session) | added `user_id: user.id` |

`user` is in scope at all three (`useAuth()` at `QuickLog.jsx:413`, `Traning.jsx:96`). Both files transform cleanly in Vite (status 200, `transformedOk: true`).

**Reads (task 6) — no changes needed, verified safe:**
- `ExerciseModal.jsx` already scopes via `training_sessions!inner(... user_id)` + `.eq('training_sessions.user_id', user.id)` (Phase 1, live-verified). Still correct; direct-`user_id` RLS is now an extra guard.
- `Traning.jsx` reads (`:192`, `:329`, `:620` embed `training_exercises(*)`), `Dashboard.jsx:251`, and PR logic select specific fields / embed via `session_id`. Adding a column doesn't break `SELECT`; direct-`user_id` RLS returns the same rows the parent-join did. No join shape changed.

**Writes intentionally NOT changed:** `jarvis-chat` `execute_action` logs `training_sessions` only (never `training_exercises`); `strava-sync` inserts `training_sessions` only. Nothing to update there.

---

## 7. Conflict targets (task 7) — decision

- **User-scoped already (no change):** every `onConflict` in the app and in `strava-sync` (`user_id`, `user_id,date`, `user_id,slug`, `user_id,date,supplement_name`, `user_id,distance_key,strava_activity_id`, `user_id,exercise_name`).
- **Deferred to Phase 3 (documented, not changed):** `google-calendar-sync` upserts `pa_shifts` and `mandatory_sessions` on `google_event_id` (not user-scoped). Making these `(user_id, google_event_id)` requires **dropping/replacing the unique constraint AND editing + redeploying the edge function** in lockstep — doing only the DB half would break the live Google sync. That coordinated change belongs to Phase 3 (Edge Function isolation). Risk today is low: Google event ids are globally unique, so cross-user collision is effectively impossible; this is hardening, not an active leak.

---

## 8. Global / reference tables (task 8) — verified, unchanged

Phase 1 already set the correct model; Phase 2 **does not** touch these and explicitly **excludes** them from NOT NULL/backfill (their global rows intentionally have NULL `user_id`):
- `exercise_library`: global defaults (`user_id IS NULL`) stay readable by all; per-user overrides stay owner-scoped; a user can't edit another user's or global rows (write policy = own, or admin for global).
- `exercise_muscles` / `exercise_aliases`: public read; write only for mappings of an exercise the user owns.
- `muscle_groups`: public read; admin-only write.
- `exercise_library_with_muscles` view: `security_invoker = on`.

`phase2_verify.sql` query 8 confirms global vs override counts post-push.

---

## 9. Verification SQL (task 9)

`supabase/phase2_verify.sql` — every query should return zero rows / zero counts unless a migration NOTICE flagged something:
1. owned tables missing a `user_id` column → none
2. owned tables whose `user_id` is still nullable → none (unless ambiguous-ownership NOTICE)
3. owned tables with no leading-`user_id` index → none
4. owned tables missing a `user_id`→`auth.users` FK → none
5. `training_exercises.user_id` ≠ parent `training_sessions.user_id` → 0
6. any public table with RLS disabled → none
7. token tables policy count → 0 (service-role only)
8. global vs user-override `exercise_library` counts
9. per-table NULL `user_id` counts → all 0

---

## 10. Test / build status (task 10)

- **Vite transform check:** both edited frontend files compile cleanly in the running dev server (status 200, `transformedOk: true`).
- **Scope check:** `user` confirmed in scope at all three insert sites.
- **`npm run build`:** does **not** complete in this environment — it stalls at the production-bundling step with no error emitted, consistent with the documented RAM-hang for this project (full `vite build` is known to exhaust memory here; verification is expected via the dev server, not a prod build). Because the changes are trivial property additions and both files pass the Vite transform, this is the environment limit, not a code problem.
- **Lint/type:** the frontend is JSX (no TS typecheck). ESLint is slow to cold-start in this environment; syntax is validated by the Vite transform above.

---

## 11. Exact commands you need to run

Apply **in this order** (DB before frontend so the `user_id` column exists before the new client writes it; the trigger also covers any ordering):

```bash
# 1) take a snapshot/backup in the Supabase dashboard first (no prior migration history)

# 2) apply Phase 1 + Phase 2 migrations (idempotent; no Docker needed)
supabase db push

# 3) run the verification scripts in the SQL editor
#    supabase/phase1_verify.sql   and   supabase/phase2_verify.sql

# 4) deploy the Jarvis edge-function fix from Phase 1 (if not already done)
supabase functions deploy jarvis-chat

# 5) rebuild & redeploy the frontend (so explicit user_id writes ship)
```

Watch the `db push` output for `PHASE2 WARNING:` lines — they flag any table with ambiguous-ownership NULLs that was intentionally left nullable.

---

## 12. Rollback notes

- Migrations are non-destructive; the riskiest operations are `SET NOT NULL` and the FK adds. To revert a specific table: `alter table public.<t> alter column user_id drop not null;` and `alter table public.<t> drop constraint fk_<t>_user_id;`.
- `training_exercises`: to fully revert, `drop trigger trg_training_exercises_set_user_id on public.training_exercises; drop function public.set_training_exercise_user_id(); alter table public.training_exercises drop column user_id;` then re-apply the Phase-1 parent-join policies (migration `20260615120300`).
- Indexes can be dropped freely (`drop index if exists idx_...`).
- Because the remote had **no migration history**, prefer a **dashboard backup before `db push`** as the real safety net.

---

## 13. What should be Phase 3 next

1. **Edge Function isolation** — change `pa_shifts` / `mandatory_sessions` unique constraint to `(user_id, google_event_id)` **with** the matching `onConflict` edit + redeploy of `google-calendar-sync`.
2. **Authenticate `insights-ai` and `price-fetch`** (still open, stateless proxies — cost/abuse vectors).
3. **Defense-in-depth for Jarvis reads** — optionally run read tools through a per-request JWT client so RLS double-guards the service-role path.
4. Review any existing FKs whose delete action is **not** `ON DELETE CASCADE` (Phase 2 left pre-existing FKs untouched; `phase2_verify.sql` can be extended to list them) so user deletion cleans up fully.

---

## 14. Files changed / added

**Added (migrations + verification):**
- `supabase/migrations/20260616090000_phase2_00_training_exercises_ownership.sql`
- `supabase/migrations/20260616090100_phase2_01_user_id_constraints_indexes.sql`
- `supabase/phase2_verify.sql`

**Modified (code):**
- `src/components/QuickLog.jsx` — explicit `user_id` on training_exercises insert.
- `src/pages/Traning.jsx` — explicit `user_id` on two training_exercises inserts.

No UI, scoring, onboarding, tier, or Jarvis-personalization changes were made.
