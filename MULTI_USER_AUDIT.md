# MaxxIt / SiggeOS — Multi-User Readiness Audit

> **Status:** Analysis only. No code, schema, RLS, or UI was changed in producing this report.
> **Scope:** Full frontend (`src/`) + Supabase Edge Functions (`supabase/functions/`) + inferred database schema.
> **Date:** 2026-06-15
> **Bottom line:** The app is architecturally *close* to multi-user — almost every query already filters by `user_id` and most edge functions authenticate correctly — but it is **not safe to open up** until (1) RLS is verified/enforced on every table, (2) a hard-coded dev auth backdoor is removed, (3) three confirmed cross-user leak vectors are closed, and (4) a large amount of Sigge-specific product logic is made user-configurable.

---

## 0. How this audit was produced & a critical unknown

There is **no `supabase/migrations/` directory and no `.sql` file in the repo**. The database schema is only visible implicitly through the queries in the code. That means:

- Column lists below are **inferred from `select`/`insert` field usage**, not from a verified schema.
- **RLS (Row-Level Security) status cannot be determined from the repo.** This is the single most important thing to verify before any multi-user work.

**⚠️ The #1 question to answer first:** *Is RLS enabled, with correct policies, on every table?*

The entire frontend uses the **anon key** (`src/lib/supabase.js`) and relies on client-side `.eq('user_id', userId)` filters for isolation. **Client-side filters are not security.** If RLS is OFF (or permissive), then today *anyone with the public anon key can read and write every row in every table* — they would just omit the `.eq('user_id')` filter. In single-user mode this is invisible; the moment a second user exists it is a total data breach.

Verify in the Supabase dashboard (Authentication → Policies) or via SQL:
```sql
select relname, relrowsecurity from pg_class
where relkind = 'r' and relnamespace = 'public'::regnamespace order by relname;
```
Treat "RLS on every table with `auth.uid() = user_id` policies" as **Phase 1, Step 1** — everything else is secondary.

---

## 1. Current Auth Architecture

### How login/auth works
- **Client:** `src/lib/supabase.js` creates a single Supabase client with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. No custom auth/session config (uses default localStorage session persistence).
- **Auth provider:** `src/context/AuthContext.jsx`
  - `signIn` → `supabase.auth.signInWithPassword`
  - `signUp` → `supabase.auth.signUp`
  - `signOut` → `supabase.auth.signOut`
  - Session is read via `getSession()` and kept fresh via `onAuthStateChange`.
- **Login UI:** `src/pages/Login.jsx`. OAuth/email callback handled by `src/pages/AuthCallback.jsx`.

### 🚨 Dev auth backdoor (must remove for multi-user)
`src/context/AuthContext.jsx:6-8`:
```js
const DEV_USER = import.meta.env.VITE_DEV_USER
  ? { id: import.meta.env.VITE_DEV_USER, email: 'dev@local', role: 'authenticated' }
  : null
```
If `VITE_DEV_USER` is set at build time, the app **skips authentication entirely** and hard-codes a user id into the client. This bypasses `getSession`/`onAuthStateChange`. **It must be stripped from any production multi-user build** (or guarded behind `import.meta.env.DEV`). Note also that a faked context user does *not* produce a real Supabase JWT — so edge functions and RLS would reject it; dev mode only "works" if RLS is off, which reinforces the Section 0 risk.

### Where user identity is read
Two patterns coexist (should be unified):
1. **`useAuth()` context** → `user.id` — used by most pages/components (Onboarding, Settings, Journal, Traning, Ekonomi, Jobb, Plugg, Halsa, Insights, Upplevelser, Kalender, Export, QuickLog, RunModal, StudyModal, WeeklyReview, AchievementsModal, TodayWidget, AppLayout, Sidebar).
2. **`supabase.auth.getUser()` directly** → `Dashboard.jsx:220`. This will return `null` in `VITE_DEV_USER` mode (inconsistency, but not a multi-user blocker).

### Where protected routes exist
`src/App.jsx:24-35` — `ProtectedRoute` wraps `AppLayout` and all 13 app routes. Public routes: `/login`, `/auth/callback`, `/strava-callback`. Redirects to `/login` when `!user`. **This is client-side gating only** — real protection must come from RLS + authenticated edge functions.

### Where onboarding/settings depend on user_id
- **Onboarding gate:** `src/components/AppLayout.jsx:26-28` reads `user_settings.onboarding_done` for `user.id`; shows `<Onboarding>` if missing/false. ✅ Already per-user.
- **Onboarding write:** `src/components/Onboarding.jsx:78-92` upserts `user_settings` keyed on `user_id`.
- **Settings:** `src/pages/Settings.jsx:172/187` reads/writes `user_settings` with `.eq('user_id', user.id)` / `onConflict: 'user_id'`. ✅ Properly scoped.

---

## 2. Database Multi-User Audit

~48 tables/views are referenced. Classification key:
- **PERSONAL** — one owner per row; needs `user_id`, NOT NULL, FK → `auth.users`, index, and owner-only RLS.
- **CHILD** — owned indirectly via a parent FK; may legitimately lack `user_id`.
- **GLOBAL** — shared reference/template data; no `user_id`; read-all, admin-write.
- **SECRET** — OAuth tokens; PERSONAL + extra-sensitive (never expose to other clients).

### 2A. Personal data tables (need user_id + owner-only RLS)

| Table | Has `user_id`? (inferred) | Module | Notes |
|---|---|---|---|
| `training_sessions` | ✅ | Träning | Core; written by client + strava-sync + jarvis. |
| `personal_records` | ✅ | Träning | Strength PRs. |
| `run_personal_records` | ✅ | Träning | Run PRs (strava best-efforts). |
| `health_logs` | ✅ | Hälsa | Weight/sleep/mood/etc + `retatrutide_dose_mg`. |
| `supplement_logs` | ✅ | Hälsa | Adherence. |
| `nutrition_logs` | ✅ | Hälsa | |
| `meal_logs` | ✅ | Hälsa | AI meal analysis. |
| `journal_entries` | ✅ | Journal | Free text + AI-extracted people/keywords. |
| `social_interactions` | ✅ | Journal/Social | |
| `friends` | ✅ | Jarvis memory | Personal relationship notes. |
| `study_sessions` | ✅ | Plugg | |
| `courses` | ✅ | Plugg | |
| `course_exams` | ✅ | Plugg | |
| `learning_goals` | ✅ | Plugg | mastery %. |
| `study_tasks` | ✅ | Plugg | |
| `study_task_deadlines` | ✅ | Plugg | |
| `tenta_sessions` | ✅ | Plugg | AI exam practice. |
| `course_materials` | ✅ (see leak 4B) | Plugg | Uploaded content; **read by id w/o user check in jarvis-chat**. |
| `exam_old_files` | ✅ (see leak 4B) | Plugg | Uploaded exams; **read by id w/o user check in jarvis-chat**. |
| `income_logs` | ✅ | Ekonomi | |
| `expense_logs` | ✅ | Ekonomi | |
| `fixed_costs` | ✅ | Ekonomi | |
| `assets` | ✅ | Ekonomi | Priced via price-fetch. |
| `net_worth_history` | ✅ | Ekonomi | Precomputed daily totals. |
| `projects` | ✅ | Jobb | |
| `project_tasks` | ✅ | Jobb | |
| `erik_tasks` | ✅ | Jobb (Erik) | **Sigge-specific module** (see §6). |
| `erik_payments` | ✅ | Jobb (Erik) | **Sigge-specific.** |
| `erik_contact_log` | ✅ | Jobb (Erik) | **Sigge-specific.** |
| `pa_shifts` | ✅ | Jobb/Kalender | PA night-shift work; synced from Google. |
| `mandatory_sessions` | ✅ | Plugg/Kalender | KI "obligatorisk" sessions. |
| `schedule_events` | ✅ | Kalender | Generic events. |
| `trips` | ✅ | Upplevelser | |
| `adventures` | ✅ | Upplevelser | |
| `side_quests` | ✅ | Upplevelser | AI-generated. |
| `skill_logs` | ✅ | Dashboard (Färdigheter) | minutes/skill. |
| `daily_scores` | ✅ | Dashboard | Maxx Score components. |
| `tier_snapshots` | ✅ | Dashboard | Per-category tiers per day. |
| `jarvis_insights` | ✅ | Jarvis memory | AI-stored facts about the user. |
| `jarvis_conversations` | ✅ | Jarvis | Chat history. |
| `user_settings` | ✅ (one row/user) | All | Profile, goals, Jarvis config, onboarding flag. |

**Required for all of the above:** `user_id uuid not null references auth.users(id) on delete cascade`, an index on `user_id`, `alter table … enable row level security`, and four policies (select/insert/update/delete) each asserting `auth.uid() = user_id` (insert/update use `with check`).

### 2B. Secret/token tables (PERSONAL + extra-sensitive)

| Table | Notes |
|---|---|
| `strava_tokens` | `user_id`, `onConflict: 'user_id'`. Only touched by `strava-sync` (service role). |
| `google_tokens` | `user_id`, `onConflict: 'user_id'`. Only touched by `google-calendar-sync` (service role). |

These contain OAuth access/refresh tokens. **They must never be selectable by the anon client.** Owner-only RLS (or, better, *no* anon policy at all — only the service-role edge functions read them). Currently no client code queries them — keep it that way.

### 2C. Child table (owned via parent)

| Table | Parent | Current scoping |
|---|---|---|
| `training_exercises` | `training_sessions` (via `session_id`) | Has **no `user_id`** (inferred). Jarvis scopes it through user-owned session ids; client mostly scopes via `session_id`. **But see leak 4A.** |

**Decision required:** either (a) add a denormalized `user_id` to `training_exercises` (simplest RLS + fixes the leak directly), or (b) write RLS as `exists (select 1 from training_sessions s where s.id = session_id and s.user_id = auth.uid())`. Option (a) is recommended for performance and clarity.

### 2D. Global / shared reference tables (no user_id; read-all, admin-write)

| Table | Role |
|---|---|
| `exercise_library` | Master exercise catalog. Queried in `Traning.jsx`; **also updated by the client** (`Traning.jsx:353`). |
| `exercise_library_with_muscles` | View over the library. |
| `muscle_groups` | Reference (`is_active`, `sort_order`). |
| `exercise_muscles` | Junction: exercise ↔ muscle. Client insert/delete (`Traning.jsx:368-373`). |
| `exercise_aliases` | Junction: exercise ↔ alias/slug. Client insert/delete (`Traning.jsx:375-379`). |

**🚨 Cross-user write problem:** Today any logged-in user can edit/extend the *global* exercise library and its muscle/alias mappings from the client. In multi-user this means one user's edits change everyone's library. Two valid models:
1. **Global + admin-only writes** (library curated centrally; users only read). Simplest.
2. **User-extensible**: keep global rows read-only, add a nullable `user_id` so users can create *their own* exercises (RLS: read where `user_id is null or user_id = auth.uid()`; write only own rows). Best UX, more work.

### 2E. Migrations needed (summary)
1. Add/verify `user_id` (NOT NULL + FK + index) on every PERSONAL/SECRET table in 2A/2B.
2. Decide & implement `training_exercises` ownership (2C).
3. Enable RLS + owner-only policies on every PERSONAL/SECRET table.
4. Add read-all/admin-write (or user-extensible) RLS on GLOBAL tables (2D).
5. New tables: `profiles`, plus the module/tracker tables in §7–§8.
6. Constrain upsert conflict targets that are not user-scoped (e.g. `pa_shifts`/`mandatory_sessions` use `onConflict: 'google_event_id'` — fine if that id is globally unique, but consider `(user_id, google_event_id)`).

### 2F. Existing-data backfill for the current user (Sigge)
- Sigge's rows already carry his `user_id` (the app has always set it), so the main backfill is **safety + separation**, not repair:
  - **Find NULLs:** `select count(*) from <table> where user_id is null;` for each PERSONAL table — any NULLs must be assigned to Sigge's id before adding the NOT NULL constraint.
  - **Create `profiles` row** for Sigge (and mark him `is_admin = true` / `role = 'owner'`).
  - **Exercise library separation:** if going user-extensible (2D option 2), decide which `exercise_library` rows are "global" (`user_id = null`) vs Sigge's custom additions. Currently they're indistinguishable — likely treat all existing rows as global.
  - **`training_exercises` backfill** (if adding `user_id`): `update training_exercises te set user_id = s.user_id from training_sessions s where s.id = te.session_id;`

---

## 3. Frontend Query Audit

Every page/component, the tables it touches, and isolation status. ✅ = filters/writes by `user_id` (verified by reading the queries); ⚠️ = relies on RLS only or has a gap.

| File | Tables | Read scoping | Write scoping | Risk |
|---|---|---|---|---|
| `pages/Dashboard.jsx` | training_sessions, run_personal_records, personal_records, health_logs, learning_goals (+courses join), pa_shifts, skill_logs, supplement_logs, assets, net_worth_history, tier_snapshots, training_exercises, income_logs, user_settings, daily_scores | ✅ `.eq('user_id', userId)` throughout (userId from `auth.getUser()`) | ✅ `tier_snapshots` upsert `onConflict:'user_id,date'` | Low. Uses `auth.getUser()` not context (breaks in DEV_USER mode only). |
| `pages/Traning.jsx` | training_sessions, training_exercises, personal_records, run_personal_records, daily_scores, exercise_library*, muscle_groups, exercise_muscles, exercise_aliases, user_settings | ✅ personal; ⚠️ library tables global | ⚠️ **edits GLOBAL library** (`353/368/373/375/379`); `training_exercises` rename by `exercise_id` (`364`) not user-scoped | **Med** — global-library writes (see 2D); cross-user exercise rename. |
| `components/ExerciseModal.jsx` | training_exercises | 🚨 **`.eq('exercise_name', …)` only — no user/session filter** (`44-46`) | — | **HIGH leak (4A).** |
| `pages/Halsa.jsx` | health_logs, supplement_logs, nutrition_logs, user_settings | ✅ | ✅ | Low. |
| `pages/Journal.jsx` | journal_entries, social_interactions, health_logs, daily_scores, skill_logs | ✅ | ✅ inserts set `user_id` | Low (calls insights via jarvis-chat). |
| `pages/Ekonomi.jsx` | income_logs, expense_logs, fixed_costs, assets, net_worth_history, trips, user_settings | ✅ | ✅ | Low. Hardcoded INCOME_SOURCES (see §6). |
| `pages/Plugg.jsx` | courses, course_exams, learning_goals, study_sessions, study_tasks, study_task_deadlines, mandatory_sessions, exam_old_files, course_materials | ✅ (materials/exams via `.in('course_id', allIds)` where ids are user's) | ✅ deletes by `id` only → rely on RLS | Med (delete-by-id needs RLS). |
| `components/StudyModal.jsx` | course_materials, exam_old_files, study_sessions, tenta_sessions, learning_goals | ✅ `.eq('user_id', user.id)` on reads | ✅ | Low. Hardcoded "Sigge" in AI prompt (see §5/§6). |
| `pages/Jobb.jsx` | projects, project_tasks, erik_tasks, erik_payments, erik_contact_log, pa_shifts, income_logs | ✅ | ✅ | Low isolation; **entire module Sigge-specific** (§6). Seeds "Erik Norling" project. |
| `pages/Upplevelser.jsx` | trips, adventures, side_quests | ✅ | ✅ | Low. Hardcoded Sigge bio in quest prompt (§5/§6). |
| `pages/Kalender.jsx` | schedule_events, mandatory_sessions, pa_shifts, erik_tasks, trips, study_task_deadlines, course_exams, training_sessions, health_logs | ✅ | — | Low. Hardcoded `erik` event category. |
| `pages/Insights.jsx` | training_sessions, health_logs, study_sessions, courses, course_exams, income_logs, expense_logs, personal_records, pa_shifts, journal_entries | ✅ | — | Low (calls insights-ai — see 4). |
| `pages/Jarvis.jsx` | jarvis_conversations, jarvis_insights, projects, trips, course_exams, daily_scores | ✅ | ✅ | Low; sends auth token to edge fn (`228-231`). |
| `pages/Export.jsx` | generic loop over many tables | ✅ `.eq('user_id', user.id)` (`107`) | — (read/export only) | Low — but table list must exclude/handle no-`user_id` tables (training_exercises, library). |
| `components/QuickLog.jsx` | training_sessions, training_exercises, health_logs, personal_records, journal_entries, expense_logs, income_logs | ✅ | ✅ (sets `user_id`) | Low. Hardcoded INCOME_SOURCES. |
| `components/RunModal.jsx` | training_sessions (+PRs) | ✅ | ✅ | Low. |
| `components/WeeklyReview.jsx` | training_sessions, health_logs, study_sessions, daily_scores | ✅ | — | Low. |
| `components/AchievementsModal.jsx` | training_sessions, personal_records, run_personal_records, study_sessions, health_logs | ✅ | — | Low. |
| `components/dashboard/TodayWidget.jsx` | training_sessions, mandatory_sessions, erik_tasks, pa_shifts, course_exams | ✅ | — | Low. |
| `components/AppLayout.jsx` | user_settings | ✅ | — | Low. Onboarding gate. |
| `components/dashboard/DashboardConstellation.jsx` | none (props only; `.from` matches were `Array.from`) | n/a | n/a | None. |

**Cross-user leakage risks (frontend):**
- **4A — `ExerciseModal.jsx`** queries `training_exercises` by `exercise_name` with no owner constraint → without correct RLS it returns *every user's* sets for that lift. **Must add session/user scoping AND rely on RLS.**
- **`Traning.jsx` global-library writes** → cross-user contamination of shared data (see 2D).
- **`Traning.jsx:364`** renames `training_exercises` by `exercise_id` with no user scope.
- All "delete/update by `id` only" paths (Plugg, others) are safe **only if RLS is correct** — they have no client-side owner guard.

---

## 4. Edge Function Audit

| Function | Auth | Data client | User isolation | Verdict |
|---|---|---|---|---|
| `jarvis-chat` | `anonClient.auth.getUser()` from `Authorization` header; tools return "Ingen användare inloggad" if null | **service role** for all reads/writes, scoped by `user.id` | Mostly ✅ — every tool query uses `.eq('user_id', userId)` and every write sets `user_id` | ⚠️ One leak (4B) |
| `strava-sync` | `anonClient.auth.getUser()`; **401 if no user** | service role, scoped by `user.id` | ✅ All token/session queries `.eq('user_id', user.id)` | ✅ Good |
| `google-calendar-sync` | `supabase.auth.getUser(token)`; throws Unauthorized if none | service role, scoped by `user.id` | ✅ scoped; ⚠️ upserts on `google_event_id` (not user-scoped conflict target) | ✅ Good (minor) |
| `insights-ai` | **NONE** | none (pure Anthropic proxy of `lines` from body) | No DB; client sends its own already-fetched data | ⚠️ Unauthenticated AI proxy (cost/abuse), no cross-user leak |
| `price-fetch` | **NONE** | none (Yahoo/Coingecko proxy of `assets` from body) | Stateless; client sends its own tickers | ⚠️ Unauthenticated proxy, no cross-user leak |

### 🚨 4B — `jarvis-chat` content fetch is not user-scoped
`supabase/functions/jarvis-chat/index.ts:892-899` uses the **service-role** client to fetch attachment content by raw id, with **no `user_id` check**:
```ts
const { data: mats } = await supabase.from('course_materials').select('file_name,content').in('id', materialIds)
…
const { data: ef } = await supabase.from('exam_old_files').select('file_name,content').eq('id', examFileId).single()
```
A malicious client can pass *any* `materialIds` / `examFileId` and exfiltrate another user's uploaded materials/old exams. RLS does **not** protect this (service role bypasses RLS). **Fix:** add `.eq('user_id', user.id)` to both queries (and reject if `user` is null).

### Other edge-function notes
- **Service role + manual scoping is the core pattern.** It works, but every query's `.eq('user_id', userId)` is now load-bearing for security. A single missed filter (like 4B) is a breach. Consider a thin helper that always injects the user filter, and/or move read tools to a per-request RLS client (anon client with the user's JWT) so the DB enforces isolation as defense-in-depth.
- **`insights-ai` / `price-fetch` need auth** before public launch — at minimum verify a valid Supabase JWT to prevent anonymous use of your Anthropic/Yahoo quota. They don't leak data, but they're open cost vectors.
- **Hard-coded business logic in `google-calendar-sync`** (see §6): `isPaShift()` matches `'assistanstid'`/`'hos hw'`; mandatory-session detection matches `'obligatorisk'`. These are Sigge/KI-specific and must become user-configurable for other users to get any value from calendar sync.
- **CORS `Access-Control-Allow-Origin: '*'`** on all functions — acceptable with JWT auth, but tighten to known origins when possible.

---

## 5. Jarvis / AI Context Audit

Jarvis's brain is `supabase/functions/jarvis-chat/index.ts` (1090 lines). It is an agentic loop (max 8 iterations, streaming + non-streaming) with 12 read tools + 1 `execute_action` write tool.

### Where Jarvis gathers user data
- **System prompt context** (`buildSystemPrompt`, `825-867`): pulls `user_settings` (about_me, goals, jarvis_style, jarvis_lang, jarvis_personality), latest 20 `jarvis_insights`, latest 15 `friends` — all scoped to `user.id` (`886-889`). ✅
- **Tools** (`213-820`) cover every domain: workouts, health, journal, economy, study, calendar, experiences, scores, tasks, memory/goals, chat history, nutrition. All scoped by `userId`. ✅ (except the 4B attachment leak.)
- **Memory writes** via `execute_action`: `save_insight`, `update_insight`, `delete_insight`, `save_preference`, `update_memory_context`, `update_friend` — all set/scope `user_id`. ✅

### 🚨 Hardcoded "Sigge" assumptions in prompts (must become user-specific)
- System prompt opens: **"Du är Jarvis – Sigges AI-coach/assistent i SiggeOS"** (`846`). Hardcodes the user's name and product name. → Use `display_name` / `about_me`.
- `fetch_chat_history` labels the user **"Sigge"** in transcript rendering (`584`). → Use display name.
- Tool descriptions are studded with Sigge-specific vocabulary: **"retatrutide-dos"** (a specific GLP-1 medication, `37`), **"PA-pass"**, **"Erik-uppdrag"** (`127`), **"KI"** (Karolinska Institutet, `78/91`). These bias the model toward one user's life. → Generalize tool descriptions; surface user-specific terms via profile/module metadata instead.
- The "save memory silently" guidance refers to **"faktum om Sigge"** (`859`). → "facts about the user".
- Other prompt sites in the client: `Journal.jsx:264` ("Analysera denna journal-entry från **Sigge**"), `StudyModal.jsx:177-196` ("Om **Sigge** svarar fel…"), `Upplevelser.jsx:846` (full Sigge biography hardcoded into the side-quest generator — age 21, medicine student in Stockholm/Täby, night-shift PA, music taste, "100k/mån, bo i Göteborg", etc.).

### What user profile/settings/memory structure is needed for personalized coaching
Today `user_settings` already holds the right *shape* (about_me, goals JSON, jarvis_style/lang/personality, attachments). For real multi-user personalization, add:
- **Identity:** `display_name`, locale, currency, timezone (for date math — Jarvis uses server `new Date()`), units.
- **Enabled modules** (so Jarvis only offers tools for areas the user tracks — see §7/§8). A user with no "Jobb" module shouldn't see "Erik-uppdrag".
- **Per-user vocabulary/goals** that replace the hardcoded biography (medication names, work context, study institution) — ideally derived from `about_me` + structured profile fields, not literals in code.
- `jarvis_insights` + `friends` already provide per-user long-term memory. Keep, but ensure RLS.

---

## 6. Hardcoded Sigge-Specific Product Assumptions

| Area | Hardcoded thing | Location | Generalization |
|---|---|---|---|
| **Whole module** | "Erik" job module (tables `erik_tasks`, `erik_payments`, `erik_contact_log`) + auto-seeded "Erik Norling" project | `pages/Jobb.jsx` (`555/583`), jarvis tools/actions | Should be a *user-created* client/project, not a first-class module. Prime candidate for the custom-module system (§8). |
| **Income sources** | `['PA-jobb','Erik Norling','CSN','Skatteåterbäring','Övrigt']`; "Erik = kontant, räknas ej" CSN logic | `Ekonomi.jsx:24/1001/1012`, `QuickLog.jsx:10`, `Dashboard.jsx:578` | User-configurable income-source list; CSN logic is Sweden-student-specific. |
| **CSN fribelopp** | Default `114500` kr student-income cap | `Onboarding.jsx:87`, `Settings.jsx:501` | Sweden-only. Make optional/region-aware. |
| **Currency** | Hardcoded `kr` / `sv-SE` / SEK everywhere; price-fetch converts to SEK | `jarvis-chat`, `Ekonomi.jsx`, `price-fetch` | Add currency to profile. |
| **Calendar sync rules** | PA shift = title contains `assistanstid`/`hos hw`; mandatory = `obligatorisk` | `google-calendar-sync.ts:56-59/239-244` | User-defined sync rules/keywords. |
| **Maxx Score categories** | Fixed set: Kondition, Styrka, Sömn, Plugg, Ekonomi, Välmående, Färdigheter, Kropp | `Dashboard.jsx`, `tierUtils.js` | Make categories module-driven & user-selectable (§7/§8). |
| **Tier thresholds** | Population norms for VO2max, run times, lifts (×bodyweight), sleep, **income 12k–60k kr**, **savings 5k–500k kr**, steps, energy/mood/stress | `tierUtils.js:39-69` | Income/savings thresholds assume a Swedish student. Make thresholds configurable per user or per region/age cohort. |
| **Rank model** | "Maxx Score = lowest category tier" (weakest-link); excludes kropp/fardigheter | `Dashboard.jsx:69-140` | Reasonable default, but should be a configurable scoring policy. |
| **Study assumptions** | KI / medicine framing; mastery tiers; exam practice | `StudyModal.jsx`, `Plugg.jsx`, jarvis tool text | Generalize study vocabulary. |
| **Health assumptions** | `retatrutide_dose_mg` first-class column; nicotine/alcohol/caffeine | `health_logs`, jarvis `fetch_health` | Medication tracking should be a custom tracker, not a hardcoded column. |
| **Side-quest bio** | Full Sigge biography in the generation prompt | `Upplevelser.jsx:846` | Build from profile/about_me. |
| **Copy/branding** | "Sigges AI-coach", "SiggeOS", "t.ex. Sigge Gustafsson" placeholders | `jarvis-chat`, Onboarding/Settings | Use display name + product name var (already rebranding to "MaxxIt"). |
| **localStorage keys** | `sigge-bg`, `sigge-blur`, `sigge-dim` | `useBackground.js`, `ThemeContext.jsx` | Cosmetic; namespace per app, not per user. Low priority. |
| **Integrations** | Strava, Google Calendar, Yahoo/Coingecko prices | edge functions | Already per-user via token tables; fine. |

---

## 7. Multi-User Architecture Proposal

### 7.1 `profiles` (new) — public-ish identity, 1:1 with `auth.users`
```
profiles(
  id uuid pk references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text default 'sv',
  timezone text default 'Europe/Stockholm',
  currency text default 'SEK',
  unit_system text default 'metric',
  is_admin boolean default false,      -- dev/owner account model
  created_at timestamptz default now()
)
```
- Auto-created via a trigger on `auth.users` insert (`handle_new_user`).
- RLS: user can read/update own row; admins can read all (for support).
- Sigge = the first profile with `is_admin = true`.

### 7.2 `user_settings` (extend existing) — private preferences, 1:1
Keep current columns (`about_me`, `goals` JSONB, `jarvis_style`, `jarvis_lang`, `jarvis_personality`, `onboarding_done`, `display_name`). Add:
- `enabled_modules text[]` (or drive via `user_modules`, 7.3) — which life areas are active.
- `scoring_policy jsonb` — which categories count toward Maxx Score + weighting + custom thresholds.
- `income_sources text[]`, `currency`, region flags (CSN on/off), `salary_day` (already in goals).
- RLS: owner-only.

### 7.3 Module visibility / preferences — `user_modules`
```
user_modules(
  user_id uuid references auth.users(id),
  module_key text,          -- 'traning','halsa','plugg','ekonomi','jobb','upplevelser', or a custom-module id
  enabled boolean default true,
  sort_order int,
  config jsonb,             -- per-module settings (e.g. tracked metrics, thresholds)
  primary key (user_id, module_key)
)
```
Drives: which nav items/pages render, which dashboard categories appear, which Jarvis tools are advertised.

### 7.4 Custom modules / metrics / logs / goals
See §8 — a generic tracker system so users add life areas without new code.

### 7.5 Global templates vs user-created data
- **Global templates** (read-all, admin-write): `exercise_library` family, a future `module_templates` (starter module definitions), default tier-threshold sets.
- **User-created data:** everything in §2A/§2B + custom modules/trackers in §8.
- Clear rule: a row is global iff `user_id is null` (with RLS `using (user_id is null or user_id = auth.uid())`), otherwise owner-only.

### 7.6 Admin / dev account model
- `profiles.is_admin` flag + a Postgres helper `is_admin()` (`select coalesce((select is_admin from profiles where id = auth.uid()), false)`).
- Admin-only RLS policies for: writing GLOBAL tables (exercise library, templates), reading any profile (support), managing module templates.
- Keep `VITE_DEV_USER` **only** behind `import.meta.env.DEV` and never in production builds.

---

## 8. Custom Module System Proposal

Goal: a user can add a new life area (e.g. "Meditation", "Sobriety", "Side business revenue", or Sigge's "Erik" client) — with its own metrics, logs, goals, dashboard card, and Jarvis awareness — **without any new code**.

### 8.1 Tables
```
custom_modules(
  id uuid pk default gen_random_uuid(),
  user_id uuid references auth.users(id),   -- null = global template
  key text,                 -- slug, unique per user
  name text,                -- "Meditation"
  icon text, color text,
  description text,         -- fed to Jarvis as module context
  enabled boolean default true,
  sort_order int,
  created_at timestamptz default now()
)

custom_metrics(                     -- the schema of a module's trackable fields
  id uuid pk default gen_random_uuid(),
  module_id uuid references custom_modules(id) on delete cascade,
  user_id uuid references auth.users(id),
  key text,                 -- 'minutes','mood','reps'
  label text,               -- "Minuter"
  type text,                -- 'number'|'duration'|'scale_1_10'|'text'|'bool'|'enum'
  unit text,                -- 'min','kr','kg'
  options jsonb,            -- for enum
  higher_is_better boolean,
  thresholds numeric[],     -- optional tier thresholds (drives Maxx Score)
  sort_order int
)

custom_logs(                        -- the actual logged entries (EAV-lite via JSONB)
  id uuid pk default gen_random_uuid(),
  module_id uuid references custom_modules(id) on delete cascade,
  user_id uuid references auth.users(id),
  date date not null,
  values jsonb not null,    -- { "minutes": 20, "mood": 8 }
  notes text,
  created_at timestamptz default now()
)

custom_goals(
  id uuid pk default gen_random_uuid(),
  module_id uuid references custom_modules(id),
  user_id uuid references auth.users(id),
  metric_key text,
  target numeric,
  direction text,           -- 'at_least'|'at_most'
  period text,              -- 'day'|'week'|'month'|'once'
  deadline date
)
```
All four tables: RLS owner-only (`user_id = auth.uid()`), plus read-only access to `custom_modules`/`custom_metrics` rows where `user_id is null` (global starter templates).

### 8.2 Example — Sigge's "Erik" job, as a custom module
- `custom_modules`: `{ key:'erik', name:'Erik (fastigheter)', icon:'briefcase' }`
- `custom_metrics`: `tasks` (text), `payment` (number, unit kr), `contact` (text).
- This replaces the bespoke `erik_tasks`/`erik_payments`/`erik_contact_log` tables — proving the system can absorb today's hardcoded module.

### 8.3 Example — "Meditation"
- metrics: `minutes` (duration, higher_is_better, thresholds `[5,10,15,20,30,45,60]`), `clarity` (scale_1_10).
- Logging "20 min, clarity 8" writes one `custom_logs` row; the dashboard derives a tier from `minutes` thresholds exactly like built-in categories.

### 8.4 How custom modules surface
- **Dashboard:** each enabled module with threshold'd metrics becomes a category card; Maxx Score scoring policy can include/exclude it.
- **Settings:** a "Modules" manager — toggle built-ins, create/edit custom modules & metrics, reorder, set thresholds/goals.
- **Quick log:** dynamic form generated from `custom_metrics` of enabled modules.
- **Jarvis:** add **one generic tool** `fetch_custom_module(module_key, date_from, date_to)` and `log_custom(module_key, values)`; inject enabled modules' `name`/`description`/`metrics` into the system prompt so Jarvis knows they exist. This removes the need to hardcode a new tool per domain.

> **Migration insight:** the built-in modules (Träning, Hälsa, etc.) can stay as dedicated tables for performance and rich UI, while *new* user areas use the generic system. Long term, built-ins can be expressed as "system module templates" so everything is uniform.

---

## 9. Migration Roadmap (phased)

Each phase is shippable and reversible. **Do nothing until Phase 1, Step 1 (verify RLS) is done.**

### Phase 1 — Auth & RLS hardening *(highest priority, security-critical)*
1. **Verify RLS status** on every table (Section 0 query).
2. Enable RLS + add owner-only policies (select/insert/update/delete with `auth.uid() = user_id`) on all §2A/§2B tables.
3. Lock down `strava_tokens`/`google_tokens` (no anon policy).
4. GLOBAL tables: read-all + admin-write policies (§2D).
5. Remove/guard `VITE_DEV_USER` backdoor (§1).
6. Add `profiles` + `handle_new_user` trigger + `is_admin()` helper.
7. Smoke-test with a **second** throwaway account: confirm it sees zero of Sigge's data.

### Phase 2 — `user_id` audit & backfill
1. For each PERSONAL table: `where user_id is null` count; assign stragglers to Sigge; add `NOT NULL` + FK + index.
2. Resolve `training_exercises` ownership (add `user_id` + backfill from parent — §2C/§2F).
3. Add `with check (auth.uid() = user_id)` to all insert/update policies so clients can't write rows for other users.

### Phase 3 — Edge Functions & Jarvis isolation
1. **Fix 4B:** add `.eq('user_id', user.id)` to `course_materials`/`exam_old_files` fetches in jarvis-chat.
2. Add JWT auth to `insights-ai` and `price-fetch`.
3. (Optional, defense-in-depth) Switch jarvis read tools to a per-request anon client carrying the user JWT, so RLS double-guards every read.
4. Make `google-calendar-sync` keyword rules user-configurable; scope upsert conflicts to `(user_id, …)`.

### Phase 4 — Onboarding / profile personalization
1. De-Sigge all prompts (§5): name/product/biography from profile, not literals.
2. Extend onboarding to capture currency/locale/units and "which modules do you want?".
3. Replace hardcoded income sources / CSN with profile config.

### Phase 5 — Module visibility
1. Add `user_modules` (§7.3); render nav/pages/dashboard/Jarvis tools from it.
2. Settings "Modules" toggle UI.
3. Make Maxx Score `scoring_policy` configurable (which categories count).

### Phase 6 — Custom trackers / modules
1. Add `custom_modules/metrics/logs/goals` (§8) + RLS.
2. Dynamic quick-log form + dashboard cards + generic Jarvis tools.
3. Migrate the "Erik" module to a custom module as the reference implementation.

### Phase 7 — Personalized Maxx Score
1. Per-user/per-cohort tier thresholds (replace `tierUtils.js` constants with configurable sets; ship sensible defaults).
2. Region/age-aware defaults for income/savings/steps.
3. Custom-module metrics feed the score via their `thresholds`.

---

## 10. Risk Assessment (most dangerous parts)

1. **RLS unknown / possibly off (CRITICAL).** With only the anon key + client-side filters, if RLS is not correctly enforced, the entire database is world-readable/writable the instant a second user exists. This dwarfs every other risk. *Mitigation:* Phase 1 first; test with a second account before launch.
2. **`VITE_DEV_USER` backdoor in a production build.** Would pin every visitor to one identity / disable auth. *Mitigation:* strip from prod (Phase 1.5).
3. **Service-role edge functions with manual scoping.** `jarvis-chat`/`strava-sync`/`google-calendar-sync` bypass RLS by design; security depends entirely on never missing a `.eq('user_id')`. The 4B attachment leak is a live example. *Mitigation:* fix 4B; add a scoping helper; consider per-request JWT clients.
4. **`ExerciseModal` + global-library writes (data leakage / contamination).** Unscoped `training_exercises` read; client writes to the shared `exercise_library`. *Mitigation:* Phase 1 RLS + Phase 2 scoping + 2D decision.
5. **Breaking existing Sigge data during backfill.** Adding `NOT NULL`/FK before clearing NULLs, or wrong `training_exercises` backfill, could drop or orphan rows. *Mitigation:* count NULLs first; backfill in a transaction; snapshot/backup before constraints.
6. **Dashboard score corruption.** `daily_scores`/`tier_snapshots` are computed client-side with hardcoded thresholds; introducing per-user thresholds or module changes can retroactively shift historical scores and break charts. *Mitigation:* version the scoring policy; don't rewrite historical snapshots.
7. **Duplicated/!merged settings.** `display_name` lives in both `profiles` (proposed) and `user_settings` today; goals JSON overlaps with structured fields. *Mitigation:* pick one source of truth per field; migrate, don't duplicate.
8. **Broken integrations.** Token-conflict targets (`onConflict:'user_id'` good; `onConflict:'google_event_id'` not user-scoped) and the hardcoded calendar keyword rules will silently no-op or mis-attribute for other users. *Mitigation:* Phase 3.
9. **RLS policy mistakes.** Over-permissive (`using (true)`), missing `with check` (lets users write rows as others), or forgetting policies on a new table = silent breach. *Mitigation:* policy template applied uniformly; a test that every `public` table has `relrowsecurity = true`.
10. **Unauthenticated AI/price proxies.** `insights-ai`/`price-fetch` can be called by anyone to burn your Anthropic/Yahoo budget. *Mitigation:* Phase 3 JWT auth.

---

## Appendix — Files that will need changes later (by phase)

- **Phase 1:** `src/context/AuthContext.jsx` (remove DEV_USER); new SQL migrations (RLS, profiles).
- **Phase 2:** SQL migrations only (constraints/backfill); `src/components/ExerciseModal.jsx` (scope query); `src/pages/Traning.jsx` (library write model, `:364` rename).
- **Phase 3:** `supabase/functions/jarvis-chat/index.ts` (4B fix `:892-899`), `insights-ai/index.ts`, `price-fetch/index.ts`, `google-calendar-sync/index.ts`.
- **Phase 4:** `supabase/functions/jarvis-chat/index.ts` (de-Sigge prompt `:584/846/859` + tool descriptions), `src/pages/Journal.jsx:264`, `src/components/StudyModal.jsx:177-196`, `src/pages/Upplevelser.jsx:846`, `src/components/Onboarding.jsx`, `src/pages/Settings.jsx`.
- **Phase 5:** `src/App.jsx`, `src/components/Sidebar.jsx`, `src/components/BottomNav.jsx`, `src/pages/Dashboard.jsx`, `src/pages/Settings.jsx`.
- **Phase 6:** new tables + `src/components/QuickLog.jsx`, dashboard components, `jarvis-chat` (generic tools).
- **Phase 7:** `src/components/dashboard/tierUtils.js`, `src/pages/Dashboard.jsx`.
