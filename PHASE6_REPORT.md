# Phase 6 Report — Tier Engine v2 (Personalized Dynamic Tiers)

> **Scope:** Phase 6 only — the tier *intelligence layer*. **Additive**: no edits to `tierUtils.js`, `Dashboard.jsx`, or the Maxx Score. The engine is built and verified, ready for Phase 7 to consume.
> **Constraints honored:** no custom modules, no onboarding redesign, no Jarvis changes, no module visibility, **Maxx Score unchanged**.
> **State:** new frontend libs in repo, nothing wired into the live UI yet (intentional — see §6).

---

## 1. Audit of the current tier system (task 1)

**Where tier calculations occur**
- `src/components/dashboard/tierUtils.js` — `getTier(value, thresholds, higherIsBetter)` (generic 8-tier mapper), `getStudyTier(mastery)` (5-tier), `getSkillTier(minutes/wk)`, plus `estimateVO2max`, `calc1RM`, `calcOverallTier`.
- `src/pages/Dashboard.jsx` — computes **every category tier** by calling `getTier()` with the static ladders below, then derives the Maxx Score as the **minimum** category tier (weakest-link; excludes `kropp`/`fardigheter`), and upserts `tier_snapshots`.

**Every hardcoded threshold (all universal, no profile input):**

| Constant | Value | Used for | Most user-specific? |
|---|---|---|---|
| `VO2MAX_THRESHOLDS` | 44,49,53,57,61,65,70 | Kondition | no sex/age grading |
| `RUN_5K/10K/HALF/MARA_THRESHOLDS` | seconds | Kondition | no sex/age grading |
| `BENCH/SQUAT/DEADLIFT/OHP_THRESHOLDS` | BW multiples | Styrka | already BW-relative; **no sex/age** |
| `PULLUP_THRESHOLDS` | 5..28 reps | Styrka | no sex/age |
| `SLEEP_DURATION_THRESHOLDS` | 6.5..9 h | Sömn | no age grading |
| `SLEEP_REGULARITY_THRESHOLDS` | 60..10 min SD | Sömn | — |
| `INCOME_THRESHOLDS` | **12000..60000 SEK** | Ekonomi | **🚩 student-SEK calibrated** |
| `SAVINGS_THRESHOLDS` | **5000..500000 SEK** | Ekonomi | **🚩 student-SEK calibrated** |
| `ENERGY/MOOD/STRESS_THRESHOLDS` | 1–10 scales | Välmående | universal-ish |
| `STEPS_THRESHOLDS` | 5000..18000 | Välmående/aktivitet | no age grading |
| `getStudyTier` bands | mastery 20/40/60/80 | Plugg | internal (no external norm) |
| `getSkillTier` bands | 30/60/120/240 min/wk | Färdigheter | universal-ish |

**Categories using static values:** *all of them* — kondition, styrka, somn, plugg, ekonomi, välmående, fardigheter. The economy ladders (flat SEK) are the most distorting for non-Sigge users.

---

## 2. Architecture created (task 2)

`src/lib/tierEngine.js` — one entry per domain, all flowing through a shared `build()` that returns a `getTier`-compatible object **plus** the inspector payload:
- `calculateStrengthTier(lift, input, context)`
- `calculateConditioningTier(metric, value, context)`
- `calculateEconomyTier(metric, value, context)`
- `calculateHealthTier(metric, value, context)`
- `calculateStudyTier(mastery, context)`
- `inspectTier(category, metric, value, context)` — the Tier Inspector (task 9).

`context` is the normalized object from Phase 5's `buildUserContext()`: `{ age, sex, height, weight, lifeStage, occupation, goals, country, currency }`.

**Mechanism:** the engine imports the base ladders from `tierUtils` and *scales* them by context-derived multipliers, then calls the existing `getTier()`. It never mutates `tierUtils`. The scale-the-threshold seam is the place a real percentile/benchmark dataset slots in later without changing call sites.

Return/inspector shape (every result):
```
{ tier, label, color, …,            // getTier output
  metric, value, thresholds, baseThresholds, factors, higherIsBetter, fallback, reason, notes }
```

---

## 3–6. Profile factors used, per domain

| Domain | Function | Factors | Model (heuristic now, dataset-ready) |
|---|---|---|---|
| **Strength** | `calculateStrengthTier` | sex, age, bodyweight (via multiple) | Already BW-multiples. Female ×0.65 upper / ×0.72 lower; age >30 −0.6%/yr (clamp 0.6). Pullups by reps. |
| **Conditioning** | `calculateConditioningTier` | sex, age | VO2max: female ×0.85, age >25 −0.8%/yr. Run (time, lower=better): female ×1.10, age >30 +0.6%/yr. **Cycling**: architecture supports it — add a base ladder + factors (no cycling metric exists in the app yet). |
| **Economy** | `calculateEconomyTier` | age, life_stage, country/currency | **Three separate ladders** (income / savings / net_worth). Per-metric life-stage multipliers (student income ×0.35 … retired net_worth ×1.5); savings/net_worth scale with age; currency scales SEK base to the user's currency (rough FX, replaceable). New `NET_WORTH_THRESHOLDS_SEK` added (none existed). |
| **Health** | `calculateHealthTier` | sex, age, height, weight | `bmi` (derived from height/weight, band-based around ~21.7), `weight_goal` (proximity to target), `sleep` (age-graded), `steps` (age-graded). Metrics unchanged — only the tier calc. |
| **Study** | `calculateStudyTier` | — | Routes the existing internal mastery scale through the engine (no external norm; profile hook reserved). |

### Old vs new thresholds — examples
| Case | Base ladder (T2…T8) | New ladder used |
|---|---|---|
| Bench, **female 25** | `0.75,1.0,1.15,1.3,1.5,1.65,1.8` | ×0.65 → `0.49,0.65,0.75,0.85,0.98,1.07,1.17` (1.30× → **T8** vs base T5) |
| Bench, **male 55** | same | ×0.94 → easier (1.30× → **T6**) |
| Income, **student** | `12000,18000,22000,28000,35000,45000,60000` SEK | ×0.35 → `4200,6300,…,21000` (20 000 → **T7** vs base **T3**) |
| Income, **professional** | same | ×1.0 → unchanged (20 000 → **T3**) |
| VO2max, **female 25** | `44,49,53,57,61,65,70` | ×0.85 → `37.4,41.7,…` (50 → **T5** vs base **T3**) |

*(All figures from the live verification run — see §8.)*

---

## 7. Tier Profiles (task 7)

`src/lib/tierProfiles.js` — **data only**: `Student`, `Fitness Focus`, `Career Focus`, `Entrepreneur`, `Balanced`, each a category-weight map (keys = Dashboard category ids). Plus `weightsForProfile(id)` and `suggestTierProfile(context)` (maps `primary_focus`/`life_stage` → a profile). These are for a **future weighted Maxx Score** — nothing consumes them yet, so the score is unchanged.

---

## 8. Backwards compatibility (task 8) — verified

Every calculator: when context is missing the relevant fields, all factors = 1 → adjusted ladder == base ladder → **identical to today's `getTier`**, with `fallback: true` flagged. No user loses functionality; a profile-less user sees exactly the current tiers.

**Verification** (`scripts/tier_engine_check.mjs`, bundled with esbuild + run on node — the dev server is RAM-wedged this session, so node is the low-RAM substitute): **14/14 passed**, including:
- `bench 1.30×, no context` → engine **T5 == base getTier T5** ✓
- `income 20000, no context` → engine **T3 == base T3** ✓
- `sleep 7.5h, no context` → **== base** ✓
- profile adjustments move tiers in the correct direction (female/older/student → higher tier at the same raw value).
- inspector returns thresholds + factors + a human reason (`"bench=1.3 → T8 (Top 1%). Trösklar justerade: sex×0.65, age×0.94."`).

Both new libs also pass per-file esbuild transform.

---

## 9. Tier Inspector (task 9)

`inspectTier(category, metric, value, context)` (and the `reason`/`factors`/`thresholds`/`fallback` fields on every result) give a full, UI-free explanation: the base ladder, the adjusted ladder actually used, each multiplier and why, the resulting tier, and whether a fallback was taken. This is the data layer for a future **"Why this score?"** — no UI built.

---

## 10. Files changed

**Added (additive only):**
- `src/lib/tierEngine.js` — the engine + inspector.
- `src/lib/tierProfiles.js` — weight presets (future Maxx Score).
- `scripts/tier_engine_check.mjs` — verification harness (dev-only; not imported by the app).

**Not modified:** `tierUtils.js`, `Dashboard.jsx`, Maxx Score, tier_snapshots, Jarvis, onboarding. (`Dashboard.jsx` shows as modified in git, but that is a pre-existing uncommitted change from before this work — Phase 6 did not touch it.)

---

## 11. Remaining work before Maxx Score v2 (Phase 7)

1. **Wire the engine into the Dashboard** — replace the direct `getTier(...)` calls per category with `calculate*Tier(..., getUserContext())`. This is the step that actually swaps the hardcoded thresholds for the profile-aware ones; deferred so scores don't shift until intended.
2. **Weighted Maxx Score** — consume `tierProfiles` weights (replace the weakest-link `min` model with a weighted aggregate). *This is Maxx Score v2.*
3. **Reliable context** — finish Phase 5's identity consolidation so `getUserContext()` is populated (and prompt users for sex/age/bodyweight, which the strength/conditioning models need).
4. **Real benchmark data** — swap the heuristic multipliers for percentile tables (strength standards, VO2max norms by sex/age, ACSM/Cooper run norms, regional income/net-worth percentiles). The scale-the-ladder seam already supports this.
5. **Cycling** — add a cycling power/FTP ladder + factors (no cycling metric exists in the app yet).
6. **Score versioning** — when the engine goes live, version `daily_scores`/`tier_snapshots` so historical charts don't retroactively shift (audit risk #6).

---

## 12. Recommended next phase

**Phase 7 — Maxx Score v2:** wire this engine + tier profiles into the Dashboard scoring (profile-aware category tiers + weighted aggregate), with score versioning and the inspector powering "Why this score?". Do it only after the security GO checklist (Phase 4B) and Phase 5 identity consolidation are done, so context is trustworthy and historical scores are preserved.
