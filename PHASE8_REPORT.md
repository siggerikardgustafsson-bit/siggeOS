# Phase 8 Report — Onboarding & Profile Completion Engine

> **Scope:** *activate* the personalization infrastructure built in Phases 5–7 by collecting the profile data the Tier Engine v2 / Maxx Score v2 need, and by surfacing how personalized a user's scores currently are. **Constraints honored:** no custom modules, no social, no Jarvis redesign, **no score/tier redesign** (tiers and the Maxx Score formula are untouched — Phase 8 only *measures* and *collects*).
> **⚠️ Deploy status:** implemented + verified (esbuild + node, 24/24). **Not deployed.** Still gated on applying the Phase 1–5 migrations first (see §8) — no new migration in this phase.

---

## 1. Files changed

**Added:**
- `src/lib/profileCompleteness.js` — the completeness + confidence + personalization-status engine (pure, sync, no DB).
- `src/components/ProfileQualityCard.jsx` — reusable card (`full` for the Profile page, `compact` nudge for the Dashboard).
- `scripts/profile_completeness_check.mjs` — verification (empty / partial / complete + confidence + Why-This-Score expansion).

**Modified:**
- `src/components/Onboarding.jsx` — Onboarding v2: collects Identity / Body / Life / Goals and writes them to `profiles`.
- `src/pages/Profile.jsx` — renders the full Profile Quality card (live, from the edit form).
- `src/pages/Dashboard.jsx` — fetches the profile row once, computes confidence per category + a personalization summary, threads it into `buildMaxxProfile` / Why-This-Score, and shows subtle indicators (header chip + compact nudge).
- `src/lib/maxxScore.js` — `buildWhyThisScore` extended with an **optional** personalization bundle (confidence, missing fields, fallback usage). Backwards-compatible — omitting it keeps the exact v7 shape.

**No migration, no schema change** — Phase 8 reads the columns Phase 5 already added.

---

## 2. Onboarding architecture (tasks 2)

Onboarding v2 **extends** the existing flow rather than replacing it (the legacy `user_settings` writes — `display_name`, `about_me`, `goals`, `jarvis_*`, `onboarding_done` — are preserved exactly), so no behaviour regresses.

Steps now: **Welcome → Vem är du? (Identity) → Anpassa dina tiers (Body+Life+Focus) → Mål → Jarvis → Klart**.

| Group | Fields collected | Feeds |
|---|---|---|
| Identity | `sex`, `birth_date` (→ age), `country` (+ existing display name / about) | strength, conditioning grading |
| Body | `height_cm`, `weight_kg`, `target_weight_kg` | strength multiple, BMI, weight-goal |
| Life | `life_stage`, `occupation` | economy ladder, tier profile |
| Goals | `primary_focus`, `secondary_focus` | tier-profile weighting (`suggestTierProfile`) |

- **Concise, not a questionnaire:** one new step; every field optional; existing "Hoppa över" skip preserved on the non-required steps.
- **Write path:** on finish, after the `user_settings` upsert, a **non-blocking, try/caught** `profiles` upsert persists the personalization fields. If the Phase-5 `profiles` migration isn't applied yet, the error is logged and onboarding still completes — graceful degradation.

---

## 3. Profile completeness logic (tasks 1, 3, 5)

`src/lib/profileCompleteness.js` — pure functions over a `profiles` row:

- **`getProfileCompleteness(profile)`** → weighted percentage. 10 fields; the 5 that directly feed the engine (`birth_date`, `sex`, `weight_kg`, `height_cm`, `life_stage`) weigh **2**, the 5 enrichment fields weigh **1** (total 15). Returns `{ pct, missing[], missingCritical[], status, isEmpty, isComplete }`. A field counts as filled only when present and non-empty (`0` is valid; `''` is not).
- **`getMissingCriticalFields(profile)`** → `[{ key, label }]` for the 5 critical fields still empty.
- **`getPersonalizationStatus(pct)`** (task 5) → `Fully (≥85) / Mostly (≥60) / Basic (≥30) / Fallback (<30)`, each with a colour.
- **Tier Engine activation (task 3):** `CATEGORY_PROFILE_FIELDS` maps each ranking category to the exact profile fields `tierEngine.js` consumes. `isCategoryFallback()` / `getFallbackCategories()` flag categories whose factors all collapse to 1 (i.e. running on the static fallback thresholds) so the UI can tell the user *which* scores are not yet personalized.

---

## 4. Confidence logic (task 6)

`calculateTierConfidence(category, profile, hasData)`:

```
no metric data            → 0      (nothing to be confident about)
profile-independent cat   → 100    (study/wellbeing/skills — fully defined w/o a profile)
otherwise                 → 55 + 45 × (filled category fields / total category fields)
```

The **floor of 55** reflects that a tier computed from calibrated fallback thresholds is still meaningful; filling the category's inputs raises confidence toward 100. **Tiers are never modified** — confidence is an orthogonal trust signal (the verification asserts the same metric value yields the same tier regardless of completeness). `getCategoryConfidences()` returns `{ strength, conditioning, economy, health }`; `buildPersonalizationSummary()` bundles completeness + status + confidences + missing-critical + fallback categories + an `overallConfidence` average for the Dashboard and Why-This-Score.

---

## 5. Why-This-Score expansion (task 7)

`buildWhyThisScore(score, rankCats, personalization?)` now (when the bundle is supplied) adds:
- `headline.completeness`, `headline.personalizationStatus`, `headline.overallConfidence`
- per category: `confidence` + `usingFallback`
- a top-level `personalization` block: `{ completeness, status, missingFields[], fallbackCategories[], overallConfidence }`

This is the **data layer only** (per the task — no major UI). The third argument is optional; existing callers and the Phase-7 test (which calls it with two args) are unaffected — verified.

---

## 6. Dashboard integration (task 8) — subtle, no redesign

- One profile read powers everything: `getUserProfile` → `buildUserContext` (tier context, unchanged) **and** the completeness/confidence summary (single fetch, no extra round-trip).
- Per-category `confidence` + `usingFallback` are attached to each category object; the personalization summary is threaded into `buildMaxxProfile` → Why-This-Score and exposed as `maxxProfile.personalization`.
- **Indicators:** (a) a small header chip — `✨ {completeness}% profil`, status-coloured, links to `/profil`, auto-hides at 100%; (b) a `compact` Profile Quality nudge at the top of the content that auto-hides at ≥85%. The constellation / focus / tree views and all category cards are untouched.
- **Full card** lives on the Profile page (live from the edit form, so the ring + per-category confidence update as the user types).

---

## 7. Verification (task 9)

`scripts/profile_completeness_check.mjs` (esbuild-bundled + node) — **24/24 pass**:
- **Empty / partial / complete:** 0% / 40% / 100%; completeness monotonic; status maps Fallback / Basic / Fully.
- **Missing critical:** empty → all 5; partial (`sex`+age+`life_stage`) → flags `weight_kg`+`height_cm`; complete → none.
- **Confidence:** no-data → 0; empty floors at 55 (not 0); complete → 100; economy complete > empty; profile-independent → 100.
- **Fallback categories:** empty → all 4; partial → strength & economy off fallback; complete → none.
- **Tiers unchanged:** same metric value → same tier regardless of confidence.
- **Why-This-Score:** personalization block present with completeness/missingFields/fallback; per-category confidence surfaced; backwards-compat shape when the 3rd arg is omitted.
- **Graceful degradation:** every function tolerates a `null` profile without throwing.

Regression: Phase 7 `maxx_score_check.mjs` still **15/15**. All six changed/added files pass per-file esbuild transform; the two new JSX components bundle with local imports resolving.

**Not browser-verified this session:** the Dashboard/Profile/Onboarding views are auth-gated and the dev server is RAM-wedged (documented env limit) — a logged-in smoke-test is required after deploy. The integration is additive and null-safe (every path degrades to "no profile → 0% → fallback"), so it cannot change existing tier/score values.

---

## 8. Deployment

No new migration. Phase 8 depends on the **Phase-5 `profiles` columns** existing, so the deploy order is unchanged from Phase 7 — apply migrations 1–5 *before* shipping the frontend (otherwise `profiles` reads return null → everything shows "Fallback-läge / 0%", and onboarding's profile upsert silently no-ops):

```bash
# 0) Back up the DB.
supabase db push                 # migrations 1–7 (Phase 5 adds the profiles columns Phase 8 reads)
# (edge functions per Phase 4A as before)
git push origin main             # → Vercel deploys the frontend
# Smoke-test: run onboarding as a fresh user → /profil shows rising completeness →
# Dashboard header chip + nudge reflect it → fill sex/age/weight → confidence climbs.
```

---

## 9. Remaining blockers before benchmark datasets

- **Heuristic factors still underlie the tiers** — Phase 8 makes *confidence* honest, but the tier-adjustment multipliers (strength sex/age, VO2max, economy life-stage) are still heuristics, not real percentile datasets. Confidence currently measures **input completeness**, not statistical calibration; once real benchmark datasets land, confidence should also fold in dataset coverage (e.g. lower confidence for a 19-year-old female lifter if the dataset is thin there).
- **Weight source** — strength uses a `multiple` already; the profile `weight_kg` is a baseline. Wiring live bodyweight (`health_logs`) into the strength confidence/inputs is a follow-up.
- **No per-user weighting of completeness by focus** — a fitness-focused user arguably needs `weight_kg` more than `country`; completeness weights are currently global.
- **Personalization still dormant until the migration is applied + a user fills the profile** — onboarding now collects it, but existing users must visit `/profil` (the nudge drives them there).
- **Browser-unverified this session** (RAM + auth gate) — smoke-test required.

---

## 10. Constraints honored

No custom modules, no social, no Jarvis redesign, **no score/tier redesign**. Phase 8 only added a measurement layer (completeness/confidence), an onboarding data-collection step, indicators, and the Why-This-Score data expansion — all additive and backwards-compatible.
