# Phase 5 Report — Profile Engine & Personalization Foundation

> **Scope:** Phase 5 only — user profiles + a read-only personalization foundation. **No** custom modules, dynamic tiers, Maxx Score changes, AI-coaching/Jarvis changes, social, or marketplace work. This is the first product-track phase; the infra track (Phases 1–4B) remains the deploy gate.
> **State:** Migration written but **unapplied**; frontend changes in repo, **not deployed**. The Profile page degrades gracefully until the migration is applied.

---

## 1. Profile schema changes

`profiles` (created in Phase 1) is extended with nullable columns (existing rows + the `handle_new_user` trigger keep working; RLS unchanged — Phase 1 owner/admin policies cover new columns). Migration `20260618090000_phase5_00_profile_engine.sql`.

| Group | Columns added | Notes |
|---|---|---|
| Identity | `first_name`, `last_name`, `birth_date`, `sex`, `country`, `city` | `display_name`, `avatar_url`, `locale` (=language), `timezone` already existed (Phase 1). **Age** is derived from `birth_date` in code (not stored — avoids staleness). `sex` has a CHECK (`male/female/other/prefer_not_to_say`). |
| Body | `height_cm`, `weight_kg`, `target_weight_kg` | `weight_kg` is an optional profile baseline; **`health_logs` remains the time-series source of truth** for actual weight. Nothing feeds tiers yet. |
| Life context | `life_stage`, `occupation`, `study_program`, `study_institution` | `life_stage` CHECK (`student/early_career/professional/entrepreneur/parent/retired`). |
| Preferences | `theme_prefs` (jsonb) | `currency` (=preferred_currency), `unit_system` already existed. `theme_prefs` is a foundation for future cross-device theme sync; ThemeContext still uses localStorage today (unchanged). |
| Goals/focus | `primary_focus`, `secondary_focus` | CHECK against the 8 focus areas (`fitness/career/education/wealth/experiences/relationships/health/productivity`). |

**Storage:** the migration also creates a public `avatars` bucket + `storage.objects` RLS (public read; authenticated users may write only within their own `"<user_id>/…"` folder) so avatar upload works.

**Backfill:** conservative — seeds `profiles.display_name` from `user_settings.display_name` only where empty. No numeric/goal casting (avoids errors on free-text values).

---

## 2. Migrations added

- `supabase/migrations/20260618090000_phase5_00_profile_engine.sql` — idempotent (`ADD COLUMN IF NOT EXISTS`, guarded CHECK constraints, `on conflict do nothing` bucket, drop-then-create storage policies). Non-destructive.

This is the only schema change in Phase 5. It applies **after** Phases 1–4 in `db push` order (timestamp `20260618…`).

---

## 3. Files changed / added

**Added:**
- `src/lib/personalization.js` — the personalization layer + User Context Engine + shared option vocabularies.
- `src/lib/profileTemplates.js` — life-stage / goal / onboarding templates (inert data for future onboarding).
- `src/pages/Profile.jsx` — the Profile settings page.
- `supabase/migrations/20260618090000_phase5_00_profile_engine.sql`.

**Modified:**
- `src/App.jsx` — lazy route `"/profil"`.
- `src/components/Sidebar.jsx` — "Profil" nav link (footer, `User` icon).

**Untouched (by design):** Settings, Dashboard, Onboarding, tierUtils, Maxx Score, all Jarvis/edge code, `user_settings` semantics.

---

## 4. Personalization architecture

`src/lib/personalization.js` is a **read-only foundation** future systems consume. It does **not** change any score/tier/Jarvis behaviour.

**API:**
- `getUserProfile(userId?)` → the full `profiles` row (or `null`). Defaults to the current auth user; **degrades gracefully** (try/catch + `maybeSingle`) so callers don't crash before the migration is applied.
- `getUserContext(userId?)` → the normalized context object (the Context Engine).
- `getLifeStage(profileOrId?)`, `getPrimaryGoals(profileOrId?)` → accept a profile object (sync extract) or a userId/undefined (fetch).
- `buildUserContext(profile)` → pure synchronous builder; `computeAge(birthDate)` → integer age.
- Vocabularies: `SEX_OPTIONS`, `LIFE_STAGES`, `FOCUS_AREAS`, `UNIT_SYSTEMS`, `CURRENCIES`, `LANGUAGES`, `labelFor()`.

**User Context Engine output (stable shape, additive-only):**
```js
{ age, sex, height, weight, lifeStage, occupation, goals: { primary, secondary }, country, currency }
```
This is the single object that will later feed the Tier Engine, Maxx Score, Jarvis, onboarding, and custom modules — without each re-reading the DB or re-deriving age.

**Profile page bridge:** saving the Profile mirrors `display_name` into `user_settings.display_name` so the existing Dashboard greeting stays correct until identity is consolidated (see §7).

---

## 5. Sigge-specific assumptions — categorized (task 5)

Categories: **A** keep as default template · **B** profile-driven · **C** onboarding-driven · **D** future module setting. *(Audit only — nothing rewritten this phase beyond adding the profile fields that make B possible.)*

| Assumption | Where | Cat | Disposition |
|---|---|---|---|
| Currency `kr` / `SEK`, `sv-SE` formatting | jarvis-chat, Ekonomi, price-fetch | **B** | `profiles.currency` now exists; wire formatting to it in a later phase. |
| Display name / "Sigge" copy & placeholders | Settings/Onboarding/Dashboard, Jarvis prompt | **B** | `profiles.display_name`/`first_name`; Jarvis prompt change deferred (no Jarvis changes now). |
| Study = KI / medicine framing | Plugg, StudyModal, jarvis tool text | **B/C** | `profiles.study_program` / `study_institution` now exist; onboarding can prefill. |
| Side-quest hardcoded biography | Upplevelser.jsx:846 | **B** | Build from `getUserContext()` later. |
| Income sources `['PA-jobb','Erik Norling',…]` | Ekonomi, QuickLog, Dashboard | **C/D** | User-configurable list via onboarding/settings; ultimately a module setting. |
| CSN fribelopp `114500`, CSN logic | Onboarding/Settings/Ekonomi | **B/C** | Sweden-student-specific; profile/region flag + onboarding for students. |
| "Erik" job module (`erik_*` tables, seeded project) | Jobb, jarvis actions | **D** | A user-created client/module (Phase 6 custom modules), not first-class. |
| Calendar sync keywords (`assistanstid`/`hos hw`/`obligatorisk`) | google-calendar-sync | **D** | User-defined sync rules (module setting). |
| Maxx Score categories (fixed 7) | Dashboard, tierUtils | **A→D** | Keep as default template now; module-visibility later (Phase 6). |
| Tier thresholds (VO2max, lifts, **income 12k–60k**, **savings 5k–500k**, steps) | tierUtils.js | **A** (+B later) | Keep as **default template** now; profile/region/age overrides when dynamic tiers land (Phase 7). |
| Rank model "lowest category tier" | Dashboard | **A** | Default scoring policy; configurable later. |
| `retatrutide_dose_mg` first-class health column | health_logs, fetch_health | **D** | Medication should be a custom tracker, not a hardcoded column. |
| localStorage theme keys `sigge-*` | useBackground/ThemeContext | **A** | Cosmetic; namespacing is low priority. `theme_prefs` column added for future sync. |
| Integrations (Strava, Google, prices) | edge functions | **A** | Already per-user; keep. |

**Foundation delivered this phase:** every **B** item now has a profile field to migrate to; **C** items have templates (§6); **D** items are documented for Phase 6; **A** items stay as defaults (no tier/score changes).

---

## 6. Future onboarding architecture (prepared, not built)

`src/lib/profileTemplates.js` — **data only, no UI flow, nothing auto-applied**:
- `LIFE_STAGE_TEMPLATES` — per stage: suggested focus, suggested modules (future keys), defaults, blurb.
- `GOAL_TEMPLATES` — per focus area: prompt sets a future onboarding screen would ask.
- `ONBOARDING_TEMPLATES` — named starter bundles: **Student, Fitness, Career, Entrepreneur** (lifeStage + focus + suggested modules + blurb) + `getOnboardingTemplate(id)`.

A future onboarding flow would: let the user pick a template → write `life_stage` / `primary_focus` / `secondary_focus` to `profiles` (and, once module-visibility exists, the suggested modules). `suggestedModules` is inert until Phase 6. No onboarding UI was added or changed.

---

## 7. Remaining work before dynamic tiers (Phase 7)

1. **Identity consolidation** — `display_name` and goals live in both `profiles` and `user_settings`. Pick `profiles` as the source of truth and migrate Dashboard/Settings/Onboarding reads (the current Phase-5 bridge keeps the greeting correct in the meantime).
2. **Module visibility (Phase 6)** must precede dynamic tiers (which categories count is a per-user choice).
3. **Wire `getUserContext()` into the Tier Engine + Maxx Score** — currently nothing consumes it (intentional).
4. **Profile-driven thresholds** — income/savings thresholds by `currency`/`country`; bodyweight from `profiles`/`health_logs` for strength multiples.
5. **Onboarding UI** using the templates from §6.
6. **(Optional) Jarvis personalization** — feed `getUserContext()` into the system prompt (separate, deferred phase).

---

## 8. Verification

- **esbuild per-file transform (the transformer Vite uses):** clean for `personalization.js`, `profileTemplates.js`, `Profile.jsx`, `App.jsx`, `Sidebar.jsx`, `AuthContext.jsx`.
- **esbuild bundle of `Profile.jsx`:** clean — confirms `personalization.js` actually exports everything the page imports (cross-file graph resolves).
- **Live preview render:** could not be confirmed — the Vite **dev server wedged under this machine's documented RAM pressure** (repeated restarts this session), and the only stored session token is expired. This is the same environment limit noted in project memory ("full vite build hangs (RAM)"); it is not a code defect (esbuild validates the code). The Profile page is written to **render even when `profiles` is unavailable** (graceful empty form), so it will work once the migration is applied and a valid session exists.

**To verify locally after applying the migration:** `supabase db push`, then open `/profil` while logged in → fill + save → confirm a `profiles` row updates and the avatar uploads to the `avatars` bucket.

---

## 9. Deployment

```bash
# 1) Apply migrations (Phases 1–5, ordered, idempotent):
supabase db push
#    Phase 5 adds profile columns + the avatars storage bucket/policies.

# 2) Redeploy the frontend (new Profile page + route + nav link).
#    No edge-function redeploy needed for Phase 5 (none changed).
```
Rollback: `git revert` the frontend files; to revert schema, `alter table public.profiles drop column …` for the Phase-5 columns and `drop policy … on storage.objects` / remove the bucket. All additive/non-destructive.

---

## 10. Constraints honored

No custom modules, no dynamic tiers, no Maxx Score changes, no Jarvis behavior changes, no onboarding redesign, no module visibility, no dashboard redesign. Only the profile data model, a read-only personalization layer, the Profile page, and inert templates were added.
