# Phase 15 Report — Career Progression Architecture

> **Scope:** build a career **progression model** — *Where am I? Where am I going? What's missing? What's my trajectory?* — entirely on top of data MaxxIt already owns. **Career is not a tracker.** No new project/income/task/education system, no new table, and (per the recommendation below) **not added to the Maxx Score**. Architecture-first: one pure library + a track registry + verification. No UI redesign, no AI advice.

---

## 1. Existing career-relevant data discovered (task 1 audit)

| Source | What it contributes | Reused as |
|---|---|---|
| `profiles.life_stage` (`student/early_career/professional/entrepreneur/parent/retired`) | current career *position* | position ladder |
| `profiles.occupation` (free text) | current *role* | framework role |
| `profiles.study_program` / `study_institution` | track inference signal | `inferCareerTrack` |
| `user_settings.goals` (`future_plan`/`one_year`/`ten_year`/`monthly_income_goal`) | *target* role + income target | framework target / income driver |
| **Phase-14 Studier composite** (`{tier}`) | education driver (formal + skills) | `education` driver |
| skills (`skTop.tier`) | skills driver | `skills` driver |
| `projects` / `project_tasks` | project & responsibility output | `projects` driver + outcomes |
| `income_logs` / `pa_shifts` / goals | income level & growth | `incomeGrowth` driver |

**Conclusion:** every career signal already exists. Career needed **derivation, not collection.**

---

## 2–8. Architecture — `src/lib/career.js` (NEW, pure)

A single reader, analogous to `buildRankUpLayer`, that takes already-fetched data and returns a complete career view. No DB, no React, no Maxx coupling.

### Career framework (task 2)
`framework: { currentPosition, currentPositionLabel, currentRole, targetRole, nextPosition, roleLadder }` — position from `life_stage` (`CAREER_POSITIONS` ladder), role from `occupation`, target from `goals.future_plan/one_year`, role-ladder from the track registry.

### Career drivers (task 3) — measurable, existing data only
Five drivers, each `{ id, label, score(0–100), value, hasData, confidence, source }`:
`education` (Studier composite tier/8), `skills` (skill tier/6), `projects` (project count + completed tasks), `experience` (position ordinal + tenure proxy), `incomeGrowth` (current/goal or trend). No subjective metric is invented; missing data → `hasData:false, score:0` and a weak confidence tag.

### Career outcomes (task 4) — outcomes, not inputs
`outcomes: { roleProgression, incomeProgression, responsibilityProgression, projectProgression }` — the *results* of the drivers (position reached, % of income goal, projects led, tasks completed), kept distinct from the input drivers.

### Career readiness model (task 5)
`assessCareerReadiness(drivers, track)` → `{ score, completeness, blockers[], strongestDrivers[], biggestGaps[] }`. Readiness is the **track-weighted** average over *present* drivers (weights renormalized so missing data doesn't silently deflate the score). **Blockers** = drivers that are weak (`score<50`) or missing **and** matter to the track (`weight≥0.12`), each labelled ("Behöver fler avslutade projekt", "Saknar data: erfarenhet", …). Deterministic; no AI. A strong profile correctly yields **zero blockers** while `biggestGaps` still names the relative weakest area — the model never invents a problem.

### Career registry (task 8) — not medicine-biased
`CAREER_REGISTRY` covers **healthcare, engineering, business, entrepreneurship, trades, academic, + generic**. Each track defines `driverWeights` (sum to 1), a 5-step `roleLadder`, and valued `credentials`. `inferCareerTrack(profile)` uses keyword matching over occupation/study text (e.g. engineering favours skills 0.30; entrepreneurship favours projects 0.30 + income 0.30; academic favours education 0.40) and falls back to `generic` — verified that an unknown occupation does **not** default to medicine.

### Career explainability (task 6) — reuses the evidence pattern
`explainCareerStage(cp)` and `careerDriverBreakdown(cp)` return grounded prose + raw `data`, **confidence-tagged via `reason.evidenceLevel`** — the same FAKTA/STARK/SVAG vocabulary Jarvis and the Phase-12 surface already use. Answers: *Why am I at this stage? · What contributes most (strongest drivers)? · What are my biggest gaps?*

---

## 7. Career ↔ Maxx Score recommendation

**Recommendation: (B) a supporting / derived category — explicitly NOT a 7th rankable Maxx category, initially surfaced Jarvis-first.**

Rationale:
- Career's drivers are **already ranked individually** in the Maxx Score: education (Studier), economy (income), and partially skills. Adding Career as a 7th rankable category would **double-count** those and violate the Phase-13/14 "six categories" invariant.
- Career is a **derived lens** (a synthesis of existing tiers + goals), not an independently logged metric — it belongs *alongside* the score as an interpretation, like Rank Up Plans, not *inside* it.
- It is therefore flagged `meta.partOfMaxxScore: false` and the verification asserts `RANKABLE_IDS` stays at 6.

**Evolution path:** start **Jarvis-only** (career context the coach can reason about) → graduate to a **supporting Dashboard card** (a derived readiness gauge next to the score) once income-growth and tenure data mature. Only consider rankable status if a *career-specific* measured signal (e.g. verified role/credential) is ever added that isn't already a tier — unlikely.

---

## 8b. Files changed

**Added:** `src/lib/career.js` (the entire layer), `scripts/career_progression_check.mjs` (**53/53**).
**Modified:** none — the layer is purely additive; nothing existing was touched, so all prior phases are untouched by construction.
**No migration, no UI change, no Maxx Score change, no edge-function change.**

---

## 9. Verification (task 9)

`scripts/career_progression_check.mjs` — **53/53** across **Student / Professional / Entrepreneur**. Asserts: registry covers all six tracks with weights summing to 1; track inference is keyword-driven (healthcare from study program, engineering from occupation, entrepreneurship from life-stage, **unknown → generic, no medicine bias**); drivers derive from the existing composite/skills/projects/income (and go `hasData:false` when absent); **career is NOT in `RANKABLE_IDS` and flags `partOfMaxxScore:false`**; per persona the framework carries role+target, readiness is 0–100, outcomes are outcomes, blockers obey the contract (only weak/missing weighted drivers — nothing healthy flagged), explainability names the stage and carries an evidence label; track weighting genuinely differs (high-skill/low-income scores higher on engineering than entrepreneurship); off-ladder stages (parent/retired) and empty input don't crash.

**Regression:** maxx 15/15, rankup 36/36, studies 51/51, insight 243/243, jarvis 48/48 — unchanged (career.js touches no existing file). `career.js` passes per-file esbuild transform.

---

## 10. Recommendation for future evolution

1. **Wire Career into Jarvis context** (next, low-risk): add a derived career block to `getJarvisUserContext` so the coach can answer "what's holding back my career?" using `careerDriverBreakdown` — reuses Phase-11 plumbing, no edge-function change.
2. **Supporting Dashboard card** (after): a small readiness gauge + top-driver/biggest-gap chips in the existing style, behind the Phase-12 explainability pattern. No new page (honours Phase-13: extend, don't add a Career page).
3. **Credential tracking** (the one genuine data gap): the registry already names valued `credentials` per track but nothing logs them — a light credential type on `skill_logs` (Phase-14 §future) would let readiness flag "missing certification" with real data instead of as a structural placeholder.
4. **Tenure/experience signal**: experience is currently a position+proxy estimate; a single `career_start_date` profile field (not a tracker) would sharpen the experience driver.

## Constraints honored
No new tracker, no duplicated project/income/task/education system, no new table, no Maxx Score coupling, no AI advice. Career is a **pure derived progression model** over existing MaxxIt data, with a registry that generalises across healthcare/engineering/business/entrepreneurship/trades/academic — no medicine-specific assumptions.
