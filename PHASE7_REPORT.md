# Phase 7 Report — Maxx Score v2 & Tier Engine Integration

> **Scope:** wire the Phase-6 Tier Engine into the live Dashboard, ship Maxx Score v2 (weighted + bottleneck-aware), Bottleneck Engine v2, the Why-This-Score data layer, and score versioning. **Constraints honored:** no custom modules, no social, no Jarvis redesign, no onboarding redesign, no module visibility, design unchanged.
> **⚠️ Deploy status:** implemented + verified (esbuild + node), **NOT deployed** — a `git push` is blocked on applying the DB migrations first (see §8). Pushing the frontend without them would break workout logging.

---

## 1. Files changed

**Added:**
- `src/lib/maxxScore.js` — Maxx Score v2 + Bottleneck Engine v2 + Why-This-Score (pure functions).
- `supabase/migrations/20260619090000_phase7_00_score_versioning.sql` — `score_version` column on `tier_snapshots` + `daily_scores`.
- `scripts/maxx_score_check.mjs` — verification (4 scenarios).

**Modified:**
- `src/pages/Dashboard.jsx` — Tier Engine wired into every ranking category; `buildMaxxProfile` now computes v2; context fetch; per-category percentile; versioned snapshot write.
- `src/lib/tierEngine.js` — added `1k` run + `dip` base ladders (so the Dashboard's existing sub-metrics map cleanly; additive, fallback unchanged).

---

## 2. Old vs new score model

| | v1 (old) | v2 (new) |
|---|---|---|
| Category tiers | `getTier(value, STATIC_THRESHOLDS)` | `calculate*Tier(value, userContext)` — profile-aware, **falls back to the exact v1 thresholds when no profile** |
| Maxx Score | `min(categoryTiers)` (pure weakest-link) | `round(0.55 × weightedTier + 0.45 × minTier)` |
| Weighting | none | per-category weights from a **tier profile** |
| Bottleneck | the min category | preserved (0.45 weight) **and** surfaced via Bottleneck Engine v2 |
| Transparency | none | Why-This-Score data per category |

**Weighted tier:** each category tier → percentile (`T1≈25 … T8≈99`); `weightedPct = Σ(pct·weight)/Σweight`; `weightedPct → tier`. Then blended with `minTier` so a single weak area still drags the headline.

---

## 3. Weighting system (tier profiles)

Weights come from `src/lib/tierProfiles.js` — **Student / Fitness Focus / Career Focus / Entrepreneur / Balanced**. The Dashboard picks one via `suggestTierProfile(userContext)` (from `primary_focus` / `life_stage`), defaulting to **Balanced** when there's no profile. With Balanced (all weights = 1) the weighted percentile is a plain average, so the result is a sensible, stable blend.

---

## 4. Bottleneck Engine v2

`detectBottlenecksV2(rankCats, headlineTier, weights)` → for each holding-back category: `{ id, name, tier, weight, impact, opportunity, progressPct }`, sorted worst-first.
- **impact** = estimated weighted-percentile gain from a +1 tier raise (weight-aware).
- **opportunity** = `T{n} → T{n+1}`.
- JSON-friendly for future Jarvis ("what should I focus on?"). Attached to the Maxx category as `bottlenecksV2`; the v1 "Lägsta kategori" detail + level-up requirements remain visible (no removal).

---

## 5. Why-This-Score architecture

`buildWhyThisScore(score, rankCats)` → `{ version, model, headline, categories[] }` where each category carries `tier, percentile, weight, contribution`, and — straight from the Tier Engine result — `thresholdsUsed, profileFactors, fallback, reason`. Attached to the Maxx category as `whyThisScore`. **Data layer only — no UI built** (per the task). This is the backend for a future "Why this score?" panel.

---

## 6. Versioning architecture

`score_version` column added to `tier_snapshots` and `daily_scores` (migration `20260619090000`). The Dashboard tags new snapshots `v2`; existing rows stay `NULL` = interpret as `v1` (weakest-link). **Old history is never rewritten** — charts can distinguish models. The snapshot write is fire-and-forget (`.catch`), so writing `score_version` is a no-op (not an error) if the migration hasn't run yet.

---

## 7. Dashboard integration details

- `const ctx = await getUserContext(userId)` + `suggestTierProfile(ctx)` early in `fetchAllData`. **Null-safe**: profiles missing / no profile → `ctx = null` → every engine call uses fallback thresholds → category tiers identical to today.
- Per-category swaps (inside the existing `value != null ? … : null` guards, so null-handling is preserved and the engine's `getTier`-compatible result is a drop-in): conditioning (`r1T…rMT`), strength (`bT…dipT`), sleep (`slT`), study (`pT`), economy (`incT/savT`). Energy/mood/alcohol/supplement and skills stay on `getTier`/`getSkillTier` (no profile factor applies).
- `buildMaxxProfile(cats, tierProfileId)` computes the v2 headline + attaches `bottlenecksV2`, `whyThisScore`, `weightedPercentile`, `tierProfile`, `scoreVersion`. Output shape is otherwise unchanged, so `DetailModal`/`Constellation`/`FocusView`/`KpiTree` keep working — **no redesign**.
- Each category gets a `percentile` field for the cards/detail.

**Verification:** `scripts/maxx_score_check.mjs` (bundled w/ esbuild + run on node — the dev server is RAM-wedged this session) → **15/15 pass** across profile-less / student / professional / fitness: headline tiers land between min and max, contributions sum ~100%, student economy outranks professional at equal income, bottlenecks sort worst-first with impact, why-this-score carries profile factors. All changed files pass per-file esbuild transform; every new import already bundled cleanly in the node tests. **A live browser render could not be confirmed** (RAM-wedged dev server + expired session) — the integration is surgical and fallback-safe, but treat a browser smoke-test as required before/after deploy.

---

## 8. ⚠️ Deployment — required order (do NOT `git push` first)

Deploy = `git push origin main` → Vercel builds. **But the frontend now depends on schema that production doesn't have yet** (no migration has ever been applied):
- Phase 2 writes `training_exercises.user_id` → column missing → **gym logging breaks**.
- Phase 5 Profile page writes `profiles.*` → table missing → saves fail (page still renders).
- Phase 7 writes `tier_snapshots.score_version` → column missing → snapshot write no-ops (safe).

**Safe sequence:**
```bash
# 0) Back up the DB in the Supabase dashboard.
# 1) Apply ALL migrations (Phases 1–7), idempotent, ordered:
supabase db push
# 2) (recommended) deploy the hardened edge functions (Phases 1–4A) + delete dead fn:
supabase functions deploy jarvis-chat strava-sync google-calendar-sync price-fetch
supabase functions delete insights-ai
# 3) Run the SQL verifiers (phase1/2/3_verify.sql) + bash supabase/verify_all.sh
# 4) NOW deploy the frontend:
git add -A && git commit -m "Multi-user migration + Maxx Score v2" && git push origin main
# 5) Browser smoke-test: log in, open Dashboard, log a gym workout, open Profile.
```
After step 1, `ctx` becomes populated and personalization activates; before it, the app runs in safe fallback (current tiers, v2 aggregation only).

**Why I didn't push:** "push to vercel" can't be done safely without first applying the migrations, and applying migrations to the production database is an irreversible action you didn't explicitly authorize. I stopped rather than ship a regression.

---

## 9. Remaining weaknesses

- **Study tier scale** (1–5 from `getStudyTier`) is mapped through the 1–8 percentile table — coarse; normalize later.
- **Wellbeing sub-metrics** (energy/mood/alcohol/supplement) and **steps** are not profile-adjusted (no factor applies / kept out of the score to avoid changing composition).
- **Heuristic factors** — strength/VO2max/economy multipliers are heuristics, not real percentile datasets.
- **Personalization is dormant until profiles are populated** (sex/age/bodyweight/life_stage) — needs onboarding to collect them.
- **Mixed history** — `tier_snapshots` will contain v1 (old) + v2 (new) rows; charts mix models until enough v2 data accrues (versioning makes this distinguishable, not invisible).
- **Browser-unverified** this session (RAM) — smoke-test required.

---

## 10. Recommended next phase

1. **Apply migrations + deploy + verify with a second test account** (the long-deferred GO gate).
2. **Onboarding** to collect profile fields (sex/age/bodyweight/life_stage) so personalization actually engages — uses the Phase-5 templates.
3. **"Why this score?" UI** consuming `whyThisScore` + a Jarvis tool consuming `bottlenecksV2`.
4. Replace heuristic factors with real benchmark/percentile datasets.
